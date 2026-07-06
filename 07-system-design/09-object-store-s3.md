# Worked Design 9: Object Store (S3-like)

The infrastructure heavyweight: petabytes, eleven nines of durability, and
the cleanest architectural split in the canon — metadata vs data. Outside
your operational lane (say so if asked), but every mechanism in it is one
you already own from another angle: WAL-thinking, replication math,
range-partitioned metadata, background repair as recon.

**Prompt:** "Design S3: PUT/GET objects up to 5 TB, 11 nines durability."

---

## 1. Requirements & scope (0–5)

Functional: PUT/GET/DELETE object by (bucket, key); LIST by prefix
(the operation everyone forgets — call it out early, it drives the
metadata store); multipart upload for large objects; versioning
(mention, scope by interviewer). Out of scope: IAM details, lifecycle
policies (one sentence each).

Non-functional — the two headline numbers and what they force:
- **Durability 99.999999999%** (lose ~1 object per 10 M per 10 k years)
  — forces redundancy + *active* integrity (scrubbing/repair); durability
  is a *process*, not a copy count — that sentence is the design's core.
- **Availability 99.99%** — separate dial from durability
  (`01-distributed-systems/01` §3): data can be safe but unreachable;
  design them independently.
- Scale: exabytes, trillions of objects; GET-dominated; object sizes
  bimodal (millions of KB-scale, few of TB-scale — **which means** two
  internal paths: small objects inline-ish, large objects chunked).

## 2. Estimation (5–9)

1 EB at 3× replication = 3 EB raw vs **erasure coding** ~1.5× = 1.5 EB —
at ~$10/TB-month raw (estimate), the EC-vs-replication delta is
~$15 M/month/EB: **the storage-efficiency decision IS a nine-figure
decision; do this math aloud.** Metadata: 10¹² objects × ~500 B ≈ 500 TB
of metadata — *itself a large distributed database* (the recursive
insight: the metadata store is a whole design-problem — your wide-column
wheelhouse).

## 3. Architecture: the metadata/data split (9–24)

```
Client → API/gateway (auth, routing)
  ├→ METADATA SERVICE: (bucket,key) → object record {version, size,
  │   chunk map [(chunk_id → placement)], checksum, state}
  │   — range-partitioned by (bucket, key): LIST = range scan (your
  │   row-key discipline verbatim); wide-column/LSM-backed.
  └→ DATA NODES: store immutable chunks (~4–64 MB units), append-
      oriented on disk (chunks never mutate — LSM philosophy at the
      blob layer: PUT = new chunks + metadata pointer swap; no
      in-place update anywhere).
```

**PUT path (narrate):** client → gateway → metadata reserves object
record (state=UPLOADING) → data written as chunks to a placement set
(replication or EC group across failure domains — racks/AZs) → each
chunk checksummed, ack after quorum/EC-write durable → metadata commits
the chunk map + flips state=COMMITTED (**the metadata commit IS the
atomic commit point** — a failed upload leaves orphaned chunks +
UPLOADING record, cleaned by GC — the outbox/marker crash-recovery
shape, `14-.../04`). Multipart = parts as independent chunk uploads +
one final metadata assembly (retryable per part, resumable — why the
API exists).

**GET path:** metadata lookup → parallel chunk fetches (nearest/least-
loaded replica or EC reconstruct if a chunk is down) → stream, verify
checksums end-to-end.

**Consistency:** modern S3 is strongly consistent read-after-write —
achieved by making the metadata service linearizable per key (single-
writer partition ownership — your HBase model) and never serving a GET
from a chunk set the metadata hasn't committed. Say it as: "consistency
lives entirely in the metadata layer; data chunks are immutable so they
can't be inconsistent, only present or absent."

## 4. Deep dives (24–39)

### 4.1 Erasure coding (the expected deep-dive)

