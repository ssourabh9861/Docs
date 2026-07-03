# MySQL / InnoDB Internals

MySQL is on your resume's datastore line, which licenses probes — and unlike
HBase/Aerospike, your interviewer almost certainly HAS run MySQL, so bluffing
is maximally dangerous here. This doc covers the internals that actually get
asked: buffer pool, redo/undo, the clustered index consequences, the
binlog-vs-redo duality, locking/deadlocks, and replication topology basics.
**[VERIFY what actually lives in MySQL in your platform and have one concrete
table/flow ready — or soften the resume line. "It's on your resume" +
"I never touched it" is a bad combination.]**

---

## 1. Plain definition

MySQL = a SQL layer (parser, optimizer, replication/binlog) over pluggable
storage engines, of which **InnoDB** is the default and the only one that
matters in interviews: a B+tree engine (`01-storage-engines.md`) with MVCC
transactions (`04-transactions-isolation.md`), crash recovery via
write-ahead logging, and row-level locking.

The mental model in one sentence: **InnoDB is a big buffer pool of 16 KB
pages, kept durable by a redo log, kept abortable by undo logs, and kept
replicable by the server-layer binlog** — four artifacts; every internals
question is about one of them.

---

## 2. The four artifacts

### 2.1 Buffer pool (the RAM half of the database)

All page reads/writes go through the **buffer pool** (typically sized to
~70–80% of RAM on a dedicated host). Pages are fetched from disk on miss,
modified in memory ("dirty"), and flushed back asynchronously. An LRU with
midpoint insertion (new pages enter 3/8 from the tail) resists scan
pollution — a full-table scan can't evict your hot working set. Performance
truth #1: **MySQL is fast exactly when the working set fits the buffer
pool**; the hit-ratio cliff is the classic "we grew 20% and fell over"
incident.

### 2.2 Redo log (durability — the WAL)

Every page change is first recorded in the **redo log** (sequential,
fixed-size ring; group-committed fsyncs). Commit = redo flushed
(`innodb_flush_log_at_trx_commit=1` — the durable setting; 2/0 trade
crash-durability for latency, a knob you should name, not silently assume).
Crash recovery: replay redo from the last **checkpoint** to reconstruct
dirty pages that never flushed. Because torn 16 KB page writes are possible
(disks write 4 KB atomically), InnoDB first writes pages to the
**doublewrite buffer**, then to their home — recovery can always find one
intact copy. (Write amplification: row → page → doublewrite + redo — the
B-tree tax itemized.)

### 2.3 Undo logs (MVCC + rollback)

Before-images of modified rows, chained per row version. Two consumers:
**rollback** (atomicity — walk undo to reverse an aborted txn) and **MVCC
reads** (a snapshot reconstructs older versions by walking undo chains).
Purge removes undo no snapshot needs — a long-running transaction pins
purge (**history list length** grows), reads walk ever-longer chains, and
the database "mysteriously" slows: the signature MySQL incident
(`04-transactions-isolation.md` P3).

### 2.4 Binlog (replication + CDC — the server layer's log)

The **binlog** records committed changes (row-based format is the modern
default) at the *server* layer — logically above InnoDB's redo. It feeds
replicas and CDC (Debezium tails exactly this). Because there are TWO logs
(engine redo + server binlog), commit is an **internal two-phase commit**:
prepare in InnoDB → write binlog → commit in InnoDB; recovery reconciles
(a transaction in the binlog must commit; one absent must roll back) —
otherwise replicas and primary could diverge. This "why does MySQL 2PC with
itself" fact is a beloved senior probe, and it's also the answer to "where
does CDC attach and why is it trustworthy."

---

## 3. Senior-level depth

### 3.1 Clustered-index consequences (repeated because probed constantly)

PK = physical order; secondary indexes store PK values and cost two
descents; fat/random PKs poison every index (UUID lesson,
`01-storage-engines.md` P3, `03-indexing.md` §2.1). Auto-increment PKs:
right-hand hot page (fine — append-optimized) but historically a
lock-contention point (`innodb_autoinc_lock_mode` — interleaved mode is
the modern default).

### 3.2 Locking and deadlocks (where practitioners are separated)

