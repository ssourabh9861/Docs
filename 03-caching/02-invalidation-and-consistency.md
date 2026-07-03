# Invalidation and Consistency with the Source

"There are only two hard things in computer science: cache invalidation and
naming things." The joke survives because the difficulty is structural:
invalidation is the distributed-consistency problem (`01-distributed-systems/
02-consistency-models.md`) smuggled into an "easy" component — mutable source
+ distributed copies + concurrent readers and writers = every anomaly you've
already studied, now with a TTL. This doc: the mechanisms, the famous races,
and the decision framework for what may be cached at all.

---

## 1. Plain definition

When the source changes, every cached copy is wrong until *something*
fixes it. The three somethings:

1. **Expiry (TTL):** copies self-destruct after T. Staleness is *bounded by
   construction* (≤ T), no coordination needed, works for every write path
   including ones you don't control. The workhorse.
2. **Explicit invalidation:** the writer (or something watching the writer)
   deletes/updates the copy at write time. Staleness ~0 in the happy path —
   bought with coordination, and coordination brings races (§2.2).
3. **Versioned keys:** never mutate — change the *key* when data changes
   (`user:123:v42`, content-hashed asset names). Old copies become
   unreachable garbage; "invalidation" becomes pointer-swap + eviction.
   The cleanest mechanism when a version pointer exists (CDN assets,
   config epochs).

The framing that organizes everything: **invalidation chooses a point on
the staleness-vs-coordination curve.** TTL = zero coordination, bounded
staleness. Explicit = high coordination, near-zero staleness, race surface.
Versioned = coordination moved into the key/pointer. Real systems layer
them: explicit invalidation for speed, TTL as the *backstop* that bounds
the damage of every race and bug ("belt and suspenders" is not paranoia —
it's acknowledging that §2.2 exists).

---

## 2. How it works in practice

### 2.1 TTL design

- TTL = your declared staleness SLO. Derive it: "how stale can this read
  be before the product/correctness cost exceeds the caching win?"
  Config/flags: seconds–minutes. Display aggregates: minutes. Immutable
  content: ∞ (version the key). Money-gating state: ~0 ⇒ don't cache
  (`01-cache-patterns.md` §3).
- **Jitter your TTLs** (±10–20%) — uniform TTLs synchronize mass expiry
  (deploy-time warm → everything dies together → stampede;
  `03-stampedes-and-hot-keys.md`).
- TTL-on-write vs TTL-on-read (sliding): sliding keeps hot keys alive
  forever — which also means hot keys can be *stale* forever if TTL is
  your only invalidation. Sliding expiry + no explicit invalidation =
  unbounded staleness for exactly your most-read data; a classic quiet
  bug.

### 2.2 The explicit-invalidation races (the heart of the topic — know
these cold)

**Race 1 — the stale-set (read-miss vs write):**
1. Reader misses cache, reads DB → gets value v1.
2. Writer updates DB to v2, deletes/invalidates cache.
3. Reader (slow — GC pause, network) populates cache with v1.
Result: cache holds v1 **indefinitely** (until TTL — the backstop's job).
Low probability per request, guaranteed at scale. This is THE cache race;
Facebook's memcache paper made it famous and introduced the fix:
**leases** — the cache issues a token on miss; a set is accepted only if
the lease is still valid; the intervening delete invalidates the lease, so
the stale v1 set is refused. (Generation/CAS tokens — your Aerospike
generation counters can implement exactly this **[nice connection to
name]**.)

**Race 2 — delete-then-write vs write-then-delete (writer-side ordering):**
- *Update DB → then delete cache* (the correct default): the window is
  small (between DB commit and delete, readers get old cache — bounded,
  then fixed). If the delete *fails*: stale until TTL — hence TTL
  backstop + retry/async-queue the delete.
- *Delete cache → then update DB*: worse — a reader misses in the gap,
  loads old DB value, re-populates; now stale after the write completes
  (Race 1 by another door). Mitigation folklore: "double delete" (delete
  again after a delay) — a band-aid; the honest fixes are leases or
  CDC-driven invalidation.
- *Update cache in place instead of delete* (write-through-ish): two
  writers can interleave DB and cache writes in opposite orders →
  cache holds the loser (LWW-flavored lost update). Delete is safer than
  set precisely because it's idempotent and order-insensitive; "prefer
  delete over update" is a quotable rule.

**Race 3 — invalidate-before-commit:** writer invalidates, then its DB
transaction *rolls back* → cache correctly empty, DB has old value —
harmless. But writer invalidates *within* the transaction and a reader
re-populates from the *uncommitted-invisible* old value → stale again.
Rule: invalidate **after commit** — which is a dual-write (commit + 
invalidate)… and you know where dual-writes lead (§2.3).

### 2.3 CDC-driven invalidation (the structural fix — and your platform's
natural answer)

