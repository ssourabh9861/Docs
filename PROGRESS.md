# PROGRESS

Legend: ✅ complete · 🟡 partial · ⬜ stub only

| Directory | Status | Notes |
|-----------|--------|-------|
| README.md | ✅ | Roadmap, index, justified additions |
| 00-resume-arsenal | ✅ | 4 project arsenals + cross-cutting attacks + gap analysis. **Action on you:** fill `[X]` placeholders (see 06-gap-analysis.md) |
| 01-distributed-systems | ✅ | 8 docs complete (fault tolerance/HA, consistency, replication, partitioning, consensus, time & ordering, failure detection, CAP/PACELC) |
| 02-databases | ⬜ | |
| 03-caching | ⬜ | |
| 04-messaging-streaming | ✅ | 8 docs complete (queues vs logs, Pulsar vs Kafka, Storm, delivery semantics, ordering, DLQ, CDC, backpressure) |
| 05-resilience | ✅ | 7 docs complete (timeouts, circuit breakers, bulkheads, retries, rate limiting, load shedding/degradation, idempotency) |
| 06-concurrency-java | ⬜ | |
| 07-system-design | ⬜ | 12+ worked designs planned |
| 08-api-design | ⬜ | |
| 09-security | ⬜ | |
| 10-infra-observability | ⬜ | |
| 11-coding-dsa | ⬜ | **Start daily practice now regardless — do not wait for this doc** |
| 12-behavioral-leadership | ⬜ | STAR bank will build on 00-resume-arsenal stories |
| 13-networking | ⬜ | Added directory |
| 14-distributed-transactions | ⬜ | Added directory |
| 15-mock-interviews | ⬜ | Added directory |
| 99-cheat-sheets | ⬜ | Write last |

## Recommended next steps (given a typical 8–12 week runway)

1. **You, this week:** fix resume placeholders + verify ownership claims (00/06-gap-analysis.md).
2. **Next writing turn:** `02-databases` (HBase/Aerospike/MySQL internals, storage
   engines, isolation — your data-layer resume surface). Say "next".
3. Then: `14-distributed-transactions`, `03-caching`, `07-system-design`,
   remainder per README roadmap.
4. Start `11-coding-dsa`-style daily practice immediately in parallel (2 problems/day,
   timed, talking out loud) — the doc will sharpen it, but volume can't be backloaded.

## Decisions log

- 2026-07-02: Repo built at root of `Docs` repo (per instruction "use Docs repo") rather
  than nested `sde3-prep/` folder. Structure otherwise matches the requested skeleton.
- 2026-07-02: Added `13-networking`, `14-distributed-transactions`, `15-mock-interviews`
  (justifications in README).
