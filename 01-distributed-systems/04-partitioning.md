# Partitioning (Sharding)

Replication copies the same data everywhere; **partitioning splits different data
across nodes**. It's how systems scale writes and datasets beyond one machine —
and it's the layer where your HBase row-key designs live, so for you this topic is
resume territory, not book territory. Own it accordingly.

---

## 1. Plain definition

**Partitioning** = dividing a dataset into disjoint pieces (partitions/shards),
each owned by (typically) one node, so that load and storage spread horizontally.
Analogy: a library too big for one building splits by call-number ranges into
branch buildings (range partitioning), or assigns each book to a branch by
hashing its ISBN (hash partitioning). The catalog telling you which branch holds
what is the routing layer.

Why partition (name the driver — they imply different designs):
- **Dataset size** exceeds one node's storage/RAM.
- **Write throughput** exceeds one node (replication doesn't help writes — every
  replica does every write; partitioning is THE write-scaling tool).
- **Parallelism** for scans/analytics.

The three problems every partitioned system must answer: **(a)** how keys map to
partitions, **(b)** how partitions map to nodes and move when nodes come/go
(rebalancing), **(c)** how requests find the right node (routing).

---

## 2. How it works in practice

### 2.1 Key → partition strategies

**Range partitioning** (HBase, Bigtable, Spanner, TiKV): keys sorted; each
partition owns a contiguous key range.
- Wins: **efficient range scans** (adjacent keys co-located — one partition
  serves `accountId:*`), natural key locality, partitions can split where data
  actually grows.
- Loses: **hot spots from skewed key patterns** — the classic: monotonically
  increasing keys (timestamps, sequential IDs) make ALL writes land on the last
  partition; one node does 100% of the write work while the cluster idles.