Invalidation-on-write is a dual-write (DB commit + cache delete) with all
the usual dual-write pathologies. The structural fix is the same as
always: **derive invalidation from the committed change stream** — a
consumer tails CDC/binlog and deletes/updates cache entries for changed
keys (`04-messaging-streaming/07-cdc.md`; Facebook's mcsquare/binlog-
driven flows are the canonical citation). Properties: can't invalidate
what didn't commit; can't miss a commit (at-least-once); adds lag
(ms–seconds — the staleness floor becomes CDC lag); still pair with
leases-or-TTL for the Race-1 reader-side hole (CDC fixes the *writer*
side). For you this is a one-sentence power move: "we'd drive cache
invalidation off the SEP/CDC stream we already operate — invalidation as
a derived view of committed changes, not a courtesy of application code."

### 2.4 Session guarantees over caches

A user writes, then reads through a cache that hasn't caught up:
read-your-writes broken (profile edit "reverts"). Fixes mirror the
replication-lag playbook (`01-distributed-systems/03-replication.md` P3):
write-through for the writer's own entry, session-pinned cache bypass for
T-after-write, or version tokens ("serve only if cache version ≥ my
write's version"). Multi-copy tiers (L1 per pod) add monotonic-reads
flicker — same medicine.

---

## 3. Senior-level depth

- **Classify data by invalidation difficulty before caching it:**
  immutable (cache forever, version keys — zero risk); single-writer
  mutable (owner can invalidate reliably — moderate); multi-writer
  mutable (who invalidates? races multiply); **derived/computed** (the
  inputs change — invalidating requires knowing the dependency graph:
  the hardest class, and the honest answer is often short TTLs or
  materialized-view-ification instead of caching). This taxonomy is a
  better design tool than any single mechanism.
- **Staleness has a direction** (the repo's recurring lens): a stale
  "eligible" over-offers; a stale "price" undercharges; a stale
  permission grants revoked access — per-field, decide the tolerable
  direction and bound. Caching authorization data is the classic
  silent-security-bug (revocation must propagate ≤ policy bound —
  short TTLs or push-invalidation, and say the bound out loud).
- **Invalidation storms:** one write to a hot shared entity (a config
  row, a celebrity profile) invalidates everywhere → thundering
  re-load (`03-stampedes-...md`). Explicit invalidation *creates*
  synchronized misses; pair hot-entity invalidation with
  stale-while-revalidate or single-flight.
- **Observability:** staleness is invisible by default — you serve
  wrong data with 200s and great latency. Measure: age-at-serve
  distribution (attach write-timestamps to entries), invalidation
  delivery lag (CDC-driven), and canary comparisons (sample reads
  compared against source — recon-thinking applied to caches,
  `14-distributed-transactions/05-reconciliation.md`).
- **L4/L5/L6:** L4: "we set TTLs and delete on update." L5: the three
  races with fixes (leases, delete-after-commit, prefer-delete),
  CDC-driven invalidation, TTL-as-backstop layering, direction-of-
  staleness analysis, session guarantees. L6: platform machinery —
  invalidation as CDC-derived infrastructure, staleness SLOs per data
  class, cache-consistency canaries, and the governance line on what
  may never be cached.

---

## 4. Resume connection

- **Your eligibility short-circuit is a designed stale-read** with
  direction analysis (under-offer safe) and dual convergence
  (callbacks + recon) — you've been doing "invalidation" via
  event-driven update + backstop all along; name the pattern
  correspondence: callbacks ≈ explicit invalidation (fast, lossy),
  recon ≈ TTL-backstop (slow, complete) — push-for-latency,
  pull-for-truth again (`14-.../06-...md` §2.7).
- **Aerospike generation counters = lease/CAS machinery** available
  off-the-shelf for Race-1-proof cache sets **[whether your lookup
  caches use it: VERIFY — if not, it's your named upgrade]**.
- **CDC-driven invalidation is your one-sentence design answer** for
  any cache-consistency question — you already run the hard half
  (SEP → Pulsar), the consumer is a weekend of work.
- **The security-flavored instance you own:** device-fingerprint reads
  gate payments — staleness direction analysis says a stale *binding*
  (device unbound but cache says bound) is the dangerous direction;
  know your propagation bound for unbind events **[VERIFY: how fast
  does a device unbind take effect? That's an interview question with
  a compliance flavor]**.

**30–60 s spoken answer** ("how do you keep caches consistent?"):

> "By choosing a point on the staleness-versus-coordination curve per
> data class, and layering. TTL is the workhorse — it bounds staleness
> by construction with zero coordination, so every cache gets one as
> the backstop even when faster invalidation exists, because the races
> are real: the classic stale-set — a slow reader populating the old
> value after a writer's delete — leaves a cache wrong until TTL, and
> the fix beyond TTL is leases, which our Aerospike generation counters
> can implement natively. Writer-side, the rules are: invalidate after
> commit, prefer delete over update because delete is idempotent and
> order-insensitive, and recognize that commit-plus-invalidate is a
> dual write — so the structural answer is deriving invalidation from
> the CDC stream we already operate: you can't invalidate what didn't
> commit, and you can't miss a commit. And staleness has a direction
> per field: our eligibility short-circuit deliberately serves a stale
> local view because the error direction is under-offering, converged
> by callbacks fast and recon completely — whereas a stale device
> binding points the dangerous way, so its propagation bound is a
> security parameter, not a tuning knob. The thing I always add:
> staleness is invisible by default — you serve wrong data with
> perfect latency — so we measure age-at-serve and run canary
> comparisons against source. Recon thinking, applied to caches."

---

## 5. What the interviewer will push on

**P1. "Walk me through the stale-set race and fix it three ways."**
- *Model:* the four-step interleaving from §2.2 (miss-read v1 → write
  v2+delete → slow reader sets v1 → wrong until TTL). Fixes:
  (1) leases/CAS — miss issues a token, intervening invalidation voids
  it, stale set refused (memcache leases; Aerospike generation);
  (2) TTL backstop — bounds the damage window (always, regardless);
  (3) CDC-driven re-invalidation/short-TTL layering — the writer-side
  stream deletes again after the race (or versioned values: set only
  if incoming version > cached version — turning the set into a
  conditional write, your CAS pattern). Bonus: state *why* it's
  guaranteed at scale — the race window is (reader DB-read →
  cache-set) which includes GC pauses; probability × QPS × time = 1.
- *Trap:* "delete again after a delay" (double-delete) as the primary
  fix — it's a probabilistic band-aid; leases/versioning are the
  mechanism answers.

**P2. "Design invalidation for a user-profile service: 50 k reads/s,
500 writes/s, profiles cached in Redis + per-pod L1."**
- *Model:* classify: single-writer mutable (the profile service owns
  writes) → reliable invalidation possible. Design: cache-aside with
  jittered TTL (minutes) as backstop; CDC/outbox-driven invalidation
  consumer deleting Redis keys on commit (structural, no dual-write);
  L1s subscribe to an invalidation pub/sub topic (best-effort) with
  seconds-scale L1 TTLs bounding the miss; read-your-writes for the
  editing user via session-pinned bypass or version token; negative
  caching for deleted users; age-at-serve metric + canary comparison.
  Numbers check: 500 writes/s of invalidation traffic is trivial;
  50 k reads/s justifies L1 (Redis hop = real CPU).
- *Trap:* app-code delete-on-write as the whole answer (dual-write +
  Race 1 unaddressed), or no L1 invalidation story.

**P3. "Why keep a TTL when you have reliable event-driven
invalidation?"**
- *Model:* because "reliable" has asymptotes: Race-1 reader-side holes
  (events fix writers, not slow readers), consumer outages (invalidation
  lag = unbounded staleness without a floor), bugs (a filter that
  misses a table), and unknown-unknowns — the TTL is the recon of
  caching: it bounds divergence *duration* regardless of cause
  (`14-.../05-reconciliation.md` P5's argument, verbatim applicable).
  Cost of the belt: slightly lower hit ratio. State it as the same
  layered philosophy as everything else you build.
- *Trap:* "you don't need TTL then" — the interviewer is checking
  whether you believe in perfect components; you don't.

**P4. "We cache permission/authorization results for 10 minutes to save
the auth service. Attack this design."**
- *Model:* direction-of-staleness: a revoked permission stays live for
  up to 10 minutes — the failure is a *security incident*, not a UX
  blemish; the bound must come from security policy, not latency
  budgets. Attack specifics: offboarding/compromise response time now
  has a 10-minute floor; audit says "revoked at T" but access continued.
  Fixes: short TTLs (seconds) + negative-result non-caching; push
  invalidation on revocation events (revocations are rare — the event
  path is cheap); or cache *grants* with version epochs (bump the
  user's epoch on any revocation → all cached grants keyed by epoch
  die instantly — versioned-key mechanism doing security work). Close:
  cache *allow* decisions cautiously, never cache *deny*-overrides,
  and get the bound signed off by security, not eng.
- *Trap:* treating it as a normal staleness trade — the question tests
  whether you notice the direction flip from product-cost to
  security-cost.

---

## Self-test

1. The three invalidation mechanisms and the curve they sit on.
2. Why jitter TTLs, and what's wrong with sliding expiry as your only
   invalidation?
3. Reproduce the stale-set race precisely (four steps) and explain why
   it's guaranteed at scale.
4. How do leases fix it? What Aerospike feature implements the same
   idea?
5. Delete-then-write vs write-then-delete vs update-in-place: rank and
   justify; state the "prefer delete" rule's mechanism.
6. Why must invalidation happen after commit, and what problem does
   that ordering itself create?
7. CDC-driven invalidation: two properties app-code invalidation can't
   have, one cost, and the hole it doesn't fix.
8. The four-class invalidation-difficulty taxonomy with the honest
   answer for the hardest class.
9. Give two direction-of-staleness examples where the stale read is a
   security/money problem, with the bound-setting principle.
10. How do you *measure* staleness? Three instruments.
11. Map callbacks + recon in your platform onto invalidation
    vocabulary.
12. The permission-cache attack: three specific harms and the epoch
    fix.

<details>
<summary><b>Answers</b></summary>

1. TTL/expiry (zero coordination, staleness ≤ T by construction);
   explicit invalidation (coordination at write time, ~zero staleness,
   race surface); versioned keys (mutation becomes new-key + pointer
   swap; old copies unreachable). The staleness-vs-coordination curve;
   real systems layer explicit-for-speed + TTL-as-backstop.
2. Uniform TTLs synchronize expiry (mass warm at deploy → mass death →
   stampede); ±10–20% jitter de-correlates. Sliding expiry keeps hot
   keys alive indefinitely — with no explicit invalidation, your
   most-read data has *unbounded* staleness: the popular entry never
   expires and never gets corrected.
3. (1) Reader misses, reads DB → v1; (2) writer commits v2, deletes
   cache entry; (3) reader (delayed — GC, network, scheduling) sets
   cache = v1; (4) cache serves v1 until TTL. Guaranteed at scale:
   the vulnerable window (DB-read → cache-set) is nonzero and
   occasionally long (pauses); window × miss-rate × write-rate × time
   → probability approaches 1.
4. On miss the cache issues a lease token; a set is accepted only with
   a valid lease; any intervening delete/write invalidates outstanding
   leases → the delayed v1 set is refused. Aerospike: generation
   counters — conditional writes (generation-checked) make the
   cache-set a CAS that fails if the entry changed meanwhile.
5. Update-DB-then-delete-cache is the default: small bounded window,
   idempotent fix; delete failure bounded by TTL. Delete-then-update
   is worse: the gap invites re-population with the old value (Race 1
   through the front door). Update-in-place is worst under
   concurrency: interleaved DB/cache write orders → cache holds the
   losing value (lost update). Delete wins because it's idempotent
   and order-insensitive — any later read repairs via the source.
6. Invalidating inside the transaction lets a reader re-populate from
   the still-committed *old* value (the new one isn't visible yet) —
   stale immediately. After-commit ordering fixes that but makes
   commit+invalidate a dual-write: the invalidation can be lost
   (crash between) → stale until TTL → hence CDC-derived invalidation
   or TTL backstop as the structural completions.
7. Properties: fires only for committed changes (can't invalidate a
   rollback), and can't miss a commit (at-least-once from the log).
   Cost: lag (ms–s) becomes the staleness floor. Unfixed hole: the
   reader-side stale-set race (a slow reader can still write v1 after
   the CDC-driven delete) — needs leases/versioned-sets or TTL.
8. Immutable (cache forever, versioned keys); single-writer mutable
   (owner invalidates — tractable); multi-writer mutable (invalidation
   ownership unclear — races multiply; centralize writes or shorten
   TTLs); derived/computed (inputs change — requires dependency
   tracking; honest answers: short TTLs, or promote to a maintained
   materialized view instead of a cache).
9. Cached authorization after revocation (access continues past
   revocation — bound set by security policy, seconds not minutes);
   cached device-binding state where a stale "bound" passes an
   unbound/compromised device (payment gating — bound is a security
   parameter); (also: stale price/limit undercharging or
   over-extending credit). Principle: the tolerable staleness bound is
   set by the owner of the harm (security/finance), not by the latency
   optimizer.
10. Age-at-serve distribution (store write-timestamp in the entry,
    emit age on read); invalidation delivery lag (CDC/pub-sub consumer
    lag age); canary comparison (sample N reads/min, compare cache vs
    source, alert on mismatch rate) — recon applied to caches.
11. Callbacks = explicit event-driven invalidation/update of the local
    view (fast, best-effort, lossy at the tails); recon force-query =
    the TTL-like backstop that bounds divergence duration regardless
    of cause (slow, complete). Push-for-latency, pull-for-truth — the
    same two-channel design as cache invalidation done right.
12. Harms: revoked employee/token retains access up to TTL
    (offboarding/incident-response floor); audit trail contradicts
    reality (revoked-at-T vs served-after-T); compromised-credential
    lockout delayed platform-wide. Epoch fix: cache grants keyed by
    (user, epoch); any revocation bumps the user's epoch (one small
    authoritative read on the hot path); all prior cached grants
    become unreachable instantly — versioned keys converting
    revocation into an O(1) pointer bump.

</details>
