# Replication

Every serious data system replicates. The design space is small — leader-based,
multi-leader, leaderless — but the failure modes are where interviews live:
replication lag anomalies, failover data loss, write conflicts. This doc gives you
the mechanics, the pathologies, and the exact places your stack sits.

---

## 1. Plain definition

**Replication** = keeping copies of the same data on multiple machines. Three
reasons, and you should always name which one you're buying, because they pull in
different directions:

1. **Durability/fault tolerance:** data survives machine loss.
2. **Availability:** the service keeps answering when a copy is down.
3. **Performance:** serve reads from more machines (throughput) or nearer ones
   (latency/geo-locality).

Analogy: a team wiki. One editable master everyone mirrors (leader-based); several
regional offices each editing their own copy and syncing overnight (multi-leader —
now edits can conflict); or no master at all, every office writes to several
copies and readers ask a few and take the newest (leaderless).

The hard part is never the copying — it's **what happens between and during**
copies: readers seeing old data (lag), the master dying mid-copy (failover), and
two copies accepting incompatible edits (conflicts).

---

## 2. The three architectures in practice

### 2.1 Single-leader (primary/replica) — the default

All writes go to one **leader** per dataset/partition; it orders them, appends to
its log, and ships the log to **followers** which replay it. Reads: leader (fresh)
or followers (scalable, possibly stale).

**Sync vs async vs semi-sync — the durability dial:**
- **Synchronous:** leader acks the client only after follower(s) confirm. Zero
  RPO for those writes; latency += slowest follower's round-trip (intra-DC
  ~0.5–2 ms, cross-region 10s–100s of ms); a dead sync follower blocks writes
  (why fully-sync-to-all is rare).
- **Asynchronous:** leader acks immediately, ships later. Fast; leader loss =
  **acked writes lost** (RPO = replication lag, ms→minutes).
- **Semi-sync:** ack after ≥1 (or quorum of) follower(s) — the practical
  compromise (MySQL semi-sync, quorum-ack systems like Kafka acks=all/min.insync,
  BookKeeper's ack-quorum under Pulsar).

**Failover mechanics (memorize the four steps and the three disasters):**
detect leader death (timeout — see `07-failure-detection.md`) → choose new leader
(most-up-to-date follower; via consensus or coordinator) → reconfigure clients/
routing → **fence the old leader**. Disasters: (1) *lost writes* — promoting a
lagging follower discards the old leader's unreplicated acked writes (GitHub's
famous MySQL incidents); (2) *split-brain* — old leader was only partitioned, not
dead, and keeps accepting writes → divergence; fencing (epochs/STONITH) is the
cure; (3) *flapping/cascades* — timeout too aggressive under load, failover storm
makes overload worse.

**Replication-lag anomalies** (with the session-guarantee fixes from
`02-consistency-models.md`): read-your-writes violations (write to leader, read a
stale follower), non-monotonic reads (two refreshes hit differently-lagged
replicas), causal reversals (answer replicated before question). Fixes: pin a
session's reads to leader-or-caught-up replicas, client carries a version/LSN
"read at least this" token, or bounded-staleness routing.

### 2.2 Multi-leader

Multiple nodes accept writes (typically one leader per DC), replicating to each
other asynchronously. Buys: local write latency in every region; per-region
availability (keep writing during inter-DC partition). Pays: **write conflicts
are now a normal condition**, not an anomaly — two DCs update the same row
concurrently and both are "committed". Resolution options: last-writer-wins
(silently drops one write — see `06-time-and-ordering.md`), per-key homing (route
each key's writes to one home region — conflicts avoided by construction; the
common real-world answer), CRDTs, or surfacing siblings to the app. Interview
rule of thumb: multi-leader on the *same keys* is a last resort; multi-leader
with *partitioned key ownership* is just single-leader per key with geo-locality.

### 2.3 Leaderless (Dynamo-style)

No distinguished node: client (or coordinator) writes to N replicas, considers
the write done at W acks; reads query R and take the newest version. Repair paths
because some replicas miss writes: **read repair** (fix stale replicas noticed
during reads), **hinted handoff** (a stand-in node holds writes for a down
replica, delivers later — note: with *sloppy quorums* this means W acks may not
include ANY home replica, gutting the overlap guarantee), **anti-entropy**
(background diff via Merkle trees). Buys: no failover event at all — any node
down just lowers redundancy; smooth availability. Pays: consistency is the
weakest by default (see the R+W>N discussion in `02-consistency-models.md`),
conflicts need versions/vector clocks, and operations like CAS need a consensus
bolt-on (LWT).

