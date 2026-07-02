# Change Data Capture (CDC)

You built a production CDC pipeline (HBase → Pulsar → Storm → analytics, four
entity types, protobuf envelopes). The replication doc covered *why CDC beats
dual-write*; the core-platform arsenal covered your pipeline's story. This doc
completes the topic: the full pattern space (polling → triggers → log-based),
the transactional outbox, the initial-snapshot problem, schema evolution, and
the operational pathologies — everything an interviewer can reach for after
"tell me about your CDC pipeline."

---

## 1. Plain definition

**CDC** = turning a database's changes into a stream of events that other
systems can consume — making the database's *write history* a product, not
just its current state. Instead of asking "what does the table say now?"
(polling, batch ETL), consumers learn "what just changed?" within seconds.

Analogy: instead of photographing a whiteboard every hour (batch snapshots —
you miss intermediate states and burn effort re-reading the unchanged parts),
you record every stroke as it's drawn. Anyone can replay the strokes to
rebuild the board, keep their own copy live, or react to specific strokes.

The killer property (worth repeating from `01-distributed-systems/03-replication.md`):
because events are derived from **committed database changes**, the stream
*cannot disagree* with the database — only lag it. Dual-writing (app writes DB
AND publishes an event in code) can't make that promise: the two writes
aren't atomic, and every crash between them mints a silent divergence.

---

## 2. The pattern space (know all four, and why the industry converged on one)

### 2.1 Polling (the crude baseline)

`SELECT * WHERE updated_at > :last_checkpoint` on a timer.
- Requires: an indexed updated_at / version column the app faithfully
  maintains.
- Misses: **deletes** (the row is just gone), intermediate states between
  polls, and rows whose clocks skew.
- Costs: query load proportional to polling frequency; latency = poll
  interval.
- Verdict: fine for low-stakes, append-mostly tables; not CDC so much as
  incremental batch.

### 2.2 Triggers

Database triggers write change rows to a shadow/audit table; a reader drains
it.
- Wins: catches deletes, transactional with the change.
- Costs: trigger execution *inside every transaction* (write-latency tax,
  typically double-digit % **(estimate)**), operational fragility (triggers
  are code hidden in the database), per-table sprawl.
- Verdict: legacy pattern; superseded by log-based except where log access
  is impossible.

### 2.3 Log-based (the modern answer, and yours)

Tail the database's own write-ahead/replication log — the artifact the DB
already produces for durability and replication (`03-replication.md`):
MySQL binlog (Debezium's bread and butter), Postgres logical decoding /
WAL, MongoDB change streams, **HBase: replication hooks (SEP) — your
pipeline registers as a replication peer and receives every cell mutation**.
- Wins: zero cost added to the transaction path (the log was being written
  anyway); catches everything including deletes; ordered per key/partition
  as the log is; can't diverge from committed state.
- Costs: couples you to the storage layer's format and operational
  surface (log retention windows, format/version changes, failover
  repositioning); events are *storage-shaped* (row images, cell
  mutations), not business-shaped — see §3 outbox.
- The dominant tooling name to know: **Debezium** (Kafka-ecosystem log
  tailer for MySQL/Postgres/Mongo/etc.) — cite it as what you'd reach for
  outside your in-house stack.

### 2.4 The transactional outbox (CDC's application-level sibling)

Problem it solves: you want to publish a *business event* ("OrderPlaced")
atomically with your state change — but the bus and the DB can't share a
transaction (the dual-write problem).
Mechanism: within the SAME database transaction as the state change, insert
an event row into an `outbox` table. Then either (a) log-based CDC tails the
outbox table and publishes its rows to the bus, or (b) a poller drains it.
The DB transaction makes state-change + event atomic; CDC makes
event-in-outbox → event-on-bus reliable (at-least-once).
- This is the standard answer to "how do I atomically update my DB and
  publish an event?" — and note it's *your* CDC infrastructure applied one
  level up: you already run the hard half. (Cross-ref: the arsenal already
  flags outbox as the fix for your write-then-publish gap —
  `00-resume-arsenal/03-core-upi-platform.md` A2.)
- Full treatment with sagas: `14-distributed-transactions/04-outbox-and-cdc.md`
  (when written).

---

## 3. Senior-level depth

### 3.1 The snapshot problem (every CDC deployment's day-one question)

A new consumer needs *current state*, not just changes-from-now: the stream
alone answers "what changed" but not "what existed." Approaches:
- **Snapshot-then-stream:** bulk-read the table at a known log position,
  then apply changes from that position — the seam must be exact
  (log-position-coordinated) or you lose/double changes at the boundary.
  Debezium's snapshot modes automate this; it can lock or race (newer:
  incremental/lock-free snapshots interleaving chunk reads with the
  stream — the watermark trick).
