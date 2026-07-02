# Cross-Cutting Attacks — Stack Choices & Meta-Questions

These attacks don't target a bullet; they target the *stack* and *you*. They arrive
in every loop, usually as warm-up ("why Pulsar?") or as a probe of intellectual
honesty ("would you build it this way today?"). Two rules govern every answer here:

1. **Never pretend an org-standard choice was your personal architectural decision.**
   "It was the platform standard" is a fine first sentence *if* the second sentence
   proves you understand the technology well enough to have made the call yourself.
   The failure mode is defending an inherited choice as if alternatives don't exist.
2. **Always carry the 2026 answer.** For each legacy piece (Hystrix, Storm), know
   its modern successor and how you'd migrate. "I know why it's there, I know
   what's better now, I know the migration trigger" is a strictly stronger position
   than either defensiveness or trash-talking your own stack.

---

## X1 — "Why Pulsar and not Kafka?"

**Honest opening:** Flipkart's managed messaging platform is Pulsar-based; teams
consume it as a service. Then demonstrate you could have made the call:

**Model answer (mechanism-level):**
- Architecture: Kafka brokers own both serving and storage (partitions live on
  broker disks); Pulsar separates brokers (stateless serving) from BookKeeper
  bookies (storage). Consequences: Pulsar brokers scale/fail over without data
  movement (a new broker serves a topic instantly — no partition reassignment/
  rebalance storms); adding storage capacity is independent of serving capacity.
  Kafka's model is simpler operationally at small scale; the separation pays off
  precisely in a *multi-tenant managed platform* — which is what Flipkart runs, and
  why the platform team's choice was rational.
- Consumption semantics: Kafka's unit of parallelism is the partition (consumer
  group = one consumer per partition; per-partition order). Pulsar subscriptions
  offer more modes — exclusive/failover (ordered), **shared** (work-queue style,
  N consumers on one topic, per-message acks), key_shared (order per key with
  shared scaling). Our payment-execution consumers use shared-style consumption
  with individual acks + negative-ack redelivery + broker-side delayed delivery —
  the callback-buffering and retry patterns lean on exactly those features; on
  Kafka you'd hand-roll delay topics and per-message retry bookkeeping.
- Built-ins we used that Kafka lacks natively: delayed messages, dead-letter
  policy at subscription level, per-message ack.
- What Kafka wins: ecosystem gravity (Connect, Streams, ksqlDB, every vendor
  integration first-class), simpler mental model, and — at single-tenant,
  stable-topology scale — fewer moving parts (no ZK/BK quorum trio; though Kafka
  itself shed ZooKeeper with KRaft, mainstream since ~3.5/4.x era).
- **Close:** "For a single-team deployment I'd default to Kafka for ecosystem
  reasons; for a company-wide multi-tenant bus with delay/retry/DLQ semantics as
  platform features, Pulsar's architecture is the better substrate — which is the
  position Flipkart was in."

**Trap answers:** "Pulsar is faster" (benchmark-fight bait; unfalsifiable and
wrong-headed — both saturate NICs; the differences are architectural). Or reciting
the bookies/brokers split without a single consequence ("so what?" follows).

---

## X2 — "Hystrix has been dead since 2018. Why is it on a 2026 resume?" ← guaranteed

