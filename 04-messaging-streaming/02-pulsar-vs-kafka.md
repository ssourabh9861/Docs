# Pulsar vs Kafka — The Question You Must Win

Your resume says Apache Pulsar; the world's default is Kafka; therefore every
interviewer asks. The cross-cutting arsenal (X1) gives you the 60-second answer;
this doc gives you the depth behind every sentence of it, so the third and fourth
follow-ups land on prepared ground.

---

## 1. Plain definitions (both systems from zero)

Both are distributed, durable, partitioned event platforms: producers append
messages to named topics; the system replicates them to survive machine loss;
consumers read at their own pace. The differences are architectural — *where
data lives, who owns it, and how consumption is modeled* — and every practical
difference traces back to those.

**Kafka:** a cluster of **brokers**; each topic-partition is a log stored on
the local disks of the brokers that host it. One broker is the partition's
**leader** (all reads/writes), others hold **replicas**, kept in sync via the
ISR (in-sync replica set); `acks=all` + `min.insync.replicas` gives quorum-ish
durability. Coordination (controller election, metadata) historically via
ZooKeeper, now via **KRaft** (built-in Raft metadata quorum). Consumers form
**consumer groups**: partitions are divided among group members; each member
tracks progress with one offset per partition.

**Pulsar:** two layers. **Brokers** are stateless serving nodes — they own
topics *logically* (one broker serves a topic at a time) but store nothing.
Storage lives in **Apache BookKeeper**: an ensemble of **bookies** storing
topic data as a chain of **ledgers** (append-only segments). Each entry is
written to a **write quorum** of bookies and acked after an **ack quorum**
confirms (e.g., ensemble 3, write 3, ack 2). Consumers attach **subscriptions**
— named, durable cursors with a mode (exclusive / failover / shared /
key_shared) that decides semantics (`01-queues-vs-logs.md`).

---

## 2. The architectural difference and its consequences (the core of your answer)

### 2.1 Compute/storage coupling vs separation

**Kafka couples serving and storage:** a partition IS files on specific
brokers' disks. Consequences:
- Broker failure/replacement/scale-out ⇒ **data movement**: re-replicating
  partitions (hours for TB-scale brokers at disk/network limits), rebalance
  planning (cruise-control-class tooling exists because this is genuinely
  hard).
- Capacity is coupled: need more serving CPU? You get more disks too, and
  vice versa.
- But: the hot path is beautifully simple — sequential appends to local disk,
  page-cache-served reads, zero-copy sendfile to consumers. Fewer moving
  parts, one system to operate.

**Pulsar separates them:** brokers are stateless routers/caches; bookies store
segments. Consequences:
- Broker failure/scale ⇒ **no data movement**: another broker picks up the
  topic in ~seconds (metadata change only). Serving scales independently of
  storage.
- **Segment-centric storage:** a topic's ledgers scatter across many bookies
  (each ledger picks its own ensemble) — a topic is never bound to N specific
  disks; a full bookie just stops receiving *new* ledgers. Adding a bookie
  helps immediately (new ledgers land on it) — no rebalancing of history.
- **Tiered storage** falls out naturally: old ledgers offload to object
  storage (S3/GCS) while the topic stays transparently readable — cheap
  "infinite" retention.
- But: two clustered systems (+ metadata quorum) to operate, an extra network
  hop on the write path (producer → broker → bookies), and a smaller
  operational-knowledge community than Kafka's.

The honest performance sentence: both saturate networks with millisecond p99s
when tuned; published benchmark duels (vendor-funded in both directions) mostly
measure configuration skill. Latency/throughput is a **tie at the architecture
level**; don't fight there — fight on operations, multi-tenancy, and semantics.

### 2.2 Consumption models

**Kafka consumer groups:** partition = unit of parallelism and of ordering.
- Max parallel consumers = partitions; changing partition count re-maps keys
  (ordering break — `01-queues-vs-logs.md` P-scars).
- **Rebalances:** membership change (deploy, crash, scale) triggers partition
  reassignment; historically stop-the-world (all consumers pause), improved
  by cooperative/incremental rebalancing (KIP-429) and static membership —
  but rebalance storms remain Kafka's most-paged consumer pathology
  (max.poll.interval violations during slow processing → eviction → rebalance
  → more slowness).