Reed-Solomon (k=8, m=4): object striped into 8 data + 4 parity
fragments across 12 failure domains — survives ANY 4 losses at 1.5×
overhead (vs 3× replication surviving 2). Trades: reads of a degraded
object need k fragments + decode CPU; small objects don't amortize
striping (⇒ replicate small, EC large — the bimodal split pays);
**repair amplification**: rebuilding one lost fragment reads k
fragments (8× the lost data moved across the network) — why EC systems
obsess over repair bandwidth and why locality-aware/LRC codes exist
(one sentence of awareness).

### 4.2 Durability as a process

Nines come from: redundancy across failure domains (correlated-failure
math — `01-distributed-systems/01` §3) + **detection**: background
scrubbing (continuously re-read + verify checksums against bit rot —
disks lie silently at ~10⁻¹⁴–10⁻¹⁵ BER: at exabytes, silent corruption
is *routine*, so scrubbing isn't paranoia, it's arithmetic) + **repair**:
re-replicate/re-encode within a bounded window (the durability model
assumes repair-before-second-failure; repair speed is a durability
*parameter* — MTTR again). This is recon applied to bytes: divergence
(corruption/loss) is assumed, detection is scheduled, convergence is
automatic — say the correspondence.

### 4.3 The metadata store & LIST

Range-partitioned by (bucket, key) ⇒ LIST prefix = contiguous scan;
hot buckets (one bucket with 10⁹ sequential keys — timestamp-prefixed
uploads!) hot-spot exactly like HBase regions ⇒ same medicine: key
salting guidance to customers, split management (your
`01-distributed-systems/04` P1 answer, verbatim). Sequential-key
uploads are the classic S3 performance anti-pattern — knowing it
connects design to real operator lore.

### 4.4 Deletes & GC

DELETE = metadata tombstone (fast, consistent); chunk reclamation is
async GC: reference-count or mark-and-sweep over chunk maps — because
chunks are shared (versioning, multipart aborts, dedup if any), eager
deletion is unsafe. Orphan cleanup (UPLOADING residue) rides the same
sweep. GC bugs are the scariest class here (deleting live data) —
maker-checker-grade caution: age thresholds, soft-delete windows,
delete-rate alarms.

## 5. Operations (39–45)

Page on: durability events (any unrepaired-fragment age — THE metric),
scrub coverage lag, repair queue depth vs bandwidth budget, metadata
p99 (it's on every request), GC safety alarms. 10×: metadata partitions
split (designed); repair bandwidth scales with fleet size × failure
rate — the wall is network, provision it as a first-class budget.

---

## Probes & traps

- **"Why not store metadata with the data?"** — the split's defense:
  metadata is small, hot, strongly-consistent, range-scanned (LIST);
  data is huge, immutable, throughput-oriented — different stores,
  different scaling, different consistency machinery; co-locating
  forces one system to be both (the four-axis taxonomy applied,
  `02-databases/02`). Trap: hand-waving "separation of concerns" —
  give the axis-by-axis contrast.
- **"Walk the crash: client dies mid-PUT / metadata dies before
  commit."** — chunks orphaned + record UPLOADING; no GET ever sees
  them (commit point not reached); GC sweeps by age; multipart resumes
  by part. The atomic-commit-point + marker + sweeper shape — your
  crash-matrix fluency transfers wholesale.
- **"11 nines — prove it's not just '3 copies'."** — copies × failure
  domains give the static math; the nines *survive* only with
  detection (scrubbing vs silent corruption) + bounded-window repair
  (durability degrades with every hour a fragment stays lost) +
  correlated-failure hygiene (never co-locate a stripe). Durability =
  redundancy × repair-speed × independence.
- **"Small objects are killing your EC scheme."** — striping 10 KB
  into 12 fragments = overhead + IOPS madness ⇒ replicate small
  objects (3×), EC only above a size threshold; or pack small objects
  into container blocks EC'd together (with a GC/compaction story —
  LSM thinking resurfacing). The bimodal split from estimation pays
  off here — point back at it.