**Model answer:**
> "Because it's what's actually running — Hystrix is embedded in Flipkart's shared
> platform libraries that predate me, wrapping every external call across dozens of
> services, and ripping out a battle-tested resilience layer from a payment system
> mid-flight is a risk decision, not a hygiene decision. What matters is that I
> understand precisely what it gives us — thread-pool bulkheads with enforceable
> timeouts, per-command rolling-window breakers, fallbacks — and its real costs:
> maintenance-mode means no fixes, thread-per-call overhead, and it predates
> CompletableFuture-era and Loom-era concurrency. If I were starting today:
> Resilience4j — same concepts as composable, lightweight decorators
> (CircuitBreaker, Bulkhead, TimeLimiter, Retry) without the thread-pool tax unless
> you opt in — or, at the platform level, adaptive concurrency limits in the mesh/
> client (gradient-based, Netflix's own successor direction) instead of static
> thresholds. Migration trigger I'd watch: virtual-thread adoption — Loom changes
> the isolation calculus because blocking becomes cheap, and Hystrix's thread-pool
> model becomes pure overhead."

**Why this works:** it converts a liability into a demonstration that you know the
whole timeline: Hystrix → Resilience4j → adaptive limits. **Follow-up you must
survive:** "Map your dual-timeout design onto Resilience4j." Answer: TimeLimiter
(800 ms / 3.5 s per operation) + CircuitBreaker per operation (count/time-based
sliding window — configurable, vs Hystrix's fixed 10 s rolling window) + Bulkhead
(semaphore) or ThreadPoolBulkhead where hang-protection is needed; decorators
compose around the client call.

**Trap answer:** "It still works fine." Maintenance-mode dependencies in a payment
system are a supply-chain and CVE liability; shrugging signals you don't think
about operational debt.

---

## X3 — "Storm? The industry moved to Flink a decade ago."

**Model answer:**
- Same honest opening: platform-provided stream-processing substrate.
- Then the technical map: Storm gives per-tuple processing with ack-tracking
  (at-least-once via replay from the spout; the acker XOR-tracks each tuple's
  processing tree). No native state management — our state lives in HBase/
  Aerospike, which is why the idempotency/CAS discipline in my systems exists.
  Flink gives managed keyed state with checkpointing (distributed snapshots),
  event-time semantics/watermarks, and effectively-once *state* updates — a
  categorically better fit for stateful aggregations/windows.
- The key insight that flips the question: **our topologies are mostly stateless
  I/O orchestrators** (consume event → call PSP → call txn-svc), not stateful
  stream computations. Flink's killer features buy little there; at-least-once +
  external state + idempotent effects is the right shape either way. For the
  *aggregation-flavored* work (rewards), Flink would genuinely simplify —
  checkpointed keyed state instead of hand-built checkpoint/CAS — and I can say
  exactly which parts of my design Flink's runtime would absorb.
- **Close:** "I'd choose Flink today for anything stateful; I'd still design the
  effect-idempotency the same way, because exactly-once state is not exactly-once
  side effects — the PSP call doesn't participate in Flink's checkpoint."

**Trap answer:** either defending Storm as current best practice, or conceding so
hard you imply your systems are built wrong. The L5 move is the distinction between
stateful stream compute (Flink wins) and durable async RPC orchestration (runtime
barely matters; discipline does).

---

## X4 — "Why HBase for payments? Wouldn't MySQL/Postgres or Cassandra be saner?"

**Model answer:**
- Access pattern fit: transaction/mandate/user records are point-lookups and short
  range scans by designed row keys, at large write volume, with wide sparse
  columns and per-table retention from 1 to 30 years — LSM-based wide-column
  storage is built for exactly this (sequential writes via WAL+memstore, ordered
  HFiles, cheap horizontal partitioning by key range).
- Consistency: HBase is **CP** — single-row operations are strongly consistent and
  atomic (one region server owns a row at a time), which is why row-level CAS
  (checkAndPut) is trustworthy for money bookkeeping. Cassandra's leaderless
  quorum model gives tunable consistency and better write availability, but its
  lightweight transactions (Paxos per operation) are expensive and its
  last-write-wins cells are a footgun for ledger-like data. That's a real
  differentiator, not a vibe: *we bet on per-row linearizability as a primitive.*
- vs relational: MySQL gives multi-row ACID and secondary indexes — genuinely
  missed (we hand-build indexes as lookup tables and live without cross-row
  transactions, hence markers/sagas/recon). Costs at our scale: sharding story
  (app-level or Vitess-class middleware), schema migration pain at billions of
  rows, and retention/archival economics. Flipkart's Yak platform made HBase the
  paved road with CDC (SEP) built in — the CDC pipeline came almost free.
- **Close with the honest trade:** "We paid with application-level transaction
  discipline — every multi-row invariant in my systems is enforced by idempotency
  markers, CAS, ordering, and recon. That's the tax of the choice, and most of my
  interesting work is literally paying that tax well."

**Trap:** "HBase scales, MySQL doesn't." MySQL at Flipkart/Meta scale demonstrably
scales; the truthful axis is access patterns + operational platform + what
transactional guarantees you're willing to rebuild in the app.

---

## X5 — "Why Aerospike over Redis?"

**Model answer:** the workload is caching-with-persistence at payment QPS: device
fingerprints and dedup tokens must survive restarts (a cold dedup cache = a
duplicate-payment window; a cold device cache = payment outage) and some sets are
effectively permanent. Aerospike's hybrid-memory model (indexes in RAM, data on
NVMe/flash) serves sub-ms reads with data durably on disk and native cross-DC
replication (XDR) — RAM-cost economics of Redis-with-persistence at our data sizes
favored it, and its per-record **generation counter** gives CAS semantics we use
for check-and-set patterns. Redis wins on data-structure richness (sorted sets,
streams, Lua) and ubiquity; for a flat KV at scale with durability, Aerospike is
the boring right answer. **[If you never personally compared them, say "platform
standard, and here's why it holds up" — do not invent a bake-off you didn't run.]**

---

## X6 — "Dropwizard? Not Spring Boot?"

Short answer, don't over-invest: org standard predating you; Dropwizard = Jersey
(JAX-RS) + Jetty + Metrics + Jackson, thin and explicit, with Guice for DI; less
magic and lighter startup than Spring's ecosystem, at the cost of ecosystem
breadth. Frameworks are the least interesting layer of your stack — say so
gracefully and steer to the interesting layers. Don't let the interview burn ten
minutes here.

---

## X7 — "Strip the internal names. What was your actual scale?" 

You MUST walk in with real, speakable numbers **[FILL EVERY ONE]**:
- Transactions/day and peak TPS through the platform: [X]
- Gateway QPS (all endpoints) and payment-submit QPS: [X]
- Storm topology event throughput: [X]
- HBase row counts / daily write volume on txn table: [X]
- Aerospike ops/sec: [X]
- p50/p99 submit-to-terminal: [X]
- Public anchor for credibility: NPCI reports UPI network-wide volume — ~18–20 B
  transactions/month in 2026 **[VERIFY current figure before quoting]** — placing
  Flipkart's share gives the interviewer a scale anchor they can trust.

**Why this matters:** without numbers, every scale claim on the resume is
unfalsifiable and will be discounted to zero. With numbers, even modest ones, you
sound like the owner. If a number is sensitive, give the order of magnitude —
"single-digit millions/day, peak TPS in the low thousands" is speakable and safe.

---

## X8 — "What exactly did YOU do vs your team?" (the triangulation probe)

They will ask it three different ways spread across the hour: "who wrote the design
doc?", "who reviewed it?", "what did the first version look like before feedback?",
"which part would break if you'd been on vacation?". Prepare a **truthful RACI** for
each project: what you authored, what you built, what you reviewed, what you merely
adopted. Inconsistency between two of your own answers is the #1 way strong
candidates fail behavioral triangulation. Where your context docs left ownership
checkboxes unchecked (they do — see `06-gap-analysis.md`), resolve them BEFORE the
first interview, not during it.

**Model shape:** "The eligibility pipeline and the SM integration in the PSP
adapter were mine end-to-end — design doc, reviews, code, rollout. The Varadhi
callback-delay pattern existed in the mandate flows before me; I applied and
extended it to the SM callbacks. The recon system is a platform service I
integrated with, not built." Specific, mixed, verifiable = credible.

---

## X9 — "Tell me about your worst production incident." 

You own payment infrastructure; claiming no incidents reads as either dishonesty or
lack of real ownership. Prepare ONE real incident with: detection (what paged),
diagnosis timeline, the wrong turn you took first (humanizing + credible), the fix,
the blast radius in numbers, and the durable prevention (alert added, pattern
changed, runbook written). **[You must supply this from memory — your context docs
don't contain incidents. The callback-race corruption and stuck-transaction
reduction both imply incidents you can rebuild truthfully. Write it down THIS WEEK
while you still remember details.]** The L5 grading axis is the *systemic
prevention*, not the firefight.

---

## X10 — "You're on Java 17. Virtual threads shipped in 21. Would Loom have changed
your architecture?"

**Model answer:** it dissolves one leg of the async justification and leaves the
others standing. Virtual threads make thread-per-request cheap (millions of parked
threads, ~KB-scale stacks) — so "we'd exhaust threads waiting 60 s on NPCI" stops
being an argument, and the Hystrix thread-pool-bulkhead tax stops being worth
paying (semaphore-style limits + timeouts on virtual threads instead). What Loom
does NOT provide: durability of intent across process death, replayable retry,
queue-depth backpressure, or independent scaling of execution capacity — the
reasons the queue exists. So: same macro-architecture, radically simpler service
internals, Hystrix retired in favor of Resilience4j-on-virtual-threads. Bonus
nuance for depth: synchronized-block pinning was the classic Loom caveat
(carrier-thread pinning), resolved in JDK 24 (JEP 491) **[VERIFY]** — mentioning
pinning shows you actually track the feature, not the headline.

---

## Self-test

1. State the broker/storage architectural difference between Kafka and Pulsar and
   ONE operational consequence of each direction.
2. Which three Pulsar features did your platform's patterns actually lean on that
   Kafka lacks natively?
3. Give the Hystrix answer in 30 seconds: why it's there, what replaces it, what
   triggers migration.
4. Map 800 ms/3.5 s dual timeouts + bulkhead + per-op breakers onto Resilience4j
   components.
5. Why does Flink matter little for your send-money topology but a lot for your
   rewards aggregation? Name the boundary concept ("exactly-once ___ is not
   exactly-once ___").
6. Defend HBase over Cassandra for money bookkeeping in two sentences built on a
   consistency primitive.
7. What tax did choosing HBase impose on your application code? Name three
   mechanisms you built to pay it.
8. Aerospike over Redis: the two workload facts that decide it here.
9. What are your five must-know scale numbers, and what happens to your resume's
   credibility without them?
10. Describe the triangulation probe and your defense.
11. What does Loom dissolve in your architecture and what does it not touch?

<details>
<summary><b>Answers</b></summary>

1. Kafka brokers own serving AND storage (partitions on broker disks); Pulsar
   brokers are stateless with storage in BookKeeper bookies. Consequences: Kafka
   broker replacement/scaling triggers partition data movement/rebalancing; Pulsar
   brokers fail over instantly with no data motion (but you operate two clustered
   systems instead of one).
2. Per-message acknowledgment with negative-ack redelivery, broker-side delayed
   delivery, and subscription-level dead-letter policy (plus shared subscriptions
   as a work-queue). The callback-delay fix and DLQ ladders are built on exactly
   these.
3. "It's the platform's battle-tested resilience layer predating me; removing it
   from live payment flows is risk, not hygiene. Today: Resilience4j decorators —
   TimeLimiter/CircuitBreaker/Bulkhead/Retry — or adaptive concurrency limits at
   the platform layer. Trigger: virtual-thread adoption, which makes Hystrix's
   thread-pool model pure overhead."
4. Per-operation TimeLimiter (800 ms, 3500 ms) + per-operation CircuitBreaker
   (sliding window count/time-based) + shared Bulkhead (semaphore; or
   ThreadPoolBulkhead if hang-isolation from a misbehaving client is required),
   composed as decorators around the partner call.
5. Send-money is stateless I/O orchestration — Flink's checkpointed keyed state
   buys nothing for an external PSP call. Rewards is stateful keyed aggregation —
   Flink's runtime would absorb the hand-built checkpoint/CAS machinery.
   "Exactly-once **state** is not exactly-once **side effects**."
6. HBase serves single-row reads/writes through one region server at a time,
   making row operations linearizable and checkAndPut a trustworthy CAS — the
   primitive our money bookkeeping is built on. Cassandra's leaderless
   last-write-wins model makes conditional updates expensive (Paxos LWT) and
   silent-overwrite the default — the wrong defaults for a ledger.
7. No cross-row/table transactions and no secondary indexes → (i) idempotency
   markers + natural keys (two-phase writes made crash-safe), (ii) CAS-on-version
   OCC for concurrent read-modify-write, (iii) hand-built index tables + recon/
   force-query to repair divergence. (Also write-ordering disciplines for
   multi-row updates.)
8. Durability requirement (dedup tokens and device fingerprints must survive
   restarts — cold cache = payment outage or duplicate window) and flat-KV-at-
   high-QPS economics (hybrid memory: RAM index, flash data) — data-structure
   richness is unused here.
9. Txns/day + peak TPS, gateway/submit QPS, p50/p99 submit-to-terminal, storage
   volumes/write rates, cache ops/sec. Without them every scale claim is
   discounted to zero and the "owner" narrative collapses into "was present".
10. The same ownership question asked 3+ ways across the hour (who wrote the doc,
    who reviewed, what changed after review, what breaks without you), checking
    answer consistency. Defense: a pre-written truthful RACI per project —
    authored / built / extended / adopted — used consistently.
11. Dissolves: thread-exhaustion economics and the thread-pool-bulkhead tax
    (cheap blocking → semaphore limits on virtual threads). Untouched: durable
    intent, replayable retry, backpressure visibility, independent execution
    scaling — the queue's actual reasons. (Nuance: synchronized pinning, fixed
    ~JDK 24 / JEP 491 [VERIFY].)

</details>
