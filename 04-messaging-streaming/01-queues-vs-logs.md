# Queues vs Logs

Two data structures pretending to be one product category. Half the confusion in
messaging interviews ("why Kafka over RabbitMQ?", "is Pulsar a queue?") dissolves
the moment you separate them. This doc builds both from first principles and
shows why your platform needed *both semantics* — and got them from one system.

---

## 1. Plain definition

A **message queue** is a mutable collection with work-distribution semantics:
producers add messages; competing consumers *take* them; a consumed-and-
acknowledged message is **gone**. The queue's job is to get each message
processed by **exactly one worker**, tracking per-message state (unacked,
redelivered, dead-lettered) to make that happen. Think: a stack of orders on a
restaurant spike — each cook grabs one, and once cooked it's off the spike.

A **log** is an immutable, append-only sequence with data-distribution
semantics: producers append; the log *keeps everything* (until retention
expires); consumers don't remove anything — each consumer just remembers **how
far it has read** (an offset/cursor). Think: the restaurant's CCTV tape — any
number of people can watch it, at their own pace, from any point, repeatedly,
and watching doesn't erase it.

The one-sentence separation: **a queue tracks the state of each message; a log
tracks the state of each consumer.** Everything else — replay, fan-out cost,
ordering, scaling models — falls out of that inversion.

---

## 2. How each works in practice

### 2.1 Queue semantics (RabbitMQ, SQS, ActiveMQ; Pulsar shared subscriptions)

- **Competing consumers:** N workers pull from one queue; the broker hands each
  message to exactly one (until it times out/nacks). Adding workers adds
  throughput linearly with zero re-partitioning — elastic by construction.
- **Per-message lifecycle:** delivered → acked (deleted) | nacked/timed out
  (redelivered, possibly with delay/backoff) → attempts exhausted → DLQ. The
  broker is "smart": it owns retry state, visibility timeouts, delays,
  priorities, dead-lettering.
- **No replay:** acked = gone. Yesterday's messages cannot be reprocessed; a
  new consumer sees only the future.
- **Ordering:** generally none once you have competing consumers + redelivery
  — and that's *fine* for work distribution (jobs are independent) but must be
  explicit (see `05-ordering.md`).
- **Fan-out** (multiple independent consumer *groups* each wanting every
  message) requires broker features: exchanges/bindings duplicating messages
  into per-consumer queues — each copy stored separately. Cost scales with
  subscriber count.

### 2.2 Log semantics (Kafka; Pulsar topics under the hood)

- **Offsets, not deletion:** each consumer group stores "I've read to offset
  X" — one integer per partition. Consumption is a *read*, not a *take*.
- **Replay is free:** rewind the offset and reprocess — the feature that
  changes architectures: bug in the consumer? Fix, rewind, re-run. New
  analytics team? Point them at offset 0. This turns the bus into a
  short-term source of truth, not just a conduit.
- **Fan-out is free:** ten consumer groups = ten cursors over ONE stored copy.
  Cost of a subscriber ≈ read bandwidth, not storage.
- **Retention by policy, not consumption:** time/size-based (your platform:
  ~5 days), or compaction (keep latest per key — a materialized-state hybrid).
- **Parallelism = partitioning:** consumers in a group split *partitions*, not
  messages; max useful consumers = partition count (Kafka's classic
  constraint), and per-partition order is the compensation.
- **"Dumb broker, smart consumer":** the broker appends and serves ranges;
  retry/delay/DLQ logic is the consumer's problem (or bolted on via retry
  topics).

### 2.3 The trade summarized

| Dimension | Queue | Log |
|---|---|---|
| Message after consumption | Deleted | Retained until retention |
| Consumer scaling | Add workers freely | Bounded by partitions (Kafka) |
| Replay | No | Yes — the killer feature |
| Fan-out | Per-subscriber copies | Free (cursors) |
| Ordering | None (competing) | Per partition/key |
| Retry/delay/DLQ | Broker-native | DIY (retry topics) or platform sugar |
| Natural fit | Jobs, tasks, commands | Events, facts, changelogs, CDC |

