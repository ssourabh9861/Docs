# Aerospike Internals

Your latency tier: device fingerprints and dedup tokens on the critical path of
every payment. "Sub-millisecond cache" is the L4 description; the L5 story is
*how* — an all-RAM primary index over log-structured flash, fixed partitioning
with single-hop clients, and per-record generation counters. Interviewers who
know Aerospike are rare; interviewers who know Redis are universal — so this
doc equips you for both audiences: mechanism-deep on Aerospike, comparison-
fluent against Redis.

---

## 1. Plain definition

Aerospike is a distributed key-value store engineered around one bet: **keep
the index in RAM, the data on flash, and touch the SSD exactly once per
read.** Data model: namespaces (≈ databases, each with its own storage/
replication policy) → sets (≈ tables, optional) → records (key → bins, i.e.,
named fields). Records are capped in size (write-block-bound, ~1–8 MB
region — it's a KV store, not a document store).

The architecture in one diagram-sentence: every key hashes (RIPEMD-160) into
one of **4096 partitions**; partitions are assigned to nodes by a
deterministic **partition map**; **smart clients** cache the map and go
directly to the owning node — **one network hop**, no proxy/coordinator tier;
on the node, the **primary index entry (~64 bytes/record) lives in RAM**
pointing at the record's location on SSD → a read is: hash → hop → RAM index
lookup → **one SSD I/O**. Sub-millisecond p99 at millions of ops/sec follows
from that arithmetic, not magic.

---

## 2. How it works in practice

### 2.1 Storage engine: log-structured on raw flash

- Aerospike writes SSDs as **raw block devices** (bypassing the filesystem
  and page cache — its own buffering/scheduling), appending records into
  large **write blocks** (~128 KB–1 MB) that are flushed sequentially.
  Updates never modify in place: a new copy is written, the RAM index is
  repointed, the old copy becomes garbage. LSM philosophy without SSTables:
  no read-side merging (the index always points at THE current copy — read
  amp ≈ 1), but garbage accumulates.
- **Defragmentation** is its compaction: background process reads blocks
  whose live fraction fell below a threshold (~50% default), rewrites the
  surviving records into fresh blocks, frees the old. The operational
  knobs/pathologies rhyme with compaction: defrag lag under write bursts,
  write amplification (each surviving record rewritten), and the classic
  sizing rule — keep disks ≲50–60% full so defrag has headroom
  **(ballpark)**.
- Namespace storage modes: data-on-SSD + index-in-RAM (the classic, yours
  presumably), all-in-RAM (with optional persistence), and index-on-flash
  variants for huge keyspaces **[VERIFY your namespaces' modes]**.

### 2.2 The RAM math (do this live)

Primary index ≈ 64 bytes/record, held in RAM regardless of data size. 1 B
records ≈ 64 GB of index RAM across the cluster (÷ nodes, × replication
factor). This is THE capacity-planning fact: Aerospike's ceiling is usually
**index RAM, not data disk** — and it's the mechanism behind "predictable
sub-ms reads at any dataset size": the index never spills, so lookups never
degrade. (Contrast Redis: *everything* in RAM — data too — so cost scales
with data size; Aerospike moved the bulk to flash and kept only the
pointers.)

### 2.3 Distribution: fixed partitions, deterministic map, smart clients

- 4096 partitions, always. Node joins/leaves ⇒ recompute the map
  (deterministic function of cluster membership) ⇒ only the affected
  partitions **migrate**. No consistent-hash ring, no vnode tuning — the
  fixed-count model from `01-distributed-systems/04-partitioning.md` §2.2.
- Replication factor per namespace (RF=2 typical): each partition has a
  master and replica(s); writes go to the master, replicated
  **synchronously to replicas before ack** (in the default/strong write
  path — commit-to-device vs commit-to-memory is a further knob
  **[VERIFY yours]**).
- Smart clients subscribe to cluster events and refresh the map — during
  migrations, a brief window of proxied/retried requests instead of a
  stop-the-world rebalance.

### 2.4 Consistency modes — the AP vs SC decision per namespace

- **AP mode (default, availability-first):** during partitions, both sides
  can keep serving (split-brain forms sub-clusters); conflicting versions
  are resolved on heal by policy (generation or last-update-time — a
  LWW-flavored merge). Fast, always-on, and exactly as dangerous as LWW
  implies for *authoritative* data (`06-time-and-ordering.md`).
- **SC (strong consistency) mode (per-namespace, since 4.0):** a **roster**
  (the authoritative node set) makes partition ownership unambiguous;
  writes require the full replica set / majority rules; minority sides
  refuse — linearizable or session consistency for reads, no lost writes.
  CP posture with its availability price.
- Your platform: device/dedup namespaces are very likely **AP**
  **[VERIFY — and be ready to defend it]**: the data is a *defense layer*,
  not a system of record; a rare post-partition LWW merge on a dedup token
  is absorbed by the deeper idempotency chain (the arsenal D2 fail-open
  logic, now at the storage layer).

### 2.5 The per-record toolkit you actually use

- **Generation counter:** every record carries a version incremented on
  each write; writes can demand `generation == N` (**check-and-set**) —
  optimistic concurrency identical in spirit to your HBase version-column
  CAS, engine-native. (Policy: GEN_EQ / fail-on-mismatch.)
- **TTL per record** (`void-time`): expiration enforced by index scans
  (expired records ignored on read, reclaimed by eviction/defrag —
  cheap, native, exactly what dedup tokens want).
- **Eviction under memory pressure:** namespaces can evict
  soonest-to-expire records when high-water marks hit — cache semantics
  by config; for durable namespaces you disable it and alarm instead
  **[VERIFY which namespaces evict]**.
- Atomic per-record ops (bin-level increments, list/map operations) and
  **UDFs/Expressions** for server-side conditional logic — single-record
  scope, like everything here.

### 2.6 XDR (cross-datacenter replication)

Asynchronous, per-namespace shipping of writes to remote clusters — your
Hyderabad↔Chennai story. Consequences: cross-DC RPO = XDR lag; conflict
policy on concurrent cross-DC writes is LWW-ish (AP thinking again); design
accordingly (device bindings written in one DC "home" per user? **[VERIFY
topology — active-active or active-passive per namespace]**).

---

## 3. Senior-level depth

- **Why it beats Redis-shaped systems for your workload (mechanism, not
  brand):** (1) cost — RAM only for 64 B/record indexes vs RAM for all
  data: at 1 B × 300 B records, ~64 GB index vs ~300+ GB data-in-RAM per
  copy **(illustrative)**; (2) durability — flash-persistent by design
  vs Redis persistence bolted on (RDB snapshots lose the tail; AOF
  fsync-every-write costs the latency Redis exists for; a *cold dedup
  cache is a payment-duplicate window*, so persistence is not optional
  for you); (3) native clustering with sync replication + smart clients
  vs Redis Cluster's 16384-slot model with async replication (acked
  writes lost on failover — fine for cache, not for your tokens);
  (4) TTL/generation/eviction as engine features. What Redis wins:
  data-structure richness (sorted sets, streams, Lua — if you need
  leaderboards/queues, Redis is right), ubiquity, single-ms simplicity
  at small scale. The one-liner: **"Redis is a data-structure server
  that can persist; Aerospike is a persistent KV engine that happens to
  be as fast."**
- **Defrag is compaction — reason accordingly:** write-burst → garbage
  accumulates → defrag competes for device bandwidth → read p99 tail;
  the same "deferred tax" mental model as LSM compaction
  (`01-storage-engines.md`), different bookkeeping. Watch: device
  available-percent, defrag queue, write-q.
- **Failure/migration profile:** node loss ⇒ replicas promote (partition
  map v+1), migrations refill RF in background — brief per-partition
  blips, no HBase-style dark windows (masters exist per partition, but
  replicas are promotable instantly); the cost vs HBase: AP-mode
  divergence risk instead of CP-mode unavailability. You run both
  postures in one platform — one paragraph of gold
  (`08-cap-pacelc.md` decomposition, embodied).
- **Hot keys still exist:** one key = one partition = one master node;
  a celebrity device/token pins its node (mitigations: client-side
  caching, key salting — `04-partitioning.md` P3 applies unchanged).
- **L4/L5/L6:** L4 — "Aerospike is a fast KV cache." L5 — the
  index-in-RAM/data-on-flash arithmetic, 4096-partition model,
  generation CAS, AP-vs-SC per namespace, defrag-as-compaction, the
  Redis comparison by mechanism. L6 — tiering policy (which data
  *earns* RAM-index economics), SC-vs-AP as a per-dataset governance
  decision, capacity model (index RAM as the binding constraint),
  XDR topology design.

---

## 4. Resume connection

- **Why Aerospike for device-fingerprint + dedup, argued from mechanism:**
  the reads sit on EVERY payment's critical path (sub-ms budget at
  gateway QPS); the data must survive restarts (a cold dedup cache = a
  duplicate-payment window; a cold device cache = a payment outage) —
  so: persistent-by-design + one-SSD-I/O reads + native TTLs for token
  windows + generation CAS where check-and-set semantics matter. That's
  four workload facts mapped to four engine mechanisms — the X5 arsenal
  answer, now fully loaded.