- Progress = one offset per partition: **no per-message state**. A slow/failed
  message can't be individually deferred — you commit past it, park it
  elsewhere (retry topics), or block the partition.

**Pulsar subscriptions:** per-message acknowledgment as a first-class citizen.
- **Shared** subscriptions distribute individual messages across any number of
  consumers — parallelism decoupled from partition count; adding a consumer is
  instant (no rebalance event, just flow-control redistribution).
- **Individual acks + ack holes:** consumers ack out of order; the broker
  tracks ranges (a cursor plus "holes"). Enables selective redelivery
  (negative-ack ONE message with backoff) — impossible in offset-land.
- **Broker-side features** riding on per-message state: delayed delivery
  (`deliverAfter`), subscription-level dead-letter policy, redelivery-count
  tracking, per-subscription rate limits and backlog quotas.
- **key_shared:** per-key ordering with shared-style scaling (hash ranges of
  keys assigned to consumers) — with real-world caveats around consumer churn
  re-mapping ranges.
- Cost: per-message tracking is bookkeeping Kafka refuses on principle —
  Kafka's refusal is exactly why it's operationally lean and why every
  queue-ish feature is DIY there.

### 2.3 Multi-tenancy, geo-replication, ecosystem

- **Multi-tenancy:** Pulsar is natively hierarchical (tenant/namespace/topic)
  with per-namespace quotas, auth, isolation policies — designed as a shared
  company-wide utility (this is *the* reason platform teams like Flipkart's
  chose it: one managed bus for hundreds of teams). Kafka multi-tenancy =
  cluster-per-team or disciplined quotas/ACLs — workable, hand-built.
- **Geo-replication:** Pulsar built-in (per-namespace, async, active-active
  patterns); Kafka via MirrorMaker 2 / Confluent replicator — external
  machinery with offset-translation subtleties.
- **Ecosystem:** Kafka wins decisively — Connect's connector universe,
  Streams/ksqlDB, every vendor's first-class integration, hiring pool,
  StackOverflow depth. For a single product team this weight is often
  decisive *for Kafka* — say so; conceding the strongest opposing point is
  what makes the rest of your answer credible.

---

## 3. Senior-level depth

- **Write-path durability, precisely:** Kafka `acks=all` waits for the ISR
  (leader + in-sync followers; floor = min.insync.replicas) to have the
  bytes (in page cache — Kafka's default durability is replication, not
  fsync-per-message; flush is periodic **[nuance worth knowing: it relies on
  "unlikely all replicas lose power simultaneously"]**). BookKeeper acks
  after ack-quorum bookies have **fsynced to a dedicated journal disk** —
  per-entry fsync durability by default. Two defensible philosophies:
  replication-as-durability (Kafka) vs disk-and-replication (BK). If an
  interviewer wants one concrete technical edge for money workloads, this
  fsync distinction is a clean one — deliver it with the caveat that
  properly configured Kafka (replicas across racks/AZs) is also fine in
  practice.
- **Failure-recovery asymmetry:** Kafka leader failure → controller elects a
  new leader from ISR (fast, seconds) but a *lost broker's disks* mean
  re-replicating its partitions (slow). Pulsar broker loss → topic ownership
  transfer (fast, no data); bookie loss → background re-replication of its
  ledger fragments across the cluster (spread load, no single "new replica"
  bottleneck). Ledger **fencing** during recovery prevents split-brain
  writes — same fencing pattern as everywhere
  (`01-distributed-systems/05-consensus.md`).
- **KRaft matters to your answer:** "Pulsar needs ZooKeeper, Kafka doesn't
  anymore" is a real 2026 operational point *against* Pulsar's default
  deployment (Pulsar has been moving to pluggable metadata stores —
  **[VERIFY current state and what Flipkart runs before leaning on this]**).
  Don't let the interviewer surprise you with it; raise it yourself.