## Self-test

1. The metadata/data split: contrast the two sides on four axes.
2. Narrate the PUT path naming the atomic commit point and the crash
   residue + its cleaner.
3. EC (8,4) vs 3× replication: overhead, loss tolerance, and the two
   costs EC pays.
4. Why is durability "a process"? The three multiplied factors.
5. Why does LIST drive the metadata store's partitioning, and what's
   the hot-bucket anti-pattern?
6. Repair amplification: the 8× number and why repair bandwidth is a
   durability parameter.
7. Why must chunk deletion be async GC, and what makes GC the
   scariest subsystem?
8. Where does strong read-after-write consistency live, and why can
   chunks not be "inconsistent"?
9. Multipart upload: what problem, what mechanism, what retry
   property?
10. Map three mechanisms here onto your platform's patterns.

<details>
<summary><b>Answers</b></summary>

1. Metadata: small (500 TB), hot (every request), strongly consistent
   (commit point), range-scanned (LIST) → linearizable wide-column DB.
   Data: exabytes, immutable, throughput-bound, placement-flexible →
   append-oriented chunk servers. Different data model, query power,
   scaling, consistency — two stores by the four-axis procedure.
2. Reserve metadata record (UPLOADING) → write chunks to placement set
   across failure domains, checksummed, durable-acked → commit chunk
   map + state=COMMITTED (the atomic point: GETs exist only after
   this metadata write). Crash before commit: orphaned chunks +
   UPLOADING record — invisible to readers, swept by age-based GC.
3. EC(8,4): 1.5× storage, survives any 4 fragment losses; 3×: 3.0×
   storage, survives 2. EC pays: degraded reads need k fragments +
   decode CPU, and repair reads k fragments to rebuild one (8×
   network amplification); also small objects don't amortize
   striping.
4. Redundancy (copies/fragments across independent failure domains) ×
   detection (scrubbing against silent bit rot — at EB scale,
   corruption is statistically routine) × repair speed (the model
   assumes rebuild-before-next-failure; every hour un-repaired eats
   nines). Any factor at zero collapses the product.
5. LIST-by-prefix must be a contiguous scan ⇒ range partitioning on
   (bucket, key). Hot bucket with sequential (timestamped) keys
   concentrates writes on one partition — the HBase timestamp-first
   anti-pattern at object scale; fix: key-prefix randomization
   guidance + partition splitting.
6. Losing 1 fragment requires reading k=8 surviving fragments to
   recompute it — 8× the lost bytes cross the network per repair.
   Fleet-wide failure rate × amplification = a standing bandwidth
   bill; if repair can't keep pace with failures, un-repaired windows
   lengthen and the durability math degrades — bandwidth is nines.
7. Chunks are shared (versions, multipart, aborted uploads) and
   references live in metadata — eager delete races with readers and
   references. GC (refcount/mark-sweep + age thresholds) is scary
   because its bug class is "deleting live data" — irreversible;
   hence soft-delete windows, rate alarms, conservative sweeps.
8. In the metadata service: per-key linearizable (single-writer
   partition ownership), and GETs only ever see committed chunk
   maps. Chunks are immutable — a chunk is either present and
   checksum-valid or it isn't; all "consistency" is which map the
   metadata serves.
9. TB-scale uploads over flaky networks can't be one atomic stream:
   parts upload independently (parallel, resumable, per-part
   retry with per-part checksums), then one metadata assembly call
   commits the whole — the retryable-steps-then-pivot saga shape.
10. Metadata commit-point + orphan GC ↔ outbox/marker crash recovery
    with sweeper. Scrub + repair ↔ recon: assumed divergence,
    scheduled detection, idempotent convergence. Range-partitioned
    metadata + hot-bucket salting ↔ HBase row-key design and
    hot-region medicine. (Also: immutable chunks ↔ LSM/append-only
    philosophy; checksum end-to-end ↔ ledger-grade integrity.)

</details>
