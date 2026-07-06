# Worked Design 10: Top-K & Typeahead

Two designs that interviewers treat as one family: **typeahead**
(autocomplete: prefix → top suggestions, <10 ms) and **top-K heavy hitters**
(trending: the K most frequent items over a window). Both are
"precompute-or-die" problems — the read-path budget forbids computing
anything at query time — which makes them showcases for the derived-view
discipline you already own.

**Prompt:** "Design Google-search autocomplete" / "Design trending topics."

---

## 1. Typeahead

### Requirements & scope (0–5)

Per keystroke: prefix → top 5–10 completions, p99 < 10 ms (it renders
*while typing* — the tightest latency budget in the canon); suggestions
ranked by popularity (freshness: ask — daily rebuild + hourly/streaming
delta is the usual contract); personalization scoped out (mention: a
re-rank layer on the client/edge over the generic candidates).

### Estimation (5–9)

10 B searches/day, avg 4–5 keystrokes each ≈ 500 k prefix-QPS peak —
**which means**: pure cache/memory serving, zero query-time computation;
CDN/edge participation for the head. Corpus: top ~10 M queries retained;
prefix table = every prefix (len 1–~20) of each → ~10⁸–10⁹ rows ×
(prefix + 10 suggestions ≈ 200 B) ≈ tens of GB — **fits in RAM across a
modest fleet**; that estimate closes the architecture debate (trie
service vs KV): both fit; pick the operationally boring one.

### Design (9–24)

**The precompute insight (say it first):** don't search at query time —
store the *answer* per prefix: `prefix → [top-10 suggestions]`, a hash
lookup. The classic trie is the textbook answer; the production answer
is a **flat prefix→top-K table** sharded by prefix-hash (a trie's
top-K-per-node, materialized — same information, KV-shaped: single-hop
smart-client reads, your Aerospike serving pattern, and shard-friendly
where a trie wants to live on one box). Say both, choose the table,
justify: operational uniformity beats pointer elegance at this size.

**The pipeline (the real design):** query logs → batch job (hourly/
daily): count, filter (spam/abuse/blocklist — a *policy* stage; skipping
it is a launch-blocking miss, not a nicety), compute top-K per prefix →
build immutable serving snapshots → **versioned-key deployment**: load
snapshot vN+1 alongside vN, flip a pointer, evict vN
(`03-caching/02` §1's versioned-keys mechanism as a deployment strategy —
zero invalidation, instant rollback). Freshness delta: a streaming layer
merges a small "rising queries" overlay (last hour's heavy hitters — see
Part 2) at read time: base snapshot ⊕ tiny hot overlay — two lookups,
still <10 ms.

**Serving:** edge/CDN caches the hottest prefixes (1-char prefixes are
~26–40 keys serving a huge traffic share — the ultimate cacheable hot
keys: tiny, immutable-per-snapshot, universal); regional serving fleets
for the rest; client-side debounce + local prefix-extension filtering
(typing "cha"→"chai" can filter the "cha" response client-side — a free
10× QPS cut; mentioning client cooperation is a senior touch).

### Probes

- **"A breaking news term needs to appear in minutes."** — the overlay
  path: streaming heavy-hitters (Part 2) feeds a small hot-overlay
  store merged at read; base snapshot stays daily. Trap: rebuilding the
  whole snapshot hourly (cost) or claiming the batch path is enough.
- **"Multi-language/Unicode?"** — normalize (case/accent folding) at
  both pipeline and query; prefixes are grapheme-aware; per-locale
  corpora — one sentence each, flag don't drown.
- **"Why not Elasticsearch prefix queries?"** — computing at query time
  what you can precompute: ES does the work per keystroke at 500 k QPS;
  the table does it once per build. ES belongs in the *pipeline*
  (candidate generation), not on the 10 ms path.

---

## 2. Top-K heavy hitters (trending)

### The problem shape (0–9)

"K most frequent items in the last N minutes/hours" over a firehose
(10⁵–10⁶ events/s). Exact counting of *everything* = a counter per
distinct item (10⁸+ cardinality) per window — memory-hostile and
pointless: you only need the *head*. **Which means**: approximate the
tail, be accurate on the head — the license for sketches.

### Design (9–24)

**Per-shard sketch + heap:** each aggregation shard maintains a
**count-min sketch** (d=4–5 hash rows × w≈10⁴–10⁵ counters ≈ a few MB;
overestimates only, ε ≈ e/w with probability 1−(1/2)^d — quote the
shape, not the exact algebra) + a K-sized min-heap of candidates: on
event, increment sketch, if estimate > heap-min, admit/update. Per
window: shards emit their local top-K′ (K′ ≈ 2–5×K for merge safety) →
merger sums/combines → global top-K → serving store.
**Windowing:** tumbling minutes + rolling aggregation (last-60-minutes =
merge 60 minute-buckets — buckets are the unit, `08-ad-click-...md`
time-bucket discipline); event-time vs arrival matters less here
(trending tolerates ±minutes — say the contract difference vs billing).
**Skew note (delicious):** heavy hitters ARE the hot keys — but sketches
don't care (increments spread across hash cells), and two-stage
salted aggregation handles the counting path; the *serving* of trending
results is a broadcast-cacheable single key (everyone reads the same
top-10 — cache it everywhere, seconds TTL).

