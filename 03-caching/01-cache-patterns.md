# Cache Patterns

Caching looks like the easiest topic in the repo and produces some of the
subtlest production bugs in it. This doc covers the placement and write
patterns; the next two cover the two famous hard parts (invalidation,
stampedes). Your platform adds a twist worth exploiting in interviews: your
"cache tier" (Aerospike) is mostly *not* a cache — and knowing exactly why
sharpens every definition in this directory.

---

## 1. Plain definition

A **cache** is a smaller, faster store holding *copies* of data whose
authoritative version lives elsewhere, bet on the observation that access is
skewed — a small fraction of data serves a large fraction of requests
(Zipf/80-20). Three distinct payoffs (name which one you're buying — they
tune differently):

1. **Latency:** serve from memory/nearby instead of disk/far away. The
   gaps that make it work: RAM ~100 ns, NVMe ~50–100 µs, intra-DC RTT
   ~0.5 ms, cross-region ~50–150 ms, a relational query ~1–10 ms. A cache
   moves you up this ladder by 1–4 orders of magnitude.
2. **Load protection:** absorb reads so the source survives (the DB does
   1% of the reads it would otherwise). Often the *real* reason — the
   source would fall over, latency aside.
3. **Cost:** RAM+flash serving is cheaper per read than scaling the
   authoritative store (fewer replicas, smaller instances).

The defining property — and the source of every hard problem here — is
**copy-ness**: the cache can be wrong (stale) the instant the source
changes, and everything in `02-invalidation-and-consistency.md` follows.
If the data has no authoritative home elsewhere, it's not a cache — it's a
store, and it must be treated with store discipline (durability,
replication). That boundary is tested in §4.

---

## 2. The patterns

### 2.1 Read patterns

- **Cache-aside (lazy loading)** — the default 90% answer: app checks
  cache → miss → app reads DB → app populates cache (with TTL) → returns.
  Wins: simple, cache failures degrade to DB reads (fail-open by shape),
  only requested data is cached. Costs: first-request latency (miss
  penalty), the *app* owns consistency (invalidation races —
  next doc), and every service duplicates the load-and-populate logic.
- **Read-through:** same laziness, but the *cache layer* owns loading
  (app asks cache; cache misses → cache loads from DB itself). Wins:
  centralizes loading logic, enables library-level goodies (coalescing,
  refresh-ahead — Caffeine/Guava do this in-process). Cost: the cache
  needs to know how to load (coupling), and a distributed read-through
  tier is a component you operate.
- **Refresh-ahead:** proactively reload entries *before* expiry for
  known-hot keys — converts miss-latency into background work
  (stampede-relevant — `03-stampedes-and-hot-keys.md`).

### 2.2 Write patterns

- **Write-through:** writes go to cache AND source synchronously; cache
  is never stale w.r.t. your own writes. Cost: write latency = slower of
  the two; cache fills with written-but-never-read data (write-heavy
  workloads pollute).