- **Where each genuinely wins (the judgment table):**
  - Kafka: single-team/product deployments; ecosystem-heavy stacks
    (Connect/Streams); maximum operational familiarity; raw simplicity of
    one storage-serving layer.
  - Pulsar: multi-tenant platform bus; workloads needing queue semantics +
    log semantics together (per-message ack, delays, DLQ native); elastic
    serving (stateless brokers under K8s); tiered "infinite" retention;
    built-in geo-replication; fsync-grade durability posture.
- **L4/L5/L6:** L4 recites "Pulsar separates compute and storage." L5
  derives consequences (no-data-movement failover, segment scatter, tiered
  storage), contrasts consumption models mechanically (offsets vs
  per-message acks and what each enables), and concedes Kafka's ecosystem
  honestly. L6 frames it as platform strategy: which do you run as a
  company utility, what does migration cost, and when do the semantics
  (not the benchmarks) force the choice.

---

## 4. Resume connection

- **Own the real decision context:** you didn't pick Pulsar; Flipkart's
  platform team built a managed multi-tenant bus (Varadhi/Viesti) and
  Pulsar's tenancy + queue-semantics fit that mandate. Your claim is
  *informed consumption*: you leaned on exactly the features that
  differentiate it — shared subscriptions with per-message ack for elastic
  payment workers; negative-ack redelivery + delayed delivery for the
  callback race fix; subscription DLQ policy for the recovery path;
  independent cursors for CDC fan-out.
- **The one-liner that proves architecture-level understanding:** "our
  produce isn't acked until an ack-quorum of bookies has fsynced the entry
  to their journals — the payment event is on multiple disks before the API
  returns," and downstream of that, "broker loss moves topic ownership in
  seconds with zero data movement."
- **Kafka-fluency insurance:** be ready to design your own platform on
  Kafka in two minutes (retry topics for delays, DLQ topics, partitions
  sized for peak consumers, idempotent producers) — the strongest possible
  proof that your Pulsar knowledge is understanding, not habit.

**30–60 s spoken answer** ("why Pulsar over Kafka?"):

> "Honestly: it was Flipkart's platform choice — a company-wide multi-tenant
> bus — and it's the right choice for that mandate, which I can defend at
> the architecture level. Kafka couples serving and storage: a partition is
> files on specific brokers' disks, so broker failure or scaling means
> moving data, and consumer parallelism is bounded by partition count with
> rebalance storms as the classic pathology. Pulsar separates them:
> stateless brokers over BookKeeper, so failover is a metadata change with
> zero data movement, storage scales by adding bookies with no history
> rebalancing, and old segments tier off to object storage. And the
> consumption model is per-message rather than per-offset — shared
> subscriptions scale consumers past partition counts with no rebalance
> event, and per-message state is what gives us broker-native delayed
> delivery, negative-ack redelivery, and subscription-level dead-lettering —
> features my callback-race fix and DLQ recovery path lean on directly,
> which on Kafka are hand-rolled retry-topic machinery. What Kafka wins is
> ecosystem and operational familiarity, decisively — for a single product
> team I'd default to Kafka. For a multi-tenant platform with queue
> semantics as a requirement, Pulsar's architecture is the better
> substrate. And on durability: our produces ack only after a quorum of
> bookies has fsynced to journal — the payment event is on multiple disks
> before the API returns."

---

## 5. What the interviewer will push on

**P1. "Pulsar adds a network hop on the write path (broker → bookies).
Doesn't that make it slower?"**
- *Model:* Kafka's `acks=all` write path ALSO crosses the network — leader →
  follower replication before ack; both architectures pay ~one network
  round-trip for replicated durability. Pulsar's extra hop is
  producer→broker→bookie vs producer→leader→follower — same hop count for
  comparable guarantees; BK adds journal fsync (latency floor ~ms on NVMe,
  bounded by group-committing the journal). Net: single-digit-ms p99 for
  both when tuned; the hop argument dissolves under inspection — and
  showing you can dissolve it IS the answer.
- *Trap:* conceding "yes but it's worth it" — you'd be accepting a false
  premise; count the hops out loud instead.

