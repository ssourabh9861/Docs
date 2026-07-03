# Eviction and Sizing

The economics doc: a cache is a fixed budget of fast memory bidding on an
unbounded stream of candidates, and eviction is the auction rule. Plus the
sizing math — hit-ratio curves, the miss-cost multiplier, and why the jump
from 99% to 99.9% matters more than the jump from 50% to 90%. Short doc,
high probe-density: eviction-policy questions are cheap for interviewers to
ask and revealing to grade.

---

## 1. Plain definition

A cache is smaller than the data it fronts — by design (that's the
economics). When full, admitting a new entry means **evicting** an old one.
The eviction policy is a *prediction*: which resident entry is least likely
to be needed again soon? The theoretical optimum (Bélády's algorithm: evict
whatever is needed furthest in the future) requires clairvoyance — real
policies are heuristics approximating it from the past:

- **LRU (least recently used):** evict the longest-un-touched entry. Bet:
  recency predicts re-use (temporal locality). The default everywhere;
  cheap (linked list + map). **Weakness — scan pollution:** one bulk
  scan/batch job touches everything once, flushing the genuinely hot
  working set with one-hit wonders (the same attack InnoDB's midpoint
  LRU defends against — `02-databases/07-mysql-innodb-internals.md`).
- **LFU (least frequently used):** evict the least-*often*-used. Bet:
  frequency predicts re-use. Weaknesses: **aging** (yesterday's
  celebrity retains a huge count and squats forever — needs decay) and
  **cold-start bias** (new entries have count 1 and get evicted before
  proving themselves).
- **FIFO / random / CLOCK:** cheap approximations; second-chance/CLOCK
  is "LRU on a budget" (one reference bit, circular sweep) — the OS
  page-cache classic.
- **Segmented/SLRU & midpoint insertion:** probation + protected
  segments — entries must be touched *again* to earn the protected
  region; scans die in probation. (InnoDB's young/old sublists are
  exactly this.)
