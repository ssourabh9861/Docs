# Ordering in Messaging Systems

"Kafka preserves order" and "Pulsar preserves order" are both true statements
that have caused production incidents, because each is true only inside a set of
fine print nobody reads. This doc is the fine print: what order is actually
guaranteed where, the six things that silently break it, what global order
costs, and the design posture — yours — that makes most ordering problems
disappear.

(Foundations: logical/physical time and "manufacture order by ownership" live in
`01-distributed-systems/06-time-and-ordering.md`. This doc applies them to
brokers and consumers.)

---

## 1. Plain definition

**Ordering** in messaging = the promise that consumers observe messages in the
same sequence producers created them. The catch: "the same sequence" is only
well-defined within a scope. Three scopes, wildly different costs:

- **Global order:** every message in the topic, one sequence, all consumers
  agree. Requires a single serialization point — expensive, rarely needed.
- **Per-key order:** messages for one key (one account, one transaction) in
  order; different keys freely interleaved. Cheap — route each key through
  one path. This is the scope 95% of real requirements reduce to.
- **Per-producer order:** one producer's messages in send order; nothing
  across producers. What brokers naturally give within a partition.

Analogy: a bank doesn't need every customer's transactions globally
interleaved in one ledger sequence — it needs *each account's* entries in
order. Demanding global order for per-account correctness is buying a stadium
to host a chess game.

---

## 2. What's actually guaranteed, and the six silent breakers

### 2.1 The baseline guarantee (both ecosystems)

**One producer → one partition → one consumer = FIFO.** Kafka: order within a
partition, for a single producer, consumed by the single group member owning
that partition. Pulsar: order within a topic/partition under an exclusive or
failover subscription. Everything beyond that baseline is where incidents
live.

### 2.2 The six breakers (memorize as an audit list)

1. **Multiple producers.** Two gateways emitting events for the same key:
   the broker orders by *arrival*, which interleaves their sends
   arbitrarily (network jitter decides). Per-key order across producers
   requires a single logical writer per key (ownership) — brokers cannot
   conjure it.
2. **Producer retries + pipelining.** Kafka with
   `max.in.flight.requests.per.connection > 1` and retries: batch 1 fails,
   batch 2 lands, batch 1's retry lands ⇒ **reordered within one producer
   and partition**. Fix: idempotent producer (sequences let the broker
   reject/order correctly, preserving order with in-flight ≤ 5) — a config
   subtlety that has bitten real payment systems.
3. **Hash-to-partition changes.** Adding partitions remaps keys
   (hash % N) — key K's messages now split across an old and new partition
   with no order between them (`01-queues-vs-logs.md`).
4. **Competing consumers.** Shared subscriptions / work queues hand
   consecutive messages to *different workers* — even if delivery order is
   preserved, **processing** order isn't (worker A gets msg 1, worker B
   gets msg 2, B finishes first). Order at delivery ≠ order of effects.
5. **Redelivery and DLQ.** A nacked/timed-out message re-arrives *after*
   its successors were processed; a DLQ'd message is processed hours later
   by a different path. Any retry mechanism is a reordering mechanism.
6. **Failover replay.** Rebalance/subscription failover rewinds to the
   last committed position — already-processed messages replay after their
   successors' effects landed.

Corollary worth saying aloud: **any system with retries has already given up
strict processing order.** The question is never "how do we keep perfect
order" but "what do we do about disorder" (§3).

### 2.3 The middle tools

- **Kafka:** keyed partitioning (per-key order across the topic's
  partitions, within the fine print above); one consumer per partition
  keeps processing serial per partition — parallelism bounded by partition
  count.
- **Pulsar key_shared:** per-key serial dispatch with shared-style consumer
  scaling — with the churn caveats from `02-pulsar-vs-kafka.md` P5 (range
  remapping on join/leave can interleave a key across old/new consumers
  unless drained).
- **Consumer-side per-key serialization:** hash keys to in-process worker
  lanes (striped executors) — restores effect-order per key behind a
  shared subscription, at the cost of in-process queues and hot-lane skew.

---

## 3. Senior-level depth

### 3.1 What global order costs (and who actually pays it)

