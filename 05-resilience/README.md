# 05 — Resilience Engineering

**Status: ✅ Complete.** Seven documents on the five-part contract, each ending in
a hidden-answer self-test. This is your strongest resume surface — these docs are
written to make it *provably* strong, mechanism by mechanism.

## Reading order

| # | Document | One-line takeaway |
|---|----------|-------------------|
| 1 | [Timeouts](01-timeouts.md) | The timeout stack, budget decomposition, two-layer enforcement, deadline propagation — your 800 ms / 3.5 s / 55 s system of deadlines |
| 2 | [Circuit breakers](02-circuit-breakers.md) | All four types (count, time, sliding-window, adaptive), what-counts-as-failure judgment, retry/stampede interactions, Hystrix → Resilience4j → adaptive limits |
| 3 | [Bulkheads](03-bulkheads.md) | Thread-pool vs semaphore mechanics, Little's-law sizing (your 200-thread pool worked both directions), granularity trades, what Loom changes |
| 4 | [Retries](04-retries.md) | Retryability taxonomy, full jitter, retry budgets, R^L amplification, metastable failure — and your queue-as-retrier architecture |
| 5 | [Rate limiting](05-rate-limiting.md) | Four algorithms with exact failure modes, the distributed limiter ladder, fail-open policy per limit class, Retry-After as storm prevention |
| 6 | [Load shedding & degradation](06-load-shedding-degradation.md) | Goodput vs throughput, queue-age signals, criticality tiers, LIFO+CoDel, absorb-then-shed — your two-stage overload story |
| 7 | [Idempotency](07-idempotency.md) | The keystone: key pattern with crash semantics, structural idempotency, exactly-once scope boundaries, your four-shape taxonomy |

## How the seven fit together (the 30-second synthesis)

Timeouts bound how long you wait; breakers decide whether to call at all;
bulkheads bound how much of you can be consumed; retries govern the second
attempt; rate limits bound what others may ask of you; shedding chooses what
fails when something must; and idempotency is why all of the above — every one
of which manufactures duplicates and unknown outcomes — doesn't corrupt state.
Remove idempotency and the rest becomes dangerous; remove the rest and
idempotency has nothing to protect.

## The five sentences to walk into any interview with

1. "The deadline follows the journey, not the dependency — and it's enforced at
   two layers or it's fiction."
2. "The breaker's design is the failure taxonomy; the state machine is
   commodity — and 4xx is never a failure."
3. "A bulkhead converts unbounded failures into bounded ones: pool = λ × W at
   the latency you're sizing for, and the queue stays near zero."
4. "Retries convert transient failures into latency and persistent failures
   into load — jitter smooths the crowd, budgets cap the amplification."
5. "At-least-once delivery plus idempotent processing equals effectively-once
   outcome — that equation is my platform."

## Self-test discipline

Do each doc's self-test cold ≥3 days after first reading; misses go to the
spaced-repetition deck (`15-mock-interviews/` when written).