- **Your dedup reservation is engine-native:** "insert-if-absent with
  TTL" (create-only write policy) — the atomic reservation from
  `05-resilience/07-idempotency.md` §2.1, no Lua required.
- **The AP admission:** your namespaces likely run AP — own it with the
  layered-defense argument, and know that SC mode exists and why you
  didn't need it (the data is a defense tier, not a record of truth).
- **[VERIFY] before interviews:** namespace modes (AP/SC,
  storage-engine), RF, commit-to-device vs memory, eviction policies
  per set, XDR topology, and your actual ops/sec + p99 numbers
  **[the X7 scale-numbers homework includes Aerospike]**.

**30–60 s spoken answer** ("why Aerospike, and how does it get sub-ms?"):

> "The workload is device fingerprints and dedup tokens on the critical
> path of every payment — sub-millisecond reads at gateway QPS, and the
> data must survive restarts, because a cold dedup cache is a
> duplicate-payment window, not a cache miss. Aerospike's architecture
> matches that exactly: every key hashes into one of 4096 partitions,
> smart clients cache the partition map and reach the owning node in one
> hop, and on the node the primary index — about sixty-four bytes per
> record — lives entirely in RAM, pointing at log-structured data on
> flash written as raw blocks. So a read is one RAM lookup plus exactly
> one SSD I/O, which is where predictable sub-millisecond p99 comes
> from — the index can never spill, so lookups never degrade with
> dataset size. Updates are copy-on-write with background
> defragmentation — compaction's cousin, same deferred-tax reasoning as
> our HBase tier. TTLs are native, which is precisely what retry-window
> dedup tokens want, and per-record generation counters give us
> check-and-set — the same optimistic concurrency we use on HBase,
> engine-native. Versus Redis: Redis keeps all data in RAM and bolts on
> persistence; for flat KV at our scale, RAM-for-indexes-only plus
> flash durability is the better cost and safety point — though if I
> needed sorted sets or streams, that's Redis's game."