- **Compacted-topic bootstrap:** if the stream is keyed and compacted
  (latest-per-key retained), new consumers read the compacted topic from
  the start — snapshot and stream are the same artifact
  (`01-queues-vs-logs.md` compaction).
- **Rebuild-from-source:** your rewards pattern — derived views that can
  full-scan ground truth on initialization; the CDC feed is an
  optimization over re-derivation, not the only path.
Know which your platform used for FDP backfills **[VERIFY — how did a new
FDP entity type get its history?]**.

### 3.2 Schema evolution (the slow-motion failure mode)

The stream outlives code versions on both ends. Discipline:
- **Storage-shaped streams** (yours): version the serialization — your
  version-prefixed blobs + `YakBlobCodec` and schema-versioned FDP
  entities (`FkUpiTransaction` v4.4 etc.) are exactly this; producers and
  consumers deploy independently because the envelope declares its
  version.
- **Ecosystem-standard:** schema registry (Avro/Protobuf) with enforced
  compatibility rules (backward: new readers read old data; forward: old
  readers read new data) — CI gates on compatibility, not tribal memory.
- **The DDL trap:** an upstream `ALTER TABLE` changes the log's shape
  mid-stream; log-based connectors must parse DDL and re-align. In your
  world: an HBase column-qualifier or blob-format change is your DDL —
  the codec's version prefix is the survival mechanism. Say that mapping.
- Rule of thumb: **additive changes only** on live streams (new optional
  fields); renames/removals are new-version topics with parallel-run
  migration.

### 3.4 Operational pathologies (what pages you)

- **Lag under write bursts/compactions:** CDC competes with replication
  I/O; consumers see minutes-old state — freshness SLI = lag age, alert
  before consumers make stale decisions (`00-resume-arsenal` C3).
- **Log-retention outrun:** consumer down longer than the log/topic
  retention ⇒ gap that streams can't heal ⇒ forced re-snapshot. Retention
  must exceed max credible consumer outage + resolution time.
- **Amplification:** row-level logs emit every mutation — bookkeeping
  writes, compaction artifacts; without filtering, downstream drowns.
  Your qualifier filter (only the `tl` timeline column emits transaction
  events) is the built defense — one cell-write in N is a business event.
- **Ordering across keys:** per-region/per-partition order only; consumers
  upsert by version (posture B — `05-ordering.md`). Region splits/moves
  create seams **[the VERIFY from the arsenal stands]**.
- **PII leakage:** the log carries every column, including ones the
  analytics consumer must never see — filtering/masking belongs in the
  pipeline (your PII discipline extends here **[VERIFY what the FDP
  mappers exclude]**).

### 3.4 L4 / L5 / L6

- **L4:** "we use CDC/Debezium to send DB changes to Kafka."
- **L5:** pattern-space fluency (why log-based won), outbox as the
  dual-write cure, snapshot seam mechanics, schema-versioning discipline,
  the pathology list with defenses, storage-shaped vs business-shaped
  events.
- **L6:** CDC as data-platform strategy — contracts on streams (who may
  consume raw CDC vs curated business events), org-wide outbox paved
  road, stream lineage/governance, and the build-vs-Debezium call.

---

## 4. Resume connection

Your pipeline, presented with the full pattern vocabulary:

- **Log-based CDC via replication hooks:** "we subscribed to the store's
  replication stream (HBase SEP peer) — zero transaction-path cost, can't
  diverge from committed state, at-least-once with per-region order."
- **Amplification defense:** qualifier filtering (business-event columns
  only) before deserialization — the difference between streaming
  mutations and streaming *meaning*.
- **Schema evolution solved twice:** version-prefixed value blobs
  (storage-shaped seam) AND schema-versioned FDP entities
  (consumer-facing seam) — two independent evolution boundaries, both
  versioned. That's more discipline than most Debezium deployments; claim
  it.
- **Consumer posture:** idempotent, versioned upserts into the analytics
  platform (BigfootEntity with version + modTime) — the stream can replay
  and reorder without corrupting downstream.
- **The one-level-up insight to volunteer:** "our write-then-publish gap
  on the execution path is exactly what a transactional outbox closes —
  and the CDC machinery to power it is the machinery we already run."
  This turns a known gap into a demonstration of pattern mastery.

**30–60 s spoken answer** ("tell me about your CDC pipeline"):