- **Write-behind (write-back):** write to cache, ack, flush to source
  asynchronously (batched/coalesced). Wins: write latency = cache
  latency; batching absorbs bursts. Costs — and they're serious: **acked
  data loss** if the cache tier dies before flush (the cache became a
  durability-critical store without store guarantees), plus reordering/
  coalescing effects on the source, plus read-your-writes against the
  *source* breaks (DB lags the cache). Use only where loss is tolerable
  (view counters) or the "cache" is genuinely durable (at which point
  you've built a write buffer/log — say so).
- **Write-around:** write to source only; let reads cache-aside it in.
  Right when written data is rarely re-read soon (bulk loads, logs).

### 2.3 Placement tiers

- **Local/in-process (Caffeine):** ~100 ns, zero network, per-instance —
  N pods = N caches (inconsistent with each other; invalidation needs
  pub/sub), memory competes with the heap/GC. Right for: tiny hot sets
  (config, feature flags), request-scope memoization.
- **Distributed (Redis/Aerospike/memcached):** ~0.3–1 ms, shared truth
  across the fleet, independent capacity. The workhorse tier.
- **Multi-tier (L1 in-process + L2 distributed):** hot-hot keys served
  at nanoseconds, L2 as shared floor — with L1 invalidation as the new
  hard problem (short L1 TTLs, or invalidation broadcast via pub/sub —
  the standard design; be ready to sketch it).
- **Edge/CDN:** the same patterns at HTTP scope (cache-control headers =
  TTLs; purge APIs = invalidation) — one sentence of awareness; deep
  dive lives in `13-networking/` and `07-system-design/` when written.
- **Negative caching:** cache "not found" results (with short TTLs) —
  otherwise misses for nonexistent keys (abuse, typos, enumeration) hit
  the DB every time; a classic omission interviewers probe with "what
  if someone queries keys that don't exist?"

---

## 3. Senior-level depth

- **The cache/store/materialized-view triangle** (the recurring theme of
  this repo, now completed): a **cache** holds evictable *copies* with a
  staleness contract; a **store** holds authoritative state (durability
  obligations); a **materialized view** holds *derived* data maintained
  on the write path, rebuildable from ground truth, often durable
  (`02-databases/03-indexing.md` §3.3). Misclassifying is the root bug:
  treating a store like a cache (evicting dedup tokens = correctness
  hole), treating a cache like a view (assuming it's maintained — it's
  not, it decays), treating a view like a cache (rebuilding it via
  misses = stampede by design). Interview power move: classify before
  designing.
- **Caches change your failure math both ways.** They protect the source
  in steady state and *endanger* it in failure: a cache tier restart
  sends 100× load at a DB sized for 1× (`03-stampedes-...md`). Decide
  explicitly: is the cache load-bearing infrastructure (DB is *never*
  sized for miss storms — then the cache needs HA, warming, and
  degradation plans) or an optimization (DB survives full miss traffic —
  then keep it simple)? Most orgs drift from the second to the first
  without noticing; saying that out loud is a senior observation.
- **What not to cache:** money-gating reads (balance checks before
  debits — the error direction is overspend; strengthen the write with
  CAS instead — `01-distributed-systems/02-consistency-models.md` P3),
  anything whose staleness cost exceeds its latency win, and data
  cheaper to recompute than to fetch (tiny pure functions).
- **L4/L5/L6:** L4 knows cache-aside + TTL. L5 chooses patterns per
  workload with the write-pattern risk ledger, designs multi-tier with
  L1 invalidation, classifies cache/store/view correctly, and states
  the load-bearing-or-optimization decision. L6 sets platform policy:
  who may depend on cache availability, negative-caching and
  fail-open defaults in the client library, cache capacity as a
  first-class budget.

---

## 4. Resume connection

Run the classification on your own Aerospike tier — it's a better answer
than "we cache in Aerospike":

- **Device fingerprints: a store, not a cache.** Authoritative record of
  device binding (written at bind ceremony, read at every payment). No
  eviction tolerable, durability required (flash persistence), cold
  start = payment outage. It has cache-*like latency* because Aerospike
  is fast, not cache semantics.
- **Dedup tokens: short-lived state, not a cache.** Not a copy of
  anything — the token IS the record of "this request ID was seen."
  TTL'd because the *business horizon* expires, not because eviction is
  safe. Loss = correctness exposure (bounded by deeper layers —
  arsenal D2).
- **VPA/reverse lookups [VERIFY]:** likely genuine cache-aside copies of
  user-service truth — the one true cache in the set.
- **Rewards aggregate: materialized view** — maintained on the write
  path, durable, rebuildable, versioned (`00-resume-arsenal/02-...md`
  A1 made this exact distinction).
Saying "our Aerospike tier holds one cache, one store, and one kind of
short-lived state — and they have different loss semantics" is a
memorable, precise answer that most candidates cannot produce about
their own systems.

**30–60 s spoken answer** ("how do you use caching?"):

> "Carefully, starting with a classification, because our fast tier is
> mostly *not* a cache. A cache holds evictable copies with a staleness
> contract; a store holds authoritative state; a materialized view holds
> derived data maintained on the write path and rebuildable. In our
> Aerospike tier, device fingerprints are a store — authoritative,
> durable on flash, where a cold start is a payment outage, not a miss
> penalty; dedup tokens are short-lived state — the token IS the record,
> TTL'd on the business retry horizon, not because eviction is safe; and
> lookup data is the one genuine cache-aside cache. Our rewards
> aggregate is deliberately a materialized view rather than a cache —
> maintained on the write path, durable, rebuildable from ground truth —
> because a cache there would mean stampedes on cold start and no
> correctness protocol. Where we do cache, the pattern defaults are
> cache-aside with TTLs, negative caching on miss-prone lookups, and an
> explicit decision about whether the cache is load-bearing — because a
> cache that protects your database in steady state is also the thing
> that DDoSes it on restart, and you size and plan for whichever
> relationship you've chosen."

---

## 5. What the interviewer will push on

**P1. "Cache-aside vs read-through vs write-through vs write-behind —
pick for: session data, product catalog, view counters, exchange rates."**
- *Model:* sessions — distributed store-not-cache (authoritative,
  loss = logout) or cache-aside over a session DB; catalog —
  cache-aside/read-through + longish TTL + CDC-driven invalidation
  (read-heavy, staleness tolerable, updates rare); view counters —
  write-behind is legitimate (loss tolerable, batching wins) or better:
  counters in the cache tier flushed periodically; FX rates —
  refresh-ahead on a schedule (data is *time-based*, everyone wants the
  same key — one background fetch, never user-facing misses). The
  scoring is per-workload reasoning, not pattern trivia.
- *Trap:* write-behind for anything whose loss you can't shrug off —
  the interviewer picked the list so one item tempts you.

**P2. "Walk me through what breaks when you add an in-process L1 over
your distributed L2."**
- *Model:* you've created N+1 copies with independent staleness: L1s
  disagree with each other and with L2 (a user hitting two pods sees
  flicker — monotonic-reads violation, `02-consistency-models.md`);
  invalidation now needs fan-out (pub/sub broadcast to all pods, or
  accept short L1 TTLs as the staleness bound); memory competes with
  heap (GC pressure — `06-concurrency-java/` when written); and
  warm-up per deploy (every rollout is N cold L1s). When it's worth
  it: read rates where even 0.5 ms × QPS is real CPU/network, tiny
  hyper-hot key sets (config, flags, top content). Give the design:
  L1 TTL of seconds + L2 TTL of minutes + invalidation topic
  best-effort — bounded staleness, cheap.
- *Trap:* adding L1 "for performance" with no invalidation story or
  staleness bound stated.

**P3. "Your write-behind cache node dies with 30 seconds of unflushed
writes. What did you lose and who notices?"**
- *Model:* every acked-but-unflushed write is gone from the source's
  perspective — and *nothing notices by default*: callers got success,
  the DB never saw it, no error fired. Detection requires recon-shaped
  comparison or downstream absence (a report doesn't add up). This is
  the pattern's true cost: it converts a cache into a
  durability-critical store silently. Mitigations if you must:
  replicated cache tier with persistence (you've built a write
  buffer/queue — name it honestly), bounded flush lag with monitoring,
  and scoping write-behind to loss-tolerable data only. The
  meta-answer: "acked data loss with no error is the worst failure
  class in this repo — silent wrongness."
- *Trap:* "we'd replay from cache persistence" — then it's not the
  scenario (the node died); the question tests whether you see the
  silent-loss shape.

**P4. "Why is your rewards aggregate NOT a cache? Convince me the
distinction matters operationally."**
- *Model:* four operational differences: (1) maintenance — updated
  transactionally-ish on the write path (event-driven with CAS), never
  decays; a cache is populated by misses and decays by TTL/eviction;
  (2) cold start — view is always present (durable); a cache would
  rebuild via misses = O(history) scans exactly at peak
  (stampede-by-design); (3) correctness — the view participates in the
  idempotency/CAS protocol (versioned); caches bypass it;
  (4) loss semantics — view loss = re-derivation (a procedure); cache
  loss = miss storm (an incident). Same bytes, different contract —
  and the contract drives sizing, HA, and on-call runbooks.
- *Trap:* "it's semantics" — the four operational deltas are the
  point; this is your own design, so fluency here is mandatory.

---

## Self-test

1. The three payoffs of caching and the latency ladder with numbers.
2. Define copy-ness and derive why invalidation problems are inevitable
   from it.
3. Cache-aside vs read-through: who loads, and what does centralizing
   the loader enable?
4. The write-pattern ledger: write-through, write-behind, write-around —
   cost and the workload each fits.
5. Why does write-behind silently violate the repo's worst-failure
   rule? Name the rule.
6. Multi-tier L1/L2: the three new problems and the standard design.
7. What is negative caching and what attack/load class does it stop?
8. The cache/store/materialized-view triangle: definitions and one
   misclassification bug per direction.
9. Classify your Aerospike tier's three data classes with loss
   semantics for each.
10. "Load-bearing or optimization" — define the decision and what each
    branch obligates.
11. Name three things you should refuse to cache and the principle
    behind each.
12. Four operational differences between your rewards view and a cache.

<details>
<summary><b>Answers</b></summary>

1. Latency (RAM ~100 ns → NVMe ~50–100 µs → intra-DC RTT ~0.5 ms → DB
   query ~1–10 ms → cross-region ~50–150 ms; caching climbs the
   ladder), load protection (source sees 1−hit-ratio of traffic), cost
   (RAM/flash reads cheaper than scaling the authoritative store).
2. A cache holds copies whose authority lives elsewhere; the source can
   change the instant after any copy is made, so every copy is
   potentially wrong from birth — staleness isn't a bug but the
   definition; all invalidation machinery is negotiating the bound on
   it.
3. Cache-aside: the application loads on miss and populates (owns the
   logic, duplicated per service). Read-through: the cache layer loads
   (app sees one API). Centralizing enables request coalescing,
   refresh-ahead, consistent negative caching, and one place to fix
   invalidation races.
4. Write-through: +write latency (slower of two), cache never stale to
   own writes; read-heavy data that's re-read soon after writes.
   Write-behind: cache-speed writes + batching; acked-loss risk +
   reordering; loss-tolerable high-rate writes (counters). Write-
   around: source-only writes; data rarely re-read soon (bulk/logs) —
   avoids polluting cache with write-once data.
5. It can lose *acknowledged* writes with no error signal — the caller
   was told success, the source never saw it, nothing alarms. Rule:
   silent wrongness is worse than loud failure ("eventually right,
   never silently wrong") — write-behind without durability breaks it
   by construction.
6. Inter-L1 inconsistency (flicker across pods — monotonic reads),
   invalidation fan-out (N caches to notify), per-deploy cold L1s
   (+ heap/GC pressure). Standard design: seconds-scale L1 TTL +
   minutes-scale L2 TTL + best-effort pub/sub invalidation broadcast =
   cheap bounded staleness.
7. Caching "key does not exist" with a short TTL. Stops miss-storms
   from nonexistent keys — enumeration/abuse, typo'd IDs, retried
   lookups for deleted entities — which otherwise pass through to the
   DB on every request (the cache can't help without it: misses by
   definition).
8. Cache: evictable copies, staleness contract. Store: authoritative,
   durability obligations. View: derived, write-path-maintained,
   rebuildable. Bugs: store-as-cache (evicting dedup tokens/device
   bindings = correctness hole); cache-as-view (assuming freshness
   maintenance that doesn't exist — decayed data treated as truth);
   view-as-cache (rebuilding via read-misses = stampede + O(history)
   at peak).
9. Device fingerprints: store — durable, no eviction, cold start =
   payment outage. Dedup tokens: short-lived state — the token IS the
   record; TTL = business retry horizon; loss = bounded correctness
   exposure (deeper layers absorb). Lookup caches (VPA/reverse
   lookups): true cache-aside copies — loss = miss penalty only.
10. Is the source sized to survive full miss traffic? Optimization
    branch: yes — keep the cache simple, let it fail-open.
    Load-bearing branch: no — the cache is availability-critical
    infrastructure: HA/replication, warming plans, restart runbooks,
    degradation modes, and capacity reviews like any tier-1 system.
11. Money-gating reads (stale balance → overspend; strengthen the
    write with CAS instead — error-direction principle); data whose
    staleness cost exceeds the latency win (authorization/permission
    checks after revocation); data cheaper to recompute than fetch
    (trivial pure functions — cache adds a network hop and a
    consistency problem for negative value).
12. Maintenance: write-path event-driven with CAS vs miss-populated
    decay. Cold start: always-present durable rows vs rebuild-via-
    misses at peak. Correctness: versioned participant in the
    idempotency protocol vs bypass. Loss semantics: re-derivation
    procedure vs miss-storm incident — driving different sizing, HA,
    and runbooks.

</details>
