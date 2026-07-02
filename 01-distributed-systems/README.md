# 01 — Distributed Systems

**Status: ✅ Complete.** Eight documents, each on the five-part contract
(definition → practice → senior depth → resume connection with a 30–60 s spoken
answer → interviewer probes with model + trap answers), each ending in a
hidden-answer self-test.

## Reading order

| # | Document | One-line takeaway |
|---|----------|-------------------|
| 1 | [Fault tolerance vs resilience vs HA](01-fault-tolerance-resilience-ha.md) | Availability math, correlated failure, metastable cascades — and why your grey-out is resilience, not fault tolerance |
| 2 | [Consistency models](02-consistency-models.md) | The spectrum linearizable → eventual, anomaly-driven model selection, CAP-C vs ACID-C, linearizability vs serializability |
| 3 | [Replication](03-replication.md) | Leader/multi-leader/leaderless, lag anomalies, failover disasters + fencing — and one payment traced through every replication layer of your stack |
| 4 | [Partitioning](04-partitioning.md) | Range vs hash vs consistent hashing, hot keys, rebalancing, secondary indexes — your row-key designs ARE this topic |
| 5 | [Consensus](05-consensus.md) | Quorum math, Raft's two safety jewels, fencing, ZK-under-HBase/Storm blast-radius analysis |
| 6 | [Time and ordering](06-time-and-ordering.md) | Why clocks lie (numbers), LWW data loss, Lamport/vector clocks, TrueTime/commit-wait — and time-as-label vs time-as-truth in your keys |
| 7 | [Failure detection](07-failure-detection.md) | Timeouts as guesses, phi-accrual, SWIM, leases+fencing, gray failure — "timeout ≠ failure" as your force-query design |
| 8 | [CAP and PACELC](08-cap-pacelc.md) | The precise theorem, the misstatement catalog, PACELC, per-operation decomposition with error directions |

## The five sentences to walk into any interview with

1. "Fault tolerance masks; resilience degrades deliberately; availability is the
   scoreboard."
2. "Pick the cheapest consistency model that kills the anomaly the product can't
   tolerate — per operation, not per system."
3. "Failover without fencing is a split-brain generator with a delay knob."
4. "Manufacture order by ownership where you can; buy clock machinery only where
   the write topology admits true concurrency."
5. "Timeout ≠ failure: retry the question or retry with identity — never blindly
   retry a money action."

## Self-test discipline

Do each doc's self-test cold ≥3 days after first reading. Anything you miss goes
into your spaced-repetition deck (`15-mock-interviews/04-spaced-repetition-deck.md`
when written).