---

## 5. What the interviewer will push on

**P1. "Where does the sub-millisecond actually come from? Break down a
read's latency budget."**
- *Model:* client hash + map lookup (µs, local) → one network hop
  (~100–500 µs intra-DC) → RAM index probe (µs; red-black/sprig
  structures) → one SSD read (~50–100 µs NVMe) → response. Total
  ~0.3–0.8 ms; no proxy hop, no filesystem/page-cache detour, no
  multi-file merge (index points at THE copy — read amp 1). Then the
  contrast that shows understanding: HBase's read may touch memstore +
  N files (compaction-state-dependent); Redis is pure RAM (faster
  still) but pays for it in cost and persistence posture.
- *Trap:* "it's in-memory" — the *data* isn't; the index is. Missing
  that distinction misses the entire design.

**P2. "1 billion dedup tokens, 200 bytes each, RF=2. Size the cluster's
RAM and defend the number."**
- *Model:* index RAM = 1 B × 64 B × RF2 ≈ 128 GB cluster-wide (÷ nodes);
  data on flash = 1 B × 200 B × RF2 ≈ 400 GB (× headroom ÷ ~0.5 for
  defrag ⇒ ~1 TB device). Plus overheads (write blocks, set indexes) and
  high-water margins ⇒ e.g., 4 nodes × 48–64 GB RAM comfortably. The
  defense: index RAM is the binding constraint and it's *per record*,
  not per byte — a million more tokens costs 64 MB × RF regardless of
  payload. Bonus: TTL means steady-state population = rate × window —
  size from that, not from cumulative volume.
