# HBase Internals

Your system of record. "We store transactions in HBase" licenses an
interviewer to descend arbitrarily deep — region lifecycle, write/read paths,
compactions, the single-row atomicity your CAS depends on, and the replication
hooks your CDC rides. This doc is the descent, pre-walked. (Storage-engine
fundamentals: `01-storage-engines.md`. Partitioning/keys:
`01-distributed-systems/04-partitioning.md`. Your platform wraps HBase as
"Yak" — translate internal names, and **[VERIFY]** where the wrapper may
diverge from stock HBase.)

---

## 1. Plain definition

HBase is the open-source Bigtable: a **sparse, distributed, persistent,
multi-dimensional sorted map** — the value of the map is addressed by
`(row key, column family, column qualifier, timestamp)`. Rows are sorted
byte-wise by key; the keyspace is split into contiguous ranges (**regions**);
each region is served by exactly one **RegionServer** at a time; durability
and file storage are delegated to HDFS; coordination (liveness, metadata
bootstrap) to ZooKeeper; a **Master** assigns regions and runs admin
operations.

The two sentences that orient everything:
1. **It's a sorted map, not a database** — no query engine, no secondary
   indexes, no transactions beyond a row; you are programming against a
   giant ordered key space.
2. **One region, one server** — the single-writer-per-row property that
   makes row operations linearizable (and your `checkAndPut` trustworthy)
   is an *assignment invariant*, maintained by Master + ZK + fencing.

---

## 2. The paths (write, read, flush, compact, split)

### 2.1 Write path

Client → (locate region: meta cache) → RegionServer:
1. **WAL append** (HLog, on HDFS — sequential, the durability point;
   multiple regions share one WAL per server).
2. **MemStore insert** — per-column-family sorted in-memory buffer.
3. Ack the client. That's the whole foreground cost — LSM economics.
4. **Flush** when MemStore hits its threshold (~128 MB default) or global
   memory pressure: write an immutable **HFile** to HDFS (sorted blocks +
   block index + bloom filter), then trim the WAL.

Failure story: RegionServer dies → its ZK session expires → Master splits
the dead server's WAL by region and reassigns regions to other servers,
which **replay the WAL** to rebuild un-flushed MemStore state before
serving. Fencing (WAL lease recovery / sequence IDs) prevents the zombie
from appending after reassignment — the
`01-distributed-systems/05-consensus.md` P3 pattern, in the flesh.

### 2.2 Read path

For a Get: merge the answer across **MemStore + every candidate HFile** of
the column family, newest timestamp wins. Kept fast by: **block cache**
(LRU, hot blocks in heap/off-heap), **bloom filters** (skip files that
definitely lack the row/row+col), and compaction (bounding file count).
A read of a hot, recently-written row is memory-speed; a cold row with
many un-compacted files is multi-file disk work — HBase read latency is a
*distribution shaped by compaction state*, which is why p99 stories always
involve compaction.

### 2.3 Compactions