> "Log-based, via the store's own replication machinery: our HBase platform
> exposes replication hooks, so the pipeline registers as a replication
> peer and receives every committed cell mutation — zero cost added to the
> transaction path, and the stream can lag the store but never disagree
> with it, which is the property dual-writing can't give you. Raw mutation
> streams drown consumers, so the first stage is a qualifier filter — only
> the column that encodes a business transition emits an event. Then a
> two-seam schema discipline: values are version-prefixed blobs decoded by
> a versioned codec, and the analytics entities carry their own schema
> versions — producers and consumers deploy independently on both
> boundaries. Downstream is posture-B all the way: at-least-once delivery
> with per-region ordering only, so the analytics sink upserts by entity
> version — replays and reorders are no-ops. Four entity types, feeding
> analytics and fraud with seconds of freshness instead of batch-ETL
> hours. And the pattern generalizes upward: the same machinery is what
> a transactional outbox needs — tail an event table written in the same
> transaction as the state change, and you've closed the dual-write gap
> for business events too."

---

## 5. What the interviewer will push on

**P1. "Dual-write vs CDC vs outbox — a service must update its DB and tell
three other systems. Design it and defend against the crash cases."**
- *Model:* dual-write fails the crash test (write lands, publish doesn't —
  or worse with publish-first: event for a rolled-back write). Two correct
  shapes: (a) raw CDC — consumers tail the table's change stream; right
  when consumers want *data* changes; couples them to schema. (b) outbox —
  same-transaction event row, CDC/poller publishes; right when consumers
  want *business* events with a stable contract. Crash cases: crash before
  commit ⇒ nothing anywhere (atomic); crash after commit before publish ⇒
  outbox row persists, publisher retries ⇒ at-least-once ⇒ consumers
  idempotent by event ID. Close with the fan-out: three systems = three
  subscriptions on one stream, not three publishes.
