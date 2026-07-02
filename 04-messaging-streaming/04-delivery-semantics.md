# Delivery Semantics — At-Most-Once, At-Least-Once, and the Exactly-Once Myths

The consumer-side idempotency story lives in `05-resilience/07-idempotency.md`.
This doc owns the other half: where duplicates and losses are *born* — producer
acks, broker replication, consumer ack protocols — and the precise anatomy of
"exactly-once" claims, which is the single most reliable place to sort L4 from
L5 in a messaging interview.

---

## 1. Plain definition

Delivery semantics answer one question: **if machines and networks fail at the
worst moment, how many times does a message's effect happen?**

- **At-most-once:** 0 or 1. Fire and forget; failures lose messages, never
  duplicate them.
- **At-least-once:** 1 or more. Failures duplicate messages, never lose them.
- **Exactly-once:** exactly 1 — the marketing term. The precise truth: 
  exactly-once *delivery* across arbitrary boundaries is impossible;
  exactly-once *processing/state-update* within a transactional scope is real
  and shipping; exactly-once *external side effects* reduces to at-least-once
  + idempotency. Hold those three apart and you win the topic.

The root cause, one more time (it underlies this whole repo): an
acknowledgment can always be lost. If A does work and the ack to B vanishes,
B must choose — assume done (risk loss) or redo (risk duplication). Two
Generals. Every "semantics" is just a policy about which risk you take and
which machinery you buy to shrink it.

---

## 2. Where duplicates and losses are born (the full audit)

### 2.1 Producer → broker

- **Fire-and-forget / acks=0:** producer doesn't wait. Broker crash, network
  drop ⇒ silent loss. At-most-once. (Metrics, best-effort telemetry.)
- **acks=1 (leader only, Kafka):** leader has it, followers may not; leader
  dies before replication ⇒ acked-but-lost. A loss window most people forget
  they're running.
- **acks=all / quorum ack (Kafka ISR, BookKeeper ack-quorum):** durable at
  ack. But now the *producer retry* problem: producer times out waiting for
  the ack (which was sent but lost) → retries → **broker has it twice**.
  At-least-once is born on the *produce* path, before any consumer exists.
- **The fix — broker-side producer dedup:** Kafka **idempotent producer**:
  each producer gets a PID; each message a sequence number per partition;
  the broker accepts each (PID, partition, seq) once — retries dedupe at the
  door. Pulsar equivalent: **broker deduplication** (producer name +
  sequence ID, enabled per namespace **[VERIFY whether your platform enables
  it — if not, produce-path duplicates are absorbed by your consumer-side
  identity, which is a legitimate answer]**). Scope caveat: dedup state is
  per producer *session/partition* — a producer that restarts with a new
  identity (or an app-level retry above the client) is a new producer;
  application-level intent identity is still the outer wall.

### 2.2 Broker internals

- Replication + fsync policy decide acked-durability (covered in
  `02-pulsar-vs-kafka.md`); unclean leader election (Kafka: electing an
  out-of-ISR replica) can *lose acked data* — disabled by default; know the
  knob exists.
- Retention expiry and DLQ overflow are *policy* losses: the system worked
  as configured and the data is gone. TTLs on queues are silent-drop bugs
  waiting for a business owner (`05-resilience/01-timeouts.md`).

### 2.3 Broker → consumer (the ack protocol decides everything)

The same three semantics re-emerge from *when the consumer acknowledges*:

- **Ack-before-process** (or auto-ack on delivery): crash after ack, before
  processing ⇒ message gone, work never done. At-most-once.
- **Ack-after-process:** crash after processing, before ack ⇒ redelivery ⇒
  work done twice. At-least-once. This is the correct default for anything
  that matters, and it is why consumer idempotency is non-optional.
- **Kafka's version:** the "ack" is the committed offset. Auto-commit on a
  timer = commits may run *ahead* of processing (at-most-once-ish loss on
  crash) or behind (duplicates) depending on timing — the classic subtle
  default; manual commit-after-process restores clean at-least-once.
  Rebalances add their own replay: partition moves to a new consumer, which
  resumes from the last *committed* offset — everything processed-but-
  uncommitted replays.
- **Pulsar's version:** per-message acks; unacked-within-ack-timeout or
  nacked ⇒ redelivery; cumulative ack (everything up to X) vs individual
  ack (ranges + holes — `02-pulsar-vs-kafka.md` P5).

### 2.4 The complete duplicate-factory list (memorize as a checklist)

