# When to Pick What — The Datastore Decision Procedure

The synthesis doc. Taxonomy (`02-...md`) gave you the families; internals docs
gave you the mechanisms; this one gives you the *procedure* — the ordered
questions, the capacity numbers that anchor them, and worked decisions
including your own platform's. In design interviews, the store choice is
scored less on the pick than on the **procedure and the named trade** — this
doc trains the procedure.

---

## 1. The procedure (five questions, in this order)

Ask in order; each question can eliminate families before the next.

### Q1. What are the access patterns — ALL of them, including year two's?

List every (query shape × frequency × latency budget). The split that
matters: **predeclared** patterns (point get, key-range scan, per-entity
fetch) vs **ad hoc** (joins, filters on arbitrary columns, aggregations).
Predeclared-only → NoSQL families are candidates. Any serious ad hoc need →
relational, or NoSQL + CDC into a warehouse (the escape hatch you built).
*The classic failure is answering Q1 with launch-day patterns only —
analytics, support tooling, and recon queries always arrive.*

### Q2. What is the invariant unit — the largest thing that must change
atomically?

Per-key → KV suffices. Per-row/entity → wide-column/document. Multi-row,
same shard → relational. Multi-row across shards/services → nothing native:
you're budgeting sagas/outbox/recon *regardless* of store
(`14-distributed-transactions/`), so pick the store on other axes and
budget the machinery explicitly.

### Q3. What are the numbers? (the anchors — commit these)

| System (well-tuned, ballpark 2026) | Comfortable ceiling before sharding/heroics |
|---|---|
| Single MySQL/Postgres primary | ~1–5 TB working data; ~5–20 k write TPS, ~50 k+ read QPS with replicas + cache; p99 single-digit ms |
| Sharded MySQL (Vitess-class) | ~linear × shards; pay: cross-shard txn/query machinery |
| HBase/Cassandra cluster | PB-scale; ~100 k–1 M+ writes/s across cluster; p99 ~1–20 ms (compaction-shaped) |
| Aerospike | ~M+ ops/s cluster; sub-ms p99; capacity bound by index RAM (64 B/record) |
| Redis | ~100 k+ ops/node, µs–ms; dataset must fit RAM |
| Elasticsearch | ~10–50 k docs/s ingest/node; search ms–100s ms; NRT lag ~1 s |
| Spanner/CockroachDB | relational semantics at horizontal scale; write p99 ~5–10 ms single-region, ~50–200 ms multi-region (quorum RTT floor) |
| Kafka/Pulsar (as storage) | GB/s appends; not a query store |

**(All estimates — workload-dependent; state them as anchors, not gospel.)**
The procedure step: compute *your* numbers (data size ×3 y growth, peak
write/read QPS, latency budget) and see which rows survive. Most systems
comfortably fit "single relational primary + replicas + cache" — saying
that out loud in an interview ("do we even outgrow one primary? Let's
check: 2 k TPS peak... we don't") is a credibility move, not a cop-out.

### Q4. What consistency/availability posture per operation?

Money-gating writes → per-key linearizability or conditional writes
minimum. Display reads → bounded staleness fine. Partition behavior:
refuse (CP) or diverge-and-repair (AP)? — per dataset, per the
`08-cap-pacelc.md` decomposition. This question kills more candidates'
designs than any other when skipped: they pick an AP store and then
promise linearizable behavior.

### Q5. What's the operational reality?

Team's run-experience, managed offerings available, paved roads (your
Yak/Aerospike platform teams = massive thumb on the scale — legitimately),
hiring pool, ecosystem. A technically-second-best store your org operates
brilliantly beats the best store nobody can page on. L6 answers weigh this
axis openly; L4 answers pretend it doesn't exist.

**Then: name the trade you're accepting.** Every pick sacrifices something
from Q1–Q5. The sentence "we chose X, accepting Y, mitigated by Z, and we'd
revisit when W" is the whole game.

---

## 2. Worked decisions (your platform, reconstructed through the procedure)

### 2.1 Transaction/mandate state → HBase

Q1: point get by txn ID, per-user/time scans, per-entity updates — fully
predeclared; ad hoc needs → CDC to warehouse. Q2: invariant = one
transaction's state = one row. Q3: platform-scale writes × years of
retention (1–30 y) → PB territory, past relational comfort. Q4: per-row
linearizable (CAS!), CP-refusal over divergence for money state. Q5: Yak =
paved road with CDC included. **Trade named:** no engine transactions/
indexes → sagas, markers, hand-built index tables, recon. Revisit-when:
never realistically; the machinery is amortized.

### 2.2 Device fingerprints / dedup tokens → Aerospike

