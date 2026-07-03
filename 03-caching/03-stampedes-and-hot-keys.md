# Stampedes, Thundering Herds, and Hot Keys

The failure modes where caching stops protecting your source and starts
aiming at it. Three related beasts: the **stampede** (one key's expiry ×
concurrent demand), the **mass-expiry storm** (many keys dying together), and
the **hot key** (one key exceeding one node). All three are staples of design
interviews because they have crisp mechanics and named, layered fixes.

---

## 1. Plain definition

**Cache stampede (dogpile):** a popular key expires; between the expiry and
the first re-population, EVERY request for it misses and goes to the source
— N concurrent identical queries for data that one query could have fetched.
The math that makes it an incident: recompute cost C (say, an expensive
50 ms aggregate query) × concurrency K (requests arriving during the window
≈ QPS × C) — a key read 2,000×/s with a 50 ms recompute takes ~100
simultaneous identical queries at every expiry; if the source slows under
that, C grows, K grows with it, and the loop runs away (the metastable
shape again — `05-resilience/04-retries.md` §3).

Analogy: a bakery's one bread oven (source) protected by a display case
(cache). When the case empties, every customer in line walks into the
kitchen and orders a loaf *individually* — the oven gets 40 orders for what
is literally the same loaf. The fixes will all be versions of: send ONE
person to the kitchen, keep serving yesterday's bread meanwhile, or restock
before the case empties.

**The general truth underneath:** a cache converts steady load into
*conditional* load — near-zero normally, full fury at misses. Every
stampede pattern is about controlling **when misses happen** (de-
synchronize) and **how many requests a miss costs** (coalesce to one).

---

## 2. The fix toolkit (know each mechanism + where it applies)

### 2.1 Request coalescing / single-flight

The first miss becomes the *loader*; concurrent requests for the same key
**wait for its result** instead of launching their own. In-process:
Caffeine/Guava `get(key, loader)` does this natively (per-JVM). Across a
fleet: a **distributed lock/lease on the loader role** — memcached's
*lease-get* (miss returns a lease token; only the token-holder may set;
others get "wait/retry" or stale data), or a short-TTL "loading" marker in
the cache (SETNX-style). Turns K source-queries into 1 + (K−1) waits.
Cost: waiters add latency (bounded by C) and the loader is a
single-point-of-slowness — pair with a loader timeout + fallback.

### 2.2 Stale-while-revalidate (SWR)

Entries carry both a *soft* TTL (freshness) and a *hard* TTL (existence).
Between soft and hard expiry, requests are served the **stale value
immediately** while ONE background refresh runs. Users never wait on
recompute; the source sees one refresh per key per cycle. The default
answer for display data (HTTP has it standardized:
`Cache-Control: stale-while-revalidate`). Cost: bounded, *declared*
staleness — which you already know how to reason about
(`02-invalidation-and-consistency.md`).

### 2.3 Probabilistic early refresh (XFetch)

Each request rolls dice weighted by recompute-cost and time-to-expiry
(`refresh if now − Δ·β·ln(rand) ≥ expiry`); as expiry nears, *some one
request* refreshes early — expiry never actually arrives for hot keys.
Elegant, no coordination, per-key self-tuning. Name-drop with the
mechanism ("optimal probabilistic cache stampede prevention" — the
XFetch paper) and you've banked a depth point.

### 2.4 De-synchronization: TTL jitter

Mass-expiry storms come from *correlated birth*: deploy-time warm, bulk
loads, midnight cron refreshes give thousands of keys identical expiry.
±10–20% random jitter spreads the die-off. Trivial, universally
applicable, embarrassing to lack.

### 2.5 Never-expire + background refresh (for the known-hot set)

For keys you KNOW are hot (home-page config, top merchants), don't let
demand drive loading at all: pin them (no TTL-driven expiry) and refresh
on a schedule / on CDC events — the cache becomes a push-maintained view
for that key class (the materialized-view end of the spectrum, again).
Misses on these keys become impossible rather than survivable.

### 2.6 Cold start and the cache-restart storm

The catastrophic generalization: the *whole cache* is empty (cluster
restart, flush, new region) → 100% miss rate → the source receives its
full unshielded load, likely for the first time in years. Defenses:
**warming** (replay recent keys / snapshot-and-restore / shadow traffic
before taking live traffic), **gradual traffic ramp** (admit load in
steps while hit-ratio climbs), **request coalescing fleet-wide** (bounds
the per-key damage), and — the honest architectural one — the
**load-bearing decision** from `01-cache-patterns.md` §3: if the DB can't
survive miss storms, the cache is tier-1 infrastructure with HA and
restart runbooks, and "we flushed the cache" belongs in the same risk
category as "we dropped a table."