### Probes

- **"Why is count-min safe for top-K despite overestimates?"** — errors
  only inflate (collisions add), and inflation is bounded by ε×total;
  the head's true counts dwarf the error band, so the top-K *set* is
  robust even when tail estimates are junk — accuracy where it matters,
  garbage where it doesn't, memory O(sketch) instead of O(cardinality).
  Verify head candidates with exact counters if the product needs true
  numbers (sketch for detection, counters for display — two-tier).
- **"Exact top-K, no approximation allowed."** — then it's the
  ad-click-aggregator shape: keyed exact aggregation with salted
  two-stage combine, more memory, same architecture — the sketch was an
  optimization, not the skeleton. Recognizing which constraint bought
  the sketch is the point.
- **"Trending manipulation (bot brigades)?"** — the counting layer
  counts; the *policy* layer (dedup per user/device, rate caps,
  anomaly filters — your gateway-hardening instincts) decides what
  counts. Same three-layer split as ad clicks: transport dedup /
  business rules / fraud ML.

---

## Operations & wrap (39–45)

Typeahead pages on: serving p99, snapshot age (build pipeline health —
a stale snapshot is invisible-until-embarrassing: canary queries against
known-fresh terms), overlay lag. Top-K pages on: sketch shard health,
merge lag, and — both systems — the *policy* pipeline (blocklist
deploy = same rigor as code deploy; a bad filter push IS the incident).
10×: both scale by sharding the pipeline; serving was over-provisioned
by construction (RAM-resident, cacheable).

## Self-test

1. The precompute insight and the budget that forces it.
2. Trie vs prefix-table: the information equivalence and the
   operational argument.
3. The snapshot deployment mechanism and its two free properties.
4. How does "breaking news in minutes" work without hourly rebuilds?
5. The 1-char-prefix observation and what it implies for serving.
6. Count-min sketch: dimensions, memory, error direction, and why
   top-K survives the error.
7. Per-shard top-K′ → merge: why K′ > K?
8. Rolling windows from tumbling buckets: the mechanism.
9. Exact-top-K demanded: what changes, what doesn't?
10. Where does policy (blocklists, anti-gaming) sit in both designs,
    and why is it deploy-grade?

<details>
<summary><b>Answers</b></summary>

1. Never compute at query time what a pipeline can compute once:
   store prefix → answer. Forced by p99 < 10 ms at ~500 k QPS —
   per-keystroke rendering leaves budget for a hash lookup and a
   network hop, nothing else.
2. A prefix table IS a trie flattened: each row = a trie node's
   materialized top-K. Same information; the table shards by
   prefix-hash across a fleet, serves via single-hop KV reads, and
   reuses standard cache/KV operations — the trie concentrates on
   one process and adds pointer-structure ops burden. At tens of GB,
   both fit; boring wins.
3. Versioned snapshots: build vN+1 immutably, load alongside vN,
   atomic pointer flip, evict vN. Free properties: zero invalidation
   (nothing mutates — the versioned-key mechanism) and instant
   rollback (flip the pointer back).
4. A streaming heavy-hitters layer (count-min + heap over the live
   query stream) maintains a small "rising" overlay store; serving
   merges base-snapshot results with the overlay at read (two RAM
   lookups). The base stays daily; freshness rides the tiny overlay.
5. A handful of 1–2-char prefixes serve a giant share of keystroke
   traffic, are tiny, and are immutable per snapshot — perfectly
   edge/CDN-cacheable with seconds-to-minutes TTLs; the serving
   fleet's real load is the mid-tail prefixes.
6. d (4–5) hash rows × w (10⁴–10⁵) counters — a few MB regardless of
   cardinality. Errors are one-directional (collisions only add;
   estimate ≥ truth), bounded ~ε×total-count. The head's true counts
   exceed the error band by orders of magnitude, so membership of
   the top-K set is robust; tail estimates are garbage nobody reads.
7. Local and global rankings differ: an item can be #K+3 on every
   shard yet global #2 (uniform spread), so shards emitting exactly
   K can drop true global winners. Emitting K′ = 2–5×K makes the
   merge see enough of each shard's head to reconstruct the global
   head (with sketch-verified counts).
8. Count into fixed tumbling buckets (per minute); any rolling
   window = sum/merge of its constituent buckets (last hour = 60
   buckets) — buckets are immutable-once-closed, merges are cheap,
   retention drops whole buckets (the time-series pattern).
9. Changes: sketches out, exact keyed counters in — memory grows
   with cardinality, salted two-stage aggregation for the hot head,
   more shards. Unchanged: bucketed windows, shard-then-merge
   topology, serving via broadcast-cached results — the skeleton
   was never the sketch.
10. Between counting and serving: dedup/caps/blocklists filter what
    counts (typeahead pipeline's filter stage; trending's per-user
    dedup and anomaly rules). Deploy-grade because a bad filter is
    user-visible instantly at full traffic (embarrassing/offensive
    suggestions, gamed trends) — policy pushes get canaries,
    rollback, and review like code, not like config edits.

</details>