The semantic razor: **commands vs events.** A command ("execute this payment")
wants exactly-one-worker, per-message retry, no replay of old commands — queue.
An event ("this payment reached SUCCESS") is a fact many systems care about,
forever-true, replayable — log. Most platforms need both; the design smell is
forcing one shape through the other's tool.

---

## 3. Senior-level depth

- **Pulsar's unification (why your platform gets both from one system):**
  Pulsar stores every topic as a log (BookKeeper segments) and layers
  *subscription modes* on top: **exclusive/failover** = log semantics
  (ordered, one consumer, cursor-based); **shared** = queue semantics
  (competing consumers, per-message acks, nacks, redelivery, delays, DLQ
  policy) over the same stored log; **key_shared** = the hybrid (per-key
  order with competing consumers). So the queue/log choice becomes per-
  *subscription*, not per-deployment — the same payment-events topic can be a
  work queue for execution workers AND a replayable log for a new audit
  consumer. This is the architectural answer to "is Pulsar a queue or a
  log?": "the storage is a log; the subscription decides."
- **Replay is not free *for you*:** replaying a log re-executes side effects
  — safe only against idempotent consumers (`05-resilience/07-idempotency.md`).
  Log advocates say "just replay"; seniors add "into what?" A replayed
  payment-event stream must hit state-machine-guarded handlers or you've
  weaponized your own history. Also: replay competes for the same consumer
  capacity as live traffic — throttle it or brown out the present to repair
  the past.
- **Queue anti-pattern — the database-as-queue:** polling a table with
  `SELECT ... FOR UPDATE SKIP LOCKED` is a legitimate small-scale queue and a
  scaling trap (lock contention, polling load, no fan-out). Know it as the
  budget option and where it caps out (~hundreds-to-low-thousands msg/s,
  fine for many internal jobs **(estimate)**).
- **Log anti-pattern — infinite retention as a database:** "Kafka is our
  source of truth forever" runs into unbounded storage, slow rewinds
  (rebuilding state = re-reading everything), and schema drift across years
  of events; the mature versions are compacted topics (latest-per-key) or
  tiered storage + snapshots. Event sourcing is a *discipline*, not a
  retention setting.
- **L4 vs L5 vs L6:** L4 picks "Kafka because scale" or "RabbitMQ because
  simple." L5 chooses per *semantics* (commands vs events, replay needs,
  fan-out count, ordering scope), knows the DIY costs each side hides
  (retry topics on logs; fan-out copies on queues), and can name the
  unification (Pulsar subscriptions). L6 designs the *event fabric*: which
  topics are contracts vs internals, retention/compaction as data-lifecycle
  policy, replay as an operational capability with governance.

---

## 4. Resume connection

- **Your payment execution path is queue semantics:** Pulsar shared
  subscription, competing Storm workers, per-message ack, nack→redelivery
  with backoff, DLQ policy. Commands ("execute this payment") — exactly the
  right shape, and elastic worker scaling (no repartitioning to add
  consumers) is why queue-depth-based scaling works cleanly.
- **Your CDC/analytics fan-out is log semantics:** HBase mutations →
  Pulsar → multiple independent downstream consumers (FDP topologies per
  entity type), each with its own subscription cursor, lag-tolerant,
  replayable after a consumer bug **[VERIFY whether you ever replayed a CDC
  subscription in anger — a real replay story is gold]**.
- **The callback-buffering fix leaned on queue-side features:** broker-side
  delayed delivery + negative-ack redelivery — the exact features that are
  DIY-on-Kafka (delay topics + consumer-side scheduling). One honest
  sentence: "on Kafka, my callback fix would have been three components
  instead of one subscription setting."
- **You can now answer "queue or log?" about your own bus precisely:**
  storage is a log; execution consumes it as a queue (shared), analytics as
  a log (independent cursors). That sentence upgrades you from user to
  architect of the messaging layer.

**30–60 s spoken answer** ("queues vs logs — how do you think about them?"):