Row locks live **on index entries** — a locking query that uses no index
locks far more than you intended (up to "every row it examined"): the
"UPDATE without an index locked the table" incident. InnoDB RR adds
**gap/next-key locks** on scanned ranges (phantom defense) — and
concurrent inserts into nearby gaps deadlock classically (two txns hold
adjacent gap locks, each waits for the other's insert intention). InnoDB
detects deadlock cycles instantly and **aborts a victim** — so retry logic
is mandatory application code, and `SHOW ENGINE INNODB STATUS` (latest
deadlock section) is the diagnostic you should name. Practical hygiene:
short transactions, consistent access order, indexed predicates on all
locking statements, and lock-wait timeout as the backstop.

### 3.3 Replication topology (enough to design with)

Async by default: primary commits, ships binlog, replicas apply —
replica lag = your read-staleness and failover-RPO
(`01-distributed-systems/03-replication.md` owns the theory).
Semi-sync closes the ack gap for ≥1 replica. Row-based binlog +
GTIDs (global transaction IDs) made failover/repointing sane —
name GTID as "how modern MySQL failover tracks what's applied."
Read-replica anomalies and their session-guarantee fixes: the
replication doc's P3, verbatim applicable.

### 3.4 Operational fingerprints (what pages a MySQL owner)

Connection exhaustion (thread-per-connection; `max_connections` vs pool
sizing — and why every serious shop fronts MySQL with app-side pools
**[+ ProxySQL/RDS Proxy at scale]**); replication lag; history-list
growth; buffer-pool hit ratio; slow-query log + `EXPLAIN` as the daily
tools; DDL on big tables (online DDL exists but with gotchas — gh-ost/
pt-online-schema-change as the battle-tested route — worth one
name-drop).

- **L4/L5/L6:** L4 — "MySQL is a relational DB; we index slow queries."
  L5 — the four artifacts and their incidents (hit-ratio cliff, history
  list, deadlock retry, torn pages/doublewrite, internal 2PC), locks-on-
  index-entries, GTID failover. L6 — fleet posture: sharding strategy and
  its costs, proxy tiers, schema-migration machinery, and the
  "relational-for-what" portfolio call (`08-when-to-pick-what.md`).

---

## 4. Resume connection

- **Your strongest angle: cross-engine literacy.** You can explain any
  InnoDB mechanism by contrast with your daily systems: redo log ↔ HBase
  WAL (same WAL idea; InnoDB replays into *pages*, HBase into
  *MemStores*); undo/MVCC ↔ your CAS-retry OCC (engine-managed vs
  hand-rolled first-committer-wins); binlog ↔ your SEP/CDC stream (both
  are "the replication log as API"; MySQL's internal 2PC is the price of
  having two logs — HBase has one); doublewrite ↔ torn-page protection
  that LSMs don't need (immutable files!). Interviewers remember
  candidates who *connect* engines, not recite them.
- **[VERIFY] and prepare one concrete MySQL usage** from your platform
  (config store? recon bookkeeping? merchant metadata?) with: table
  shape, QPS scale, isolation level used, and one incident/tuning story.
  If nothing exists, the honest line is: "MySQL is in our stack's
  periphery; my depth is HBase/Aerospike — but here's InnoDB from first
  principles," then deliver §2 flawlessly. Honesty + mechanism beats
  bluff.

**30–60 s spoken answer** ("how does InnoDB actually work?"):

> "Four artifacts. Everything is 16-kilobyte pages moving through a buffer
> pool — MySQL is fast exactly while the working set fits it. Durability
> is the redo log: every page change is logged sequentially and
> group-committed before the change is durable, with a doublewrite buffer
> protecting against torn pages, and crash recovery replays redo from the
> last checkpoint — same WAL idea as our HBase tier, except InnoDB
> replays into pages where HBase replays into memstores. Abortability and
> MVCC are the undo logs: before-images chained per row, walked backward
> for rollback and for snapshot reads — which is why one forgotten
> long-running transaction pins purge, grows the history list, and slows
> the whole database. And replication is the binlog at the server layer —
> which is what CDC tools tail — kept consistent with the engine by an
> internal two-phase commit between redo and binlog, so a crash can't
> leave replicas and primary disagreeing. The consequences I design
> around: the primary key is the physical layout, so every secondary
> index carries the PK and random PKs poison everything; row locks live
> on index entries, so an unindexed locking update locks everything it
> examined; and gap locks under repeatable read mean concurrent nearby
> inserts deadlock by design — the victim is aborted, so retry logic is
> application code, not an edge case."

---

## 5. What the interviewer will push on

**P1. "A transaction committed and the server lost power one second later.
Walk me through exactly why the data survives — every artifact involved."**
- *Model:* commit ⇒ redo records flushed + fsynced (flush_log_at_trx_
  commit=1; group commit amortizes fsyncs) — durability point. Data
  *pages* were likely still dirty (unflushed) — irrelevant: recovery
  replays redo from the checkpoint, rebuilding page changes; any page
  caught mid-write by the crash is repaired from the doublewrite buffer
  copy. If binlog is enabled: the internal 2PC ensures the binlog and
  redo agree on the commit (prepared-in-engine + present-in-binlog ⇒
  commit on recovery). Bonus depth: name the settings that weaken this
  (=2/=0, sync_binlog≠1) and what each surrenders.
- *Trap:* "the write was on disk" — the *pages* weren't; redo was. The
  question exists to catch page/log conflation.

**P2. "Your UPDATE deadlocked with another UPDATE. Reconstruct a plausible
scenario, show me the diagnosis, and give the fix hierarchy."**
- *Model:* classic: txn A updates row 1 then row 2; txn B updates row 2
  then row 1 — cycle. Or the RR special: both insert into the same
  region after locking adjacent gaps (gap-lock + insert-intention
  deadlock). Diagnosis: SHOW ENGINE INNODB STATUS → LATEST DETECTED
  DEADLOCK (both txns' statements + locks held/waited). Fix hierarchy:
  consistent access ordering (sort keys before multi-row updates) →
  shorter transactions (lock hold time) → ensure locking statements use
  indexes (shrink lock footprint) → reduce isolation/gap-locking where
  legal (RC for that txn class) → and non-negotiable: idempotent retry
  on ER_LOCK_DEADLOCK, because detection-and-victim is the engine
  *working*, not failing.
- *Trap:* "deadlocks mean a bug" — under RR + concurrency they're a
  normal outcome to engineer around; missing the retry contract is the
  L4 tell.

**P3. "Read replica lag is 45 seconds and users see stale data. Fix it at
three different layers."**
- *Model:* (1) Session layer: read-your-writes routing — pin post-write
  reads to primary for T>lag, or GTID-wait ("wait until replica applied
  my GTID") for precision. (2) Replication layer: find the lag cause —
  single-threaded apply (enable parallel/LOGICAL_CLOCK appliers),
  long transactions on primary, replica I/O saturation; semi-sync
  doesn't fix lag (only durability). (3) Architecture layer: is this
  read even replica-appropriate? Money-gating reads go to primary by
  policy; display reads tolerate staleness with UI acknowledgment —
  the per-operation consistency decomposition again. Bonus: bound it —
  alert on lag age; drain replicas beyond threshold from the read pool.
- *Trap:* "make replication synchronous" — re-serializing all writes on
  the slowest replica to fix a read-routing problem
  (`03-replication.md` P3's trap, same answer).

**P4. "Why does MySQL two-phase-commit with itself? What breaks without
it?"**
- *Model:* two independent logs must agree on the commit set: engine
  redo (durability/recovery) and server binlog (replication/CDC/PITR).
  Without coordination, a crash between "commit in engine" and "write
  binlog" yields a transaction that exists on the primary but never
  reaches replicas (or vice versa) — silent divergence discovered at
  failover. So: prepare in InnoDB → binlog write/fsync → commit;
  recovery scans prepared txns and resolves by binlog presence. This
  is also why sync_binlog=1 + flush_log=1 is the "durable pair," and
  why group commit exists (amortize the double fsync). Kicker: your
  platform faces the same shape — store-write + event-publish — solved
  by CDC/outbox instead of 2PC (`04-messaging-streaming/07-cdc.md`);
  drawing that parallel is the senior flourish.
- *Trap:* "binlog is just a log of redo" — they're different layers
  with different consumers; the divergence scenario is the content.

**P5. "Design pagination for 100M rows. Why does OFFSET die, and what
replaces it?"**
- *Model:* `LIMIT 20 OFFSET 5,000,000` walks and discards 5M index
  entries (and possibly rows) per page — O(offset) per request, and
  deep pages get slower linearly (plus the data shifts under paginators).
  Replacement: **keyset/cursor pagination** — `WHERE (created_at, id) <
  (:last_seen_at, :last_seen_id) ORDER BY created_at DESC, id DESC
  LIMIT 20` riding a composite index: O(page) regardless of depth,
  stable under inserts; the cursor is the last row's key, opaque to
  clients. Costs: no random page jumps, requires a total order
  (tiebreaker column). Bonus: your HBase equivalent — scan-from-rowkey
  with limit — is *natively* keyset pagination; another cross-engine
  connection.
- *Trap:* "add an index" (the offset walk is *on* the index) or caching
  page counts — the algorithmic shape is the answer.

---

## Self-test

1. Name the four artifacts and the one-line job of each.
2. Why does commit survive power loss when the data pages were never
   flushed? Include the torn-page defense.
3. What two consumers read undo logs, and what incident does a
   long-running transaction cause via undo?
4. Why do redo AND binlog both exist, and what's the crash scenario the
   internal 2PC prevents?
5. The buffer pool's midpoint-LRU: what attack does it defend against?
6. State three consequences of "PK = clustered index" that change how
   you design schemas.
7. Why does an unindexed locking UPDATE lock "everything it examined"?
   What's the incident name?
8. Reconstruct the gap-lock insert deadlock and give the fix hierarchy's
   first three rungs.
9. Replica lag: three causes and the three-layer fix from P3.
10. OFFSET pagination: the exact cost mechanism and the keyset
    replacement with its index.
11. GTIDs: what problem they solve in one sentence.
12. Draw three cross-engine parallels between InnoDB and your daily
    stack (redo↔?, undo/MVCC↔?, binlog↔?).

<details>
<summary><b>Answers</b></summary>

1. Buffer pool: all page I/O passes through RAM (fast while working set
   fits). Redo log: sequential WAL making commits durable + crash
   recovery. Undo logs: before-images for rollback and MVCC snapshots.
   Binlog: server-layer log of committed changes for replicas, CDC,
   PITR.
2. Commit forces redo flush+fsync (the durability point); recovery
   replays redo from the checkpoint to rebuild dirty pages. Pages torn
   by mid-write crash are restored from the doublewrite buffer's intact
   copy before replay.
3. Rollback (atomicity: reverse an aborted transaction) and MVCC
   snapshot reads (reconstruct row versions by walking undo chains).
   Long transaction pins purge → history list grows → reads walk long
   chains + undo space balloons → global slowdown ("the analytics query
   melted OLTP").
4. Redo serves engine durability; binlog serves replication/CDC/PITR —
   different layers, both must agree on what committed. Without 2PC, a
   crash between engine-commit and binlog-write creates a transaction
   the primary has but replicas never will (or the reverse) — silent
   divergence surfacing at failover. Prepare → binlog → commit;
   recovery resolves prepared txns by binlog presence.
5. Scan pollution: a full-table scan touching millions of cold pages
   would evict the hot working set under plain LRU; midpoint insertion
   makes new pages earn promotion (young sublist) before displacing hot
   pages.
6. (a) PK choice = physical layout: sequential PKs append; random
   (UUIDv4) PKs splatter splits and churn the pool. (b) Every secondary
   index stores the PK per entry — fat PKs bloat all indexes.
   (c) Secondary lookups are two descents (secondary → PK → clustered) —
   covering indexes and compact PKs matter doubly.
7. Row locks attach to the index entries used to find rows; with no
   usable index the scan examines (and under RR, locks with next-key
   locks) every row/gap it walks. Incident: "the UPDATE that locked the
   table" — a WHERE on an unindexed column serializing all writers.
8. Both transactions hold gap locks on the same interval (RR range
   scans / duplicate checks), then each attempts an insert requiring
   insert-intention into the other's gap — cycle, victim aborted.
   Fixes: consistent access/insert ordering; shorter transactions;
   indexed predicates (shrink the locked range) — then consider RC for
   that class, and always retry on deadlock.
9. Causes: single-threaded/serialized apply, long or bulk transactions,
   replica I/O saturation. Fixes: session layer — primary-pinned
   read-your-writes or GTID-wait; replication layer — parallel
   appliers, break up bulk txns, faster replica I/O; architecture —
   route by staleness tolerance (money reads → primary; display →
   replicas with lag SLO + drain-beyond-threshold).
10. OFFSET N walks and discards N entries before returning the page —
    O(N) per request, degrading linearly with depth, unstable under
    concurrent inserts. Keyset: WHERE (sort_key, id) < (:cursor) ORDER
    BY sort_key, id LIMIT k over a composite index (sort_key, id) —
    O(k) at any depth; cursor = last row's key.
11. GTIDs give every transaction a globally unique, monotonic identity
    so replicas and tooling can express "applied up to X" —
    making failover, repointing, and read-your-writes waits tractable
    without binlog-file/position bookkeeping.
12. Redo ↔ HBase WAL (same WAL discipline; replay targets pages vs
    memstores). Undo/MVCC ↔ hand-rolled OCC: CAS-on-version +
    queue-redelivery retry = first-committer-wins without engine undo.
    Binlog ↔ SEP/CDC stream (replication-log-as-API; MySQL pays
    internal 2PC to keep two logs honest — HBase has one log, your
    platform pays instead with CDC/outbox patterns for the
    store+publish problem).

</details>