- *Trap:* "publish then write, with a retry" — event-for-nothing on
  rollback; or claiming outbox gives exactly-once (it gives atomicity +
  at-least-once; dedup is still the consumer's job).

**P2. "New consumer needs the full current state of a 2 TB table plus live
changes. Go."**
- *Model:* snapshot-then-stream with an exact seam: record log position P,
  bulk-copy at-or-after P (chunked, throttled against the source), then
  apply the stream from P with idempotent upserts — overlap at the seam is
  absorbed by version-comparison (duplicates harmless, gaps impossible if
  P precedes the copy). Mention incremental/lock-free snapshotting
  (interleave chunk reads with live changes using watermarks) for
  no-downtime sources, and the compacted-topic alternative if the stream
  is keyed+compacted. Estimate: 2 TB at a polite 100 MB/s ≈ 6 hours of
  snapshot — retention must hold the stream that long.
- *Trap:* "just replay the topic from the beginning" (retention won't
  have table-lifetime history unless compacted) or a snapshot without a
  log-position seam (the gap/double window at the boundary is the whole
  question).

**P3. "Upstream adds a column, then renames one. What happens to your
pipeline at each step?"**
- *Model:* additive column: with versioned envelopes/registry-backward
  compatibility, old consumers ignore it, new consumers read it —
  non-event by design. Rename: breaking — in registry terms it fails the
  compatibility gate in CI (that's the system working); on a live stream
  the move is new-version topic/entity, parallel-run, consumer migration,
  retire old. In my stack: blob codec bumps the version prefix; FDP entity
  bumps schema version; consumers roll forward independently. The DDL
  trap for log-tailers (connector must parse/track schema changes) is the
  extra credit.
- *Trap:* "protobuf handles it" — field *numbering* discipline and
  compatibility *rules* handle it; protobuf is the encoding, not the
  policy.

**P4. "Your CDC consumer was down for 8 days; retention is 5. What's the
recovery, and what should have prevented it?"**
- *Model:* the stream has a hole that streaming can't heal — recovery is
  re-snapshot (or re-derivation from source) + resume from a fresh
  position, with idempotent upserts absorbing overlap. Prevention:
  retention sized beyond max credible outage + detection + resolution
  (and/or tiered storage making retention cheap), consumer-lag *age*
  alerting long before the edge, and — the design answer — sinks that are
  rebuildable by construction (derived views over ground truth, your
  rewards posture) so the worst case is a re-derivation, not data loss.
- *Trap:* "replay from where it stopped" — the log no longer has it;
  missing that retention creates a hard cliff is the failure being
  probed.

**P5. "Why not have services just publish nice business events instead of
all this log-tailing?"** (the architecture-philosophy probe)
- *Model:* steelman it: business events are better *contracts* —
  storage-shaped CDC couples consumers to schemas and leaks internals.
  Then the two-part answer: (a) publishing reliably still requires the
  outbox — i.e., CDC machinery anyway; "just publish" without it is the
  dual-write bug wearing a clean shirt; (b) the mature end-state is
  *both layers*: raw CDC as the reliable transport substrate, curated
  business-event streams (built FROM it, or from outbox tables) as the
  public contract — consumers choose their coupling level. Your platform
  approximates this: raw mutations → filtered/mapped → versioned FDP
  entities are the curated layer.
- *Trap:* defending raw CDC as the final interface (schema-coupling
  denial) or agreeing that log-tailing is unnecessary (dual-write
  amnesia). The synthesis is the answer.

---

## Self-test

1. State the property CDC has that dual-write cannot, and the exact crash
   that proves it.
2. The four capture patterns with one fatal flaw each (polling, triggers,
   log-based, outbox — for outbox, its cost rather than flaw).
3. Why do polling-based approaches structurally miss deletes, and what
   catches them?
4. The transactional outbox: mechanism, what's atomic, what's still only
   at-least-once, and whose job dedup remains.
5. The snapshot seam: why must the bulk copy be coordinated with a log
   position, and what absorbs seam overlap?
6. Your two schema-evolution seams — name them and what each protects.
7. Additive vs breaking changes on a live stream: the rule and the
   migration pattern for breaking ones.
8. Four operational pathologies of CDC pipelines and your platform's
   defense for two of them.
9. Storage-shaped vs business-shaped events: the coupling trade and the
   two-layer end-state.
10. The retention cliff: construct the incident and the three preventions.
11. Why is your rewards architecture "rebuildable by construction," and
    how does that change CDC failure recovery?
12. Explain how the machinery you already run would power an outbox for
    the execution-path publish gap.

<details>
<summary><b>Answers</b></summary>

1. The stream derives from committed changes, so it can lag but never
   diverge from the database. Dual-write proof-crash: app commits the DB
   write, crashes before publishing — state changed, no event, nothing
   detects it (or publish-first + rollback: event for a change that never
   happened).
2. Polling: misses deletes and intermediate states; latency = interval.
   Triggers: per-transaction execution tax inside the write path +
   operational fragility. Log-based: couples you to storage format,
   retention, and failover repositioning (events are storage-shaped).
   Outbox (cost): an extra table + publisher machinery, and events are
   only as good as the app's discipline in writing them.
3. A delete removes the row — there's nothing left for
   `WHERE updated_at >` to select; you'd need tombstone conventions
   (soft-delete columns). Triggers and log-based capture see the delete
   operation itself.
4. In the same DB transaction as the state change, insert an event row
   into an outbox table — atomicity via the DB. A publisher (CDC tail or
   poller) moves rows to the bus with retries — at-least-once from outbox
   to bus. Consumers still dedup by event ID; outbox never promises
   exactly-once.
5. Changes concurrent with the copy are otherwise ambiguous (copied?
   streamed? both? neither?). Anchoring: record position P, copy state
   at-or-after P, stream from P — every change is in the copy, the
   stream, or harmlessly both; idempotent versioned upserts absorb the
   overlap; a gap is impossible because P precedes the copy.
6. Storage seam: version-prefixed value blobs + versioned codec —
   protects the pipeline from store-format evolution. Consumer seam:
   schema-versioned FDP entities — protects downstream from
   pipeline-model evolution. Independent deploys on both boundaries.
7. Additive (new optional fields): allowed live — backward/forward
   compatibility rules absorb it. Breaking (rename/remove/retype): new
   version topic/entity, parallel-run both, migrate consumers, retire —
   never mutate a live stream's contract in place; CI compatibility
   gates enforce it.
8. Lag under bursts/compactions (defense: lag-age SLI + alerts;
   decoupled operational path); retention outrun (defense: retention >
   max outage + rebuildable sinks); amplification (defense: your
   qualifier filter — business columns only); PII leakage (defense:
   mapper-level exclusion/masking [verify]); cross-key reordering
   (defense: versioned upserts). Any four, two defenses.
9. Storage-shaped: zero producer effort, tight schema coupling, leaks
   internals. Business-shaped: stable contract, requires outbox/curation
   effort. End-state: raw CDC as reliable substrate; curated
   business-event streams derived from it as the public interface —
   consumers pick their layer.
10. Consumer down (or lagging) past retention ⇒ log no longer holds the
    gap ⇒ streaming cannot heal it ⇒ forced re-snapshot/re-derivation.
    Preventions: retention sized beyond max-credible-outage (+tiered
    storage to make that cheap); lag-AGE alerting with runway; sinks
    rebuildable by construction so the worst case is re-derivation.
11. The aggregate is a derived view over raw reward rows (ground truth)
    with an explicit full-scan initialization path — so any CDC/stream
    failure degrades to "rebuild the view," never "data lost." CDC
    becomes an optimization over re-derivation; recovery is a capacity
    question, not a correctness one.
12. Execution path today: write txn row, then publish the event — a
    crash between them strands a row with no event (repaired by recon).
    Outbox: write the event into an outbox row in the same HBase row/
    transaction scope as the txn write [design the co-row carefully —
    single-row atomicity is the transactional unit], and let the
    existing SEP→Pulsar tail publish it — the exact pipeline already
    running for FDP, pointed at an event column instead. Gap closed
    with zero new infrastructure classes.

</details>