Q1: point get/put by key, TTL'd, on every payment (sub-ms budget). Q2:
invariant = one record (generation CAS available). Q3: high ops/s, small
records — index-RAM economics ideal. Q4: AP acceptable (defense layer,
layered idempotency behind it). Q5: platform-provided. **Trade:** no
queries beyond keys; rare post-partition LWW merges accepted.

### 2.3 Rewards aggregates → derived HBase rows (not a cache!)

The subtle one: could've been Redis/Aerospike cache-aside. Chose a durable
derived view co-located with ground truth because: rebuildability +
CAS-versioned correctness protocol + no cold-start stampede
(`00-resume-arsenal/02-upi-rewards.md` A1). **Trade:** write-path
complexity (the five-case protocol) for read-path guarantees.

### 2.4 Where MySQL sits

Relational semantics + modest scale + ad hoc queryability: config-like,
operational, back-office data **[VERIFY specifics — §4 of
`07-mysql-innodb-internals.md`]**. The general rule it instantiates:
**relational is the default; you leave it per-dataset for a named
reason** (scale, latency, model fit) — never platform-wide by fashion.

---

## 3. Senior-level depth: the judgment layer

- **Default-to-relational, exit-per-dataset.** The burden of proof is on
  leaving Postgres/MySQL, and the proof is Q3 numbers or Q1 model fit —
  not "webscale." Conversely, once numbers force the exit, own the NoSQL
  constraints fully (budget the machinery) rather than half-leaving
  (sharded relational with cross-shard joins in app code = worst of
  both).
- **One system of record per datum; everything else derived.** The
  polyglot spine (`02-sql-vs-nosql-taxonomy.md` §3): adding a store is
  fine; adding a second *authority* for the same field is the
  architecture bug. Every "should we also put it in X for fast reads?"
  gets reframed as "X becomes a derived view — who feeds it (CDC), how
  stale, how rebuilt?"
- **Migration cost is part of the pick.** Data outlives code 10:1;
  choosing store #2 includes the path from store #1 (dual-read/
  dual-write phases, CDC-driven backfill, cutover with recon — the
  playbook shape). A pick you can't migrate *to* incrementally is a pick
  you can't make. Interviews increasingly ask "how would you migrate" —
  the answer is always: backfill via snapshot+CDC seam
  (`04-messaging-streaming/07-cdc.md` P2), shadow reads/writes with
  comparison, ramped cutover, recon throughout, rollback path until
  burn-in ends.
- **Anti-pattern catalogue (name these on sight):** ES/Redis as system
  of record; one Kafka topic as "the database" without compaction/
  snapshot design; relational used as a queue at scale
  (`01-queues-vs-logs.md` P4 nuance); "we'll shard later" with
  auto-increment keys and cross-row joins everywhere (sharding is a
  key-design decision made on day one or a rewrite later); caching to
  hide a missing index; DynamoDB/wide-column with relational-style
  normalized modeling (join-shaped access over a store with no joins).
- **L4/L5/L6:** L4 picks by familiarity/fashion and defends the brand.
  L5 runs the five-question procedure, anchors with numbers, names the
  trade and the revisit trigger. L6 adds the portfolio view: org paved
  roads, migration economics, system-of-record governance, and the
  discipline to say "single Postgres, revisit at 10× growth" when the
  numbers say so.

---

## 4. Resume connection + spoken answer

You don't just know the procedure — your platform is four of its outputs,
with the trades actually paid (the machinery you built IS the named
trade). Lead with that.

**30–60 s spoken answer** ("how do you choose a datastore?"):

> "Five questions, in order. First, all the access patterns — including
> year two's: predeclared point-and-range access opens up the NoSQL
> families; any real ad hoc need means relational or a CDC-fed warehouse
> behind whatever I pick. Second, the invariant unit — the biggest thing
> that must change atomically: if it's one row, wide-column is fine; if
> it's multi-row cross-shard, no store saves me and I'm budgeting sagas
> and recon regardless. Third, the numbers: data size with growth, peak
> QPS, latency budget — and honestly, most workloads fit a single
> relational primary with replicas and a cache, and saying so is a
> feature, not a failure. Fourth, consistency posture per operation —
> money-gating writes need per-key linearizability or conditional
> writes; display reads tolerate staleness; and partition behavior —
> refuse or diverge-and-repair — is chosen per dataset. Fifth,
> operational reality: the store my platform team runs brilliantly beats
> a better one nobody can page on. Then I name the trade out loud. Our
> platform is this procedure's output four times over: HBase for
> transaction state — petabyte writes and per-row linearizability,
> paying for it with hand-built indexes, sagas, and recon; Aerospike
> where sub-millisecond and TTLs dominate, accepting AP because it's a
> defense layer; durable derived aggregates instead of caches where
> rebuildability mattered; and relational as the default that everything
> else had to argue its way out of."