- **Minor:** merge a few small HFiles → fewer, larger; cheap, frequent.
- **Major:** rewrite ALL files of a store into one; this is where
  **deletes (tombstones) and TTL-expired cells physically die** and where
  disk/IO is massively consumed; typically scheduled (often weekly or
  managed manually at scale **[VERIFY your platform's schedule]**).
- Pathologies: compaction storms (many regions hit thresholds together —
  often after bulk writes), cache eviction during major compaction, and
  write stalls if flushes outrun compaction (too many HFiles → HBase
  blocks updates at `hbase.hstore.blockingStoreFiles`).

### 2.4 Region lifecycle

Regions **split** when they exceed the size policy (~10 GB-class default)
— a metadata operation (daughters reference parent files, rewritten at next
compaction) — and can be **merged**. New tables start as ONE region unless
**pre-split** — the empty-table hot-region trap. The **balancer** moves
regions across servers (assignment change, no data copy — HDFS holds the
files; though locality is lost until compaction rewrites blocks locally —
the "short-circuit reads + locality %" operational detail).

### 2.5 Single-row atomicity and the CAS primitives

All mutations to one row (across column families **within one region**) are
atomic: applied under a row lock + one MultiVersionConcurrencyControl write
point — readers see all or none of a batch. Primitives on top:
`checkAndPut`/`checkAndMutate` (compare a cell — your version column — and
conditionally apply, atomically under the row lock) and `Increment`/
`Append` (atomic RMW — atomic but NOT idempotent, the rewards-arsenal A2
distinction). Cross-row: nothing — hence your saga/marker/recon machinery
(`04-transactions-isolation.md` §3.2).

### 2.6 Replication hooks (where your CDC lives)

Cluster replication tails each server's WAL and ships edits to peers,
async, with per-region ordering. The SEP (Side-Effect Processor) mechanism
your platform uses registers as a **replication peer** — receiving every
committed mutation as a stream (`04-messaging-streaming/07-cdc.md`).
Consequences you've already internalized: at-least-once, per-region order
only, lag under WAL/IO pressure (compaction storms → CDC lag — the causal
chain in `01-storage-engines.md` self-test 10).

---

## 3. Senior-level depth

- **Schema design is three decisions, not thirty:** (1) the row key
  (everything — `04-partitioning.md`); (2) column families — keep to 1–3:
  each CF is a separate store (own MemStores, HFiles, flush together per
  region!) so a hot CF forces flushes of cold ones; group by access
  pattern + retention (per-CF TTL/versions — likely how your 1 y vs 30 y
  retentions are expressed **[VERIFY]**); (3) versions/TTL per CF —
  cell-level history (your txn timeline exploits versioned cells or
  qualifier-per-event **[VERIFY which]**).
- **Wide rows vs tall tables:** entity-per-row with many qualifiers (wide)
  gives row-atomicity across the entity but rows can't split (a row lives
  in one region — multi-GB rows are operational poison); event-per-row
  (tall — your reward rows) scans cleanly and spreads, but atomicity across
  events is gone. Your platform uses both shapes deliberately (txn context
  row = wide-ish; reward/history rows = tall) — naming the trade is senior
  signal.
- **Read amplification management is the operator's real job:** monitor
  storefile counts, compaction queue length, block-cache hit ratio,
  locality %; correlate p99 with them. The mental model: *HBase converts
  write bursts into deferred read debt; operations is debt servicing.*
- **The meta path:** clients cache `hbase:meta` (region → server); moved
  regions produce NotServingRegion → meta refresh → retry (the
  eventually-consistent routing protocol — `04-partitioning.md` §2.3).
- **Availability profile — CP and honest about it:** a region is dark from
  server death until WAL split + replay completes (seconds to minutes
  depending on WAL volume and detection timeout) — there are no replica
  serves (stock HBase; read replicas exist as an option with staleness
  **[VERIFY if your platform uses timeline-consistent replicas]**).
  Contrast Cassandra: no dark windows, but no linearizable rows either —
  the CAP trade you chose, stated crisply.
- **L4/L5/L6:** L4 — "HBase is a NoSQL store on Hadoop; we put rows in
  it." L5 — the five paths above, CF mechanics, atomicity scope and its
  primitives, compaction-shaped latency, CDC-via-replication, dark-window
  availability math. L6 — fleet posture: pre-splitting and key governance
  as review gates, compaction/major schedules as capacity policy, when to
  choose read replicas vs cache vs redesign, and the "should this be
  HBase at all" call.

---

## 4. Resume connection

- **Your CAS trust chain, fully grounded:** rewards `checkAndPut` → row
  lock + MVCC write point on one RegionServer → single-assignment
  invariant → ZK sessions + Master + WAL fencing → ZAB quorum. You can now
  descend five levels on "why do you trust your version column?" — few
  candidates can go past level one.
- **Your retention story is CF/TTL + compaction:** "mandates 30 y, txns
  1 y" = per-CF/table TTLs, physically enforced at major compaction —
  including the capacity nuance (space returns at compaction, not
  expiry).
- **Your CDC = replication peer** — one sentence that shows you know the
  machinery: "we didn't bolt a scanner onto the store; we joined the
  replication protocol."
- **Your p99/pager stories have mechanisms now:** compaction storms →
  block-cache eviction + IO contention → read p99 + CDC lag; bulk
  writes → flush pressure → blockingStoreFiles stalls. **[Recover one
  real incident with numbers — the arsenal X9 homework applies here.]**
- **[VERIFY] list for Yak specifics:** WAL-per-server vs multiwal; region
  size/split policy; major-compaction schedule; read replicas; how
  SEP orders across region moves.

**30–60 s spoken answer** ("walk me through what happens when you write a
transaction row"):

> "The client's meta cache routes to the one RegionServer that owns that
> key range — single assignment is the invariant everything rests on. The
> server appends the mutation to its write-ahead log on HDFS — that's the
> durability point — then inserts into the in-memory MemStore and acks:
> the foreground write is one sequential append plus a memory insert,
> which is why the store absorbs payment-platform write rates. MemStores
> flush to immutable HFiles with bloom filters; reads merge MemStore plus
> candidate files with the block cache and blooms keeping that bounded;
> and compaction is the deferred tax — it bounds file counts, and it's
> where tombstones and our TTL-based retention physically execute, which
> is why our read p99 and even our CDC lag are shaped by compaction state.
> If the server dies, ZooKeeper's session expiry triggers the Master to
> split its WAL and reassign regions; the new owners replay the log before
> serving, and WAL fencing keeps the zombie from writing — that
> reassignment window is our CP trade: dark rows for seconds rather than
> divergent rows forever. And single-row atomicity under the row lock is
> what makes checkAndPut a real CAS — the primitive our whole optimistic
> concurrency design stands on."

---

## 5. What the interviewer will push on

**P1. "A RegionServer dies holding 200 regions. Walk the recovery and tell
me what users experience."**
- *Model:* ZK session expiry (tens of seconds — tuned above GC tails,
  `07-failure-detection.md`) → Master declares it dead, distributes WAL
  splitting (the shared WAL is split into per-region edit files) →
  regions reassigned across survivors → each replays its edits into
  MemStore → serving resumes. User experience: reads/writes to those key
  ranges fail/retry for the window (detection + split + replay — seconds
  to minutes; replay time ∝ un-flushed writes); everything else is
  untouched. Mitigations: aggressive flush policies bound replay,
  detection tuning bounds the front half, client retries + your async
  queue absorb the blip (payments wait rather than fail). Mention
  fencing: the zombie's late writes are rejected via lease/sequence
  fencing.
- *Trap:* "replicas take over" — stock HBase has no serving replicas;
  confusing it with Cassandra's model is a disqualifying error *for you
  specifically*, given the resume.

**P2. "Why are HBase deletes dangerous at scale? Design a mass-delete
(GDPR-style purge) safely."**
- *Model:* deletes are tombstone writes: they add data, hide rows, and
  reclaim nothing until major compaction sees tombstone + victims
  together; mass deletes ⇒ tombstone-swamped scans (read p99), store
  growth, then a monster compaction. Safe design: prefer **structural
  deletion** — TTLs (let compaction expire naturally), or
  partition-by-time so purges drop whole tables/CFs; if row-level purge
  is mandatory: batch with pacing, trigger targeted major compactions
  per region off-peak, monitor storefile counts and scan latency, and
  expect capacity to return only post-compaction. Bonus: version-purge
  vs row-purge distinction (delete markers at cell/column/family
  scopes).
- *Trap:* treating delete as free ("just delete the rows") — the
  tombstone lifecycle IS the question.

**P3. "Your checkAndPut — what exactly makes it atomic, and what happens
during a region move mid-operation?"**
- *Model:* atomicity: the row lock serializes mutations on that row
  within the owning region; the compare and the put execute under one
  lock acquisition + one MVCC write point — no window between check and
  apply. Region move: assignment is fenced and sequential — the region
  closes (flushing/quiescing operations), then opens elsewhere; an
  in-flight op either completes before close or fails with
  NotServingRegion and the client retries against the new location
  (meta refresh). Two servers never serve the row simultaneously (the
  invariant), so CAS soundness survives moves; what you pay is a brief
  unavailability blip. If the old server was a zombie (partition), WAL
  fencing rejects its writes.
- *Trap:* "ZooKeeper locks the row" — ZK coordinates *assignment*, not
  per-row operations; conflating the layers is a depth fail
  (`05-consensus.md` P5's layering point again).

**P4. "Design the column families for your transaction table, and defend
the count."**
- *Model:* 1–2 CFs, not 10: e.g., `d` (core transaction state — hot,
  small, long retention) and maybe `t` (timeline/audit events — append-
  heavy, could differ in TTL/versions/compression). Defense: each CF is
  a separate store but **flushes are per-region across CFs** (a hot CF's
  flush drags cold CFs into small-file churn); more CFs = more
  MemStores × regions = heap pressure; group by access pattern +
  retention needs, nothing else. Then the punchline: qualifier-level
  sparsity is free (columns exist per-row only when written) — most
  "more CFs" instincts are actually qualifier decisions.
- *Trap:* CF-per-attribute-group like relational column grouping —
  the flush-coupling mechanic is what the question fishes for.

**P5. "Compare HBase and Cassandra for your transaction store — you're
migrating tomorrow, what breaks?"**
- *Model:* what breaks first: **checkAndPut** — Cassandra's equivalent is
  LWT (Paxos rounds, several× latency, per-partition serialization);
  your CAS-heavy aggregate path gets slower or needs redesign. Second:
  consistency posture — LWW cells + tunable quorums replace per-row
  linearizability; your "read your own committed row" assumptions need
  QUORUM discipline and version columns become mandatory everywhere.
  Third: CDC — Cassandra CDC exists but differs from the SEP/WAL-peer
  model. What improves: no dark windows on node death (leaderless
  serving), operationally no HDFS/ZK stack, multi-DC active-active is
  native. Verdict shape: for linearizable-row money bookkeeping, HBase's
  model fits better; for availability-first geo-distributed serving,
  Cassandra's does — and say which failure you'd rather explain to
  finance (a stuck row vs a diverged row).
- *Trap:* generic "both are wide-column, migration is easy" — the CAS
  and consistency deltas are the entire risk register.

---

## Self-test

1. Address a cell in HBase (four coordinates), and state the two orienting
   sentences.
2. Walk the write path to the ack, and name the durability point.
3. RegionServer death: the five recovery steps and what bounds the dark
   window on each side.
4. Why is read latency "a distribution shaped by compaction state"? Name
   the three read-path mitigations.
5. Minor vs major compaction: what each does, and what *only* major does.
6. Two reasons to keep column families to 1–3, with the flush-coupling
   mechanic.
7. Wide rows vs tall tables: the trade, and where your platform uses
   each.
8. What makes checkAndPut atomic, and why does the property survive
   region moves?
9. Why are Increment operations atomic but wrong under at-least-once
   delivery? (Cross-doc.)
10. How does your CDC attach to HBase, and what three properties does it
    inherit from that attachment?
11. The empty-table trap and its fix.
12. Mass deletes: the tombstone lifecycle and the two structural
    alternatives.

<details>
<summary><b>Answers</b></summary>

1. (row key, column family, column qualifier, timestamp) → value.
   Orienting: it's a sorted map, not a database (no queries/indexes/
   cross-row transactions); one region, one server — the assignment
   invariant behind row linearizability.
2. Locate region via cached meta → WAL append on HDFS (**durability
   point**) → MemStore insert → ack. Flush to HFile happens later,
   off the foreground path.
3. ZK session expiry (detection) → Master declares death → WAL split
   into per-region edits → regions reassigned to survivors → replay
   edits into MemStore → serve. Front half bounded by detection tuning
   (session timeout vs GC tails); back half by un-flushed volume
   (flush policy bounds replay).
4. A row's cells may live in MemStore plus N HFiles depending on how
   recently compaction ran — file count varies with write bursts and
   compaction debt, so per-row read cost varies. Mitigations: block
   cache, bloom filters (skip definitely-absent files), compaction
   itself (bounds N).
5. Minor: merge a few small HFiles into fewer larger ones — cheap
   housekeeping. Major: rewrite all files of a store into one — and
   ONLY major physically removes tombstoned and TTL-expired cells
   (space returns here, not at delete/expiry time).
6. (a) Flush coupling: MemStore flush triggers per region across CFs —
   a hot CF forces cold CFs to flush tiny files (churn, compaction
   debt); (b) memory: MemStores exist per CF per region — CF sprawl
   multiplies heap pressure. Group only by access pattern and
   retention/version policy.
7. Wide (entity-per-row, many qualifiers): row atomicity across the
   entity, but rows can't split — giant rows are region poison. Tall
   (event-per-row): spreads and scans cleanly, no cross-event
   atomicity. Platform: transaction context rows wide-ish (atomic state
   updates); reward/history/timeline rows tall (append + range scan).
8. The owning region executes compare+apply under one row lock and one
   MVCC write point — no window between check and put. Moves close the
   region (quiesce), reassign, reopen — never two owners at once
   (fenced); in-flight ops either complete or fail with
   NotServingRegion and retry at the new owner. Brief unavailability,
   never dual-writers.
9. Atomic: the RMW happens under the row lock — no lost update between
   concurrent increments. Wrong under redelivery: an increment carries
   no identity, so a replayed message re-increments — atomicity
   protects against concurrency, idempotency against duplication;
   money counters need the latter (hence CAS + re-derivation).
10. Registers as a replication peer tailing the WAL stream. Inherits:
    at-least-once delivery, per-region ordering only, and lag coupled
    to WAL/IO pressure (compaction storms slow the stream) — hence
    idempotent versioned consumers and lag-age SLIs.
11. New tables start as one region — all writes hit one server until
    splits catch up (a self-inflicted hot spot). Fix: pre-split at
    creation using the known key distribution (e.g., salted or
    accountId-hash boundaries).
12. Delete = tombstone write: adds data, hides rows, reclaims nothing
    until major compaction co-locates tombstone and victims; mass
    deletes swamp scans and then demand a monster compaction.
    Structural alternatives: TTL-based expiry (compaction does the
    work incrementally) and time-partitioned tables/CFs where purge =
    drop (O(1), no tombstones).

</details>