---

## 3. Hot keys (one key > one node)

A single key lives on one shard/node (`01-distributed-systems/
04-partitioning.md` P3 — same problem, cache edition): a celebrity
profile, a viral item, THE config key. At some QPS, that node's CPU/NIC
saturates regardless of cluster size — adding nodes changes nothing
(the key doesn't shard).

The escalation ladder:
1. **Detect:** per-key/per-node metrics (hot-key sampling; Redis
   `--hotkeys`, Aerospike per-node skew) — you can't fix what you
   attribute to "general load."
2. **L1/local caching:** replicate the hot value into every pod's
   in-process cache with seconds-scale TTL — the distributed tier's QPS
   for that key drops by orders of magnitude; staleness bounded and
   tiny. The standard first fix — hot keys are precisely where
   multi-tier earns its complexity.
3. **Key replication:** write the value under N copies
   (`key#0..key#N−1`); readers pick one at random — the load spreads
   across N nodes; writers update all copies (or versioned copies +
   short TTL). Trade: N× invalidation fan-out and transient
   copy-divergence.
4. **Request coalescing at the client tier** — many callers, one
   fetcher per pod (§2.1) compounds with L1.
5. **Dedicated capacity / CDN-push:** for planetary hot keys (flash
   sales), push the value to the edge or dedicated replicas —
   the key stops being a cache entry and becomes distributed content.

---

## 4. Senior-level depth

- **Stampedes are metastable-failure seeds:** miss storm slows the
  source → C grows → more overlap → more concurrent misses → loop.
  The stampede toolkit is loop-gain reduction (coalescing caps K at 1;
  SWR removes user-facing waits; jitter de-correlates) — connect it to
  the retry-storm/goodput material and you're synthesizing across the
  repo (`05-resilience/06-load-shedding-degradation.md`).
- **Coalescing needs a deadline and a fallback:** the single loader can
  hang; waiters must have a timeout → then serve stale / degrade /
  error-fast — otherwise you've built a one-thread bottleneck with a
  fan-in of thousands (bulkhead thinking applied to the loader role).
- **Negative-lookup stampedes:** a hot *nonexistent* key (deleted
  viral content, enumeration attack) stampedes exactly like a real
  one — negative caching + coalescing must cover misses-of-nothing
  too (`01-cache-patterns.md` §2.3).
- **The dogpile after invalidation:** explicit invalidation of a hot
  entity *manufactures* a stampede at write time
  (`02-invalidation-...md` §3) — hot-entity writers should pair
  invalidation with immediate re-population (write-through for the
  hot set) or SWR semantics rather than naked deletes.
- **L4/L5/L6:** L4: "use a mutex so one request recomputes." L5: the
  full toolkit with mechanisms (leases, SWR soft/hard TTLs, XFetch,
  jitter, warming/ramp), the hot-key ladder, coalescing deadlines,
  and the metastable connection. L6: platform defaults — coalescing
  and jitter baked into the org's cache client library so nobody can
  forget, restart/warming runbooks as release-gate requirements,
  hot-key detection as standing telemetry.

---

## 5. Resume connection

- **Your best stampede story is architectural:** the rewards aggregate
  is a *materialized view precisely to make the stampede impossible* —
  the cache-based alternative (compute-on-read + cache) would have had
  O(history) recompute cost C at the hottest read path; you moved the
  work to the write path instead (`00-resume-arsenal/02-...md` A1 —
  "the cold-start stampede is a design input, not an ops problem").
- **Aerospike restart/cold-start semantics:** your fingerprint/token
  data is flash-persistent — restart ≠ empty (index rebuilds from
  device **[VERIFY: fast-restart/shared-memory behavior on your
  version]**) — a deliberate contrast to RAM-only caches where restart
  = stampede; one more reason "not a cache" matters operationally.
- **Hot-key exposure to audit [VERIFY]:** platform-wide config entries
  or bank-list lookups read on every eligibility check are your likely
  hot keys — do they ride L1/process caches or hit Aerospike every
  time? Knowing your answer (either is fine; not knowing isn't) closes
  the loop.

**30–60 s spoken answer** ("how do you prevent cache stampedes?"):

> "Two levers: control when misses happen, and cap what a miss costs.
> Capping cost is request coalescing — the first miss becomes the
> loader, everyone else waits for its result: per-process via
> Caffeine-style loading caches, fleet-wide via lease-gets, where only
> the lease holder may repopulate — with a deadline and a stale
> fallback on the loader, because a hanging loader with thousands of
> waiters is a new bottleneck. Controlling when is stale-while-
> revalidate — soft and hard TTLs, serve stale instantly while one
> background refresh runs, so users never wait on recompute — plus TTL
> jitter so correlated warm-up doesn't become correlated death, and
> for the known-hot set, never-expire with push refresh, which is
> really a materialized view. That's actually our rewards design: we
> made the aggregate a write-path-maintained view instead of a
> compute-on-read cache precisely because the recompute cost was
> O(user history) on our hottest screen — the stampede was designed
> out, not mitigated. Hot keys are the other beast — one key
> saturating one node, where adding nodes does nothing — and the
> ladder is: detect with per-key metrics, L1 per-pod caching with
> seconds of TTL, then key replication across N copies if it's still
> hot. And the catastrophic case is cold start: a cache restart sends
> the source its full unshielded load, so either the DB is sized for
> miss storms or the cache is tier-one infrastructure with warming
> and ramped admission — that decision has to be explicit."

---

## 6. What the interviewer will push on

**P1. "A key serving 5,000 req/s with an 80 ms recompute expires. Walk
me through the next 500 ms with and without mitigations."**
- *Model:* without: ~400 requests arrive during the 80 ms recompute
  window; all miss; ~400 identical queries hit the source; source
  slows under the burst → C stretches → more overlap → possibly
  runaway; users see 80 ms+ latency spikes and the DB sees a 400×
  burst for one key. With coalescing: 1 query, 399 waiters (bounded
  by loader deadline), source sees ~nothing. With SWR: zero user-
  facing waits (stale served), 1 background refresh. With XFetch:
  the expiry never arrives — someone refreshed early. Then the
  layered answer: jitter + SWR + coalescing compose; each covers the
  others' edges.
- *Trap:* mutex-only answers with no waiter deadline or stale
  fallback; not doing the K ≈ QPS × C arithmetic.

**P2. "Your Redis cluster restarts at peak. The DB is sized for 5% of
read traffic. Minute by minute."**
- *Model:* t0: 100% miss → DB receives ~20× its capacity → saturates
  → latency explodes → timeouts upstream → retries amplify
  (metastable ignition). Immediate: shed at the edge (serve degraded/
  stale-from-anywhere, feature-flag expensive surfaces off), coalesce
  per key fleet-wide, admit traffic in ramps while hit-ratio climbs;
  warm from a key-frequency snapshot if one exists. Then the
  postmortem-grade fixes: cache HA (replication so restart ≠ empty),
  persistent cache tiers, warming pipelines, and the governance
  answer — this DB:cache sizing ratio made the cache tier-1
  infrastructure years ago; treat it that way (runbooks, restart
  procedures, capacity reviews). Cite the bakery: everyone walked
  into the kitchen at once.
- *Trap:* "the DB autoscales" (minutes vs seconds —
  `05-resilience/06-...md`) or missing the retry-amplification
  second act.

**P3. "Design hot-key handling for a flash-sale item page: 1 M req/s
for one SKU."**
- *Model:* run the ladder to its top: this is planetary-hot — CDN/edge
  cache the rendered payload (seconds TTL + SWR semantics at the
  edge), L1 in every pod for the API path, key replication in the
  distributed tier as the floor, request coalescing everywhere, and —
  the design insight — split the key: static content (description,
  images — cache forever, versioned keys) from the dynamic sliver
  (stock count — which should NOT be a cached read at all but a
  server-pushed/approximate value: "low stock" bands, not live
  integers; exact stock is checked at the *write* — order placement —
  with conditional writes, the strengthen-the-write principle).
  Numbers: 1 M/s never reaches origin; origin sees refresh traffic
  ~1/s per edge region.
- *Trap:* trying to serve live stock counts from cache at 1 M/s —
  splitting static-from-dynamic and moving exactness to the write
  path is what's being fished for.

**P4. "When is a stampede actually fine to ignore?"**
- *Model:* when K × C is small relative to source headroom: low-QPS
  keys (K≈1 — no herd exists), cheap recomputes (C ~1 ms point reads
  — a 20-query burst is noise), or sources explicitly sized for full
  miss traffic (the optimization-branch cache). The math IS the
  answer: stampede severity ≈ QPS × C × (source fragility);
  mitigate where the product is scary, skip the machinery where it
  isn't — engineering maturity includes not installing every
  pattern everywhere (`04-outbox-and-cdc.md` §3's "when not to
  bother," caching edition).
- *Trap:* reflexive "always coalesce" — the question tests
  calibration; complexity budgets are real.

---

## Self-test

1. Define the stampede with its K ≈ QPS × C arithmetic and the
   runaway loop it can ignite.
2. The two levers all fixes reduce to.
3. Single-flight/coalescing: in-process vs fleet-wide mechanisms, and
   the two failure controls the loader needs.
4. SWR: the two TTLs and what each governs; who waits, who refreshes.
5. XFetch in two sentences — what makes it coordination-free?
6. Why do mass-expiry storms happen, and the two-word fix?
7. The cold-start storm: three immediate mitigations + the two
   architectural ones.
8. The hot-key ladder, all five rungs, with the trade at rung 3.
9. Why does explicit invalidation of a hot entity manufacture a
   stampede, and what pairs with it?
10. Your rewards design as stampede prevention: state the argument.
11. The flash-sale SKU design: the split and the
    strengthen-the-write move.
12. When do you skip the machinery? Give the severity formula.

<details>
<summary><b>Answers</b></summary>

1. On a hot key's expiry, all requests during the recompute window
   miss: concurrent identical source queries K ≈ QPS × C (recompute
   time). If the burst slows the source, C grows → the window grows →
   K grows — self-reinforcing until the source collapses (metastable
   ignition).
2. Control WHEN misses happen (de-synchronize: jitter, SWR, XFetch,
   scheduled refresh) and cap WHAT a miss costs (coalesce K
   concurrent misses into one loader).
3. In-process: loading caches (Caffeine get-with-loader) — per-JVM
   single-flight. Fleet-wide: lease-get (miss returns a token; only
   the holder may set; others wait/serve-stale) or a SETNX "loading"
   marker. Loader needs: a deadline (waiters time out to a fallback)
   and a fallback (serve stale/degrade) — else one hung loader
   becomes a thousand-waiter bottleneck.
4. Soft TTL = freshness bound (after it, entry is stale but
   servable); hard TTL = existence bound (after it, true miss).
   Between them: all requests get the stale value immediately
   (nobody waits); exactly one background refresh runs. Users never
   pay C; the source sees one refresh per cycle.
5. Each request independently decides to refresh early with
   probability rising as expiry approaches (weighted by recompute
   cost: now − Δ·β·ln(rand) ≥ expiry). No locks or markers — the
   randomness itself elects "someone" to refresh before expiry, so
   hot keys never actually expire.
6. Correlated birth: deploy warm-ups, bulk loads, and cron refreshes
   stamp thousands of keys with identical TTLs → synchronized
   die-off → miss storm. Fix: "jitter TTLs" (±10–20%).
7. Immediate: edge shedding/degradation (serve stale or reduced
   content), fleet-wide per-key coalescing, ramped traffic admission
   while hit-ratio recovers (+ warm from key-frequency snapshots).
   Architectural: cache HA/persistence so restart ≠ empty, and the
   explicit load-bearing decision (DB sized for misses, or cache
   treated as tier-1 with warming runbooks).
8. Detect (per-key/per-node telemetry) → L1 per-pod caching
   (seconds TTL) → key replication key#0..N−1 (readers randomize;
   trade: N× invalidation fan-out + transient copy divergence) →
   client-tier coalescing (compounds with L1) → dedicated
   capacity/CDN push (the key becomes distributed content).
9. The delete creates a synchronized miss on the hottest possible
   key at write time — every reader herds to the source
   simultaneously. Pair hot-entity invalidation with immediate
   re-population (write-through for the hot set) or SWR semantics
   (serve the old value while the new one loads).
10. The alternative design — compute-on-read + cache — has C =
    O(user's full history) on the platform's hottest screen; any
    expiry/cold-start is a guaranteed stampede of expensive scans.
    Making the aggregate a write-path-maintained, durable,
    versioned view sets C≈0 on the read path and removes expiry
    entirely: the stampede was designed out at the architecture
    layer, not mitigated at the ops layer.
11. Split static (description/images: immutable, versioned keys,
    edge-cached forever) from dynamic (stock: never a hot cached
    read — serve banded/approximate values, and enforce exactness
    at the write with conditional order placement). Reads get
    approximate freshness; correctness moves to the write path —
    the strengthen-the-write principle.
12. Severity ≈ QPS × C × source-fragility. Skip when: K≈1 (unpopular
    keys), C tiny (cheap point reads), or the source is provisioned
    for full miss traffic (optimization-branch cache). Install
    coalescing/SWR where the product of the three is scary; carry no
    machinery where it isn't.

</details>