Global order = one serialization point: a single partition (throughput capped
at one broker/consumer lane — Kafka single-partition topics do low-hundreds
of MB/s at best, and consumer processing single-threads), or a sequencer/
consensus log (Raft-backed: ~10–50k writes/s ballpark, +RTT latency — the
`01-distributed-systems/05-consensus.md` numbers). Legitimate buyers:
replicated state machines (every replica must apply identical order), some
matching engines / order books, audit logs with legal sequence requirements.
Almost everything else that "needs global order" actually needs per-key order
plus timestamps for display. The interview move: when someone demands global
ordering, ask **"which two messages with different keys must never be
reordered, and what breaks if they are?"** — usually silence, and you've
scoped the requirement down to per-key.

### 3.2 The two design postures

**Posture A — preserve order:** single writer per key end-to-end (owned
partitions, exclusive consumers or key-lanes, no competing retries), pay with
throughput ceilings, head-of-line blocking (one slow message stalls its whole
key/partition), and rebalance fragility. Justified when operations are
inherently non-commutative and can't be made otherwise.

**Posture B — tolerate disorder (yours):** let delivery be unordered;
make *effects* order-independent:
- **State machines with legal-transition guards:** a stale PENDING arriving
  after SUCCESS is rejected — regression-proof (your txn/mandate handlers).
