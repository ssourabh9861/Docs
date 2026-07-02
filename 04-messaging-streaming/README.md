# 04 — Messaging & Streaming

> **Status: STUB.** Say "next" (or name this directory) in the prep session to have it
> written in full. Every document here will follow the five-part teaching contract
> (definition → practice → senior depth → resume connection → interviewer probes)
> and end with a 10+ question self-test with hidden answers.

## Planned documents

- 01-queues-vs-logs.md — semantics from first principles
- 02-pulsar-vs-kafka.md — architecture-level comparison (brokers vs bookies, subscriptions vs consumer groups) — you MUST win this question
- 03-storm-and-stream-processing.md — Storm's acker model, at-least-once mechanics, and the honest 'why not Flink in 2026' answer
- 04-delivery-semantics.md — at-most/at-least/exactly-once; the exactly-once myths doc
- 05-ordering.md — per-key ordering, global ordering costs
- 06-dlq-and-poison-messages.md — your DLQ force-query recovery path, generalized
- 07-cdc.md — CDC patterns; your HBase SEP → Pulsar → Storm pipeline as a case study
- 08-backpressure.md — queue-depth signals, consumer lag, flow control
