# SQL vs NoSQL — The Real Taxonomy

"SQL vs NoSQL" is a false binary that weak candidates argue and strong
candidates dissolve. The real taxonomy has ~8 families, each defined by its
**data model + query power + scaling model + consistency posture** — four
axes, not one. This doc gives you the map; `08-when-to-pick-what.md` gives you
the decision procedure.

---

## 1. Plain definition

A database family is a bet about what you'll ask the data. Relational systems
bet you'll ask *unanticipated* questions (joins, aggregations, ad hoc filters)
over structured data and want the engine to figure out how. Most NoSQL
families bet the opposite: you know your access patterns up front, and you'll
trade query flexibility for horizontal scale, schema flexibility, or latency.

The historical arc in three sentences (worth being able to say): relational
databases dominated for 30 years because one machine could hold most
businesses' data and SQL's flexibility was priceless. The 2000s web broke the
one-machine assumption; Google/Amazon published Bigtable/Dynamo (2006–07), and
"NoSQL" bloomed — each family giving up something relational to get scale.
The 2010s–20s counter-revolution ("NewSQL"/distributed SQL — Spanner,
CockroachDB) used consensus + clever clocks to claw SQL semantics back at
scale, so the modern menu is rich in the middle, not a binary.

---

## 2. The families (model → query power → scaling → consistency → canonical use)

### 2.1 Relational (MySQL/InnoDB, Postgres)

- **Model:** tables, rows, enforced schema, foreign keys.
- **Query power:** full SQL — joins, aggregations, ad hoc everything;
  optimizer does the thinking. Secondary indexes are native and
  transactional.