Producer retry after lost ack · consumer crash between process and ack ·
ack/commit lost in transit · rebalance/subscription-failover replay ·
redelivery on timeout while processing merely ran long (slow ≠ dead!) ·
DLQ re-drive / recon replay · deliberate rewind/backfill. Seven sources;
any system claiming "we don't get duplicates" has simply not audited them.

---

## 3. Senior-level depth: the anatomy of real "exactly-once"

### 3.1 Kafka EOS (transactions) — what it actually is

The consume-**process**-produce loop, made atomic *within Kafka*:
1. Idempotent producer (PID + sequences) kills produce-path duplicates.
2. **Transactions:** the producer writes output messages AND the input
   offsets ("I consumed up to X") inside one transaction, coordinated by a
   transaction coordinator via markers in the logs.
3. Downstream consumers set `isolation.level=read_committed` — they never
   see aborted writes.
Crash mid-loop ⇒ transaction aborts ⇒ outputs invisible, offsets uncommitted
⇒ reprocessing produces the outputs again, atomically, once. Result:
**exactly-once from Kafka topic to Kafka topic**. The moment your processor
calls an HTTP API, sends an email, or writes a non-transactional store
*inside* the loop — that effect escapes the transaction and replays on
abort. Scope, scope, scope.

### 3.2 Flink's version

Checkpointed state (barrier snapshots — `03-storm-...md`) gives exactly-once
*state updates*; end-to-end requires **two-phase-commit sinks** tied to
checkpoint completion (Kafka transactional sink: pre-commit on checkpoint
barrier, commit on checkpoint-complete notification). Same boundary: 2PC
sinks exist for transactional targets, not for your PSP.

### 3.3 The honest hierarchy (say it this way)

1. Exactly-once **delivery**, end-to-end, arbitrary boundaries: impossible
   (Two Generals).
2. Exactly-once **state/processing** within one transactional scope (Kafka
   EOS, Flink checkpoints+2PC-sinks): real, shipping, valuable — and
   scoped.
3. Effectively-once **effects** everywhere else: at-least-once delivery +
   identity/idempotency at the effector — the universal, boundary-crossing
   answer, and the one your platform runs on.

The interview power move: when someone says "exactly-once," ask (or
volunteer) **"exactly-once *what*, across *which* boundary?"** — then place
their system on the hierarchy.

### 3.4 Choosing semantics per stream (the design skill)

- At-most-once where loss is cheaper than machinery: metrics, sampled
  telemetry, presence pings. (Deliberately rare in money systems.)
- At-least-once + idempotent consumers: the default for everything that
  matters — commands, events, CDC.
- Transactional EOS where the whole loop lives inside one transactional
  domain and duplicate-suppression complexity at every consumer would cost
  more than the coordinator overhead (~few-ms added produce latency,
  throughput haircut): multi-stage Kafka pipelines, stream analytics
  feeding Kafka-resident state.
- L4 picks one religion; L5 picks per-stream with the cost table; L6 sets
  the org default (at-least-once + idempotency as paved road; EOS as
  special-case tooling) and makes the audit list (§2.4) a design-review
  checklist.

---

## 4. Resume connection

- **Your platform is a deliberate, coherent Layer-3 system:** at-least-once
  everywhere (Pulsar ack-after-process, Storm acker replay, client
  retries), with identity/idempotency at every effector (gateway dedup →
  txn state machine → PSP/NPCI identity → recon backstop). You can now
  *name* it: "we run at-least-once + effectively-once effects; we never
  chased exactly-once delivery because our effects cross trust boundaries
  — NPCI doesn't join Kafka transactions."
- **Produce-path duplicates:** your write-then-publish (txn row → Pulsar
  event) means a produce retry could enqueue the same execution command
  twice — absorbed because execution is keyed by txnId (same identity ⇒
  PSP dedup ⇒ one debit). Broker dedup would be belt-and-suspenders
  **[VERIFY if enabled]**.
- **The ack-protocol detail you own:** consumers ack only after the
  status-update completes; ack-timeout redelivery covers worker death; and
  the "slow ≠ dead" duplicate source (processing outlived the ack timeout)
  is absorbed the same way — worth citing as the reason identity, not
  tuning, is the real defense.