**Hash partitioning** (Cassandra, Dynamo, Aerospike, Redis Cluster): partition =
f(hash(key)).
- Wins: uniform spread by construction; hot-spot resistant for write volume.
- Loses: **range queries die** (adjacent keys scattered); you get point lookups
  and that's it. Middle ground: **compound keys** — hash a prefix, sort by the
  rest (Cassandra's partition key + clustering columns): spread across the
  cluster by user, ordered *within* a user. Note this is exactly what your
  `accountId:timestamp` HBase keys achieve by putting the high-cardinality
  accountId first.

**Consistent hashing** (the interview classic — know the mechanics cold): hash
nodes and keys onto a ring; each key belongs to the next node clockwise. Adding/
removing a node moves only ~K/N keys (vs naive `hash mod N`, which reshuffles
almost everything). **Virtual nodes** (each physical node = 100–256 ring points)
fix the two flaws of the plain ring: variance (random arcs are uneven) and
heterogeneity (bigger machines take more vnodes); they also spread a dead node's
load across many survivors instead of dumping it on one neighbor. Used by:
Cassandra/Dynamo (data), most distributed caches, load balancers (with *bounded
loads* variant). Aerospike does something related but distinct: fixed **4096
partitions** assigned to nodes via a deterministic partition map — same idea
(stable key→partition, small moves on membership change), different mechanism
**[good detail to drop if Aerospike comes up]**.

### 2.2 Rebalancing

- **Fixed partition count** (Aerospike 4096, Kafka topic partitions, Elasticsearch
  shards): create many more partitions than nodes up front; rebalancing = moving
  whole partitions. Simple, predictable; but the count is a ceiling/granularity
  chosen on day one (Kafka's "you can add but never reduce, and repartitioning
  breaks key ordering" pain).
- **Dynamic splitting** (HBase, Bigtable, TiKV): partitions split when they exceed
  a size threshold (HBase default region split ~10 GB **[VERIFY your cluster's
  policy]**) and can merge when small. Adapts to growth and skew; the cost is
  operational spice: **split storms** (many regions crossing threshold together),
  and brand-new tables starting as ONE region (= one-node bottleneck) unless you
  **pre-split** — a real HBase operational lesson worth citing.
- **Never automatic without brakes:** rebalancing consumes the same disk/network
  serving traffic; naive auto-rebalance during an incident amplifies it
  (rebalance storm). Mature systems throttle movement and require operator
  confirmation for big moves.

### 2.3 Routing

Three shapes: (a) **routing tier** (clients hit any node/proxy, it forwards —
e.g., a coordinator node); (b) **partition-aware clients** (client caches the
partition map, goes direct — Aerospike smart clients, HBase clients caching
`hbase:meta` locations); (c) **external directory** (ZooKeeper/etcd holds
assignment — HBase master + meta, Kafka controller). Staleness handling is the
detail that shows depth: clients act on cached maps, get "wrong node / moved"
errors, refresh, retry — routing is eventually consistent and the protocol
accounts for it.

### 2.4 Secondary indexes under partitioning (the quiet killer)

- **Local (document-partitioned) index:** each partition indexes its own rows.
  Writes stay local (fast); queries by the indexed field must **scatter-gather
  every partition** (read amplification, tail-latency multiplication).
- **Global (term-partitioned) index:** the index itself is partitioned by the
  indexed value. Queries hit one index partition (fast); writes now touch
  multiple partitions (row partition + index partitions) → async index updates
  in practice → the index lags the data.
- **HBase's answer: neither — you build it yourself** as index tables
  (`txn_index` in your platform: rowkey = user/date → txnId), maintained by the
  application, eventually consistent with the main table, repaired by your recon
  discipline. Say this in interviews: "we chose our anomalies knowingly."

---

## 3. Senior-level depth

- **Hot keys survive perfect partitioning.** Hashing spreads *keys*, not *load
  per key*: one celebrity/viral key still lands on one partition. Remedies, in
  escalation order: cache the hot key in front; **key salting/splitting** —
  append a random suffix from 1..M so one logical key becomes M physical rows
  (writes spread; reads must fan in and merge — you've traded write hotness for
  read cost); isolate/dedicate capacity for known-hot tenants. The two-way trade
  is the L5 content; "salt it" alone is L4.
- **Skew is the norm, not the exception:** Zipfian access (top 1% of keys can be
  a large share of traffic **(estimate; workload-dependent)**), tenant-size skew
  (one enterprise customer = 100× median), time skew (today's partition is hot).
  Partition-level metrics (per-region request counts, per-partition consumer
  lag) are how you *see* it; if a candidate never mentions measuring skew,
  interviewers assume they've never run a sharded system.
- **Cross-partition operations are the tax.** Joins, multi-key transactions,
  global uniqueness, and ordering all stop being free once you shard. Standard
  moves: co-locate data that transacts together (same partition key across
  tables — "entity groups"), denormalize, use sagas/idempotency/recon for
  cross-partition writes (your world), and keep global invariants out of the hot
  path. The design skill is **choosing the partition key so the important
  operations are single-partition** — that's the whole game, and it's exactly
  what `accountId`-first row keys did for your per-user reads.
- **Partition count sizing (fixed-count systems):** target partitions small
  enough to move/recover quickly (10s of GB, not TB — a 1 TB partition takes
  ~hours to re-replicate at a few hundred MB/s **(estimate)**) and numerous
  enough for future nodes (partitions ≥ 10× max expected nodes), but not so many
  that per-partition overhead (files, sockets, metadata, recovery bookkeeping)
  dominates. There is no free granularity.
- **Time-series pattern:** partition by (entity, time-bucket) — spreads load
  across entities while keeping recent data scannable per entity; expire whole
  partitions/tables by age (drop is O(1); per-row deletes are a compaction tax
  — in HBase, TTLs are handled at compaction). Your reward rows (`accountId` +
  timestamp suffix) and txn-index tables follow this shape.
- **L4 vs L5 vs L6:** L4 names hash vs range and consistent hashing. L5 chooses
  the key from the query set, names the anomaly each choice creates (scatter-
  gather, hot tail region, lagging index), and knows the rebalancing/ops story.
  L6 designs the *tenancy and isolation* model: cells, per-tenant shards, heat
  management as a continuous control system (auto-splitting + load-based
  balancing like Bigtable/DynamoDB adaptive capacity).

---

## 4. Resume connection

- **Your row keys ARE partitioning decisions.** `accountId:E:<type>:<txnId>:<offerId>`
  — high-cardinality accountId prefix spreads users uniformly across regions
  (hot-spot-resistant like hashing) while keeping each user's rewards contiguous
  (range-scannable like... range partitioning, because it is). The timestamp
  goes in the *suffix*, never the prefix — putting time first would aim the
  entire write firehose at one region. You should be able to say "we got
  hash-like spread and range-like locality by key construction" — that sentence
  is the whole topic compressed.
- **Checkpoint scans depend on it:** "rows since checkpoint" is a short range
  scan *only because* per-user rows are contiguous and time-ordered within the
  user prefix. Partitioning choice → algorithm feasibility. Connect them
  explicitly.
- **Mandate keys** `ACC:SUPERPAY_LATER:MDid` — same pattern: entity-first
  namespacing, point-lookup optimized.
- **Aerospike:** 4096 fixed partitions, deterministic map, smart clients —
  single-hop reads at payment QPS. Your device/dedup lookups ride this.
- **Pulsar/Storm:** topics are partitioned for parallelism; your consumers'
  shared subscriptions trade per-key ordering for elastic parallelism — which is
  WHY your handlers carry idempotency + CAS (partitioning choices upstream
  forced correctness machinery downstream; that causal chain is an L5 paragraph).
- **Honest gap:** you consumed HBase's split/balance operations rather than ran
  them **[unless you did — verify: any pre-splitting, hot-region incidents,
  salting decisions you made? A real hot-region war story would upgrade this
  whole topic]**.

**30–60 s spoken answer** ("how is your data partitioned?"):

> "Our main store is range-partitioned — HBase — so partitioning is literally our
> row-key design. The rule we follow: high-cardinality entity ID first, time
> last. Reward rows are accountId-prefixed with timestamp suffixes, which buys
> both properties at once — users spread uniformly across regions like a hash
> scheme, so there's no hot region from the write firehose, while each user's
> rows stay contiguous and time-ordered, so our checkpoint-based aggregation can
> do a short range scan instead of scattered point reads. The anti-pattern we
> avoid is timestamp-first keys, which would aim all writes at the last region.
> Since HBase has no secondary indexes, our lookup patterns are hand-built index
> tables, eventually consistent and recon-repaired — we chose those anomalies
> knowingly. And on the cache side it's the opposite scheme: Aerospike hashes
> into 4096 fixed partitions with partition-aware clients, single-hop at
> payment QPS — pure point-lookup workload, so we spend zero on ordering."

---

## 5. What the interviewer will push on

**P1. "You need to store events keyed by timestamp in HBase. Design the key."** 
(This is a trap dressed as a task.)
- *Model:* never timestamp-first — that's a single hot region absorbing all
  writes. Ask what the queries are (the L5 reflex). If queries are per-entity
  over time: `entityId + timestamp` (your pattern). If queries are pure
  time-range across all entities: you must shard the time dimension —
  `salt(0..N-1) + timestamp`, with N ≈ number of regions/servers you want
  writing in parallel; every time-range read then fans out to N salted ranges
  and merges. State the trade explicitly: write parallelism purchased with
  N-way read fan-out. Alternatives worth naming: reverse-timestamp for
  latest-first scans; or "don't use HBase — a log (Pulsar) or TSDB fits pure
  time-series better."
- *Trap:* `timestamp` or `timestamp+id` as the key. Instant fail with anyone
  who has run Bigtable-family stores.

**P2. "Consistent hashing: N nodes, you add one. How much data moves, and why do
we need virtual nodes? What problem does consistent hashing NOT solve?"**
- *Model:* ~K/N keys move (the new node takes slivers from ring neighbors) vs
  ~all keys under `mod N`. Vnodes fix arc-length variance (uneven load),
  heterogeneous hardware (weight by vnode count), and failure redistribution
  (dead node's arcs scatter to many survivors). It does NOT solve: hot keys
  (per-key load skew is orthogonal), range queries (hashing destroys order), or
  multi-key operations. Bonus depth: "bounded-load consistent hashing" for
  caches/LBs; rendezvous hashing as the simpler alternative.
- *Trap:* "1/N of ALL data reshuffles under consistent hashing too" (that's the
  mod-N failure it exists to fix), or vnodes explained as "for more nodes".

**P3. "One user — a large merchant — is 5% of your entire rewards write volume
and their region is hot. Your key is accountId-prefixed. Now what?"**
- *Model:* per-key skew, partitioning can't fix by re-hashing (it's ONE key).
  Ladder: (1) confirm with per-region metrics; (2) split the logical key —
  salt that account's rows across M buckets (`accountId:salt:...`), fan-in on
  read/aggregation — note your checkpoint algorithm must then run per-bucket
  and merge, a real design change, own it; (3) HBase-specific: manually split
  the hot region so the account's range spreads across servers (helps if the
  range is big, not if it's one row); (4) isolate: route the tenant to
  dedicated capacity/table. And the aggregate row itself (one row per user) is
  a hot-row CAS contention point at that volume → per-bucket sub-aggregates
  merged on read. Showing you can carry the fix through your OWN algorithm is
  the difference between memorized and owned.
- *Trap:* "consistent hashing fixes hot spots."

**P4. "Why does adding partitions to a Kafka topic break things, and what's the
equivalent risk in your stack?"**
- *Model:* key→partition = hash(key) mod partitionCount; changing the count
  remaps keys, so per-key ordering breaks across the boundary and key-local
  state (consumer-side aggregations keyed by partition) misroutes. Plan
  partition count for peak from day one, or migrate via a new topic. In my
  stack: same class of risk anywhere routing is a pure function of a count —
  Aerospike avoids it with a fixed 4096; HBase avoids it entirely (ranges
  split without remapping keys — a genuine advantage of range partitioning
  worth stating); our exposure is instead consumer-parallelism changes on
  shared subscriptions, which we tolerate because handlers are
  order-independent by design (idempotent + CAS).
- *Trap:* "just add partitions, Kafka scales." 

**P5. "Design the partition key for the payments table itself. Merchant queries
want all their transactions; users want theirs; recon wants time ranges."**
- *Model:* one table can't serve three access patterns from one physical order —
  pick the *primary* owner of locality (likely txnId or userId for the hot
  path), then materialize the others: index tables (userId+time → txnId;
  merchantId+time → txnId) maintained async (or via CDC), recon reading a
  time-bucketed index or the CDC stream itself. State the anomaly budget: index
  lag → recon/read-repair. This is literally your platform's `txn` +
  `txn_index` design — claim it.
- *Trap:* promising all three patterns fast from one key, or reaching for
  "secondary indexes" in a store that doesn't have them.

---

## Self-test

1. Which scaling problem does partitioning solve that replication cannot, and
   why exactly can't replication solve it?
2. Range vs hash partitioning: the win and the loss of each, one line apiece.
3. Why is a timestamp-first HBase row key a disaster? What are the two standard
   escapes and the cost of each?
4. Explain how `accountId:timestamp-suffix` keys get "hash-like spread with
   range-like locality."
5. Consistent hashing: data moved when a node joins, and the three problems
   vnodes fix.
6. Name one thing consistent hashing does not help with, and what does.
7. Local vs global secondary indexes: where does the pain go in each? What's
   HBase's answer and yours?
8. Fixed partition count vs dynamic splitting: one system using each, one
   operational pitfall of each.
9. Why must partition-map routing tolerate staleness, and what's the client
   protocol?
10. A single key is hot. Give the escalation ladder and the trade at each rung.
11. Your rewards checkpoint algorithm depends on which two properties of the
    key design? What breaks under salting, and how do you repair the design?
12. Give the "choose the partition key from the query set" answer for a
    payments table with three competing access patterns.

<details>
<summary><b>Answers</b></summary>

1. Write throughput and dataset size. Every replica must apply every write
   (replication multiplies write work, never divides it) and store the full
   dataset; only splitting the keyspace divides both.
2. Range: contiguous scans and locality win; skewed/sequential keys hot-spot.
   Hash: uniform spread wins; range queries scatter to every partition.
3. All writes target the last (highest) range → one region server takes the
   full firehose while the cluster idles. Escapes: entity-first keys (locality
   per entity; needs an entity to query by) or salting the time dimension
   across N buckets (N-way write parallelism bought with N-way read fan-out
   and merge).
4. accountId is high-cardinality and effectively random across users → user
   prefixes distribute uniformly over regions (spread). Within one user's
   prefix, rows sort by timestamp suffix → per-user scans are short contiguous
   ranges (locality).
5. ~K/N keys move (slivers from ring neighbors). Vnodes fix: arc-length
   variance (load evenness), hardware heterogeneity (weight = vnode count),
   and redistribution on failure (dead node's load scatters to many survivors,
   not one neighbor).
6. Doesn't help: per-key hot spots (one key = one partition regardless), range
   scans, multi-key atomicity. What does: caching/salting/isolation for hot
   keys; range-partitioned stores for scans; co-location + sagas/recon for
   multi-key operations.
7. Local: writes cheap (index co-located), reads scatter-gather all
   partitions. Global: reads hit one index partition, writes fan out across
   partitions (usually async → lagging index). HBase: no native answer — we
   build index tables ourselves, async-maintained, eventually consistent,
   recon-repaired.
8. Fixed: Aerospike (4096), Kafka partitions — pitfall: count is a ceiling
   chosen early; changing it remaps keys (Kafka ordering break). Dynamic:
   HBase/Bigtable region splits — pitfalls: split storms, and new tables start
   as one region (bottleneck) unless pre-split.
9. Assignments change (splits, moves, failures) while clients hold cached
   maps; blocking all requests on a fresh map would serialize everything
   through the directory. Protocol: act on cache → on "not serving/moved"
   error, refresh map (from meta/directory) → retry. Routing is eventually
   consistent by design.
10. (1) Measure per-partition to confirm; (2) front with a cache (staleness
    trade); (3) salt/split the logical key into M buckets (write spread bought
    with read fan-in and algorithm changes); (4) manual region split (helps
    ranges, not single rows); (5) dedicated capacity/tenant isolation (cost,
    ops).
11. Per-user contiguity (all of a user's rows in one key range) and
    time-ordering within the user prefix (checkpoint = a key; "since
    checkpoint" = contiguous range). Salting breaks both into M sub-ranges:
    checkpoint must become per-bucket, scans fan out to M ranges, and the
    aggregate merge happens across buckets — plus the single aggregate row
    becomes M sub-aggregate rows to relieve CAS contention.
12. Primary key serves the hottest path (txnId point lookups / userId
    locality); the other patterns become async-maintained index tables
    (userId+time→txnId, merchantId+time→txnId) or CDC-fed views; recon runs on
    time-bucketed indexes or the CDC stream. Anomaly budget: index lag,
    bounded and repaired by recon. One physical sort order per table — every
    other access pattern is a materialization you must own.

</details>