---

## 5. What the interviewer will push on

**P1. "Design the datastore for [X] in 60 seconds" (X = URL shortener /
chat / metrics / inventory).**
- *Model:* run the procedure audibly, fast. URL shortener: Q1 point-get
  by code (99.99% reads), Q2 per-key, Q3 tiny data huge QPS → KV +
  heavy cache, relational behind for management. Chat: Q1 per-
  conversation time-range scans + fan-out, Q3 write-heavy → wide-column
  keyed (conversationId, ts) [+ the ordering discussion]. Metrics: TSDB
  or time-windowed LSM (`01-storage-engines.md` P4). Inventory: Q2 is
  the trap — decrement invariants across concurrent orders → relational
  with conditional writes / serialized per-SKU, not eventual-anything.
  The audible procedure IS the answer.
- *Trap:* leading with a brand ("I'd use DynamoDB") before the
  questions.

**P2. "You said most workloads fit one Postgres. Your platform didn't.
Reconcile."**
- *Model:* both are procedure outputs: the default holds until Q3
  numbers or Q1 shape break it — ours broke on write volume × multi-
  year retention (PB-range) and per-row-suffices invariants, so we
  exited *for those datasets* and paid the named costs. Config/back-
  office data stayed relational. "Default-relational with per-dataset
  exits" is one policy producing both answers — no contradiction.
- *Trap:* defending NoSQL-everywhere or retreating to
  relational-everywhere; the per-dataset policy is the answer.

**P3. "Product wants 'fast search over transactions' tomorrow. Your
system of record is HBase. Go."**
- *Model:* reframe: search = a new *derived view*, never a new
  authority. Feed Elasticsearch/OpenSearch from the existing CDC stream
  (the machinery already runs — FDP consumers prove it); bounded
  staleness (~seconds) declared to product; rebuildable via
  snapshot+stream backfill; PII filtered at the mapper; ES explicitly
  non-authoritative (losses/rebuilds acceptable). Estimate: index only
  searched fields + txnId pointer, fetch truth from HBase — the
  covering-vs-pointer trade. Cost: one more lag SLI, one more rebuild
  runbook.
- *Trap:* dual-writing to ES from the app (the dual-write bug,
  `07-cdc.md` P1) or promising search freshness = store freshness.

**P4. "When is DynamoDB/managed-NoSQL the right answer over your
self-run HBase, and what changes in your design discipline?"**
- *Model:* right when: no platform team paving HBase (ops cost
  dominates), spiky/unpredictable load (on-demand capacity), single-
  digit-ms SLA wanted without compaction ops. Discipline that
  *transfers unchanged*: key design = query planning (partition+sort
  key ≈ your rowkey), invariant-per-item, conditional writes ≈
  checkAndPut, streams ≈ CDC/SEP, hand-built GSIs ≈ index tables (with
  the same lag caveats). What changes: cost model (pay-per-request
  shapes access patterns!), item-size caps, and hot-partition
  throttling replaces hot-region operations. Answering this well
  proves the knowledge is principles, not vendor trivia.
- *Trap:* treating managed as "no ops" — throttling, cost, and GSI-lag
  incidents are ops by other names.

**P5. "Your growth projection says the transaction table 10×'s in two
years. What breaks first across your stack, and what's the plan?"**
- *Model:* run the ceilings: HBase — regions ×10 (splits fine;
  compaction debt and MTTR-per-server grow: more WAL to replay —
  re-tune flush/major schedules, maybe more/smaller servers); index-RAM
  math on Aerospike (tokens scale with TPS: 64 B × records × RF —
  compute it); Pulsar retention × throughput (backlog absorbency
  shrinks relative to flow — resize or tier); CDC consumer lag
  headroom; and the humans (on-call load per incident class). The
  shape: per-system ceiling analysis + the two or three that need
  action + monitoring that confirms the projection. This is the L6
  question in L5 clothing — capacity as an ongoing procedure, not an
  event.
- *Trap:* "HBase scales horizontally, we're fine" — every system in the
  chain has a *different* scaling bottleneck; enumerating them is the
  answer.

---

## Self-test

1. The five questions in order, one line each, and why the order
   matters.
2. Your anchor numbers: single relational primary, HBase-class cluster,
   Aerospike, Spanner-class — ceilings and latency.
3. Q2 walkthrough: invariant units that point to KV, wide-column,
   relational, and "no store saves you."
4. Reconstruct the HBase decision for transaction state through all
   five questions, ending with the named trade.
5. Why were rewards aggregates built as durable derived rows instead of
   a cache? Three reasons.