**30–60 s spoken answer** ("what delivery semantics does your platform
use?"):

> "At-least-once, everywhere, on purpose — with effectively-once *effects*
> built on top through identity. Duplicates are born at every layer and we
> audited them all: producer retries after lost acks, consumer crashes
> between processing and ack, redeliveries when processing runs long,
> rebalance-style failovers, and deliberate DLQ re-drives. Rather than
> suppress each source, every effector is idempotent: execution commands
> carry the transaction ID, the PSP and NPCI dedupe on it, state machines
> reject replayed transitions, and recon converges anything that leaks
> through. We never chased exactly-once because I'm precise about what it
> means: exactly-once delivery across arbitrary boundaries is impossible —
> Two Generals; exactly-once processing is real but scoped to a
> transactional domain, like Kafka topic-to-topic with transactions or
> Flink state under checkpoints — and our effects cross trust boundaries;
> NPCI doesn't join anyone's transaction. So the correct architecture is
> the one we run: at-least-once delivery plus idempotent effectors equals
> effectively-once outcomes."

---

## 5. What the interviewer will push on

**P1. "Your producer got a timeout on publish. What are the possible
states, and what does each retry policy give you?"**
- *Model:* three states: broker never got it / got it but ack lost / got it
  and is processing the ack now. No retry ⇒ at-most-once (possible loss).
  Naive retry ⇒ at-least-once (possible broker-side duplicate). Retry with
  idempotent producer (PID+seq / Pulsar sequence dedup) ⇒ broker dedupes ⇒
  effectively-once *onto the log* — but only within the producer session;
  app-level retries above the client (new producer instance) reintroduce
  duplicates, which is why the message should ALSO carry business identity.
  Layered, as always.
- *Trap:* only two states ("it worked or it didn't") — the lost-ack state
  is the entire topic.

**P2. "Explain Kafka's exactly-once. Then break it."**
- *Model:* §3.1 mechanics (idempotent producer, transactional
  offsets+outputs, read_committed). Break it three ways: (1) any external
  side effect inside the loop (HTTP/email/DB-without-XA) replays on abort;
  (2) consumers reading with read_uncommitted see aborted data; (3) the
  scope ends at Kafka's edge — a downstream service consuming the output
  topic still needs idempotency against *its* redeliveries. Bonus: zombie
  producers are fenced by epoch (transactional.id → producer epoch) —
  fencing again.
- *Trap:* breaking it with FUD ("transactions are slow/buggy") instead of
  the scope boundary — the boundary is the answer; performance is a
  footnote (~ms latency, modest throughput cost).

**P3. "Design choice: your notification events (SMS on payment success) —
which semantics, and where do you spend the machinery budget?"**
- *Model:* the SMS is an external, non-transactional, human-visible effect
  ⇒ EOS machinery buys nothing past the SMS gateway. Choose at-least-once
  delivery; spend on (a) emitting the event off the *state transition*
  (fire once per real PENDING→SUCCESS commit — `07-idempotency.md` P5),
  (b) idempotency key to the SMS provider (messageId = txnId+type) if it
  dedupes, (c) accepting rare duplicate SMS as cheaper than any
  alternative — match idempotency effort to effect stakes. Contrast: the
  *debit* event gets the full identity chain. Same bus, different budgets.
- *Trap:* "exactly-once so users never get two SMS" — proposing impossible
  machinery for a low-stakes effect signals you price nothing.

**P4. "Auto-commit in Kafka: which semantics do you actually get?"**
- *Model:* neither, reliably — it's timing-dependent. Commit timer fires
  after poll but potentially *before* processing finishes ⇒ crash loses
  in-flight work (at-most-once flavor); processing finishes but crash hits
  before the timer ⇒ replay (at-least-once flavor). Same config, both
  behaviors, by race. Correct: disable auto-commit, commit after process
  (at-least-once), pair with idempotent handlers; or EOS if in-scope. The
  question is a config-literacy screen — a lot of production Kafka runs
  auto-commit without knowing this.
- *Trap:* "auto-commit is at-least-once" — the loss window is the part
  they're testing.

**P5. "Slow consumer: processing takes 40 s, your ack timeout is 30 s. What
happens and how do you find it?"**
- *Model:* the broker redelivers at 30 s while attempt #1 is still running
  ⇒ two concurrent executions of the same message (not sequential
  duplicates — *concurrent*), possibly forever (every attempt exceeds the
  timeout ⇒ redelivery loop, backlog never drains). Finding it: redelivery
  count metrics climbing without failures logged, processing-time p99 vs
  ack-timeout comparison, duplicate side effects with overlapping
  timestamps. Fixes: raise ack timeout above processing p99.9, or ack-
  early+idempotent-checkpoint pattern, plus concurrency guards (your CAS)
  because *concurrent* duplicates need concurrency control, not just
  idempotent replay. This is the question that catches people who think
  duplicates only arrive politely, one after another.
- *Trap:* treating it as ordinary duplication — the concurrency dimension
  (two live executors of one message) is the point, and it's exactly what
  your version-column CAS defends.

---

## Self-test

1. Define the three semantics by failure behavior, and name the theorem
   that forbids the third across arbitrary boundaries.
2. List the seven duplicate factories from memory.
3. acks=0 / acks=1 / acks=all: the loss window of each.
4. How does the Kafka idempotent producer work (three identifiers), and
   what's its scope limit?
5. Ack-before vs ack-after processing: which semantics each yields; what
   does Kafka auto-commit yield?
6. Walk Kafka EOS: the three components and the exact boundary where it
   stops.
7. Flink end-to-end exactly-once: what must the sink support, and why
   can't your PSP be such a sink?
8. State the honest hierarchy (three levels) and the power-move question.
9. Rebalance replay: why does it happen, and what bounds it?
10. The slow-consumer/ack-timeout scenario: what's uniquely dangerous
    about it, and which of your mechanisms addresses it?
11. Your platform: place it on the hierarchy and name the walls at each
    layer.
12. When is at-most-once the *right* choice? Two examples and the
    criterion.

<details>
<summary><b>Answers</b></summary>

1. At-most-once: failures lose, never duplicate (0 or 1). At-least-once:
   failures duplicate, never lose (≥1). Exactly-once (=1) as *delivery*
   across arbitrary boundaries: impossible — Two Generals (the last ack
   can always be lost).
2. Producer retry after lost ack; consumer crash between process and ack;
   ack/commit lost in transit; rebalance/failover replay from committed
   position; redelivery while a slow attempt still runs; DLQ/recon
   re-drives; deliberate rewind/backfill.
3. acks=0: anything after send is invisible — broker crash/drop = silent
   loss. acks=1: leader-only durability — leader dies pre-replication =
   acked-but-lost. acks=all: durable per ISR/min.insync — loss only via
   unclean leader election or correlated replica loss; the remaining risk
   moves to duplicates via producer retries.
4. Producer ID (PID) + per-partition sequence numbers; broker accepts each
   (PID, partition, seq) once, so client retries dedupe at the door.
   Scope: per producer session/partition — restarts (new PID without
   transactional.id) and app-level re-sends are new identities; business
   identity remains the outer wall.
5. Ack-before: at-most-once (crash after ack loses the work). Ack-after:
   at-least-once (crash before ack replays). Auto-commit: a race — timer
   vs processing — yielding loss or duplication depending on timing;
   deterministically neither.
6. (1) Idempotent producer kills produce duplicates; (2) transactions
   atomically commit output records + consumed offsets via a coordinator;
   (3) read_committed consumers skip aborted data. Boundary: effects that
   don't live in Kafka's transaction — external calls, non-transactional
   stores — replay on abort; and consumers of outputs still face their own
   redeliveries beyond the scope.
7. A two-phase-commit protocol tied to checkpoints: pre-commit at barrier,
   commit on checkpoint-complete (e.g., Kafka transactional sink). The
   PSP is an external HTTP API with no prepare/commit contract you
   control — it can't hold a pre-committed debit; hence identity-dedup,
   not 2PC.
8. (1) EO delivery across arbitrary boundaries: impossible. (2) EO
   state/processing inside a transactional scope: real and scoped.
   (3) Effectively-once effects: at-least-once + idempotent effectors —
   universal. Power move: "exactly-once *what*, across *which* boundary?"
9. A partition/subscription moves (crash, deploy, scale) and the new owner
   resumes from the last committed offset/cursor — everything processed
   but uncommitted replays. Bounded by commit/ack frequency (smaller gaps
   = smaller replay windows) and absorbed by idempotent handlers.
10. It manufactures *concurrent* executions of one message (attempt #1
    still running when redelivery spawns attempt #2) — replay-idempotency
    alone isn't enough; you need concurrency control at the shared state.
    Your CAS-on-version aggregate writes (and state-machine transition
    guards) are exactly that defense; the operational fix is ack timeout >
    processing p99.9.
11. Level 3: at-least-once delivery everywhere + effectively-once effects.
    Walls: gateway request-identity dedup (client storms) → txn-row
    creation + state machine (re-drives, stale transitions) → PSP/NPCI
    transaction-identity dedup (execution replays) → recon force-query
    (everything else). Optional inner wall: broker producer-dedup
    [verify].
12. Where loss is cheaper than any machinery and staleness makes redelivery
    worthless: high-volume metrics/telemetry samples, presence/heartbeat
    pings, real-time cursors (only the latest matters). Criterion: the
    next message supersedes this one, and nobody reconciles history.

</details>
