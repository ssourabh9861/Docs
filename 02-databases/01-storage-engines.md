# Storage Engines — B-Trees vs LSM-Trees

Every database question eventually bottoms out here: how do bytes get onto disk
and back? You operate both families in production — InnoDB (B-tree) and
HBase/Aerospike (LSM/log-structured) — so "B-tree vs LSM" is not trivia for
you, it's an explanation of why your own systems behave the way they do:
why HBase loves your write volume, why compactions page you, why MySQL reads
are predictable. This is also a top-3 database interview question verbatim.

---

## 1. Plain definitions

The problem both solve: keep a large, ordered, durable key→value mapping on
disk (which is slow and block-oriented) while serving fast reads and writes.

**B-tree (and B+tree):** a wide, shallow tree of fixed-size **pages** (4–16 KB;
InnoDB: 16 KB). Internal pages hold keys + child pointers; leaf pages hold the
actual rows (B+tree: leaves also chained for range scans). A billion keys fit
in a tree 3–4 levels deep (branching factor ~hundreds), so any lookup = 3–4
page reads, most cached. Writes **update pages in place**: find the leaf,
modify it, write it back. Analogy: a filing cabinet with a hierarchical index —
you find the right folder and edit the document inside it.

**LSM-tree (log-structured merge tree):** never update in place. Writes go to
an in-memory sorted buffer (**memtable**); when full, it's flushed as an
immutable sorted file (**SSTable** / HFile) to disk — a pure sequential write.
Reads must consult the memtable plus potentially *many* SSTables (newest wins).
Background **compaction** merges SSTables — dropping overwritten/deleted
versions — to keep the file count bounded. Analogy: instead of editing
documents in folders, you append every change to a fresh notebook, and a
librarian periodically merges notebooks into consolidated volumes and discards
superseded pages.

The single sentence that organizes everything: **B-trees pay at write time to
make reads simple; LSMs pay at read+compaction time to make writes
sequential.**

---

## 2. How each works in practice

### 2.1 B-tree mechanics (InnoDB as the concrete instance)

- **Write path:** WAL first (redo log — sequential append, the durability
  guarantee), then modify the page in the buffer pool; dirty pages flushed to
  their *random* disk locations later (checkpointing). Crash recovery =
  replay redo from the last checkpoint.
- **Page splits:** inserting into a full leaf splits it — allocations,
  pointer updates, and progressive fragmentation (pages average ~70% full);
  sequential-key inserts (auto-increment) append to the rightmost leaf
  (efficient, but a concurrency hotspot); random keys (UUIDv4!) splatter
  splits everywhere — the classic "why are my UUID inserts slow" answer.
- **Write amplification shape:** changing one 100-byte row writes a full
  16 KB page (plus WAL, plus doublewrite in InnoDB) — amplification ≈
  page/row ratio for scattered small writes.
- **Reads:** O(depth) page fetches; predictable latency; range scans walk
  chained leaves — excellent.

### 2.2 LSM mechanics (HBase as the concrete instance)

- **Write path:** WAL append (durability) → memtable insert (sorted skip
  list). That's it — the foreground write is one sequential I/O + one memory
  op, which is why LSM write throughput embarrasses B-trees.
- **Flush:** memtable (HBase default 128 MB) → immutable SSTable/HFile with
  a sorted index + **bloom filter**.
- **Read path:** check memtable → check each candidate SSTable newest-first.
  Mitigations that make this livable: **bloom filters** (per-file, ~10
  bits/key ⇒ ~1% false positives — skip files that definitely lack the key),
  block cache, and compaction keeping file counts low. A point-read miss
  still costs more than a B-tree miss; a read of a heavily-updated key may
  touch several files.
