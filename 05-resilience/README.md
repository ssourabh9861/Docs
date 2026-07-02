# 05 — Resilience Engineering

> **Status: STUB.** Say "next" (or name this directory) in the prep session to have it
> written in full. Every document here will follow the five-part teaching contract
> (definition → practice → senior depth → resume connection → interviewer probes)
> and end with a 10+ question self-test with hidden answers.

## Planned documents

- 01-timeouts.md — budgets, propagation, your 800ms/3500ms dual-timeout as a case study
- 02-circuit-breakers.md — count-based, time-based, sliding-window, adaptive; Hystrix vs Resilience4j vs adaptive concurrency limits
- 03-bulkheads.md — thread-pool vs semaphore isolation; your SupermoneyPool
- 04-retries.md — retry budgets, exponential backoff + jitter, retry storms & metastable failure
- 05-rate-limiting.md — token bucket, leaky bucket, sliding window log/counter, distributed limiters
- 06-load-shedding-degradation.md — priority shedding, brownout, fail-open vs fail-closed
- 07-idempotency.md — keys, natural idempotency, dedup windows; your gateway dedup + rewards markers