> "A queue tracks the state of each message; a log tracks the state of each
> consumer — everything else follows. Commands want queues: our payment
> execution runs on a Pulsar shared subscription, competing workers,
> per-message acks and redelivery, because 'execute this payment' must be
> processed by exactly one worker and never replayed as a command. Events
> want logs: our CDC stream fans out to analytics consumers as independent
> cursors over one stored copy — fan-out is free and replay is possible,
> which is the killer feature, though replay is only safe because our
> consumers are idempotent; replaying history into non-idempotent handlers
> weaponizes it. Pulsar's trick — and why we run both semantics on one
> system — is that storage is always a log and the subscription mode decides
> the semantics: shared gives you the work queue, exclusive gives you the
> ordered log, over the same topic. On Kafka, the queue-side features we
> leaned on — broker-side delays, negative acks, subscription-level DLQ —
> would have been hand-rolled retry-topic machinery."

---

## 5. What the interviewer will push on

**P1. "Kafka or RabbitMQ for X?" (X = order processing / notifications /
audit trail / image-resize jobs)**
- *Model:* apply the razor per case, not per brand. Audit trail: log —
  immutable facts, replay, many readers. Image-resize jobs: queue —
  independent commands, elastic workers, per-message retry, zero replay
  value. Notifications: queue-ish (commands) but fan-out by channel suggests
  a log feeding per-channel queue consumers — hybrid is a legitimate answer.
  Order processing: events (state changes) on a log + command queues for
  side-effect workers. Always name the DIY tax of the "wrong" choice rather
  than declaring impossibility.
- *Trap:* brand-first answers ("Kafka, it scales more"). Both scale; the
  semantics differ.

**P2. "You need delayed retries (5 min backoff) on Kafka. Design it, then
tell me what Pulsar gives you instead."**
- *Model:* Kafka has no per-message delay (a delayed message would block its
  partition — head-of-line, because offsets are sequential). Standard
  design: retry topics per delay tier (`retry-5m`, `retry-30m`) + a consumer
  that reads, checks the target timestamp, waits/pauses partitions until
  due, then republishes to the main topic; attempts tracked in headers; DLQ
  topic after N. Works, but it's real machinery (extra topics, a scheduler-
  consumer, ordering surrendered). Pulsar: `deliverAfter()` /
  negative-ack-with-backoff + subscription DLQ policy — broker-native,
  because per-message state is a first-class citizen. The deep *why*: Kafka's
  minimal per-message state (just offsets) is the same design choice that
  makes it fast and makes delays awkward — one root cause, two consequences.
- *Trap:* "just sleep in the consumer" (blocks the partition/worker,
  destroys throughput, rebalance storms on max.poll.interval) — the classic
  wrong answer they're fishing for.

**P3. "Ten teams want your payment events. Walk me through fan-out cost on a
queue system vs a log."**
- *Model:* queue: ten bindings → ten queue copies → 10× storage/write
  amplification at the broker, per-subscriber retry state, and adding team
  #11 is a broker config change. Log: one stored copy, eleven cursors —
  cost is read bandwidth only; adding a consumer group is self-service and
  invisible to others (isolation caveat: shared broker/bookie read capacity
  — one team's full-history replay can hit cache/disk enough to affect
  others; mention backlog quotas/rate limits). This asymmetry is THE reason
  event distribution converged on logs.
- *Trap:* forgetting the shared-capacity caveat — "fan-out is free" is 90%
  true and the missing 10% is what pages you.