---

## 3. Senior-level depth

- **Quorum arithmetic and what it does/doesn't buy:** with N replicas, W+R>N
  gives read/write set overlap; W>N/2 prevents two concurrent write quorums.
  Tolerance: N=3, W=2, R=2 tolerates 1 node down for both reads and writes.
  What it does NOT buy: linearizability (partial writes + async repair break
  real-time order) or transactions. Say "overlap, not ordering".
- **Log shipping vs statement shipping:** replicate the *effects* (row/WAL
  records — MySQL row-based binlog, HBase WAL entries) not the *statements*
  (nondeterminism: NOW(), RAND(), trigger side-effects). Everything serious
  ships physical-ish logs. This is also why **the replication log is a
  first-class product**: CDC is literally "let applications subscribe to the
  replication stream" — your HBase SEP pipeline *is* this insight.
- **Replication ≠ backup.** Replicas faithfully replicate your DROP TABLE and
  your ransomware. Backups (plus delayed replicas, snapshots, PITR from logs)
  protect against logical corruption; replication protects against machine loss.
  One sentence in an interview, big signal.
- **Chain/entry-level replication variants:** BookKeeper (under Pulsar) stripes
  each ledger entry across a write quorum of bookies with client-driven
  ack-quorum — replication without a per-partition leader *for storage*, while
  the broker provides ordering. Knowing your own messaging bus's replication
  shape one level down is a differentiator: **Pulsar topic → managed ledger →
  BookKeeper ledgers → (ensemble, write-quorum, ack-quorum)**.
- **HBase's replication story, precisely:** durability *within* a cluster is
  delegated to HDFS (each WAL block + HFile block on 3 datanodes); region
  ownership gives single-writer semantics; *cross-cluster* replication is async
  WAL shipping (source: region servers tail their WALs) — and the SEP/CDC hook
  rides exactly that machinery, registering as a replication peer. So your CDC
  pipeline inherits replication's guarantees and limits: at-least-once, per-region
  ordering, lag under load. **[VERIFY the internal Yak specifics before claiming
  them as HBase-vanilla.]**
- **Aerospike XDR:** asynchronous cross-datacenter replication, per-namespace;
  your two-DC setup implies XDR lag is your cross-DC RPO for those sets
  **[VERIFY direction/topology]**.
- **L4 vs L5:** L4 recites the three architectures. L5 (a) attaches each to its
  failure story (lag anomalies / conflicts / weak defaults), (b) treats failover
  as the dangerous part and fencing as non-negotiable, (c) knows sync-ness is a
  *per-write durability dial* (semi-sync, per-request acks) rather than a global
  mode, and (d) can trace one write through their own stack's replication path
  end to end. L6 designs *around* replication: immutable logs + derived state,
  per-key homing, letting recon absorb what replication can't guarantee.

---

## 4. Resume connection

Trace one payment through your replication layers — this paragraph is
interview gold because almost no candidate can do it for their own system:

> Gateway dedup token → Aerospike (replication factor 2 in-cluster, async XDR
> cross-DC **[VERIFY]**). Transaction row → HBase WAL + memstore; WAL persisted
> on HDFS with 3-way block replication before ack; row served by exactly one
> region server (single-writer). Execution event → Pulsar topic → BookKeeper
> ledger, ensemble/write-quorum/ack-quorum (e.g., 3/3/2 **[VERIFY]**) — the
> event is on ≥2 disks before the produce call returns. CDC → the SEP peer tails
> the WAL replication stream → Pulsar → analytics. Every layer: replicated,
> differently.