6. State the system-of-record rule and the reframe for every "also put
   it in X" request.
7. The migration playbook in five moves.
8. Name six datastore anti-patterns from the catalogue.
9. "Default-to-relational, exit-per-dataset" — defend it against both
   fashion directions.
10. The search-over-transactions request: the design in four
    properties.
11. What transfers unchanged from your HBase discipline to DynamoDB,
    and what changes?
12. Your 10×-growth answer: name four different first-bottlenecks
    across your stack.

<details>
<summary><b>Answers</b></summary>

1. Q1 access patterns incl. future ad hoc (eliminates families first —
   cheapest filter); Q2 invariant unit (atomicity scope); Q3 numbers
   (data×growth, QPS, latency — most candidates never compute); Q4
   consistency/availability per operation; Q5 operational reality.
   Order matters because each is cheaper to answer than the next and
   eliminates candidates before the expensive questions.
2. Relational primary: ~1–5 TB, ~5–20 k write TPS / 50 k+ read QPS
   (replicas+cache), single-digit-ms p99. HBase-class: PB-scale,
   100 k–1 M+ writes/s cluster, 1–20 ms compaction-shaped p99.
   Aerospike: M+ ops/s, sub-ms, bounded by index RAM (64 B/record ×
   RF). Spanner-class: relational semantics, ~5–10 ms single-region
   writes, 50–200 ms multi-region (quorum RTT floor). All ballparks —
   quote as anchors.
3. Per-key (session, token, fingerprint) → KV. Per-entity-row (a
   transaction's state) → wide-column/document. Multi-row same-shard
   (debit+credit in one ledger) → relational. Multi-row cross-shard/
   service (order+inventory+payment) → no native store: sagas/outbox/
   recon budgeted regardless; choose the store on the other axes.
4. Q1: point get by txnId + per-user/time scans, predeclared; ad hoc →
   CDC/warehouse. Q2: invariant = one row. Q3: platform TPS × 1–30 y
   retention → PB, past relational comfort. Q4: per-row linearizable
   (CAS-dependent), CP for money. Q5: Yak paved road with CDC.
   Trade named: no transactions/indexes → markers, sagas, hand-built
   index tables, recon — accepted and staffed.
5. (a) Rebuildable from co-located ground truth (a cache refill is a
   stampede; a re-derivation is a protocol); (b) participates in the
   correctness protocol (versioned, CAS'd — caches bypass it);
   (c) no cold-start/stampede class of failure (durable, always
   present). (`02-consistency-models.md` materialized-view-vs-cache.)
6. One authoritative store per datum; all others are derived views.
   Reframe: "X becomes a derived view — fed by what (CDC/outbox), how
   stale (SLI), rebuilt how, and explicitly non-authoritative."
7. (1) Backfill target via snapshot + CDC-stream seam; (2) shadow
   phase — dual-read (or dual-write) with automated comparison;
   (3) ramped cutover by cohort/percentage; (4) recon running
   throughout as the divergence detector; (5) rollback path held until
   burn-in completes, then decommission.
8. ES/Redis as system of record; Kafka-topic-as-database without
   compaction/snapshots; relational-as-queue beyond its ceiling;
   "shard later" with unshardable keys/joins; caching over a missing
   index; normalized/join-shaped modeling on a no-join store. (Also:
   second authority for one datum.)
9. Against NoSQL-fashion: relational's optionality (ad hoc queries,
   transactions, constraints) is insurance you already paid for; leave
   only when Q3 numbers or Q1 shape *demonstrably* break it. Against
   relational-fundamentalism: when numbers do break it, half-measures
   (app-joined shards) cost more than honest wide-column with budgeted
   machinery — exit fully, per dataset, trade named.
10. Fed from existing CDC (no dual-write); bounded declared staleness
    with a lag SLI; rebuildable via snapshot+stream and explicitly
    non-authoritative (pointer-index into HBase for truth); PII
    filtered/masked at the pipeline mapper.
11. Transfers: key design as query planning (partition+sort key),
    single-item invariants, conditional writes (≈checkAndPut), streams
    as CDC, GSIs as async index tables with lag. Changes: cost model
    shapes access (pay-per-request), item-size limits, hot-partition
    throttling as the new hot-region, and capacity/ops as config
    rather than clusters.
12. HBase: compaction debt + per-server WAL-replay MTTR growth (not raw
    capacity). Aerospike: index RAM (records × 64 B × RF) crossing node
    memory. Pulsar: backlog absorbency relative to 10× flow (retention
    window shrinks in hours-of-traffic terms). CDC/FDP: consumer
    throughput and lag headroom. (Plus: on-call/incident load scaling
    with fleet size — the human bottleneck.)

</details>