**P4. "When is a database table the right queue?"**
- *Model:* when volume is modest (≤ ~1k jobs/s), you already need
  transactional coupling with business data (enqueue atomically with the
  state change — the poor man's outbox), operational simplicity dominates,
  and consumers are few. `FOR UPDATE SKIP LOCKED` + status columns +
  attempt counts is honest engineering at that scale. It stops being right
  when: polling load hurts, fan-out appears, retention/replay wanted, or
  throughput grows — then CDC/outbox the table into a real bus. Respecting
  the humble option while knowing its ceiling is a senior tell.
- *Trap:* sneering at it ("never do that") — interviewers who've shipped
  small systems know it's often the right V1.

---

## Self-test

1. State the one-sentence inversion that separates queues from logs, and
   derive two consequences from it.
2. Why is fan-out nearly free on a log and expensive on a queue? What's the
   caveat on "free"?
3. Why can't Kafka do per-message delays naturally? Connect it to the same
   root cause as Kafka's speed.
4. Commands vs events: define, and classify four message types from your
   platform.
5. What makes replay dangerous, and what two disciplines make it safe?
6. How does Pulsar dissolve the queue-vs-log choice? Name the mode that
   gives each semantic.
7. Kafka consumer-group parallelism: what bounds it, and what does a queue
   system offer instead?
8. Design delayed retries on Kafka (components + what you surrender), then
   the Pulsar one-liner.
9. Database-as-queue: the mechanism, the ceiling, and the graduation path.
10. Your platform: which subscription consumes payment events as a queue,
    and what consumes the "same shaped" data as a log?
11. What is log compaction and which hybrid need does it serve?
12. A replay of 3 days of CDC events must not brown out live analytics.
    Name two controls.

<details>
<summary><b>Answers</b></summary>

1. "A queue tracks the state of each message; a log tracks the state of each
   consumer." Consequences: (a) queues can retry/delay/DLQ per message
   natively, logs must bolt it on (no per-message state); (b) logs get free
   fan-out and replay (cursors over one copy), queues need per-subscriber
   copies and lose history on ack. (Also: consumer scaling — workers vs
   partitions.)
2. Log: one stored copy, N cursors — adding a subscriber costs read
   bandwidth only. Queue: each subscriber needs its own message copy with
   its own lifecycle state — storage/write amplification per subscriber.
   Caveat: subscribers share broker/storage read capacity; a full-history
   replay by one group can evict caches/saturate disks for all — quotas and
   rate limits still needed.
3. Kafka's per-message state is one integer per partition per group (the
   offset); delivery is strictly sequential per partition, so a "not yet
   due" message would block everything behind it (head-of-line). The same
   minimal-state design is why Kafka is fast (sequential I/O, no
   per-message bookkeeping) — one root choice, both consequences.
4. Command: an instruction to do work once ("execute this payment",
   "send this notification") — queue shape. Event: an immutable fact
   ("txn reached SUCCESS", "HBase row mutated" CDC) — log shape.
   Platform: SendMoneyProduceEvent = command (queue); notification trigger
   = command (queue); CDC mutation stream = events (log); mandate status
   callbacks = events consumed with queue machinery (buffered commands to
   update state — hybrid, defensible either way if argued).
5. Replay re-executes side effects and competes with live traffic. Safe
   via: idempotent/state-machine-guarded consumers (replays become no-ops
   on already-applied transitions), and throttled/isolated replay (rate
   limits, off-peak, separate consumer capacity).
6. Storage is always a BookKeeper-backed log; the subscription mode selects
   semantics: shared = competing-consumer work queue (per-message ack,
   nack, delays, DLQ); exclusive/failover = ordered single-consumer log
   cursor; key_shared = per-key order with shared scaling.
7. Max useful consumers in a group = partition count (parallelism unit is
   the partition). Queues hand out individual messages, so workers scale
   until the broker or the work itself saturates — no repartitioning
   event, no rebalance storms.
8. Tiered retry topics + delay-consumer (reads, pauses until due,
   republishes) + attempt headers + DLQ topic. Surrendered: per-key
   ordering across retries, simplicity (extra topics + a scheduler
   component), and rebalance sensitivity. Pulsar: deliverAfter()/negative
   ack with backoff + subscription-level deadLetterPolicy.
9. `SELECT ... FOR UPDATE SKIP LOCKED` with status/attempt columns; ceiling
   ~low-thousands msg/s from lock + poll contention, no fan-out/replay;
   graduate by CDC/outbox-ing the table into a real bus when volume,
   subscribers, or retention needs appear.
10. Queue: the Storm execution consumers on a shared subscription of the
    payment-execution topic (competing workers, per-message ack/redelivery,
    DLQ). Log: FDP/analytics consumers on CDC topics — independent
    subscriptions/cursors, lag-tolerant, replayable.
11. Retain only the latest record per key (compaction) — a log that
    converges to a materialized table. Serves the "changelog as state"
    hybrid: bootstrap consumers/state stores from the compacted topic
    without unbounded history.
12. Throttle the replay consumer (dispatch rate limits / paced fetch), and
    isolate capacity — separate subscription with backlog quotas, off-peak
    scheduling, or dedicated consumers — so live subscriptions keep their
    read bandwidth. (Also: idempotent sinks so overlap is harmless.)

</details>
