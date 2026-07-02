# Backpressure

The load-shedding doc (`05-resilience/06-load-shedding-degradation.md`) placed
backpressure in the overload toolbox; this doc owns its mechanics: how "slow
down" actually propagates through queues, brokers, stream processors, and
protocol stacks — and how to design the signal chain so pressure surfaces where
you can see and act on it. Your resume claims "queue-depth back-pressure";
after this doc you can defend that claim down to the flow-control permits.

---

## 1. Plain definition

**Backpressure** = a downstream component's resistance to accepting work,
propagated upstream so producers slow to match consumer capacity — instead of
the alternative: unbounded buffering (memory death), silent dropping (data
death), or collapse (everything death).

Analogy: a highway on-ramp meter. When the highway is full, cars queue at the
ramp, then on surface streets, then people delay leaving home — the congestion
signal propagates *backward* through the system until it reaches an actor who
can actually reduce demand. The alternative — everyone merges anyway — is
gridlock: maximum occupancy, minimum throughput (the goodput collapse, again).

The core design truth: **pressure always goes somewhere.** If you don't design
where it accumulates (bounded buffers with visible depth), it accumulates where
you didn't choose — heap, socket buffers, thread pools, or your users'
patience. Backpressure design = choosing the pressure vessel and instrumenting
it.

---

## 2. How it works in practice: the mechanisms

### 2.1 The three primitive responses to a full buffer