- **Scaling:** vertical first; read replicas; then *sharding hurts* (app- or
  middleware-level; you give up cross-shard joins/transactions — at which
  point you've hand-built a NoSQL with SQL syntax).
- **Consistency:** ACID transactions, strong single-node semantics.
- **Use:** the default until proven otherwise — business records, anything
  with evolving query needs, anything transactional at ≤ single-digit-TB /
  ≤ tens-of-k QPS per primary **(ballpark)**.

### 2.2 Key-value (Redis, Aerospike, DynamoDB-as-KV)

- **Model:** opaque value per key. **Query power:** get/put/delete (+ TTLs,
  counters, CAS); no queries *into* values. **Scaling:** hash-partitioned,
  nearly unbounded, single-hop lookups. **Consistency:** per-key atomic ops
  (generation CAS); usually no multi-key transactions.
- **Use:** caches, sessions, device fingerprints, dedup tokens, feature
  flags — your Aerospike tier. When latency (sub-ms) and throughput
  (millions ops/s) dominate and the question is always "give me THIS key."

### 2.3 Wide-column (HBase, Bigtable, Cassandra, ScyllaDB)

- **Model:** rows keyed by a designed row key; within a row, sparse columns
  in families; cells versioned. Think "two-dimensional sorted map," not
  "tables."
- **Query power:** point get + **range scan over the key order** — that's
  it. The row key IS the query plan (`03-indexing.md`). No joins, no ad hoc
  filters (full scans aside).
- **Scaling:** range- (HBase) or hash- (Cassandra) partitioned to PB scale,
  millions of writes/s; LSM hearts (`01-storage-engines.md`).
- **Consistency:** HBase — per-row linearizable, CP posture; Cassandra —
  tunable quorum, AP default (`01-distributed-systems/08-cap-pacelc.md`).
- **Use:** huge, write-heavy, known-access-pattern data: events,
  time series, messaging state, your transaction/mandate/rewards stores.

### 2.4 Document (MongoDB, Couchbase, DynamoDB-as-document)

- **Model:** JSON-ish documents; nested structure replaces many joins
  (locality: the order and its line items in one document).
- **Query power:** rich-ish — filters on fields, secondary indexes,
  aggregation pipelines; weaker/awkward joins; schema-on-read flexibility.
- **Scaling:** hash/range sharding, replica sets; mature horizontal story.
- **Consistency:** single-document atomicity is the sweet spot (multi-doc
  transactions exist post-4.0 with costs).
- **Use:** entities that are naturally aggregates (product catalog, user
  profile, content), heterogeneous/evolving schemas, product teams
  iterating fast. The design center: **model documents around access
  patterns; document boundaries = transaction boundaries.**

### 2.5 Graph (Neo4j, Neptune) — brief

- **Model/power:** nodes + edges as first-class; traversals ("friends of
  friends who bought X") in graph query languages — queries whose SQL
  equivalent is N self-joins.
- **Use:** deep-traversal domains — fraud rings, recommendations,
  knowledge graphs. Rule: if traversal depth is fixed and shallow (1–2
  hops), relational/document with good indexes is usually fine; graphs
  earn keep at variable/deep traversal. Fraud-ring detection is the
  payments-relevant example to cite.

### 2.6 Search (Elasticsearch/OpenSearch) — brief

- **Model:** inverted indexes over documents (term → posting list).
- **Power:** full-text relevance, fuzzy matching, faceting, aggregations.
- **Posture:** near-real-time (refresh-interval visibility lag), eventually
  consistent, **never the system of record** — a derived view fed by CDC
  (your pipeline's shape feeds exactly this kind of sink).

### 2.7 Time-series (Prometheus, InfluxDB, TimescaleDB) — brief

- Specialized LSM-ish engines: time-bucketed storage, delta/gorilla
  compression (~1–2 bytes/sample), drop-by-window retention, range+rollup
  queries. Metrics/observability; the storage-engine doc's P4 design.

### 2.8 NewSQL / distributed SQL (Spanner, CockroachDB, TiDB, Yugabyte)

- **Model/power:** real SQL, real ACID — over Raft/Paxos-replicated,
  range-partitioned storage (usually LSM: RocksDB under CRDB/TiKV).
- **The mechanism to name:** per-range consensus groups + distributed
  transactions (2PC over consensus groups) + clever time (TrueTime
  commit-wait / HLC) for external consistency
  (`01-distributed-systems/05-consensus.md`, `06-time-and-ordering.md`).
- **Cost:** write latency includes quorum RTTs (single-region: few ms;
  multi-region: tens-to-hundreds); throughput per contended range bounded
  by its consensus group; operational sophistication.
- **Use:** when you genuinely need SQL semantics + horizontal scale +
  survivability (financial ledgers at scale, global inventory) and can pay
  latency. The honest note: most workloads that "need Spanner" actually
  need a well-sharded MySQL or a wide-column store with app-level
  discipline — which is your platform's bet, and defensible.

### 2.9 Vector (2026 addition: Pinecone, pgvector, Milvus) — one paragraph

Embedding vectors + approximate-nearest-neighbor indexes (HNSW graphs, IVF)
for semantic/similarity search powering RAG and recommendations. Not a
system of record; a derived index like search. Worth one sentence in
interviews to show currency; don't over-invest **[unless the role is
ML-adjacent]**.

---

## 3. Senior-level depth

- **The four-axis analysis beats family names.** For any candidate store
  ask: (1) data model fit (are entities rows, aggregates, edges, series?);
  (2) query power needed *later*, not just day one (the relational bet);
  (3) scaling model (partition-friendly keys? write volume? dataset
  growth?); (4) consistency/transaction scope (per-key? per-document?
  multi-row?). Most bad picks are axis-3 optimism ("we'll shard later") or
  axis-2 blindness ("we'll never need joins" — analytics arrives in month
  three; the escape hatch is CDC into a warehouse, which is exactly what
  your platform built).
- **Transaction scope is the sharpest differentiator:** relational =
  arbitrary multi-row; document = the aggregate; wide-column = the row;
  KV = the key; NewSQL = arbitrary again but priced in RTTs. Everything
  else (sagas, markers, recon — your world) is compensating machinery for
  scope you gave up. One sentence: "choose the store whose native atomic
  unit matches your invariants, or budget the compensation engineering."
- **Schema flexibility is deferred cost, not absent cost:**
  schema-on-read means every reader carries version handling forever;
  "schemaless" systems accrete implicit schemas enforced by convention.
  Mature shops re-impose schema at the edges (validators, registries —
  your protobuf/versioned-blob discipline).
- **Polyglot persistence with a spine:** real platforms (yours) run 4+
  stores; the L6 concern is the *synchronization fabric* — one system of
  record per datum, everything else a derived view fed by CDC, rebuildable.
  "Which store is the system of record for this field, and how do the
  others learn?" is the architecture question that sorts staff-level
  thinkers.
- **L4/L5/L6:** L4 argues SQL vs NoSQL. L5 runs the four axes per family,
  names transaction scopes, and prices the compensation machinery. L6
  designs the polyglot fabric: systems of record, derived views, CDC
  spine, and the org rules for adding store #5.

---

## 4. Resume connection

Your platform is a textbook polyglot-with-a-spine — present it that way:

- **Wide-column (HBase/Yak) as system of record** for transactions,
  mandates, rewards: chosen for write volume, per-row atomicity matching
  the invariant unit (a transaction's state), designed row keys as query
  plans, 1–30 y retention. Compensation machinery budgeted: hand-built
  index tables, markers/CAS/sagas, recon.
- **KV (Aerospike)** for the latency tier: device fingerprints, dedup
  tokens — sub-ms, per-key CAS, TTLs native.
- **Relational (MySQL)** where transactional/relational semantics dominate
  **[VERIFY exactly what lives in MySQL in your platform — you list it on
  the resume; be ready with a concrete table/use or drop it]**.
- **Derived views via the CDC spine:** analytics (FDP), fraud — search/
  warehouse-class consumers fed from the system of record, rebuildable,
  never authoritative.
- **The gap to own honestly:** no graph/search/NewSQL production
  experience — answer from mechanism (this doc) and say so; e.g., "I
  haven't run Spanner; I know what it buys — external consistency via
  commit-wait over per-range Raft — and what it costs, and our platform
  chose the other side of that trade: wide-column plus app-level
  discipline plus recon."

**30–60 s spoken answer** ("SQL or NoSQL — how do you choose?"):

> "I don't choose on that axis — it's a false binary. I run four questions:
> what's the natural shape of the entity; what query power will we need in
> a year, not just at launch; does the workload partition — write volume,
> growth, key design; and what's the invariant unit that must be atomic —
> because that's the sharpest differentiator: relational gives you
> arbitrary multi-row transactions, documents give you the aggregate,
> wide-column gives you the row, KV gives you the key, and everything you
> give up you buy back as engineering — sagas, idempotency markers,
> reconciliation, which is half my job. Our platform answers those
> questions differently per tier: HBase as system of record for
> transaction state — per-row atomicity matches the invariant, row keys
> designed as the query plan, petabyte-friendly writes; Aerospike where
> sub-millisecond per-key operations dominate; MySQL where relational
> semantics dominate; and the spine holding it together is CDC — one
> system of record per datum, everything else a rebuildable derived view.
> The question I ask about any new store isn't 'SQL or NoSQL' — it's
> 'system of record for what, and how does everything else learn?'"

---

## 5. What the interviewer will push on

**P1. "Why did your platform put payment transactions in HBase instead of
sharded MySQL? Steelman the MySQL answer first."**
- *Model:* steelman: sharded MySQL (by account/txn ID) gives real
  transactions within a shard, secondary indexes, SQL for ops/support
  queries, and a huge operational talent pool — Meta runs the world's
  money-adjacent data on it. Then the actual answer: our write volume and
  retention (years of append-heavy state at platform TPS) fit LSM
  economics; our invariant unit is the single row (a txn's state), so
  MySQL's multi-row transactions buy little across shards anyway
  (cross-shard = same saga/recon machinery); the platform (Yak) provided
  HBase with CDC built in — paved road; and range partitioning splits
  without re-sharding events. Close: "at the point where you've sharded
  MySQL, you've accepted NoSQL's constraints with relational overhead —
  we accepted them in a store designed for them." 
- *Trap:* trashing MySQL ("doesn't scale") — the steelman is mandatory;
  interviewers at Google have seen MySQL scale further than your whole
  platform.

**P2. "Document vs relational for an e-commerce order system — argue it
concretely."**
- *Model:* the order is a natural aggregate (order + items + address +
  payment summary read/written together) — document locality wins the hot
  path, and document-boundary atomicity covers the invariant. But: orders
  are *queried across* (by seller, by SKU, analytics, finance) — the
  relational bet. Resolution options: relational with JSON columns
  (Postgres jsonb — aggregate locality inside a transactional store);
  document store + CDC into a warehouse for cross-queries; or document
  for the cart/checkout (ephemeral, aggregate-shaped) and relational for
  the order of record. State the deciding variables: cross-entity query
  intensity and transaction scope beyond the aggregate (inventory
  decrement + order create = multi-entity — relational or saga).
- *Trap:* picking either without surfacing the cross-query and
  multi-entity-transaction tensions — they ARE the question.

**P3. "When does a graph database earn its complexity?"**
- *Model:* when the workload is *variable-depth traversal* — the SQL
  equivalent is unbounded self-joins with exploding intermediate sets:
  fraud rings (accounts→devices→cards→accounts, depth unknown),
  recommendations, dependency/impact analysis. Fixed shallow hops (user →
  orders → items) = relational with indexes, no graph needed. Also
  honest: many "graph problems" at moderate scale are handled with
  adjacency tables + recursive CTEs; the graph engine earns keep when
  traversal is the *primary* workload and index-free adjacency pays.
  Payments hook: fraud-ring detection is the one you'd plausibly meet.
- *Trap:* "our data has relationships, so graph DB" — all data has
  relationships; traversal-as-workload is the criterion.

**P4. "Spanner/CockroachDB give you SQL at scale. Why doesn't everyone
just use them?"**
- *Model:* costs: every write pays quorum RTTs (multi-region: the map is
  the latency floor — 30–100+ ms); contended ranges serialize through one
  consensus group (hot-row throughput ceilings); operational and dollar
  cost; and ecosystem/tooling maturity vs 30-year incumbents. Plus the
  subtle one: most workloads' invariants are per-key/per-aggregate —
  they're paying for cross-row serializability they rarely use. When it
  IS right: global financial/inventory invariants that genuinely span
  rows and regions, teams that can operate it. Then the currency note:
  managed offerings (Spanner, CRDB serverless) have collapsed the ops
  cost — the latency physics remains.
- *Trap:* "they're too new/complex" (they're a decade+ mature) — the
  physics-based costs (RTT floors, hot-range ceilings) are the durable
  answer.

**P5. "Your platform has four stores. How do you keep them consistent, and
which one is lying to me right now?"** (the polyglot probe)
- *Model:* embrace it: they're *deliberately* inconsistent — one system
  of record per datum (HBase for txn/mandate/reward state; partner ledger
  for credit state; Aerospike authoritative only for device binding
  **[VERIFY]**), everything else derived and lagging by design: CDC-fed
  analytics (seconds), aggregates (event-processing lag), caches (TTL).
  "Which is lying": any derived view, bounded by its lag SLI — and the
  recon/rebuild paths are what make the lying safe (convergent,
  detectable). The anti-pattern we avoid: two stores both believing
  they're the record for one field.
- *Trap:* claiming they're "kept in sync" — polyglot consistency is
  managed divergence, not synchronization; pretending otherwise fails
  the probe.

---

## Self-test

1. Name the four axes that replace "SQL vs NoSQL," with one sentence each.
2. Give the transaction-scope ladder across five families, and what
   giving up scope costs you.
3. The relational bet vs the NoSQL bet — state both in one sentence each.
4. Wide-column in three sentences: model, query power, and why the row
   key is the query plan.
5. Document stores: the design center rule, and the two tensions that
   push you back toward relational.
6. When does a graph database earn its keep? State the criterion and a
   payments example.
7. NewSQL: the three mechanisms that make it possible and the two physics
   costs that bound it.
8. Why is Elasticsearch never the system of record, and what feeds it
   properly?
9. Schema-on-read: what cost moved where? What re-imposes discipline in
   your platform?
10. Define "polyglot with a spine" and apply it to your four stores.
11. Steelman sharded-MySQL-for-payments in three points, then give the
    two-point rebuttal your platform's choice rests on.
12. "Which of your stores is lying to me right now?" — give the correct
    shape of answer.

<details>
<summary><b>Answers</b></summary>

1. Data model (rows/aggregates/edges/series — the entity's natural
   shape); query power (ad hoc joins/filters vs predeclared access
   paths); scaling model (partitionability, write volume, growth);
   consistency/transaction scope (the largest unit that's natively
   atomic).
2. KV: the key. Wide-column: the row. Document: the aggregate/document.
   Relational: arbitrary multi-row (single node). NewSQL: arbitrary
   multi-row distributed (priced in RTTs). Each scope you give up is
   bought back as sagas, idempotency markers, ordering discipline, and
   reconciliation — application engineering replacing engine guarantees.
3. Relational bet: you will ask questions you haven't anticipated, so
   keep query power maximal and let the optimizer work. NoSQL bet: you
   know your access patterns, so trade query power for scale, latency,
   or schema freedom along a chosen axis.
4. A sparse, sorted, versioned two-dimensional map: rows ordered by a
   designed key, columns grouped in families, cells timestamped. Query
   power = point get + range scan over key order, nothing else. Since
   the only access path is key order, the row key literally encodes
   which queries are efficient — key design is query planning.
5. Rule: model documents around access patterns, and remember document
   boundary = atomicity boundary. Tensions: cross-entity queries
   (by-seller, analytics — the relational bet returning) and
   multi-entity invariants (inventory + order — beyond one document's
   atomicity ⇒ transactions or sagas).
6. Criterion: variable-depth traversal as the primary workload (SQL
   equivalent = unbounded self-joins). Example: fraud-ring detection —
   accounts linked through shared devices/instruments at unknown depth.
7. Mechanisms: per-range consensus replication (Raft/Paxos), distributed
   transactions layered over it (2PC across groups), and
   bounded-uncertainty time (TrueTime commit-wait / HLC) for external
   consistency. Physics costs: quorum RTTs on every write (multi-region
   floors), and per-range serialization (hot/contended keys cap
   throughput at one consensus group's speed).
8. It's a derived inverted-index view: near-real-time (refresh lag),
   eventually consistent, with relevance-oriented storage that discards
   source fidelity; loss/rebuild must be acceptable. Fed via CDC (or
   outbox events) from the system of record, rebuildable end to end.
9. From write-time (enforced schema, migrations) to read-time (every
   consumer forever handles every historical shape). Re-imposition:
   versioned serialization (version-prefixed blobs, protobuf field
   discipline), schema-versioned entities, and compatibility rules at
   the pipeline boundary.
10. One authoritative system of record per datum; every other store is a
    derived, lagging, rebuildable view; CDC is the spine that feeds
    them. Platform: HBase = record for txn/mandate/reward state; partner
    ledger = record for credit/balance; Aerospike = record only for
    device binding [verify], cache otherwise; MySQL for its relational
    domain; FDP/analytics = derived via CDC; aggregates = derived via
    events.
11. Steelman: real intra-shard transactions + secondary indexes; SQL for
    support/ops/ad hoc queries; unmatched operational maturity and
    talent pool (proven at Meta-scale). Rebuttal: (a) our invariant unit
    is the single row, and cross-shard needs the same saga/recon
    machinery anyway — the transactional advantage evaporates at shard
    boundaries; (b) LSM economics fit append-heavy volume with
    multi-year retention, and the platform's HBase came with CDC and
    range-splitting as paved road.
12. Reject "none": every derived view lies within its lag bound, by
    design. Enumerate: CDC analytics lag seconds-to-minutes; aggregate
    views lag event processing; caches lag TTL windows; local mandate
    view lags partner callbacks. The safety argument: lags are
    monitored (SLIs), error directions are benign, and recon/rebuild
    converge — managed divergence, not synchronization.

</details>
