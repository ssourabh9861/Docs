# 04 — Messaging & Streaming

**Status: ✅ Complete.** Eight documents on the five-part contract, each ending
in a hidden-answer self-test. This directory IS your platform — Pulsar, Storm,
CDC, DLQs — so nearly every section doubles as resume defense.

## Reading order

| # | Document | One-line takeaway |
|---|----------|-------------------|
| 1 | [Queues vs logs](01-queues-vs-logs.md) | "A queue tracks message state; a log tracks consumer state" — commands vs events, and how Pulsar subscriptions give you both |
| 2 | [Pulsar vs Kafka](02-pulsar-vs-kafka.md) | The question you must win: compute/storage separation, per-message acks vs offsets, fsync postures, honest Kafka concessions |
| 3 | [Storm & stream processing](03-storm-and-stream-processing.md) | The XOR acker down to the algebra, max.spout.pending, and the precise "which of my designs Flink would absorb" answer |
| 4 | [Delivery semantics](04-delivery-semantics.md) | Where duplicates are born (seven factories), Kafka EOS anatomy, the exactly-once hierarchy and the "exactly-once *what*?" power move |
| 5 | [Ordering](05-ordering.md) | The six silent order-breakers, global-order costs, and posture B — your order-tolerance architecture as a deliberate choice |
| 6 | [DLQs & poison messages](06-dlq-and-poison-messages.md) | Classification gates, the four resolution patterns, front-door replay — your force-query generalized into a pattern language |
| 7 | [CDC](07-cdc.md) | The pattern space, transactional outbox, snapshot seams, schema evolution — your SEP pipeline with full vocabulary |
| 8 | [Backpressure](08-backpressure.md) | Credit-based flow control from TCP to Pulsar permits, age-over-depth, the pressure-vessel audit of your own pipeline |

## The five sentences to walk into any interview with

1. "A queue tracks the state of each message; a log tracks the state of each
   consumer — everything else follows."
2. "Exactly-once *what*, across *which* boundary? Delivery — impossible; state
   in a transactional scope — real; external effects — identity or nothing."
3. "Any system with retries has already given up processing order; the design
   question is what you do about disorder, and ours is state machines,
   versions, and re-derivation."
4. "Every bounded retry needs a terminal state, and a DLQ without a resolution
   path is a graveyard — ours force-queries the source of truth."
5. "Pressure always goes somewhere; backpressure design is choosing the vessel
   and instrumenting it — in-flight windows, durable backlog measured by age,
   shedding at the edge."

## Self-test discipline

Cold self-tests ≥3 days after reading; misses go to the spaced-repetition deck
(`15-mock-interviews/` when written).