- **Your CDC = replication-log-as-API.** Frame it that way ("we subscribed to
  the store's replication stream instead of dual-writing") — it upgrades the
  story from "built a pipeline" to "understood the primitive".
- **Semi-sync intuition you already own:** Pulsar ack-quorum < write-quorum is
  the same durability/latency dial as MySQL semi-sync — one vocabulary, three
  systems.
- **Honest boundary:** you did not operate HBase/Pulsar replication yourself
  (platform teams); your ownership is *consuming their guarantees correctly*
  (idempotency because at-least-once, per-region ordering assumptions, recon).
  Volunteer the boundary before it's probed.

**30–60 s spoken answer** ("how is your data replicated?"):

> "Differently at every layer, and the differences are load-bearing. Transaction
> state lives in HBase: one region server owns each row — single-writer
> semantics — with durability delegated to HDFS's three-way block replication of
> the WAL; that per-row ownership is what makes our CAS operations sound. Events
> live in Pulsar, where a produce isn't acked until a quorum of BookKeeper
> bookies has it on disk — a semi-sync durability dial. Caches live in Aerospike
> with in-cluster replication and async cross-DC XDR, so cross-DC lag is our RPO
> there, which is acceptable for dedup tokens and fingerprints. And our CDC
> pipeline is really replication-as-API: we subscribe to HBase's WAL-shipping
> stream rather than dual-writing events, which is why the analytics feed can
> lag the store but can never disagree with it."

---

## 5. What the interviewer will push on

**P1. "Your leader dies. Walk me through failover and tell me where acked writes
can be lost."**
- *Model:* detection (heartbeat timeout — tuned against false positives under
  GC/load) → election of the most-caught-up follower (consensus or coordinator)
  → client rerouting → fencing the old leader (epoch/fencing token so its
  in-flight writes are rejected if it returns). Loss window: with async
  replication, everything the old leader acked but hadn't shipped — RPO =
  replication lag at death. Kill that window with semi-sync/quorum acks, paying
  the follower round-trip on every write. Bonus: mention the *un-fenced zombie
  leader* accepting writes during the partition as the other, worse loss mode.
- *Trap:* no fencing step, or "we promote the follower" without asking *which*
  follower (promoting a lagging one = choosing to lose data).

**P2. "When is multi-leader replication the right answer?"**
- *Model:* when you need write availability/latency in multiple regions AND you
  can make conflicts either impossible (per-key home region — each account's
  writes routed to its home DC; the common payments answer) or mergeable
  (commutative ops, CRDTs — carts, counters). It's the wrong answer for
  contended mutable state with LWW, which is silent data loss wearing a
  latency-optimization costume. Also legitimately: offline-first clients
  (every device is a leader) — same conflict machinery.
- *Trap:* "for more write throughput on the same data" — total write work is
  replicated everywhere anyway; you scale writes by *partitioning*, not by
  multi-leader.

**P3. "Reads are overwhelming your primary. You add read replicas and bug
reports spike: users don't see their own updates. Fix it without giving up the
replicas."**
- *Model:* it's a session-guarantee problem, not a capacity problem. Options by
  cost: (1) sticky read-after-write — route a user's reads to the leader for T >
  max-lag after their write; (2) client/session carries the write's LSN/version
  and replicas serve only if caught up to it ("causal token"); (3) monotonic
  routing — hash user→replica so at least reads don't time-travel; (4) accept +
  mask in product (optimistic UI echoes the write). Name the monitoring: lag
  per replica, and alert on lag > the stickiness window.
- *Trap:* "cache the write client-side" alone (breaks on second device), or
  "make replication synchronous" (you just re-serialized all writes on the
  slowest replica to fix a read-path bug).

**P4. "Explain hinted handoff and why sloppy quorums scare people."**
- *Model:* when a home replica for a key is down, another node accepts and
  stores the write "with a hint", delivering it when the home node returns —
  availability preserved. Sloppy quorum = counting such stand-ins toward W. The
  scare: your W acks may include *zero* home replicas, so a subsequent R read of
  home replicas can miss an acked write entirely until handoff completes —
  overlap-based reasoning silently voided. Fine for "shopping cart availability
  über alles"; wrong for anything with read-back correctness.
- *Trap:* conflating it with read repair / anti-entropy (those fix stale
  replicas; handoff is about accepting writes while a replica is down).

**P5. "Replication factor 3 — so you can lose two nodes, right?"**
- *Model:* depends on the consistency machinery, and this is exactly the
  quorum-arithmetic probe: with quorum systems (or Raft), 3 copies tolerate
  **one** node down for writes (need majority 2/3); losing two leaves data
  *durable* (one copy) but the system unavailable for quorum operations — and
  that last copy has no redundancy while you rebuild. With async single-leader,
  losing the leader + promoted follower can additionally lose acked writes.
  Copies ≠ tolerance; the protocol decides.
- *Trap:* "yes." One word, one level.

---

## Self-test

1. Three reasons to replicate — and which one your Pulsar ack-quorum setting
   buys.
2. Sync vs async vs semi-sync: latency cost, RPO, and blocking behavior of each.
3. List the four failover steps and the three failover disasters.
4. Why is fencing non-negotiable? What does a fencing token actually do?
5. Name the three replication-lag anomalies and one fix for each.
6. When do write conflicts become "a normal condition", and what are the four
   resolution strategies (rank them for a payments ledger)?
7. Why do serious systems ship logs, not statements?
8. "Replication is not backup" — give the two failure classes and which
   mechanism covers each.
9. N=3, W=2, R=2: what's tolerated, what's guaranteed, what's NOT guaranteed?
10. Trace one payment through every replication mechanism in your stack (four
    layers minimum).
11. Sloppy quorum + hinted handoff: what guarantee silently disappears?
12. Your read replicas lag 30 s during a compaction storm. Which of your
    user-facing surfaces care, and what bounds the damage?

<details>
<summary><b>Answers</b></summary>

1. Durability, availability, read performance/locality. Ack-quorum buys
   durability specifically: the produce returns only after ≥Qa bookies have the
   entry on disk.
2. Sync: +follower RTT on every write; RPO 0 for acked writes; a dead sync
   follower blocks writes. Async: no added latency; RPO = lag at failure; never
   blocks. Semi-sync: +fastest-follower RTT; RPO 0 vs single-node loss (≥1
   extra copy); blocks only if no follower at all can ack.
3. Detect (timeout) → elect most-up-to-date follower → reroute clients → fence
   old leader. Disasters: lost acked writes (lagging promotee), split-brain
   (unfenced zombie leader), flapping/cascading failovers from aggressive
   detection under load.
4. Because "dead" is a guess (see failure detection): the old leader may be
   alive-but-partitioned or mid-GC. A fencing token (monotonic epoch issued at
   election) is attached to writes; storage/downstreams reject tokens older
   than the newest seen — making the zombie's writes fail deterministically
   instead of corrupting state.
5. Read-your-writes violation → sticky leader reads for T>lag or LSN token;
   non-monotonic reads → per-user replica pinning; causal reversal (reply
   before message) → causal tokens / prefix-consistent reads.
6. Multi-leader or leaderless acceptance of concurrent writes to the same key.
   Strategies: (a) avoid by per-key homing — best for ledgers (single-writer
   per account); (b) CRDTs/commutative design — good where semantics allow,
   ledgers rarely; (c) surface siblings to app-level merge — workable, complex;
   (d) LWW — silent loss, disqualifying for money.
7. Statements are nondeterministic (NOW(), RAND(), triggers, auto-increment
   interleavings) and order-sensitive; replaying them can diverge replicas.
   Logs of effects (row images / WAL records) replay deterministically — and
   double as the CDC product.
8. Machine/site loss → replication (copies elsewhere). Logical corruption —
   bad deploy, operator error, ransomware — replicates faithfully; only
   backups/snapshots/PITR/delayed replicas cover it.
9. Tolerates one replica down for both reads and writes. Guarantees read/write
   set overlap (some contacted replica has the newest acked write) and W>N/2
   prevents two concurrent write majorities. Does NOT guarantee
   linearizability (partial writes, async repair), monotonic reads across
   clients, or anything transactional.
10. Dedup/device token → Aerospike (RF≥2 in-cluster, async XDR cross-DC).
    Txn row → HBase: WAL + memstore, WAL on HDFS (3× block replication),
    single region-server row ownership. Event → Pulsar: BookKeeper ensemble/
    write-quorum/ack-quorum across bookies. CDC → SEP peer tails the WAL
    replication stream → Pulsar → analytics. (Plus MySQL binlog replication
    where relational data lives.)
11. Read/write overlap: W acks may include only stand-in nodes holding hints,
    so quorum reads of the home replicas can miss acked writes until handoff
    delivery — R+W>N reasoning is void while hints are outstanding.
12. Caring surfaces: any read served off lagging replicas/views — rewards
    aggregate freshness, analytics, possibly txn-history queries [verify which
    reads hit replicas]. Money decisions don't care: they read the row's owning
    region server (leader-equivalent) or use conditional writes. Damage bounded
    by: lag monitoring + alerts, session stickiness where present, and
    direction-safe staleness (display-only surfaces).

</details>
