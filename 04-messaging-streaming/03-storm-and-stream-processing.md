# Apache Storm and the Stream-Processing Landscape

You run four+ production Storm topologies moving money. That's rarer in 2026 than
Kafka or Flink experience — which cuts both ways: interviewers can't assume it,
and they'll test whether you understand the machine or just deployed to it. This
doc: Storm's execution and reliability model down to the XOR trick, the honest
Flink comparison with mechanisms, and the "why is Storm still right for you"
argument.

---

## 1. Plain definition

**Stream processing** = computing over unbounded data as it arrives (vs batch:
bounded data, computed after collection). A stream processor gives you: a
programming model (a graph of transformations), a runtime that distributes it
over machines, and — the hard part — **guarantees about what happens to your
data when machines die mid-computation**.

**Apache Storm** (2011, Twitter lineage) is the elder statesman: a **topology**
— a directed graph of **spouts** (sources: pull from Pulsar/Kafka, emit tuples)
and **bolts** (processing steps: transform, call services, write stores) — runs
*forever* across a cluster, processing one tuple at a time with low latency
(single-digit ms hop-to-hop) and **at-least-once** delivery via replay.

Analogy: a factory line that never stops. Spouts are the loading dock; bolts
are stations; tuples are parts flowing between them. Storm's distinctive
promise: if any part falls off the line anywhere, the *original order form*
(the spout tuple) is re-issued from the dock — nothing is silently lost, though
some work may be redone.

---

## 2. How Storm works (mechanics you must own)

### 2.1 Execution model

- **Topology → workers → executors → tasks:** a topology's components run as
  **tasks** inside **executors** (threads) inside **worker** JVMs spread over
  cluster nodes (supervisors). Parallelism is per-component config ("this bolt:
  16 executors") — your knob for scaling a stage independently.
- **Groupings** decide tuple routing between components: **shuffle** (random,
  load-balance), **fields** (hash on chosen fields — all tuples for a key hit
  the same task: the per-key-state/ordering tool), all/global/direct (niche).
  Fields grouping is partitioning-by-key inside the topology — same hot-key
  caveats as everywhere (`01-distributed-systems/04-partitioning.md`).
- **Coordination:** Nimbus (master: assignment, rebalance) + Supervisors
  (per-node agents) + ZooKeeper (cluster state, liveness) — Nimbus HA via ZK
  election; a dead Nimbus doesn't stop running topologies (they coast; no
  reassignment until it returns — the consensus blast-radius story again).

### 2.2 The reliability model: tuple trees and the XOR acker (the depth marker)

Storm guarantees every spout tuple is **fully processed** — meaning the tuple
AND every downstream tuple it spawned (its **tuple tree**) are acked — or it's
replayed. Tracking a whole tree cheaply is the clever part:

- Each spout tuple gets a random 64-bit ID and an entry in an **acker** task's
  map: `spout-tuple-id → ack-val` (a 64-bit value, initially the tuple's ID
  XORed in... conceptually: starts at the root's ID).
- Every time a bolt **anchors** an emitted tuple to its input (declaring "this
  child belongs to that tree") and every time a tuple is **acked**, the tuple's
  random ID is XORed into the tree's ack-val.
- The algebra: every tuple's ID enters the ack-val **exactly twice** — once at
  emit/anchor, once at ack. Since `x XOR x = 0`, when every tuple in the tree
  has been both emitted and acked, the ack-val returns to **zero** → the acker
  tells the spout "complete" → the spout discards its cached tuple (and acks
  the Pulsar message).
- Failure = an explicit `fail()` OR the tree not zeroing within the **tuple
  timeout** (default 30 s) → acker signals the spout → **replay from the
  spout** (Storm holds no data; the *source* re-emits — which is why Storm
  pairs with replayable/ackable sources like Pulsar/Kafka).
- Cost: ~20 bytes per in-flight tree regardless of tree size, constant-time
  updates. Probabilistic soundness: a false "complete" requires random 64-bit
  IDs to collide in exactly the wrong way (~2⁻⁶⁴ scale — ignorable).
- **What it does NOT give:** at-least-once, not exactly-once — a tree that
  fails at bolt 3 of 4 replays from the *root*; bolts 1–2 re-execute. All
  side effects must be idempotent (your platform's entire discipline —
  `05-resilience/07-idempotency.md`).

### 2.3 Flow control

`topology.max.spout.pending` = max in-flight (un-completed) spout tuples per
spout task. The spout stops emitting when the window is full — **credit-based
backpressure by another name**: slow bolts → trees complete slowly → window
fills → spout pauses → Pulsar backlog grows → your queue-depth signals take
over (`08-backpressure.md`). Sizing: too low starves parallelism (pipeline
bubbles); too high floods bolt queues and inflates replay blast radius on
failure (every in-flight tuple at a crash gets redelivered). It's Little's law
again: pending ≈ target-throughput × tree-completion-time, plus headroom
**[VERIFY your topologies' setting — this is your knob and you should know
its value and rationale]**.

### 2.4 Worker death, precisely

Worker JVM dies → its in-flight tuples' trees never zero → timeout →
spout replay (on other workers). Supervisor restarts the worker; Nimbus
reassigns if the node is gone. Nothing is lost; everything mid-flight is
redone — the reason your PSP calls carry transaction identity. Meanwhile
ZK session expiry is the death detector (GC-pause false positives and
fencing implications per `01-distributed-systems/07-failure-detection.md`).

---

## 3. Senior-level depth: the modern landscape and the honest comparison

### 3.1 What Flink does differently (mechanism, not vibes)

- **Managed keyed state:** operators hold partitioned state (RocksDB/heap)
  *inside* the runtime — counts, windows, joins — instead of external stores.
- **Checkpointing (asynchronous barrier snapshotting):** the runtime
  periodically injects **barriers** into the stream; when a barrier flows
  through an operator, the operator snapshots its state; when barriers align
  through the whole graph, the checkpoint (all state + all source offsets) is
  atomically complete. Failure → restore *entire pipeline* to the last
  checkpoint and rewind sources → **exactly-once state** (each event's effect
  on state applied once). Chandy–Lamport's algorithm, productized.
- **Event time & watermarks:** windows computed on when events *happened*, not
  arrived; watermarks track event-time progress and bound lateness — the
  correct answer for out-of-order streams (Storm has no native notion; you'd
  hand-build it).
- **End-to-end exactly-once:** only with transactional sinks (two-phase
  commit tied to checkpoints — Kafka transactions) — and NEVER for arbitrary
  side effects like HTTP calls (the scope boundary from
  `05-resilience/07-idempotency.md` P4).
- Also in the landscape: **Kafka Streams** (library-not-cluster; state stores
  + changelog topics; EOS within Kafka), **Spark Structured Streaming**
  (micro-batch lineage, strong for unified batch+stream analytics). Storm
  itself has **Trident** (micro-batch exactly-once-state layer — heavy,
  largely historical) and successors of its ideas live in Heron (Twitter's
  Storm-API reimplementation — also now historical).

### 3.2 The honest verdict (expanded from arsenal X3)

The question is not "Storm vs Flink" in the abstract — it's **what your
topologies actually do**:

- **Durable async RPC orchestration** (send-money: consume command → call
  PSP → call txn-svc): no windows, no joins, no managed state — the state
  lives in HBase and the *effects are external*. Flink's superpowers
  (checkpointed state, event time) buy ~nothing; its exactly-once halts at
  the HTTP boundary anyway, so the idempotency discipline survives
  unchanged. Storm (or Kafka consumers, or plain workers) is honestly
  adequate — the value is in the queue + idempotency design, not the
  compute runtime.
- **Stateful aggregation** (rewards checkpoint/aggregate machinery): here
  Flink genuinely absorbs your hand-built work — keyed state instead of
  HBase round-trips per event, checkpoints instead of marker+CAS recovery
  protocol, and the five-case uncertainty table collapses into runtime
  guarantees *for the state part* (external cashback disbursement remains
  identity-guarded). Migration would be justified by simplification, not
  correctness — correctness you already achieved manually.
- **The 2026 hiring-reality sentence:** "Storm is legacy; I understand why
  it's there, what its acker actually guarantees, and precisely which of my
  designs Flink's runtime would absorb vs which discipline survives any
  runtime" — that sentence, with the mechanics above behind it, converts a
  dated-stack liability into a depth demonstration.

### 3.3 L4 / L5 / L6

- **L4:** "Storm processes streams with spouts and bolts; we should use
  Flink now."
- **L5:** XOR acker mechanics + timeout/replay semantics + max.spout.pending
  sizing; the stateless-orchestration vs stateful-compute distinction; Flink
  barrier snapshotting and its exactly-once *scope*; event time vs
  processing time.
- **L6:** platform judgment — when a compute runtime earns its operational
  weight vs plain consumers; migration sequencing (which topology first,
  what proves parity); org standardization costs.

---

## 4. Resume connection

- **"Single topology serving 4 execution paths"** — now say it in Storm
  vocabulary: one topology, event-type branching in the processor bolt,
  per-component parallelism as the scaling knob, shared acker/replay
  machinery, DLQ path as the terminal state. The isolation trade-offs are
  argued in `00-resume-arsenal/03-core-upi-platform.md` B2.
- **Your replay-safety chain is the acker's other half:** Storm promises
  redelivery; your gateway/PSP/NPCI identity chain + txn state machine make
  redelivery harmless. "At-least-once runtime + idempotent effects =
  effectively-once money movement" — the platform equation, again.
- **max.spout.pending is your admission valve:** it's where topology
  throughput meets Pulsar backlog — know your value, and the story: raise
  it and bolts flood + replay blast radius grows; lower it and you starve
  throughput. **[FILL: your actual settings + one tuning anecdote if any.]**
- **Honest gaps to volunteer if probed:** no event-time/windowing experience
  in production (your aggregations are event-driven table updates, not
  windowed streams); no Flink operations. Compensate with mechanism-level
  fluency (§3.1) — reasoned understanding beats bluffed experience.

**30–60 s spoken answer** ("you run Storm — walk me through it and defend
it in 2026"):

> "Our topologies are durable async orchestrators: consume a payment command
> from Pulsar, drive the PSP and transaction-service calls, with Storm's
> acker giving at-least-once — every spout tuple is tracked as a tree via
> the XOR trick, twenty bytes per in-flight tree, and any failure or
> thirty-second timeout replays from the source. Replay means re-executed
> side effects, so the real guarantee is our idempotency chain — transaction
> identity at the gateway, PSP, and NPCI — turning at-least-once processing
> into effectively-once money movement. Flow control is
> max-spout-pending: bolts slow down, the in-flight window fills, the spout
> pauses, and pressure becomes visible Pulsar backlog where our scaling and
> shedding signals live. Would I choose Storm today? For this workload it
> barely matters — there's no managed state, no windows; Flink's
> checkpointed exactly-once state stops at the HTTP boundary anyway, so the
> idempotency discipline survives any runtime. Where Flink would genuinely
> earn a migration is our rewards aggregation — keyed state and barrier
> checkpoints would absorb the checkpoint-and-CAS recovery machinery I
> built by hand. I'd migrate that for simplification, not correctness."

---

## 5. What the interviewer will push on

**P1. "Explain exactly how Storm knows a tuple failed halfway through a
five-bolt chain."**
- *Model:* the XOR acker in full (§2.2): random 64-bit IDs, anchor+ack each
  XOR into the tree's ack-val, zero ⇒ complete; explicit fail() or the
  30 s tree timeout ⇒ spout replay; Storm stores no tuples — the source
  re-emits. Add the two subtleties: unanchored emits opt out of the tree
  (fire-and-forget children), and the guarantee is per-tree, so a bolt
  that swallows exceptions and acks anyway silently drops data — the
  classic Storm bug.
- *Trap:* "the acker tracks every tuple in a table" — the whole point is
  it *doesn't* (constant memory via XOR); missing that means you read a
  diagram once.

**P2. "Storm replays from the root. Bolt 2 already wrote to the database.
What happens on replay, and design the bolt so it's safe."**
- *Model:* bolt 2 re-executes: its write must be idempotent — upsert keyed
  by business identity, conditional write (CAS/version), or state-machine
  transition guard; never increments/appends without identity. Generalize
  to the platform pattern: every effectful bolt in our topologies writes
  through identity (txnId) into guarded state machines, and the PSP call
  itself is identity-deduped downstream. Bonus: note that *partial trees
  replay whole* — so even bolts that succeeded re-run; idempotency is
  required at every stage, not just the failed one.
- *Trap:* "we use Trident/exactly-once so it can't happen" — Trident
  covers *state it manages*, not your HBase writes and HTTP calls; the
  scope error again.

**P3. "Flink checkpointing: explain barriers, and then tell me what
'exactly-once' does NOT cover."**
- *Model:* barriers injected at sources flow with the data; each operator
  snapshots its state when the barrier arrives (aligning multiple inputs);
  a checkpoint = consistent cut of all operator state + source offsets;
  failure restores the whole graph to the cut and rewinds. Exactly-once =
  each record's effect on *managed state* applied once. Not covered:
  side effects outside the checkpoint scope — HTTP calls, emails,
  non-transactional sinks fire again on replay between checkpoints;
  end-to-end EOS needs transactional (2PC) sinks, which exist for Kafka,
  not for your PSP. Ergo: identity/idempotency discipline is
  runtime-independent.
- *Trap:* "Flink is exactly-once, full stop." The scope boundary is the
  entire question.

**P4. "Why does max.spout.pending exist, and what happens at each extreme?"**
- *Model:* it's the in-flight window bounding memory, bolt-queue depth, and
  replay blast radius, and it's the backpressure coupling to the source.
  Too low: pipeline bubbles — bolts idle between tuples, throughput capped
  below capacity (pending < throughput × completion-time). Too high: bolt
  input queues bloat (latency), worker memory pressure, and a crash
  redelivers a huge in-flight set (thundering replay). Size via Little's
  law from measured tree-completion time; watch complete-latency and
  capacity metrics.
- *Trap:* "it's a rate limit" — it's a *concurrency* limit (window), which
  is why it self-adapts to downstream speed; conflating rate and
  concurrency is a recurring junior tell.

**P5. "You've never run Flink. Why should I believe your Flink opinions?"**
- *Model:* own it, then demonstrate transfer: "Correct — my Flink knowledge
  is mechanism-level, not operational. But the mechanisms are the ones I
  operate daily in other forms: barrier snapshotting is consistent-cut
  checkpointing — same family as the recovery protocol I hand-built with
  markers and CAS; keyed state is fields-grouping plus a local store;
  exactly-once's scope boundary is the idempotency line my platform is
  built on. What I'd need to learn operationally: checkpoint sizing/
  alignment pain, RocksDB tuning, savepoint-based deploys." Naming what
  you *don't* know is the credibility move.
- *Trap:* bluffing operational war stories — one follow-up ("what's
  checkpoint alignment backpressure?") ends it. 

---

## Self-test

1. Topology anatomy: tasks/executors/workers, and which knob scales one
   slow stage.
2. Fields vs shuffle grouping — and which platform problem fields grouping
   maps to.
3. The XOR acker: walk the algebra, the memory cost, and the probabilistic
   caveat.
4. Two ways a tree fails, and where replay comes from (why Storm needs a
   replayable source).
5. What does "fully processed" mean, and what's the classic bug that
   silently drops data anyway?
6. max.spout.pending: what it bounds (three things), the sizing law, both
   extremes' symptoms.
7. Worker JVM dies with 500 tuples in flight — narrate the next 60 seconds.
8. Flink barrier snapshotting in four sentences, and the exactly-once scope
   boundary in one.
9. Event time vs processing time; which does Storm give you?
10. For each of your two workload shapes (orchestration, aggregation): what
    would Flink change, and what survives any runtime?
11. Why is Trident not the answer to your double-debit question?
12. Give the 2026 "defend Storm" answer in three sentences.

<details>
<summary><b>Answers</b></summary>

1. Components (spouts/bolts) run as tasks within executors (threads) within
   worker JVMs on supervisor nodes. Scale one stage by raising that
   component's executor parallelism (and rebalancing workers if CPU-bound).
2. Shuffle: random distribution, pure load-balance. Fields: hash-route on
   chosen fields so a key's tuples always hit the same task — per-key state
   and ordering; identical to partition-key design, with the same hot-key
   skew failure.
3. Each tuple ID (random 64-bit) is XORed into the tree's ack-val twice —
   at anchor/emit and at ack; x⊕x=0, so ack-val==0 iff every emitted tuple
   was acked ⇒ complete. Memory: ~20 bytes per in-flight tree regardless
   of size. Caveat: a wrong-zero needs adversarial 64-bit collisions
   (~2⁻⁶⁴) — accepted as negligible.
4. Explicit fail() from a bolt, or tree timeout (default 30 s) without
   zeroing. Replay comes from the spout re-emitting — Storm buffers
   nothing; the source (Pulsar/Kafka: unacked message redelivery / offset
   not committed) must be able to re-serve the input.
5. The tuple and its entire spawned tree acked at every stage. Bug: a bolt
   catching exceptions and acking anyway (or emitting unanchored children)
   — the tree zeroes, the spout acks the source, and the failed work is
   never replayed: silent loss inside an "at-least-once" system.
6. Bounds in-flight tuples per spout: memory/queue depth, end-to-end
   latency contribution, and replay blast radius on crash; couples spout
   rate to bolt speed (credit-style backpressure). Sizing: pending ≈
   throughput × tree-completion-time + headroom. Too low: idle bolts,
   capped throughput. Too high: bloated queues, memory pressure, huge
   redelivery burst on failure.
7. ZK session for the worker expires → Nimbus/supervisor notice; supervisor
   restarts the JVM (or Nimbus reassigns tasks if the node died). The 500
   in-flight trees never zero → 30 s timeout → acker signals spouts →
   replay (on surviving/new workers); Pulsar redelivers unacked messages.
   Duplicated side effects are absorbed by identity/idempotency; backlog
   and complete-latency metrics blip, then drain.
8. Sources inject numbered barriers that flow with records; each operator,
   on receiving a barrier (aligned across its inputs), snapshots its state
   asynchronously; when all operators snapshot barrier N, checkpoint N =
   consistent cut of state + source offsets. On failure, restore all state
   to N and rewind sources. Scope: exactly-once for managed state and
   transactional sinks only — anything crossing the boundary (HTTP, email)
   replays.
9. Event time: when it happened (needs watermarks to bound disorder);
   processing time: when it arrived. Storm natively gives processing time
   only — event-time windowing would be hand-built.
10. Orchestration (send-money): Flink changes ~nothing — no managed state,
    effects external; discipline (identity, state machines, force-query)
    survives. Aggregation (rewards): Flink absorbs the hand-built recovery
    — keyed state + checkpoints replace marker+CAS+re-derivation for the
    state part; external disbursement still needs identity. Idempotency at
    effect boundaries survives every runtime.
11. Trident gives exactly-once semantics for state *it* manages via
    micro-batch + transactional state stores; the PSP HTTP call is not
    Trident-managed state — it fires per attempt regardless. Double-debit
    protection was always the identity chain, never the runtime.
12. "Our Storm topologies are stateless orchestrators, so the runtime's
    exactly-once features would stop at the HTTP boundary anyway — the
    correctness lives in our identity and idempotency chain, which is
    runtime-independent. I can explain the acker down to the XOR algebra
    and size its flow control from Little's law. Where a modern runtime
    genuinely pays — our stateful aggregation — I can name exactly which
    hand-built machinery Flink's checkpointed keyed state would absorb,
    and I'd migrate that piece for simplification, not correctness."

</details>