Every system composes these three:
1. **Block** (synchronous backpressure): the producer's write waits —
   `BlockingQueue.put()`, TCP write blocking when the window closes.
   Propagates pressure perfectly and *couples* tiers (a stalled consumer
   stalls producers into *their* callers' timeouts).
2. **Signal** (asynchronous flow control): the consumer grants explicit
   *credits/permits* for how much it can take; the producer sends only
   against credit. Reactive Streams' `request(n)`, TCP's receive window,
   gRPC/HTTP-2 flow-control windows, Storm's max.spout.pending, Pulsar
   consumer receiver queues. Decouples via bounded in-flight windows.
3. **Refuse/drop** (shedding): reject at the boundary — covered in the
   shedding doc; the honest terminus when neither blocking nor buffering
   is affordable.

### 2.2 Credit-based flow control (the pattern behind everything modern)

The consumer advertises capacity N (a window/credits); the producer may have
at most N unacknowledged items in flight; each consumption/ack replenishes
credit. Properties: in-flight work is *bounded by construction* (Little's law
made structural: in-flight ≤ N regardless of producer enthusiasm), and the
signal is *proactive* (producer knows before sending, vs discovering via
timeout). Instances you should be able to rattle off:
- **TCP receive window:** receiver advertises buffer space; sender stops at
  zero window — backpressure at the transport layer, invisible and
  universal.
- **HTTP/2 / gRPC:** per-stream + per-connection windows — a slow gRPC
  consumer flow-controls the sender at the protocol level.
- **Reactive Streams (`request(n)`):** the JVM standard (Project Reactor,
  RxJava, Akka Streams) — subscriber pulls capacity, publisher pushes only
  against demand.
- **Storm `max.spout.pending`:** ≤ N incomplete tuple trees per spout —
  covered mechanically in `03-storm-and-stream-processing.md` §2.3.
- **Pulsar consumer receiver queue:** the client pre-fetches up to
  `receiverQueueSize` messages using permit-based flow control with the
  broker; a slow handler stops replenishing permits → broker stops
  dispatching to it → backlog accrues *at the broker*, durably.

### 2.3 Where brokers change the game: the durable pressure vessel

A message broker is a deliberately *huge, durable* buffer inserted between
producer and consumer — backpressure's shape changes:
- Producers rarely feel consumer slowness at all (the broker absorbs);
  pressure becomes **backlog** — visible, measurable, durable (5-day
  retention = an enormous vessel).
- The signal is no longer "producer blocked" but **backlog depth and — the
  better metric — backlog AGE / consumer lag** (Kafka: consumer lag in
  offsets and time; Pulsar: subscription backlog + oldest-unacked age).
  Depth lies when drain rate varies; age is the direct measurement of
  lateness (the argument from the shedding doc, now with its mechanism).
- The failure mode moves too: not producer stall but **retention outrun**
  (lag > retention ⇒ data loss — the CDC cliff, `07-cdc.md` P4) and
  **backlog quotas** (Pulsar can bound per-subscription backlog and then
  either block producers, drop oldest, or refuse — the three primitives
  again, as namespace policy **[VERIFY your platform's quota settings]**).
- The consumer side becomes a *drain-rate control problem*: scale consumers
  on backlog trend (your queue-depth-based worker scaling), and shed
  upstream when age crosses tolerance (your two-stage story).

### 2.4 Backpressure through a pipeline (multi-stage propagation)

Stage C slows → its input buffer fills → stage B's sends block/lose credit →
B slows → A... Each hop adds buffer (latency) before the signal reaches the
true producer. Design rules:
- **Bounded buffers everywhere** — one unbounded queue anywhere converts
  backpressure into an OOM with a delay fuse.
- **The signal must reach an actor who can reduce demand** — if the
  ultimate producer is the public internet, the "actor" is your admission
  control (shedding); backpressure inside, shedding at the edge.
- **Amplification stages invert the math:** a stage that fans out 1→10
  (your CDC qualifier filter's *inverse*) transmits pressure upstream at
  10× sensitivity; a stage that calls a rate-limited partner converts
  *its* limit into everyone's ceiling — bulkhead it so its pressure
  doesn't stall unrelated flows (`05-resilience/03-bulkheads.md`).
- **Flink's instance** (name-drop with mechanism): credit-based network
  flow control between operators — a slow operator withholds credits,
  pressure propagates to sources, which throttle consumption; checkpoint
  barriers ride the same channels (severe backpressure → slow/failed
  checkpoints — "checkpoint alignment backpressure," the operational term
  from `03-storm...md` P5).

---

## 3. Senior-level depth

- **Backpressure is load-shedding's honest sibling — pick per link:**
  block/buffer preserves work but propagates latency and coupling; shed
  loses work but decouples. The decision variable (from the shedding doc,
  now at link granularity): is this link's work *deferrable* (buffer it,
  bounded by usefulness-age), *droppable* (shed/sample), or neither
  (provision headroom so the question rarely arises — and then still
  choose, for the day it does)?
- **The hidden backpressure audit** (where pressure hides in default
  configs): unbounded executor queues
  (`Executors.newFixedThreadPool` = unbounded LinkedBlockingQueue — the
  classic JVM OOM-with-delay), unbounded client retry queues, socket
  buffers absorbing megabytes before anyone blocks, and producer-client
  internal buffers (Kafka producer `buffer.memory`: when full, `send()`
  blocks `max.block.ms` then throws — many teams discover their
  "non-blocking" producer blocks under broker slowness). An L5 can walk a
  request path naming every buffer and its bound.
- **Backpressure vs autoscaling interplay:** the backlog is also the
  autoscaler's signal (scale consumers on backlog trend/age). Subtlety:
  scaling consumers moves the bottleneck downstream (10× consumers now
  hammer the database/partner) — backpressure must exist at *every* stage
  or scaling one stage just relocates the collapse. Your platform's
  version: more Storm workers ⇒ more PSP concurrency ⇒ partner limits —
  bounded by the Hystrix pools; the chain is designed, say it.
- **Slow-consumer isolation in multi-tenant brokers:** one lagging
  subscription must not degrade others — Pulsar's per-subscription
  backlog quotas, dispatch rate limits, and (operationally) the
  cache-vs-disk read split: a deeply-lagging consumer reads cold segments
  from bookies instead of broker cache, protecting hot-path consumers
  (the architecture dividend of segment storage — `02-pulsar-vs-kafka.md`).
  The Kafka analog concern: laggards evict page cache, hurting everyone —
  mitigated by follower-fetch/tiered storage designs.
- **L4/L5/L6:** L4 — "the queue buffers spikes; we autoscale consumers."
  L5 — the three primitives, credit-based mechanics across the stack
  (TCP→gRPC→Reactive→Storm→Pulsar), age-over-depth, bounded-buffer audit,
  pipeline propagation with amplification, shedding handoff. L6 —
  pressure-vessel architecture as an org standard: every async boundary
  declares its bound and overflow policy; capacity planning from
  drain-rate math; multi-tenant isolation policy.

---

## 4. Resume connection

Your resume line — "payment workers scale horizontally via queue-depth
back-pressure" — now has three defensible layers:

1. **Micro (in-flight windows):** Pulsar consumer receiver queues +
   Storm max.spout.pending bound in-flight work per worker — credit-based
   flow control; a slow PSP call stops permit replenishment, dispatch to
   that worker pauses, pressure lands at the broker.
2. **Meso (the durable vessel):** the subscription backlog absorbs
   demand-vs-drain mismatch durably (5-day retention); the *age* of the
   oldest unacked message is the SLI; workers scale on backlog trend
   **[FILL: manual or automated — the arsenal VERIFY stands]**.
3. **Macro (the shedding handoff):** when backlog age crosses product
   tolerance, the gateway sheds new submissions — backpressure inside,
   admission control at the edge, exactly the design rule from §2.4
   because your ultimate producer (users) can't be flow-controlled.
Plus the downstream chain: worker scale-out pressure lands on the PSP —
bounded by Hystrix bulkheads, so scaling consumers can't relocate the
collapse to the partner.

**30–60 s spoken answer** ("how does backpressure work in your platform?"):

> "Three layers, each with a designed bound. In-flight: credit-based flow
> control — Pulsar consumers hold a bounded receiver queue of permits and
> Storm caps incomplete tuple trees per spout, so a slow PSP call stops
> permit replenishment and dispatch to that worker pauses; nothing
> accumulates in worker memory. Durable: the pressure vessel is the
> subscription backlog itself — five-day retention means a demand spike
> becomes measurable, durable lag instead of failures, and the SLI is
> backlog *age*, not depth, because age directly measures how late
> payments are resolving while depth lies whenever drain rate varies.
> Workers scale on backlog trend. And the edge: users can't be
> flow-controlled, so when backlog age approaches product tolerance the
> gateway sheds new submissions — backpressure inside the pipeline,
> admission control at the boundary. The part people miss is the
> downstream half: scaling consumers just relocates the bottleneck to the
> partner, so the PSP-facing side is bounded by dedicated bulkheads —
> pressure has a designed place to accumulate at every stage, which is
> the whole discipline: pressure always goes somewhere; you choose where."

---

## 5. What the interviewer will push on

**P1. "Walk me through what happens, mechanism by mechanism, when your PSP
slows from 100 ms to 5 s."**
- *Model:* trace the chain: PSP latency ↑ → Hystrix pool fills (bulkhead)
  → tuples fail/timeout or complete slowly → tuple trees stay open →
  max.spout.pending window fills → spouts stop pulling → consumer permits
  stop replenishing → broker stops dispatching → backlog depth and age
  climb (dashboards) → alerts on age trend → workers *can't* help (the
  bottleneck is the partner, not consumer capacity — scaling would just
  fill the bulkhead faster) → breakers open on the PSP commands →
  degraded/fallback behavior + backlog absorbs in-flight demand → recovery
  drains backlog, age recovers. The killer sentence: "queue-depth
  backpressure correctly *refused* to solve this — the signal told us the
  bottleneck was downstream, which is exactly what it's for."
- *Trap:* "we'd scale the workers" — scaling consumers against a
  downstream bottleneck is the relocation error; the question tests
  whether you read the signal before reaching for the knob.

**P2. "Bounded or unbounded queue between two services you own? Defend a
size."**
- *Model:* always bounded — unbounded is an OOM with a delay fuse and it
  *hides* the pressure signal until collapse. Size from purpose: the
  buffer exists to absorb *variance*, not sustained mismatch — size ≈
  burst duration you must absorb × arrival-rate delta, bounded above by
  (a) memory and (b) the latency the last slot implies (slot k waits
  k/drain-rate — if that exceeds the caller's deadline, the slot is
  manufacturing dead work: CoDel logic). Sustained mismatch is a
  capacity/shedding problem no queue size fixes. Then the overflow
  policy: block, signal, or shed — chosen per the deferrable/droppable
  test.
- *Trap:* a size with no derivation, or "unbounded so we never lose
  anything" — you lose everything later instead.

**P3. "Explain Reactive Streams' request(n) and what problem it solves
that callbacks/push APIs don't."**
- *Model:* push APIs deliver at the producer's pace; a slow subscriber's
  only options are buffer (unbounded → OOM) or drop. Reactive Streams
  inverts control: the subscriber *requests* n items; the publisher may
  deliver at most n until re-requested — demand-driven, in-flight bounded
  by construction, composable through operator chains (each stage
  propagates demand upstream). It standardizes credit-based flow control
  at the library level — same idea as TCP windows and Pulsar permits, one
  abstraction level up. Mention: virtual threads offer the *blocking*
  style with cheap threads as the modern alternative for simple cases —
  blocking IS backpressure when threads are free.
- *Trap:* describing it as "async programming" — the flow-control
  contract (demand signaling), not asynchrony, is the content.

**P4. "Your backlog is growing. Decision procedure: when is it fine, when
do you scale, when do you shed?"**
- *Model:* three questions in order. (1) *Age vs tolerance:* growing depth
  with age well inside product tolerance = the vessel doing its job
  (absorbing a burst) — watch, don't act. (2) *Where's the bottleneck:*
  consumer-capacity-bound (workers saturated, downstream healthy) ⇒ scale
  consumers; downstream-bound (bulkheads full, breaker states, partner
  latency) ⇒ scaling is relocation — degrade/wait instead. (3) *Age
  approaching tolerance with no drain in sight* ⇒ shed at admission
  (Retry-After), protect the promises already in the queue over new ones.
  Wrap with the metrics that answer each question: age trend, worker
  utilization vs downstream latency/breaker state, drain-rate projection.
- *Trap:* any single-branch answer ("scale it"). The procedure — and
  reading the bottleneck before acting — is the entire assessment.

**P5. "Name every buffer between a user's pay tap and the PSP call, with
its bound and overflow behavior."** (the audit question — brutal and fair)
- *Model:* walk it: client HTTP connection (OS socket buffers, TCP
  windows) → LB connection queues → gateway Jetty acceptor/worker queue
  (**bounded? [VERIFY — Dropwizard defaults]**) → downstream client
  connection pools (bounded, blocks/rejects) → txn-svc same shape → HBase
  client buffers → Pulsar producer internal buffer (bounded,
  send() blocks-then-fails) → broker/bookie (durable, retention-bounded)
  → consumer receiver queue (receiverQueueSize) → Storm spout pending
  (max.spout.pending) → bolt executor queues (bounded, Storm-managed) →
  Hystrix pool + queue (200/~20, rejects) → OkHttp connection pool →
  partner. The point is not perfection — it's demonstrating the audit
  *instinct* and knowing which bounds you've verified vs assumed. Close:
  "the ones I'd check first are the ones I didn't configure explicitly —
  defaults are where unbounded hides."
- *Trap:* freezing, or naming three. Do this audit for real before
  interviews **[action item: trace and note the actual bounds]**.

---

## Self-test

1. State the "pressure always goes somewhere" principle and the three
   primitive responses to a full buffer.
2. Credit-based flow control: mechanism, the property it gives by
   construction, and five instances across the stack.
3. How does a broker change backpressure's shape? Name the new signal,
   the new failure mode, and why age beats depth.
4. Trace pressure propagation through a three-stage pipeline — what does
   each hop add, and where must the signal terminate?
5. Why must every buffer be bounded? What is an unbounded queue "really"?
6. The hidden-buffer audit: four places unbounded buffering hides in
   default JVM/client configs.
7. Scaling consumers can relocate the collapse — explain, and name your
   platform's designed bound at the relocated bottleneck.
8. Pulsar receiver queues and permits: what happens, step by step, when a
   handler blocks for 60 s?
9. The three-question decision procedure for a growing backlog.
10. Blocking vs request(n) vs shedding for: intra-service executor
    handoff, broker consumer, public API edge — pick and justify.
11. Reproduce your three-layer backpressure story (micro/meso/macro) with
    the mechanism at each layer.
12. What is checkpoint alignment backpressure (Flink), and what does it
    illustrate about pressure and control planes sharing channels?

<details>
<summary><b>Answers</b></summary>

1. Demand exceeding capacity must accumulate somewhere — designed or not:
   heap, socket buffers, thread pools, or user patience; design =
   choosing the vessel and instrumenting it. Primitives: block the
   producer (synchronous coupling), signal capacity (credits/windows —
   bounded in-flight), refuse/drop (shedding).
2. Consumer advertises capacity N; producer keeps ≤ N in flight; each
   ack/consumption replenishes credit. Property: in-flight bounded by
   construction (structural Little's law) and the producer knows *before*
   sending. Instances: TCP receive windows, HTTP/2-gRPC stream windows,
   Reactive Streams request(n), Storm max.spout.pending, Pulsar consumer
   receiver-queue permits.
3. The broker is a huge durable vessel: producers stop feeling consumer
   slowness; pressure becomes backlog. New signal: backlog depth and
   (better) age/consumer lag. New failure mode: retention outrun — lag
   beyond retention = permanent gap. Age beats depth because depth's
   meaning depends on drain rate (10k backlog at 10k/s = fine; at 10/s =
   crisis); age measures lateness directly.
4. Stage C slows → C's input buffer fills → B loses credit/blocks → B's
   input fills → A... Each hop adds its buffer's worth of latency before
   the true producer feels anything. The signal must terminate at an
   actor who can reduce demand — internal producers via flow control;
   uncontrollable edges (users) via admission control/shedding.
5. Because the alternative isn't "no limit" — it's a limit you didn't
   choose (heap), reached later, with no signal en route. An unbounded
   queue is an OOM with a delay fuse that also *hides* the pressure
   signal that would have triggered scaling/shedding in time.
6. Executors.newFixedThreadPool's unbounded LinkedBlockingQueue; client
   retry/buffer queues (Kafka producer buffer.memory + max.block.ms
   semantics); OS socket send/receive buffers absorbing MBs silently;
   unbounded in-process caches/batchers (and: HTTP client connection
   queues at default settings).
7. 10× consumers = 10× concurrency against the next stage (DB, partner);
   if that stage was the true bottleneck, you've moved the collapse
   downstream where it may be less protected. Platform bound: PSP-facing
   Hystrix thread pools (200/queue ~20) cap partner concurrency
   regardless of worker count — the relocation is stopped by the
   bulkhead.
8. Handler blocks → messages sit in the receiver queue unacked → the
   client stops sending permit replenishment as the queue stays full →
   broker stops dispatching to this consumer (other consumers on a
   shared subscription keep receiving) → backlog accrues at the broker;
   if unacked past ack-timeout, messages redeliver (possibly to others).
   Nothing unbounded accumulates in the consumer process.
9. (1) Is backlog *age* within product tolerance? Yes ⇒ the vessel is
   working; observe. (2) Where is the bottleneck — consumers saturated
   with healthy downstream ⇒ scale consumers; downstream signals
   (bulkheads full, breakers, partner latency) ⇒ don't scale, degrade/
   wait. (3) Age approaching tolerance with no drain projection ⇒ shed
   new work at admission with Retry-After, protecting queued promises.
10. Executor handoff: block (bounded queue + caller-runs/block policy) —
    same process, coupling is fine and preserves work. Broker consumer:
    credits/permits (receiver queue) — decoupled, bounded, durable vessel
    behind it. Public edge: shed (429/Retry-After) — users can't be
    flow-controlled; buffering user requests manufactures dead work.
11. Micro: permit/window flow control (receiver queues,
    max.spout.pending) bounds in-flight per worker — slow calls pause
    dispatch. Meso: durable subscription backlog absorbs mismatch;
    age-based SLI; consumers scale on trend. Macro: age-crossing-
    tolerance triggers gateway admission shedding; downstream, bulkheads
    bound the partner-facing concurrency so consumer scaling can't
    relocate collapse.
12. Flink checkpoint barriers travel the same network channels as data;
    under backpressure, barriers are stuck behind buffered data, so
    checkpoints slow or time out (alignment waits amplify it) —
    degraded pressure handling degrades the *reliability* mechanism,
    not just latency. Illustrates: when control signals share the data
    plane, backpressure becomes a correctness/recovery concern —
    budget headroom for the control plane (or use unaligned
    checkpoints, Flink's own fix).

</details>