- *Trap:* sizing RAM from data volume (that's the Redis model) or
  forgetting RF and defrag headroom.

**P3. "Aerospike AP mode splits into two sub-clusters for 90 seconds.
Your dedup namespace — what can go wrong, and why is it acceptable?"**
- *Model:* both sides serve; the same request-ID token could be
  reserved on side A while a retry lands on side B and reserves "again"
  ⇒ two transactions pass the gateway check; on heal, LWW-ish merge
  keeps one token (cosmetic). Acceptable because the gateway check is
  layer 1 of 4: txn-identity at creation, PSP/NPCI dedup, recon — true
  duplicates collapse downstream (the `08-cap-pacelc.md` P5 chain).
  If this namespace were the *only* wall, AP would be wrong — SC mode
  or a different design. State the alternative to show it's a choice,
  not ignorance.
- *Trap:* "partitions are rare, ignore it" — the acceptability argument
  is layered defense + error direction, never rarity.

**P4. "Compare failure behavior: an Aerospike node dies vs a RegionServer
dies. Which would you rather operate, and for which data?"**
- *Model:* Aerospike: replicas promote immediately per the new partition
  map (clients refresh, seconds of per-partition retries); background
  migration refills RF; no WAL replay — availability-smooth, with AP
  divergence risk during true partitions (or SC refusal). HBase: dark
  window for the dead server's regions (detection + WAL split + replay),
  but never divergence — CP. Preference is per-data: defense-layer
  caches/tokens → Aerospike's smoothness; money state → HBase's
  refusal-over-divergence. The meta-answer: "I operate both on purpose;
  the platform decomposes CAP per dataset" — the strongest possible
  close.
- *Trap:* declaring one "better" without binding it to data class.

**P5. "Why not Redis? And when WOULD you pick Redis over Aerospike?"**
- *Model:* the mechanism comparison from §3 (cost via index-vs-data RAM;
  persistence posture; cluster/replication semantics; native TTL/CAS).
  Then the honest flip: Redis when you need its data structures (sorted
  sets for leaderboards/rate-limiter sliding windows, streams, pub/sub,
  Lua atomicity across keys-in-slot), when the dataset is small enough
  that RAM cost is irrelevant, when ubiquity/hiring matters, or for
  ephemeral pure-cache where cold-start is harmless. The balanced close:
  "we picked per workload facts, and the facts for tokens and
  fingerprints — durability, flat KV, TTL, scale — point to Aerospike;
  a leaderboard would point the other way."
- *Trap:* Redis-bashing. Redis is right for enormous swaths of
  workloads; the question tests calibration, not loyalty.

---

## Self-test

1. Give the one-sentence architecture and derive the read-latency budget
   from it (four components with numbers).
2. Why is the primary index's location the whole design? What's the
   capacity-planning consequence?
3. Describe the storage engine: write path, what "update" means, and
   what defrag does. Which HBase concept does defrag rhyme with?
4. The 4096-partition model vs consistent hashing: what's fixed, what
   moves on membership change, and what the smart client does.
5. AP vs SC mode: partition behavior of each, and the argument for AP on
   your dedup namespace.
6. Generation counters: what they enable, and their sibling in your
   HBase design.
7. Size it: 500 M records × 300 B, RF=2 — index RAM and device space
   with defrag headroom.
8. Why is persistence non-negotiable for your dedup tokens? Name the
   incident a cold cache creates.
9. Node death vs RegionServer death: the availability profiles and the
   per-data preference rule.
10. Where do hot keys hurt Aerospike, and the two mitigations?
11. Redis vs Aerospike: three mechanism-level differences and two cases
    where Redis wins.
12. What is XDR, what's its RPO implication, and what must you verify
    about your topology?

<details>
<summary><b>Answers</b></summary>

1. Keys hash into 4096 partitions; smart clients hold the map and hit
   the owning node in one hop; RAM-resident primary index (~64 B/rec)
   points at log-structured data on raw flash. Read ≈ client hash/map
   (µs) + one intra-DC hop (~0.1–0.5 ms) + RAM index probe (µs) + one
   SSD I/O (~0.05–0.1 ms NVMe) ⇒ ~sub-ms p99.
2. Index-in-RAM means every lookup resolves to at most one device I/O
   and never degrades as data grows (no spill, no multi-level probe).
   Consequence: cluster capacity is bound by index RAM (64 B × records
   × RF), largely independent of record size — plan by record count,
   not byte volume.
3. Writes append full record copies into large write blocks flushed
   sequentially to raw devices; update = write new copy + repoint RAM
   index; old copies become garbage. Defrag rewrites blocks whose live
   fraction dropped below threshold, reclaiming space — compaction's
   cousin (same deferred-tax dynamics: bursts build debt, servicing
   competes with reads, keep ~50% headroom).
4. Fixed 4096 partitions always; membership change recomputes the
   deterministic map and only affected partitions migrate (no ring
   tuning, no vnode variance). Smart clients cache the map, route
   single-hop, and refresh on cluster events — brief proxy/retry
   windows during migration instead of global rebalance.
5. AP: both partition sides keep serving; divergence merged on heal by
   generation/LUT policy (LWW-flavored) — availability-first. SC:
   roster-based ownership; majority/full-replica rules; minority
   refuses — no lost writes, linearizable/session reads. AP defense for
   dedup: the namespace is layer 1 of a 4-layer idempotency chain with
   benign error direction — rare post-heal merges are absorbed
   downstream; it's a defense tier, not a system of record.
6. Per-record version incremented each write; writes may require
   generation==N (check-and-set) — engine-native optimistic concurrency.
   Sibling: the HBase version-column checkAndPut in rewards — same
   first-committer-wins principle, hand-rolled there, native here.
7. Index: 500 M × 64 B × 2 ≈ 64 GB cluster RAM (÷ nodes). Data: 500 M ×
   300 B × 2 ≈ 300 GB live; ÷ ~0.5 defrag headroom ⇒ ~600 GB+ device
   budget, plus write-block/set overheads and high-water margins.
8. Tokens exist to make client retry storms idempotent; a restart that
   empties the store opens a window where every in-flight retry
   re-executes — duplicate transaction creation until deeper layers
   catch it. Cold cache ≠ slow (miss penalty); cold dedup = correctness
   exposure. Hence flash persistence + no eviction on that namespace
   [verify].
9. Aerospike: per-partition promotion is immediate (map bump), clients
   re-route in seconds, background migration refills RF — smooth, with
   AP divergence (or SC refusal) as the partition-time trade. HBase:
   regions dark through detection + WAL split + replay — unavailability,
   never divergence. Rule: defense-layer/latency data → smoothness
   (Aerospike); authoritative money state → refusal-over-divergence
   (HBase).
10. One key lives in one partition on one master — a celebrity key pins
    that node's CPU/IOPS. Mitigations: client-side/local caching of the
    hot value; salting/splitting the logical key with read fan-in
    (plus, for read-mostly, higher RF + replica reads where policy
    allows).
11. Differences: RAM holds indexes only vs all data (cost model);
    persistence by design on raw flash vs snapshot/AOF add-ons
    (durability posture); sync-to-replica clustered writes + smart
    clients vs Redis Cluster slots with async replication
    (failover-loss semantics). Redis wins: rich data structures
    (sorted sets/streams/Lua) when the workload needs them; small or
    ephemeral datasets where RAM cost and cold-start don't matter
    (plus ubiquity/tooling).
12. Asynchronous cross-datacenter replication per namespace —
    remote-DC lag = your cross-DC RPO; concurrent cross-DC writes
    resolve LWW-ish. Verify: active-active vs active-passive per
    namespace, which DC "homes" device bindings, lag monitoring, and
    conflict policy — the two-DC resume claim invites exactly these
    questions.

</details>