- **W-TinyLFU (Caffeine's policy — the modern answer):** the key insight
  is separating **admission** from **eviction**: keep a tiny frequency
  sketch (count-min, ~few bits/entry, periodically halved for aging)
  over recent traffic; on insertion, the candidate must *beat the
  would-be victim's frequency* to get in at all — one-hit wonders are
  refused at the door instead of evicting something proven. A small LRU
  "window" in front catches genuinely-new-and-hot items. Near-optimal
  hit ratios across wildly different traces; say "admission policy +
  frequency sketch" and the depth point is banked.
- **Redis/Aerospike reality:** Redis approximates LRU/LFU by *sampling*
  (N random keys, evict the best candidate — true LRU bookkeeping is
  too expensive at that scale) — knowing "Redis LRU is approximate" is
  a nice concrete detail. Aerospike evicts by *soonest-TTL* against
  high-water marks — eviction as early-expiry, which only makes sense
  because its data is TTL'd state, not recency-cached copies
  (`02-databases/06-aerospike-internals.md`; and disable eviction
  entirely on store-class namespaces — the classification from
  `01-cache-patterns.md` §4 becoming a config line).

---

## 2. Sizing: the math that justifies the RAM

### 2.1 The only latency formula you need

E[latency] = h·L_hit + (1−h)·L_miss. The lever is the **miss side**:
with L_hit = 1 ms and L_miss = 100 ms, going h: 99% → 99.9% cuts expected
latency ~2 ms → ~1.1 ms and — more importantly — cuts *source load 10×*.
**Rule: past ~90%, think in miss-ratio, not hit-ratio** — each "one more
nine" of hits is a 10× reduction in the traffic your source and your tail
latency actually feel. (Tail view: p99 is dominated by misses long before
the average moves — a 1% miss rate means p99 IS the miss latency.)

### 2.2 Hit-ratio curves and working sets

Hit ratio vs cache size is a curve with a knee: steep gains while the
cache is smaller than the **working set** (the hot fraction actually
re-referenced), flat after. Zipfian access (web reality) means a small
cache captures a lot (the head), but the tail is long — the last nines
are expensive. Practice: derive the curve empirically (shadow/replay
traffic against simulated sizes, or use miss-ratio-curve tooling), find
the knee, provision just past it; re-measure quarterly because working
sets drift. Estimate ingredients: item count × (payload + per-entry
overhead — metadata/pointers can be 50–100+ bytes/entry, dominating for
small values **(estimate)**) × replication.

### 2.3 The metrics that diagnose a cache

- **Hit ratio by key class** — a blended 95% can hide a 40% class
  murdering the DB; always segment.
- **Eviction rate + age-at-eviction:** evicting *young* entries (age ≪
  TTL) = cache too small (churn before re-use — thrashing); near-zero
  evictions with low hit ratio = the misses aren't capacity misses
  (compulsory misses: first-touch, or non-repeating traffic — a bigger
  cache won't help; that diagnosis question is P2).
- **Memory efficiency:** bytes serving hits vs bytes squatting
  (one-hit-wonder fraction — the number TinyLFU exists to fix).

---

## 3. Senior-level depth

- **The three miss types (steal the CPU-cache taxonomy):**
  *compulsory* (first reference — fix with warming/prefetch, not size),
  *capacity* (working set > cache — fix with size or better policy),
  *coherence/invalidation* (misses manufactured by your own
  invalidation — fix invalidation granularity, not size). Diagnosing
  WHICH miss type dominates before reaching for RAM is the senior
  move; "we doubled the cache and nothing improved" is always a
  misdiagnosed miss type.
- **Eviction interacts with everything upstream:** eviction of a hot
  key = self-inflicted stampede (`03-stampedes-...md`) — which is why
  hot-set pinning exists; eviction of store-class data = correctness
  hole (the classification, again); TTL and eviction are *independent
  clocks* (an entry can die by either — reason about both bounds).
- **Cost framing for L6 conversations:** cache value = misses-avoided ×
  miss-cost (source query cost + latency-SLO value) − RAM/ops cost.
  Sometimes the honest answer is a smaller cache + a better source
  (an index! — `02-databases/03-indexing.md` "caching over a missing
  index" anti-pattern), or no cache (recompute cheaper than fetch).
- **L4/L5/L6:** L4: "LRU, and we monitor hit ratio." L5: policy
  taxonomy incl. TinyLFU's admission insight and Redis sampling;
  miss-ratio thinking with the 10×-per-nine argument; miss-type
  diagnosis; age-at-eviction; per-class metrics. L6: the economics —
  miss-ratio curves driving provisioning, cache-vs-index-vs-recompute
  trade decisions, org-standard client policies.

---

## 4. Resume connection + spoken answer

- Your platform's eviction story is mostly the *refusal* of eviction:
  store-class namespaces (fingerprints, tokens) run eviction-disabled
  with capacity alarms — the correct posture, derived from
  classification **[VERIFY the config]**. Where you DO have
  cache-class data, Aerospike's TTL-based eviction fits because the
  data was TTL-shaped anyway.
- The miss-cost multiplier is your best framing for the rewards view
  once more: miss cost was O(history) — no hit ratio is high enough
  when L_miss is unbounded; you drove L_miss to ~0 by design instead.

**30–60 s spoken answer** ("how do you think about eviction and cache
sizing?"):

> "Eviction is a prediction problem — Bélády's optimum needs the
> future, so policies bet on the past: LRU bets on recency and loses
> to scans, LFU bets on frequency and loses to aging, and the modern
> answer — W-TinyLFU, what Caffeine runs — separates admission from
> eviction: a frequency sketch over recent traffic, and a new entry
> must beat the victim's frequency to get in at all, so one-hit
> wonders are refused at the door instead of evicting something
> proven. Operationally I watch three things: hit ratio *by key
> class*, because a blended 95 can hide a 40 that's murdering the
> database; eviction age, because evicting young entries means churn
> — the cache is too small; and past ninety percent I think in
> miss-ratio, not hit-ratio — 99 to 99.9 is a 10× cut in the load
> and tail latency the source actually feels. Sizing comes from the
> miss-ratio curve: provision just past the working-set knee, and
> diagnose the miss *type* before buying RAM — compulsory misses
> want warming, capacity misses want size or policy, and
> invalidation-manufactured misses want granularity fixes; doubling
> the cache fixes exactly one of the three. And in our platform the
> loudest eviction decision is refusal: the store-class data —
> device bindings, dedup tokens — runs eviction-disabled with
> capacity alarms, because evicting state isn't a miss penalty,
> it's a correctness hole."

---

## 5. What the interviewer will push on

**P1. "LRU vs LFU vs TinyLFU — pick per workload and tell me how each
one fails."**
- *Model:* LRU for temporal-locality traffic (sessions, recent-items)
  — fails under scans/batch pollution and periodic traffic (a key
  touched every 61 s with a 60-s-capacity LRU always misses). LFU for
  stable popularity (top content) — fails on drift (aged celebrities
  squat; needs decay) and cold starts (new-hot items die at count 1).
  TinyLFU: near-best across both because admission filters one-hit
  wonders while the window-LRU catches new-hot — its failure mode is
  adversarial/exotic (sketch collisions, attack traffic engineered to
  inflate counts) and slightly higher complexity. Then the pragmatic
  close: in-process → Caffeine (you get TinyLFU for free);
  distributed → whatever the store approximates (Redis sampled
  LRU/LFU), and lean on TTLs + classification more than policy
  perfection.
- *Trap:* policy trivia without failure modes — the scan-pollution
  and aging stories are the actual content.

**P2. "We doubled the cache size; hit ratio didn't move. Explain, then
diagnose."**
- *Model:* the miss-type diagnosis: (a) compulsory misses dominate —
  keys mostly seen once (long-tail lookups, UUID-keyed requests,
  scrapers): no size helps; fix = negative caching, request shaping,
  or accept it; (b) invalidation/coherence misses — your own
  TTL/invalidation churn manufactures misses independent of capacity:
  check age-at-eviction vs TTL (if entries die by TTL, size was never
  the constraint); (c) already past the working-set knee — the curve
  was flat where you spent. Instruments: age-at-eviction, one-hit
  fraction, miss-ratio curve from a trace. The senior shape:
  "hit ratio is an outcome; the miss histogram is the diagnosis."
- *Trap:* "the workload must be weird" — the three-way taxonomy with
  the instruments to distinguish them is what's scored.

**P3. "Your cache runs at 99% hit ratio. Why should I fund the work to
get 99.9%?"**
- *Model:* reframe both nines in miss terms: 1% → 0.1% = **10× less
  source traffic** (the DB's read fleet, connection pools, and
  replica count are sized on miss QPS — potentially real hardware
  savings) and the tail: at 1% misses, p99 latency IS the miss
  latency; at 0.1%, misses fall past p99 and the user-visible tail
  collapses to cache speed. Then the honest counterweight: the last
  nine costs the most RAM (Zipf tail) — so the case must be argued
  from the miss-cost side (expensive queries, tight SLO) and
  sometimes the right spend is cutting L_miss (index the query)
  instead of chasing h. Both-sides fluency wins this one.
- *Trap:* "higher is better" without the 10×-miss-load and
  tail-collapse arguments — the funding case lives in miss-side
  math.

**P4. "Design the eviction/sizing posture for your Aerospike tier."**
- *Model:* per-namespace by classification: store-class (device
  bindings) — eviction OFF, capacity high-water alarms, growth
  budgeted from user growth (records × 64 B index math —
  `02-databases/06-...md` P2); state-class (dedup tokens) — TTL =
  business retry horizon; "eviction" acceptable only as
  early-TTL under pressure IF the layered idempotency behind it is
  healthy — and alarm anyway because pressure-eviction shrinks the
  dedup window silently; cache-class (lookups) — TTL + eviction
  free, sized to the working-set knee. The answer's shape —
  *posture per classification, not per cluster* — is the point.
- *Trap:* one policy for the whole tier; or allowing eviction on
  the dedup namespace without naming the correctness consequence
  (silent dedup-window shrinkage under memory pressure — an
  invisible correctness dial).

---

## Self-test

1. State Bélády's optimum and what every real policy is doing
   relative to it.
2. LRU's and LFU's signature failure modes, and the InnoDB/SLRU
   defense.
3. W-TinyLFU: the admission insight, the sketch, and the window —
   why does each piece exist?
4. Why is Redis's LRU "approximate," and how does Aerospike's
   eviction differ philosophically?
5. The latency formula, and the argument for thinking in miss-ratio
   past 90%.
6. What does age-at-eviction diagnose in each direction?
7. The three miss types with the fix for each — and the
   "doubled-the-cache" question they answer.
8. How do you derive a size from a miss-ratio curve, and what's in
   the per-entry overhead that surprises people?
9. Why is p99 "the miss latency" at 1% miss rate?
10. Eviction as a correctness dial: name the two places in your
    platform where eviction must be off or alarmed, and why.
11. When is the right answer a smaller cache (or none)? Two cases.
12. Give the per-classification Aerospike posture in three lines.

<details>
<summary><b>Answers</b></summary>

1. Evict the entry whose next use is furthest in the future —
   requires knowing the future. Real policies are heuristics
   predicting future use from past signals (recency, frequency,
   admission-worthiness), approximating Bélády from history.
2. LRU: scan pollution — one pass of one-hit traffic evicts the
   proven working set; also blind to periodicity beyond its
   capacity horizon. LFU: aging — historically-hot entries squat on
   inflated counts (needs decay), and new entries die at count 1
   before proving heat. Defense: segmented LRU/midpoint insertion —
   newcomers enter probation and must be re-touched to reach the
   protected segment; scans die in probation.
3. Admission: don't evict a proven entry for an unproven one — the
   candidate must beat the victim's estimated frequency. Sketch: a
   count-min frequency estimate over recent traffic at ~bits per
   entry (periodically halved = aging/decay built in). Window: a
   small LRU in front so genuinely-new-hot items can accumulate
   frequency before facing the admission filter (fixes LFU's
   cold-start bias).
4. True LRU needs global recency bookkeeping per access — too
   expensive at Redis scale; it samples N random keys and evicts
   the best candidate among them (approximate). Aerospike evicts by
   soonest-TTL against high-water marks — early expiry rather than
   recency prediction — coherent because its data is TTL-shaped
   state, and eviction is disabled entirely for store-class
   namespaces.
5. E[latency] = h·L_hit + (1−h)·L_miss; source load ∝ (1−h). Past
   90%, hit-ratio deltas look tiny (99 vs 99.9) while the miss side
   changes 10× — and misses are what the source's sizing and the
   latency tail actually feel. Nines of hits = orders of magnitude
   of miss relief.
6. Low age-at-eviction (≪ TTL / ≪ typical re-use interval): capacity
   churn — entries evicted before their re-use arrives; cache too
   small or admission too loose. High age / dying-by-TTL: capacity
   is fine — misses are compulsory or invalidation-made; more RAM
   won't help.
7. Compulsory (first touch): warming, prefetch, negative caching —
   size-immune. Capacity (working set > size): more RAM or better
   policy. Coherence/invalidation (self-manufactured by TTL/
   invalidation churn): fix granularity/TTL design. The taxonomy is
   the answer to "we doubled it and nothing changed" — you funded
   the wrong miss type.
8. Replay/shadow a real trace against simulated sizes (or MRC
   tooling) → plot miss ratio vs size → find the knee (working
   set) → provision just past it, re-measure as workloads drift.
   Overhead: per-entry metadata (pointers, expiry, policy state,
   allocator slack) — 50–100+ bytes/entry, which dominates when
   values are small (a 40-byte value can cost 3× its size).
9. With 1% of requests missing, the 99th percentile falls inside
   the miss population — the slowest 1% ARE the misses, so p99 ≈
   L_miss regardless of a beautiful average. Cutting misses to
   0.1% pushes them past p99; the visible tail becomes cache-speed.
10. Device-binding namespace: eviction off — evicting a binding
    isn't a slow read, it's an unbound device passing/failing
    payment gates wrongly (store-class). Dedup-token namespace:
    pressure-eviction silently shrinks the dedup window (retries
    outliving their token = duplicate exposure) — off or loudly
    alarmed, sized from rate × retry-horizon.
11. When misses are cheap (indexed point reads ~1 ms — the cache
    adds a hop and an invalidation problem for marginal win: fix
    the source with an index instead), and when data is cheaper to
    recompute than fetch/store (small pure derivations). Cache
    value = miss-cost × misses-avoided − RAM/ops/complexity; the
    formula sometimes says no.
12. Store-class (bindings): eviction OFF, high-water alarms, growth
    budgeted by record-count × index math. State-class (tokens):
    TTL = business retry horizon; no pressure-eviction without
    alarms (correctness dial). Cache-class (lookups): TTL + free
    eviction, sized at the miss-ratio knee.

</details>
