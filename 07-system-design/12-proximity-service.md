# Worked Design 12: Proximity Service (Yelp / Uber-nearby)

The geo design: "find things near me." Its one genuinely new idea —
turning 2-D proximity into 1-D key lookups via space-filling cells —
takes five minutes to own; everything after is your standard toolkit
(KV serving, caches, hot keys, skew). Two variants with different
hearts: **static places** (Yelp: read-heavy, cacheable) and **moving
objects** (Uber: write-heavy, ephemeral) — asking which one is meant is
the first scoping move.

**Prompt:** "Design 'restaurants near me'" (then: "now make the
restaurants move").

---

## 1. Requirements & scope (0–5)

Static variant (assume first): given (lat, lng, radius), return nearby
places, filterable (category, open-now), ranked (distance × rating);
place CRUD is low-rate (merchant updates). p99 < ~100 ms. Scale:
200 M places worldwide, 100 k search QPS peak. Out of scope: routing/
ETA (a different system — road graphs), reviews service (join by ID).

Non-functional gifts to name: staleness is nearly free (a restaurant
"appears" 30 s after onboarding — nobody notices: derived-view
economics), results are *inherently approximate* (radius edges, ranking
subjectivity) — both license aggressive caching and async pipelines.

## 2. The core idea: cells (5–14)

Databases index 1-D ordered keys (`02-databases/03`); lat/lng is 2-D —
naive `WHERE lat BETWEEN … AND lng BETWEEN …` needs two ranges (one
index serves one; the other becomes a filter — the composite-index
range-stops-prefix lesson biting geographically). **Fix: map 2-D →
1-D with locality:** divide the world into hierarchical cells —
**geohash** (base-32 strings; prefix = containment: `tdr1y` ⊂ `tdr1`)
or **S2** (Hilbert-curve cells; better locality/area uniformity — name
both, use geohash for explainability). Key property: *nearby points
share cell prefixes* (mostly — see the edge caveat), so:

- **Index:** `cell_id (precision P) → [place_ids]` — a KV/wide-column
  table, sharded by cell (your row-key discipline: cell prefix =
  spatial locality = range-scannable neighborhoods).
- **Query:** compute the ~9-cell cover of the radius (center cell +
  8 neighbors — the neighbor step handles the famous geohash edge
  case: adjacent points can straddle cell boundaries and even
  prefix-dissimilar cells; naming "that's why you always fetch
  neighbors" defuses the classic gotcha) → fetch candidate lists →
  exact-distance filter + rank → return.
- **Precision choice:** cell size ≈ query radius (geohash-6 ≈ 1.2 km ×
  0.6 km); multi-precision rows (P4/P5/P6) serve varying radii —
  storage is cheap (place_id lists), recompute is free (derived).

## 3. Static-variant architecture (14–24)

```
Search: client → API → cell-cover computation (library, stateless)
→ cell-index KV (cache-fronted; hot cities = hot cells = classic
hot-key medicine) → candidate place_ids → place-details store
(batch multiget) → filter/rank → respond.
Write: merchant update → places store (system of record) → CDC →
cell-index maintainer (derived view: add/remove place in cell rows)
→ cache invalidation events.
```
Say the classifications: places store = record; cell index = derived,
rebuildable view (CDC-fed — the whole `03-caching`/`14-.../04` spine);
caches over both. Density skew is THE operational fact: Manhattan's
cells hold 10⁴ places, Wyoming's hold 3 — (a) variable precision
(subdivide dense cells one level — S2's native trick), (b) cap +
paginate candidate lists, (c) the hot-cell serving problem is just the
hot-key ladder (`03-caching/03` §3): city-center cells are
edge-cacheable (same results for everyone in the cell for minutes).

## 4. Moving variant — Uber-nearby (24–35)

Now writes dominate: 1 M drivers × update/4 s = 250 k location
writes/s, and data is *ephemeral* (a 30-s-old location is stale; a
5-min-old one is garbage). Everything flips:

- **Storage:** in-memory sharded grid (cell → set of drivers with
  last-fix + TTL), sharded by cell/region — durability is *pointless*
  for live positions (a crashed shard repopulates in seconds from the
  update stream — say it: the data outlives its usefulness before any
  disk pays for itself; classification again — ephemeral state, not a
  store). Trip/billing positions go elsewhere (append-only log —
  different contract, `08-ad-click` shape).
- **Updates:** driver → gateway → shard-by-cell; cell *transitions*
  update two cells (remove/add — idempotent, last-write-wins by
  fix-timestamp: per-driver LWW is safe because one device is the
  only writer — single-writer-per-key ordering, manufactured).
- **Query:** rider's cell cover → shard fetches → filter by
  freshness TTL + match constraints → rank by ETA-ish distance.
- **Skew, amplified:** surge zones = hot cells for reads AND writes —
  cell-level sharding with dynamic splitting (dense cells get own
  shards), and rider queries batch/cache per cell for ~1 s (100
  riders at one intersection share one answer — micro-caching with
  1 s TTL cuts read QPS 100×; the same-answer insight).

## 5. Operations (35–45)

Static: page on search p99, cell-cache hit ratio, CDC/index lag
(place-visibility age), density-cap truncation rates (quality signal).
Moving: fix-age distribution (staleness SLI — the product IS
freshness), shard balance vs surge maps, update-pipeline backlog age.
10×: static scales embarrassingly (read replicas + cache); moving
scales by cell-sharding + regional isolation (a city is a natural
cell-cluster/failure domain — geo problems shard geographically,
the one domain where data locality and user locality coincide).

---

## Probes & traps

- **"Why not PostGIS/a geo database?"** — legitimate at modest scale
  (the default-relational instinct: R-tree indexes, one system,
  rich queries) — say so first. It caps out on: 100 k QPS serving
  (cache-shaped traffic wants KV+CDN economics), the moving variant's
  250 k writes/s of ephemeral data (wasted on any durable engine),
  and operational sharding. The answer is the when-to-pick-what
  procedure, not geo-exotica: "PostGIS until the numbers say
  otherwise — here they say otherwise, and here's the number."
- **"Geohash boundary bug: two adjacent restaurants, different
  prefixes."** — the neighbor-cells step exists precisely for this
  (cell containment ≠ proximity at edges; equator/meridian and
  cell-corner cases) — always query the 3×3 cover, then
  exact-distance filter. Bonus: S2's Hilbert curve reduces (not
  eliminates) the discontinuity — still cover-then-filter.
- **"Driver's location between two shards during a cell
  transition."** — worst case: briefly present in both or neither
  (remove/add across shards isn't atomic). Fine — say why with the
  contract: results are freshness-filtered approximations; a 1-in-
  10⁴ transient double-appearance is invisible, and matching (the
  money action) re-validates the driver's actual state at dispatch
  (read-time check at the authority — the eligibility short-circuit
  logic). Refusing to buy cross-shard atomicity for an approximate
  view is the senior move.
- **"Now add 'notify me when a driver is within 1 km'."** — inverts
  pull to push: standing queries registered per cell (rider
  subscriptions indexed by the same cells); driver updates check
  their cell's subscription list — pub/sub keyed by geography, same
  index powering both directions. Recognizing the inversion (and
  its new hot spot: popular cells' subscription fan-out) shows the
  model generalized, not memorized.

## Self-test

1. Why can't a B-tree serve 2-D proximity directly, and what
   property must the 2D→1D mapping preserve?
2. Geohash mechanics: prefixes, precision-to-size intuition, and the
   boundary caveat + its fix.
3. Design the cell-index table: key, value, maintenance path,
   classification.
4. The static variant's three "gifts" and what each licenses.
5. Density skew: three mitigations across storage and serving.
6. Everything that flips in the moving variant — four items with
   reasons.
7. Why is durability wrong for live driver positions? Where do
   billing-grade positions go?
8. Per-driver LWW ordering is safe — why? (Name the principle.)
9. The 1-second micro-cache: what makes it legitimate and what it
   buys.
10. The geo-notify inversion: mechanism and its new hot spot.

<details>
<summary><b>Answers</b></summary>

1. Proximity is a 2-D range (lat AND lng); one ordered index serves
   one dimension — the second becomes a post-filter over a huge
   candidate strip. The mapping must preserve *locality*: nearby
   points → nearby keys (mostly), so proximity queries become short
   1-D range/point lookups.
2. Hierarchical base-32 cells; longer string = smaller cell; prefix
   containment (tdr1y ⊂ tdr1); geohash-6 ≈ 1.2×0.6 km. Caveat:
   adjacency ≠ prefix-similarity at cell edges (boundary straddles,
   corner cases) — always query the 3×3 neighbor cover, then
   exact-distance filter.
3. Key (cell_id at precision P — optionally multi-P rows) →
   value [place_ids] (capped, paginated). Maintained by CDC from the
   places store (add/remove on merchant changes) — a derived,
   rebuildable view, cache-fronted; never the system of record.
4. Staleness ~free (30 s visibility lag invisible) → async CDC
   pipeline + generous caching. Results inherently approximate
   (radius edges, ranking) → cover-then-filter is honest, caching
   per cell legitimate. Read-heavy with shared answers (everyone in
   a cell sees ~the same list) → edge/CDN cacheability.
5. Variable precision: subdivide dense cells one level (S2-style)
   so candidate lists stay bounded. Cap + paginate per-cell lists
   (quality-ranked truncation, monitored). Serving: hot-city cells
   ride the hot-key ladder — micro-TTL edge caching, key
   replication if needed.
6. Storage: durable KV → in-memory sharded grid (data is ephemeral).
   Write path: dominant (250 k/s) with cell-transition double-
   updates. Freshness: TTL-filtered fixes (staleness is the product
   metric). Skew: dynamic — surge zones move; shards split by live
   density, and reads micro-cache per cell.
7. A position's useful life (~seconds) ends before disk durability
   buys anything: a crashed shard rebuilds from the live update
   stream in seconds — persistence would add cost and latency to
   protect data that's garbage by the time it's restored.
   Billing/trip traces (a different contract: durable, auditable)
   append to a log/store à la click events.
8. One device (the driver's phone) is the sole writer for its key —
   single-writer-per-key means its own fix timestamps are
   monotone-enough, and LWW can't lose a concurrent competitor's
   write because none exists. Order manufactured by ownership
   (`01-distributed-systems/06`).
9. Everyone in one cell asking "who's near" within the same second
   deserves the same answer, and the data's own freshness contract
   is coarser than 1 s — so a 1 s TTL per-cell result cache is
   within-spec staleness, cutting read QPS by the co-located-rider
   factor (10–100×) exactly where load concentrates.
10. Standing queries: subscriptions indexed by the same cells
    (rider → cells of interest); each driver update consults its
    cell's subscriber list and pushes matches — geographic pub/sub
    reusing the index in reverse. New hot spot: dense cells'
    subscription fan-out (one update × thousands of watchers) —
    the fan-out toolkit (batching, thresholds, digest pushes)
    applies.

</details>