- **Compaction — the tax collector:**
  - **Size-tiered:** merge similar-sized files into bigger ones. Cheap on
    write amp, bad on space (duplicates live long — up to ~2× space) and
    read amp (more overlapping files).
  - **Leveled:** levels L0..Ln, each ~10× larger, non-overlapping key ranges
    within a level (except L0) — reads touch ≤ ~1 file per level; write amp
    higher (a key is rewritten ~10× per level it descends: total ~20–30×
    typical **(estimate)**). RocksDB default; read-optimized among LSMs.
  - HBase's model is closer to size-tiered with minor (few files) + major
    (all files in a store) compactions; **major compactions** are the "our
    cluster is slow every night" culprit: huge sequential I/O, cache
    thrashing — and where TTLs and deletes are physically applied.
- **Deletes are writes:** a delete inserts a **tombstone**; the data
  physically dies only when compaction sees tombstone + older versions
  together. Consequences: deletes temporarily *grow* the store; massive
  deletes create tombstone-heavy reads (Cassandra's infamous pathology).

### 2.3 The three amplifications (the vocabulary that structures the trade)

For each user write/read, how much *physical* I/O and space:

| Metric | B-tree | LSM (leveled) |
|---|---|---|
| **Write amplification** | page/row ratio (~tens–hundreds× for small scattered rows... though buffered; plus WAL+doublewrite) | flush + ~10× per level ⇒ ~20–30× total, but all **sequential** |
| **Read amplification** | ~1 (tree depth, cached) | memtable + L0 files + 1/level (bloom-filtered) — worst without filters: O(files) |
| **Space amplification** | ~1.4× (page slack, fragmentation) | leveled ~1.1×; size-tiered up to ~2× (pre-compaction duplicates + tombstones) |

Two footnotes that mark seniority: (1) **sequential vs random matters less on
NVMe than on disk but still matters** — SSDs do ~GB/s sequential vs
~hundreds-of-k IOPS random, erase-block economics favor large sequential
writes (less SSD-internal write amp, longer flash life); (2) the **RUM
conjecture**: you can't simultaneously optimize Reads, Updates (writes), and
Memory/space — every engine picks two; asking "which two did this system
pick?" is a reusable analysis tool.

---

## 3. Senior-level depth

- **Why LSM won the big-data tier:** write-heavy, ever-growing datasets
  (events, time series, messaging state) at HDD/SSD economics — sequential
  ingestion at disk bandwidth, immutable files that are trivially
  replicated/tiered (S3 offload!), natural fit for compression (sorted
  runs compress well; column-family locality). Bigtable → HBase/Cassandra →
  RocksDB-as-embedded-everything (Kafka Streams state, CockroachDB/TiKV,
  Flink state backends). Your entire wide-column world is LSM.
- **Why B-trees still own OLTP:** predictable point-read latency (no
  compaction lurking), in-place semantics pair naturally with
  **transactional machinery** (row locks live on stable pages; secondary
  indexes stay consistent within the same transaction), and decades of
  optimizer maturity. Postgres/MySQL/Oracle/SQL Server are all B-tree
  hearts.
- **Operational personalities (what pages you):** B-tree systems degrade
  *smoothly* (buffer-pool hit rate erodes, fragmentation creeps —
  slow-burn). LSMs degrade *episodically*: compaction debt builds silently
  (write burst → files pile up → read amp spikes → then compaction runs and
  eats the disk bandwidth reads needed) — **write stalls** (memtable full,
  flush behind: RocksDB throttles/stops writes; HBase blocks updates when
  memstore/pending-flush limits hit **[VERIFY your platform's symptoms]**)
  and compaction storms are the pager classics. An L5 says: "LSM tuning is
  managing compaction debt like financial debt — steady servicing beats
  balloon payments."
- **Bloom filters, quantified:** ~10 bits/key ⇒ 1% FPR; 1B keys ≈ 1.2 GB
  RAM per store — the standard "why do reads touch disk anyway" answer at
  scale is bloom-filter memory pressure or non-point queries (blooms don't
  help range scans).
- **The hybrid frontier (know it exists):** fractal/Bε-trees (buffered
  B-trees — TokuDB lineage), LSM with learned/partitioned indexes,
  WiscKey-style key-value separation (keys in LSM, big values in a log —
  Badger/Titan) cutting compaction amp for large values. One sentence each
  is plenty.
- **L4/L5/L6:** L4 recites "LSM = fast writes, B-tree = fast reads." L5
  runs the mechanics (WAL/memtable/flush/compaction; splits/fragmentation),
  quantifies the three amplifications, names compaction strategies and
  their pathologies, and maps their own systems onto the taxonomy. L6
  chooses engines per workload *tier* (OLTP vs event ingest vs cache),
  reasons about hardware economics (NVMe, tiered storage), and designs
  around the operational personality (compaction windows, backpressure on
  ingest).

---

## 4. Resume connection

You run the full spectrum — say it as a spectrum:

- **HBase (Yak) = LSM:** your transaction/mandate/reward stores ingest at
  payment-platform write rates precisely because writes are
  WAL-append + memtable; your row-key designs (`accountId:...`) create the
  sorted locality that makes flushes/compactions and range scans (checkpoint
  scans!) efficient. Compaction is also where your **TTLs/retention**
  physically happen, and where your CDC pathology lives (compaction storms →
  replication/SEP lag — the arsenal C3 scenario, now with its root cause).
- **Aerospike = log-structured-on-flash with an in-memory index:** same
  no-in-place-update philosophy (copy-on-write to large sequential blocks +
  background defragmentation ≈ compaction's cousin), but the primary index
  lives wholly in RAM — reads are ~1 SSD I/O, sub-ms. Details in
  `06-aerospike-internals.md`.
- **MySQL/InnoDB = B-tree:** wherever your relational data sits, you get
  predictable reads, real transactions — and page-oriented write costs.
- **The one-liner for interviews:** "our platform is LSM where writes
  dominate and history accumulates — transactions, rewards — and B-tree
  where transactional semantics dominate; and the pager knows the
  difference: MySQL degrades smoothly, HBase degrades episodically at
  compaction time."

**30–60 s spoken answer** ("explain B-tree vs LSM and where you'd use
each"):

> "B-trees update fixed-size pages in place — WAL for durability, then the
> page — which buys predictable point reads and transaction-friendly
> semantics, and costs page-sized random I/O for row-sized changes plus
> split-driven fragmentation. LSMs never update in place: writes are a WAL
> append plus a memtable insert — pure sequential — flushed as immutable
> sorted files that background compaction merges. So writes are nearly
> free at the front and the tax is collected later: reads may touch
> several files — bloom filters and compaction keep that bounded — and
> compaction itself consumes disk bandwidth episodically, which is exactly
> when our HBase clusters page us and why our CDC stream lags during
> compaction storms. Our platform uses both deliberately: LSM — HBase —
> for transaction and reward stores where write volume dominates and
> history accumulates, with row keys designed so per-user data stays
> sorted and contiguous; B-tree — InnoDB — where transactional semantics
> and predictable reads dominate. And deletes tell you everything about
> the philosophy: in a B-tree a delete removes data; in an LSM a delete is
> another write — a tombstone — and the data actually dies at compaction,
> which is also where our TTL-based retention physically happens."

---

## 5. What the interviewer will push on

**P1. "Why exactly are LSM writes fast? And what's the catch — where did
the cost go?"**
- *Model:* foreground write = sequential WAL append + memory insert; no
  page to find, read, modify, or write back — disk sees only sequential
  I/O, which is the medium's best case on both HDD (no seeks) and SSD
  (erase-block friendly). The cost moved, not vanished: (a) read amp —
  a key's latest value could be in any of several files (bloom + cache +
  compaction bound it); (b) compaction — every byte is rewritten ~20–30×
  over its life (leveled), consuming the same disk bandwidth reads need,
  in bursts; (c) space — superseded versions and tombstones live until
  merged. Close with the deferred-tax metaphor: LSMs borrow at write time
  and repay with interest at compaction time.
- *Trap:* "LSMs are just faster" — the conservation-of-cost framing IS the
  answer; missing where the cost went means you've never operated one.

**P2. "Your HBase p99 read latency doubles every night at 2 AM. Diagnose."**
- *Model:* hypothesis #1: scheduled major compaction — massive sequential
  read/rewrite of store files evicts the block cache and competes for disk
  bandwidth; check compaction queue metrics, I/O utilization, cache hit
  rate collapsing at 2 AM. Confirm and fix: stagger/throttle major
  compactions, off-peak windows per table, compaction throughput limits;
  or if it's flush pressure from a nightly batch write job, backpressure
  the ingest. Alternatives to rule out: TTL expiry pass, region splits
  from the day's growth, backup/snapshot jobs. The shape of the answer —
  metric-driven differential diagnosis — matters as much as the culprit.
- *Trap:* "add more region servers" before diagnosing — compaction debt
  scales with data, not just load; capacity is the wrong first move.

**P3. "UUIDs as primary keys in InnoDB — what happens? And in HBase?"**
- *Model:* InnoDB: random keys land on random leaves — page splits
  everywhere, buffer pool churn (working set = whole index), ~2× insert
  cost and fragmentation; fix: UUIDv7/ULID (time-ordered) or
  auto-increment PK + UUID as secondary. HBase: the *opposite* problem
  direction — random keys are actually *good* for write spread (no hot
  region), but you lose locality/scannability; while *sequential* keys
  (timestamps) hotspot one region (`01-distributed-systems/04-partitioning.md`).
  The punchline: the same key choice inverts between engines because
  B-trees fear randomness (page locality) and range-partitioned LSMs fear
  monotonicity (region hotspots). Delivering that inversion cleanly is a
  strong-senior moment.
- *Trap:* one answer for both engines.

**P4. "Design the storage engine for a metrics/time-series store. Which
family, which compaction, what else?"**
- *Model:* LSM, obviously (append-heavy, immutable facts) — but go
  further: time-bucketed files align perfectly with time-range queries and
  retention (drop whole files at TTL — O(1) deletes, no tombstones!);
  size-tiered/time-windowed compaction (never merge across time windows —
  Cassandra's TWCS insight) keeps write amp near 1; columnar encoding +
  delta/gorilla compression inside blocks; out-of-order writes handled by
  a small overlap window. This shows engine thinking beyond the B-vs-LSM
  binary — you're composing the primitives.
- *Trap:* stopping at "LSM" — the time-windowed compaction + drop-by-file
  retention insight is the actual content.

---

## Self-test

1. State the one-sentence trade that organizes B-tree vs LSM, and where
   each "pays."
2. Walk the InnoDB write path (three artifacts) and the HBase write path
   (two steps) — and say which I/O is random in each.
3. Define the three amplifications and give ballpark values for both
   families.
4. Why do bloom filters exist in LSMs, what do they cost (bits/key → RAM
   for 1B keys), and what query shape do they NOT help?
5. Size-tiered vs leveled compaction: what each optimizes, what each
   sacrifices, and which pathology each produces.
6. Why is a delete "a write" in an LSM, and what two production problems
   do tombstones cause?
7. Explain write stalls: the debt mechanism and the two knobs.
8. The UUID-primary-key inversion between InnoDB and HBase — both
   directions, with mechanisms.
9. Why did LSMs win the big-data tier? Three reasons including one about
   immutable files.
10. Your CDC lag during compaction storms — trace the causal chain from
    compaction to consumer staleness.
11. What does RUM stand for, and which two did (a) InnoDB, (b) leveled
    RocksDB, (c) size-tiered Cassandra pick?
12. Where do your TTLs physically execute in HBase, and what does that
    imply about when space is actually reclaimed?

<details>
<summary><b>Answers</b></summary>

1. B-trees pay at write time (random page I/O, splits) to make reads
   simple and predictable; LSMs pay at read-and-compaction time to make
   the foreground write purely sequential.
2. InnoDB: redo-log append (sequential) → page modification in buffer
   pool → dirty page flushed later to its home location (**random**),
   plus doublewrite buffer. HBase: WAL append (sequential) → memtable
   insert (memory); flushes and compactions are sequential — HBase's disk
   I/O is essentially never random on the write side.
3. Write amp: physical bytes written per logical byte — B-tree ≈ page/row
   ratio for scattered small rows (mitigated by buffering); LSM leveled ≈
   flush + ~10×/level ≈ 20–30×, sequential. Read amp: structures
   consulted per read — B-tree ≈ tree depth (~1 effective, cached); LSM ≈
   memtable + L0 + one file/level, bloom-bounded. Space amp: disk vs
   live data — B-tree ~1.3–1.5× (page slack); LSM leveled ~1.1×,
   size-tiered up to ~2×.
4. Reads would otherwise probe every candidate SSTable; a bloom filter
   answers "definitely absent" per file, skipping most. ~10 bits/key for
   ~1% FPR ⇒ 1B keys ≈ 1.2 GB per store in RAM. Useless for range scans
   (they must consult overlapping files regardless — blooms answer
   point-membership only).
5. Size-tiered: minimizes write amp (merge rarely, similar-size runs);
   sacrifices space (long-lived duplicates, ~2×) and read amp
   (overlapping files); pathology: giant occasional merges + space
   spikes. Leveled: minimizes read amp (≤1 file/level, non-overlapping)
   and space (~1.1×); sacrifices write amp (~10× per level); pathology:
   sustained compaction bandwidth consumption competing with reads.
6. Files are immutable — you can't remove a record in place; you append a
   tombstone that shadows older versions until compaction merges them
   together and drops both. Problems: (a) mass deletes *grow* the store
   and reads wade through tombstones (latency spikes — the Cassandra
   wide-partition-delete pathology); (b) space reclaim is deferred until
   (major) compaction, surprising capacity planning.
7. Ingest outruns flush/compaction: memtables fill faster than flushes
   complete, or L0 file count exceeds thresholds ⇒ engine throttles then
   stops writes (RocksDB slowdown/stop triggers; HBase memstore-pressure
   blocking). Knobs: flush/compaction concurrency & bandwidth (service
   the debt faster) and ingest backpressure/throttling (borrow slower).
8. InnoDB: random UUIDs scatter inserts across all leaves — splits,
   fragmentation, buffer-pool working set = whole index ⇒ slow inserts;
   fix with time-ordered IDs. HBase: random prefixes *spread* writes
   across regions (good — no hotspot) but destroy scan locality;
   monotonic keys (timestamps) concentrate all writes on the last region
   (bad). B-trees fear randomness (page locality); range-partitioned
   LSMs fear monotonicity (partition heat).
9. (a) Sequential ingestion at disk bandwidth fits write-heavy,
   append-mostly workloads (events, messaging, time series);
   (b) immutable sorted files are trivially replicated, snapshotted,
   compressed, and tiered to object storage; (c) scales by
   splitting/moving file-backed ranges (region = files + memstore),
   pairing naturally with range partitioning.
10. Major compaction saturates disk bandwidth and evicts block cache on
    region servers → the same RS serves the replication/SEP stream →
    WAL-shipping/SEP relay falls behind (I/O contention) → Pulsar CDC
    topics receive mutations late → FDP consumers apply minutes-stale
    state → analytics/fraud freshness SLI breaches while the operational
    path stays healthy.
11. Read, Update (write), Memory/space — optimize two, sacrifice one.
    InnoDB: R+U-ish at the cost of M (page slack, doublewrite);
    leveled: R+M at the cost of U (write amp); size-tiered: U+R-ish at
    the cost of M (space) — more precisely U and M trade against R
    per strategy; the point is naming the sacrificed dimension.
12. At compaction (minor/major depending on config) — expired cells are
    filtered when files are rewritten. Implication: deleting/expiring
    data does not free space at expiry time; capacity returns only when
    the relevant files compact — plan disk headroom and compaction
    schedules around retention cliffs.

</details>