- **Versioned upserts / LWW-by-version:** apply only if incoming version >
  stored version (your CDC consumers' modTime/entity-version discipline).
- **CAS + re-derivation from ground truth:** arrival order irrelevant
  because uncertain paths recompute from the raw rows (your rewards
  design — explicitly an *ordering-avoidance* architecture).
- **Commutative operations (CRDT-flavored):** design updates that merge in
  any order (sets, maxes, counters-with-identity).
Posture B is strictly more robust (survives every one of the six breakers)
and costs design effort per handler instead of throughput per topic. L5s can
name both postures and justify a choice; L6s bend the *data model* until
posture B is cheap (immutable events, derived views — which is what your
platform did).

### 3.3 Causal traps hiding in "ordering" questions

Cross-topic/cross-system ordering: "the payment-success event arrived before
the payment-created event" (two topics, or CDC vs API path) — no broker
promises anything across topics/systems; consumers must tolerate orphans
(park-and-retry, the `00-resume-arsenal/04-superpay-in-3.md` P5 REFUND-
before-BLOCK answer) or read from one merged authority. If an interviewer's
scenario spans two streams, the answer is never a broker setting — it's
consumer-side reconciliation.

---

## 4. Resume connection

- **You run posture B, deliberately, and it's the stronger story:** shared
  subscriptions for elastic payment workers mean you *chose* competing
  consumers (breaker #4) and redelivery (breaker #5) — then made effects
  order-independent: transaction state machines reject regressions;
  CDC/analytics upsert by entity version; rewards re-derives from ground
  truth under CAS. Say it as a decision: "we bought elasticity and
  resilience by giving up processing order, and spent design effort making
  order irrelevant."
- **Where you DO have order:** per-row HBase mutations (single region
  server = single writer per key — ownership-manufactured order) and the
  CDC stream's per-region sequence in the happy path. You use it as an
  optimization, not a correctness dependency — the correct posture.
- **The trap you must not fall into in interviews:** claiming "Pulsar
  preserves order so our events are ordered." Your own architecture
  (shared subs + nacks + DLQ) breaks it six ways, and your own designs
  prove you knew that. Quote your rewards five-case table as evidence.

**30–60 s spoken answer** ("how do you handle message ordering?"):

> "By mostly refusing to need it. The baseline guarantee — one producer, one
> partition, one consumer — is real but fragile: we deliberately run shared
> subscriptions with competing workers, negative-ack redelivery, and
> dead-letter re-drives, and every one of those is a reordering mechanism.
> So instead of preserving order we made effects order-independent:
> transaction updates go through state machines that reject regressions —
> a stale PENDING after a SUCCESS is a no-op; analytics consumers upsert by
> entity version so a late event can't overwrite a newer state; and the
> rewards aggregation re-derives from ground truth on any uncertain path,
> which makes arrival order literally irrelevant. Where we genuinely have
> order — HBase's single-writer-per-row, per-region CDC sequence — we treat
> it as an optimization, never a correctness dependency. And when someone
> asks for global ordering, my first question is which two differently-keyed
> messages must never be reordered — because the honest answer is usually
> 'none', and per-key order plus order-tolerant consumers is two orders of
> magnitude cheaper than a global sequencer."

---

## 5. What the interviewer will push on

**P1. "Design ordered processing of payment events per account, 100k
events/sec, consumers must scale elastically."**
- *Model:* first scope it: per-*account* order (per-key), not global. Then
  present both postures with costs. Posture A: key-partitioned topic
  (account-hash), enough partitions for peak parallelism (name breaker #3:
  plan the count up front), one consumer per partition or key_shared (with
  churn caveats), idempotent producer for retry-order, and accept
  head-of-line per partition. Posture B: shared subscription at any scale +
  order-tolerant effects (state machine + versions) — elasticity unbounded,
  disorder absorbed. Recommend B for payment *state updates* (they're
  naturally state-machine-shaped) and A only if some operation is truly
  non-commutative. Interviewers score the scoping question and the
  two-posture fluency, not the topology drawing.
- *Trap:* jumping to key-partitioning without asking what breaks under
  disorder — you'd be buying order you may not need and forgetting retries
  break it anyway.

**P2. "max.in.flight > 1 with retries — show me the reorder, then fix it
without killing throughput."**
- *Model:* producer pipelines batches 1..5; batch 1 fails (transient),
  batches 2–5 land, batch 1's retry lands sixth ⇒ partition now holds
  2,3,4,5,1 — one producer, one partition, order broken. Fix: idempotent
  producer — broker-tracked sequences detect the gap and the retry slots
  correctly (Kafka guarantees order with idempotence up to 5 in-flight);
  the throughput-killing alternative (max.in.flight=1) is unnecessary
  post-idempotence. Moral: order within a partition is conditional on
  producer config, which most people learn from an incident.
- *Trap:* answering "set max.in.flight=1" — correct-but-costly is a
  half-answer; the question includes "without killing throughput."

**P3. "Your DLQ re-drives a payment event from 3 hours ago. Its transaction
has long since reached SUCCESS via recon. What must be true for this to be
safe?"**
- *Model:* the re-driven message is maximally out-of-order — hours late.
  Safe iff effects are order-independent: the txn state machine rejects the
  stale transition (terminal-state guard); any aggregate/derived state
  consults versions or re-derives; side effects hang off transitions (which
  won't fire — no transition occurs), not off message receipt. Generalize:
  a DLQ is only safe in posture B — if your correctness depends on order,
  your DLQ is a corruption engine. That sentence is the answer.
- *Trap:* "we check if it's already processed" (vague dedup) — the message
  isn't a duplicate, it's a *stale original*; the guard is state-based
  (legal transitions), not identity-based. Distinguishing
  duplicate-handling from stale-handling is precisely what's being probed.

**P4. "When is global ordering genuinely required? Name a system and what
it pays."**
- *Model:* replicated state machines (every replica applies the same
  sequence — consensus logs, ~10s-of-k writes/s, quorum RTT per commit);
  exchange matching engines / order books (fairness and price-time priority
  are *legally* sequence-dependent — built as single-sequencer designs,
  scaled by instrument-sharding: global-per-instrument, which is per-key
  order wearing a suit); some audit/compliance logs. Payment platforms:
  per-key (per-account/per-txn) suffices — cite your own. The pattern:
  even "global order" systems shard the globe down to the smallest scope
  that preserves the invariant.
- *Trap:* "banking needs global order" — it conspicuously doesn't (accounts
  are independent keys), and claiming it signals you've never asked the
  which-two-messages question.

**P5. "Two streams — CDC from the DB and events from the app — describe a
cross-stream ordering bug and your defense."**
- *Model:* consumer joins "payment SUCCESS" (app event, fast path) with
  enrichment from CDC (slower path): the event arrives before the CDC row
  ⇒ join misses / builds on stale state. No broker fixes cross-stream
  order. Defenses: treat one stream as authority and the other as trigger
  (on event, *read* the store instead of joining streams); park-and-retry
  orphans with redelivery (your callback-buffering pattern IS this);
  version everything and upsert; or eliminate the dual source (derive both
  from CDC). Bonus: name the general smell — "joining two streams that
  share an origin" usually means someone dual-sourced truth.
- *Trap:* proposing timestamps/watermark alignment as the primary fix —
  cross-system clocks and lag make it a heuristic, not a guarantee
  (`06-time-and-ordering.md`); the structural fixes are the answer.

---

## Self-test

1. The three ordering scopes and what each costs; which one do 95% of
   requirements reduce to?
2. State the baseline FIFO guarantee and its three conditions.
3. List the six order-breakers from memory, with one production example
   each.
4. The max.in.flight reorder: mechanism and the non-throughput-killing fix.
5. Why does "any system with retries has given up processing order" hold?
6. Posture A vs Posture B: costs of each, and the criterion for choosing.
7. Name the four order-tolerance mechanisms of posture B and map each to
   your platform.
8. Duplicate-handling vs stale-handling: define the difference and the
   guard type each needs.
9. What does key_shared promise, and its two caveats?
10. Who genuinely needs global order? What does a matching engine actually
    shard down to?
11. The cross-stream ordering bug: why timestamps don't fix it and the two
    structural defenses.
12. Give the "which two messages" scoping question and explain why it
    usually dissolves the requirement.

<details>
<summary><b>Answers</b></summary>

1. Global (one serialization point: single partition or consensus — capped
   throughput, +latency); per-key (one path per key: cheap, scalable);
   per-producer (free within a partition). 95% reduce to per-key.
2. FIFO holds for: one producer (with retry-safe config), into one
   partition, consumed by one consumer (exclusive/failover or single group
   member). Break any condition and the guarantee is gone.
3. (1) Multiple producers — two gateways emit for one key, arrival order
   arbitrary. (2) Producer retries with pipelining — failed batch's retry
   lands after successors. (3) Partition-count change — key remaps, splits
   its history. (4) Competing consumers — worker B finishes msg 2 before
   worker A finishes msg 1. (5) Redelivery/DLQ — nacked message processed
   after successors, DLQ hours later. (6) Failover replay — rewind to
   committed position replays old messages after their successors'
   effects.
4. Batches pipeline (≤5 in flight); batch 1 fails transiently, 2–5 commit,
   1's retry appends last ⇒ 2,3,4,5,1 in one partition from one producer.
   Fix: idempotent producer — broker-side sequence numbers detect the gap
   and preserve order with in-flight ≤ 5; no need for in-flight=1.
5. A retry, by definition, delivers a message after messages that were
   sent later have (potentially) been processed — redelivery, nack
   backoff, and DLQ re-drives are all mechanisms that move a message later
   in processing time than its origin position. Keeping strict order would
   require stalling everything behind any failure (head-of-line), which
   retry systems exist to avoid.
6. A (preserve): throughput ceilings per key/partition, head-of-line
   blocking, rebalance fragility, retry constraints — pay in
   infrastructure. B (tolerate): design effort per handler (state
   machines, versions, re-derivation) — pay in engineering once. Choose A
   only when operations are inherently non-commutative and can't be
   restructured; otherwise B survives all six breakers.
7. State machines with transition guards → txn/mandate/callback handlers
   (stale transitions rejected). Versioned upserts → CDC/analytics
   consumers (entity version/modTime). CAS + re-derivation from ground
   truth → rewards aggregation. Commutative/identity-carrying operations →
   reward rows keyed by natural identity (insert-if-absent commutes).
8. Duplicate: the same message again — guarded by identity (dedup keys,
   idempotent apply). Stale: a *different*, older message arriving after
   newer state — guarded by state (legal-transition checks, version
   comparisons). Identity checks pass a stale original straight through;
   you need both guard types.
9. Per-key serial dispatch with competing-consumer scaling (hash ranges of
   keys per consumer). Caveats: consumer churn remaps ranges and can
   interleave a key across old/new consumers during transitions; hot keys
   still serialize on one consumer (skew unsolved).
10. Replicated state machines (consensus logs), matching engines/order
    books (price-time priority), sequence-mandated audit logs. A matching
    engine shards to per-instrument sequencers — global order *per
    instrument*, i.e., per-key order at the largest scope the invariant
    actually spans.
11. Clocks skew across systems and pipeline lags differ, so timestamp
    comparison is a heuristic that fails exactly during incidents
    (backlogs). Structural: single-authority reads (event triggers a read
    of the store rather than a stream join) and park-and-retry for
    orphans (nack/redeliver until the dependency is visible) — or collapse
    to one source (derive both from CDC).
12. "Which two messages with *different keys* must never be reordered, and
    what concretely breaks if they are?" Cross-key operations are almost
    always independent (different accounts, different transactions), so no
    invariant spans them — the requirement collapses to per-key order,
    which ownership provides cheaply.

</details>