**P2. "Your consumer count exceeds partitions. What happens on each
system, and what does that reveal?"**
- *Model:* Kafka: extra group members sit idle — partition is the
  parallelism quantum; fix = repartition (ordering/key remap consequences)
  or consumer-side fan-out. Pulsar shared: all consumers receive messages —
  parallelism quantum is the message; the broker's flow control (permit
  based) spreads load. Reveals the root design: Kafka pushed state to
  consumers (offsets — cheap broker, coarse control); Pulsar kept
  per-message state at the broker (richer semantics, more bookkeeping).
  Every queue-vs-log feature difference is this one decision refracted.
- *Trap:* answering only "idle consumers" without the design-philosophy
  layer — the question is fishing for whether you see the root cause.

**P3. "Describe what happens end-to-end when a bookie dies. Now a Kafka
broker. Compare recovery blast radius."**
- *Model:* Bookie dies: entries it held are under-replicated; auto-recovery
  re-replicates its ledger *fragments* from surviving quorum members to
  other bookies — work spreads across the cluster; meanwhile writes
  continue (new ledgers/ensembles simply exclude it) and reads hit other
  quorum copies. No serving interruption. Kafka broker dies: leaderships
  fail over fast (controller elects from ISR — brief unavailability per
  partition), but its data must re-replicate to restore replication
  factor — concentrated on the replacement/remaining brokers, hours at TB
  scale, competing with live traffic (throttles exist for this reason).
  Blast radius: Pulsar = storage-layer background work, serving unaffected;
  Kafka = serving blips + concentrated recovery load. Mention ledger
  fencing (BK) and unclean-leader-election=false (Kafka) as the respective
  safety rails.
- *Trap:* hand-waving "it re-replicates" for both — the *distribution* of
  recovery work (scattered vs concentrated) is the differentiating insight.

**P4. "Sell me Kafka over your own stack."** (the intellectual-honesty test)
- *Model:* do it enthusiastically: one system to operate instead of
  brokers+bookies+metadata quorum; KRaft removed the ZK tax; the Connect
  ecosystem would replace custom CDC-sink code; Streams gives stateful
  processing without a separate cluster; hiring and runbook depth are
  unmatched; exactly-once producer/transactions are mature; for our
  single-digit-team usage the multi-tenancy machinery is dead weight. Then
  the pivot: what I'd have to rebuild — delays/nacks/DLQ as retry-topic
  machinery, and partition-count planning for consumer elasticity. Net for
  a fresh single-team system: Kafka, genuinely. For the company-wide bus:
  Pulsar. Same conclusion as X1, argued from the other side — consistency
  under inversion is what's being tested.
- *Trap:* a weak strawman sell ("Kafka is popular I guess") — refusing to
  argue the other side convincingly reads as brand loyalty, the exact
  anti-signal this question hunts.

