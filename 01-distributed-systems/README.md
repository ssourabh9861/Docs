# 01 — Distributed Systems

> **Status: STUB.** Say "next" (or name this directory) in the prep session to have it
> written in full. Every document here will follow the five-part teaching contract
> (definition → practice → senior depth → resume connection → interviewer probes)
> and end with a 10+ question self-test with hidden answers.

## Planned documents

- 01-fault-tolerance-resilience-ha.md — precise distinctions + failure math (MTBF/MTTR, availability arithmetic)
- 02-consistency-models.md — linearizability → eventual; CAP-consistency vs ACID-consistency
- 03-replication.md — leader/follower, multi-leader, leaderless/quorum; replication lag pathologies
- 04-partitioning.md — hash/range/consistent hashing; hot keys; rebalancing
- 05-consensus.md — the problem, Paxos intuition, Raft mechanics, where ZK/etcd fit (HBase depends on ZK — expect probes)
- 06-time-and-ordering.md — clocks, NTP error, Lamport/vector clocks, TrueTime
- 07-failure-detection.md — heartbeats, phi-accrual, gray failures
- 08-cap-pacelc.md — what CAP actually says, common misstatements that fail candidates