**P5. "What breaks in key_shared / what's an ack hole?"** (the
have-you-actually-run-it probes)
- *Model:* ack holes: with out-of-order individual acks, the subscription
  state is cursor + acked-ranges beyond it; holes = unacked gaps. Broker
  must persist range state (cursor ledger); pathological non-acking
  consumers grow state and pin backlog — mitigations: ack-timeout policies,
  backlog quotas **[verify your platform's settings]**. key_shared: per-key
  order holds only while key→consumer mapping is stable; consumer
  join/leave re-maps hash ranges, and in-flight messages of re-mapped keys
  can interleave across old/new consumers unless carefully drained — plus a
  hot key still serializes on one consumer (per-key skew survives, echoing
  `01-distributed-systems/04-partitioning.md`). If you haven't run
  key_shared, say so and reason from the mechanism — honest reasoning beats
  bluffed experience.
- *Trap:* claiming key_shared gives unconditional per-key ordering — churn
  caveats are exactly what the question exists to surface.

---

## Self-test

1. Draw both write paths (producer → durable ack) and count the network
   round-trips for replicated durability on each.
2. State the fsync difference and the two durability philosophies it
   represents.
3. Derive three consequences of segment-centric storage (ledger scatter).
4. Kafka rebalances: trigger, classic pathology, and the two mitigations by
   name.
5. What per-message state does Pulsar keep that Kafka refuses, and name
   three features that ride on it.
6. Bookie death vs Kafka broker death: recovery work distribution and
   serving impact.
7. Why is "which is faster" the wrong fight, and where do you fight
   instead?
8. Make the two-minute Kafka design of your own platform (delays, DLQ,
   elasticity).
9. key_shared's two real-world caveats.
10. What's an ack hole, why does it exist, and what pathology does it
    enable?
11. Multi-tenancy: what Pulsar has natively that made it right for
    Flipkart's platform team.
12. Give the "sell Kafka" answer's three strongest points, then the pivot
    sentence.

<details>
<summary><b>Answers</b></summary>

1. Kafka acks=all: producer → leader (1) → followers replicate + ack (2) →
   producer acked. Pulsar: producer → broker (1) → write-quorum bookies
   ack-quorum (2) → producer acked. Both ≈ two hops for replicated
   durability; the "extra hop" premise is false at equivalent guarantees.
2. BookKeeper: per-entry fsync to a dedicated journal before ack —
   disk-durable at ack time. Kafka default: acked when in the ISR's page
   caches; fsync is periodic — durability *is* replication (bet: not all
   replicas lose power together). Philosophies: disk+replication vs
   replication-as-durability. Both defensible; know which you're on.
3. (a) Topic never bound to specific disks → no history rebalancing when
   storage scales (new ledgers land on new bookies immediately); (b) full/
   failed bookie just excluded from new ensembles — writes continue;
   (c) tiered storage is natural — closed ledgers offload to object store
   while remaining readable (cheap long retention). (Also: recovery work
   scatters across the cluster.)
4. Trigger: group membership or subscription change (deploy, crash, scale,
   max.poll.interval exceeded). Pathology: slow processing → poll interval
   violation → eviction → rebalance pauses everyone → more slowness →
   storm. Mitigations: cooperative/incremental rebalancing (KIP-429) and
   static group membership (also: tune max.poll.interval, process async).
5. Per-message delivery state at the broker: individual acks (with
   acked-range tracking), redelivery counts, delivery timestamps. Features:
   negative-ack/selective redelivery with backoff, broker-side delayed
   delivery (deliverAfter), subscription-level DLQ policy (also: shared
   subscriptions themselves — message-level distribution).
6. Bookie: fragments re-replicated in background from surviving quorum
   copies, scattered across many bookies; serving continues (new ensembles
   exclude it, reads use other copies) — no serving blip. Kafka broker:
   fast leader failover (brief per-partition unavailability), then
   concentrated re-replication of its partitions to specific brokers —
   hours at TB scale, throttled to protect live traffic.
7. Both saturate NICs with ~ms p99s when tuned; benchmark duels measure
   config skill (and funding). Fight on: operations (data movement vs
   not), consumption semantics (per-message vs offsets), multi-tenancy,
   ecosystem, durability posture.
8. Delays: tiered retry topics + pause-until-due consumer + attempt
   headers. DLQ: explicit dead-letter topics per consumer group.
   Elasticity: over-partition for peak consumer count (accepting key
   remap pain later), cooperative rebalancing + static membership.
   Idempotent producer + EOS transactions where consume-process-produce
   stays in-cluster. Everything works; three extra moving parts.
9. Consumer churn re-maps key hash ranges — per-key order can interleave
   across the transition unless drained carefully; and hot keys still
   serialize on a single consumer (key skew unsolved by scaling).
10. Out-of-order individual acks leave gaps: subscription state = cursor +
    acked ranges beyond it; holes are the unacked gaps the broker must
    persist. Pathology: a consumer that receives-but-never-acks grows
    range state and pins backlog (cursor can't advance) — bounded by
    ack-timeout redelivery and backlog quotas.
11. Hierarchical tenant/namespace/topic model with per-namespace quotas,
    auth/isolation, dispatch rate limits, backlog quotas — a shared
    company bus with per-team governance out of the box, vs hand-built
    quota/ACL discipline or cluster-per-team on Kafka.
12. One system to operate (KRaft killed the ZK tax; no bookies); the
    Connect/Streams ecosystem replaces custom sink/processing code; hiring
    and operational depth are unmatched. Pivot: "what I'd have to rebuild
    is per-message semantics — delays, nacks, subscription DLQs — as
    retry-topic machinery; so: single team, Kafka; multi-tenant platform
    with queue semantics required, Pulsar."

</details>
