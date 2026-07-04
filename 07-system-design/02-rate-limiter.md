# Worked Design 2: Distributed Rate Limiter

The algorithms and distribution trade-offs live in
`05-resilience/05-rate-limiting.md` — this doc arranges them into the
45-minute interview shape. It's a favorite prompt because it's small enough
to finish and deep enough to grade: the algorithm is 20% of the answer; the
distributed decision, failure policy, and API contract are the other 80%.

**Prompt:** "Design a rate limiter for our API platform."

---

## 1. Requirements & scope (0–5)

The scoping questions that change this design (ask all four):
1. **Which job?** Protection (capacity-derived limits), abuse control
   (behavior-derived), or quotas/fairness (contract-derived) — tune
   differently; assume all three exist as limit *classes*.
2. **Where enforced?** Edge/gateway (assume: yes — cheapest rejection
   point) as a library or a sidecar/service?
3. **Accuracy vs latency vs availability** — you cannot max all three;
   get the interviewer to rank (typical: latency ≈ availability >
   accuracy — and say what that buys you: local decisions with bounded
   overshoot).
4. **Response contract:** reject (429 + Retry-After) vs queue/shape —
   assume reject for user APIs.
Out of scope: billing-grade metering (accounting-accurate counting is a
different system — say this; conflating them is a classic error).

## 2. Estimation (5–9)

Fleet: 10 k gateway pods, 500 k RPS aggregate, sub-ms decision budget
(the limiter sits on EVERY request — its latency is a tax on everything;
**which means**: no synchronous cross-network hop on the hot path at p99).
Keys: 100 M users × ~3 active limit classes → memory: token-bucket state =
2 numbers (~50 B with key) × 300 M ≈ 15 GB fleet-wide — trivially
shardable/cacheable; **which means** memory is a non-issue, coordination is
the issue. TTL everything (idle keys evaporate).

## 3. API & data model (9–14)

```
check(key_class, key, cost=1) → ALLOW | REJECT{retry_after} | (SHADOW: log-only)
Config (per class): rate r, burst B, algorithm, key-extractor, on-store-failure policy, shadow%
Response headers: 429 + Retry-After (+ X-RateLimit-Remaining/Reset for B2B)
```
State per (class,key): token bucket = `(tokens, last_refill_ts)` — lazy
refill, O(1), no timers (`05-resilience/05` §2.1). Layered keys: per-user
AND per-IP AND endpoint-global ceiling — each catches what the others miss.

## 4. High-level design (14–24)

**The core decision — the enforcement ladder (present all four, pick #3):**
1. Per-instance ÷N — free, breaks under uneven load balancing.
2. Central store per-request (Redis/Aerospike Lua/CAS) — precise; +0.5–1 ms
   × 500 k RPS on the hot path + a tier-1 dependency = rejected for the
   latency ranking above.
3. **Local decisions + token batches** (chosen): pods claim token batches
   per hot (class,key) from the central store, decide locally in ~µs,
   return unused on idle; overshoot ≤ batch × pods (tunable per class:
   tight batches for abuse limits, loose for protection). Sub-ms, store
   off the per-request path, bounded imprecision — matches the stated
   ranking.
4. Sticky routing by key — exact + cheap until rebalancing churn; fights
   the LB; niche.

Store: Redis-class or Aerospike (your natural pick — sub-ms, TTL-native,
generation CAS for atomic claim; `02-databases/06`). Hot keys: the *global*
endpoint ceiling is itself a hot key — shard its counter
(`01-distributed-systems/04` P3) and accept looser precision on it.

**Failure policy per class (the senior section — volunteer it):** store
unreachable ⇒ protection limits **fail-open** (deeper layers — bulkheads,
shedding — still bound damage); abuse limits **fail-degraded-strict**
(conservative local per-pod fallback limits, because brute-forcers are
exactly who profits from your outage) (`05-resilience/05` P3). Policy is
config, decided before the incident.

## 5. Deep dives (24–39)

- **Atomicity of check-and-decrement:** two requests race the last token —
  central: Lua script/CAS (single-threaded Redis makes it natural;
  Aerospike generation-checked ops); local: per-key striped locks or
  atomics in-process. The check-then-act race again
  (`05-resilience/07-idempotency.md` §2.1's reservation logic).
- **Sliding-window-counter alternative** for classes needing smoother
  fixed-window semantics: curr + prev×overlap — two integers, bounded
  error; sliding *log* only for tiny-N security limits (exactness worth
  O(N) memory) (`05-resilience/05` §2.3–2.5).
- **Retry-After discipline:** a limiter without back-off guidance
  manufactures synchronized retry storms — compute from bucket refill
  math; jitter it (or you've synchronized the crowd —
  `05-resilience/04` P2).
- **Rollout:** shadow mode first (log would-be rejects, measure false-
  positive rate per class), then per-class ramp. Skipping this is how
  limiters cause their first outage.

## 6. Operations (39–45)

Page on: rejection-rate deltas per class (spike = attack or client bug —
both actionable), store health + fallback-mode activation, decision-latency
p99, batch-claim contention on hot keys. 10× growth: nothing structural —
batches amortize; the global-ceiling hot key needs re-sharding first.

---

## Probes & traps

- **"Why not just Redis INCR with EXPIRE per request?"** — hot-path
  latency tax at fleet RPS + fixed-window boundary 2N burst + a new
  tier-1 dependency + hot-key concentration; the batch design answers
  all four. Trap: accepting it as "simple" — the question tests whether
  you price a per-request network hop honestly.
- **"Your overshoot bound is batch×pods — an attacker exploits it."** —
  quantify: batch 10 × 10 k pods sounds like 100 k free requests, but
  batches are claimed per (class,key) only where traffic exists; an
  attacker on one key hits only the pods the LB gives them, each holding
  one small batch; tighten batch size per abuse class (→1 = central
  precision for those keys only — hybrid precision-per-class is the
  answer, not one global setting).
- **"Clock skew across pods?"** — token buckets are per-store or per-pod
  lazy-refill against their own monotonic clocks; no cross-machine
  timestamp comparison exists in the design (`01-distributed-systems/06`
  discipline: time as local rate, never as cross-machine truth).
- **"Rate limiter for internal service-to-service calls too?"** — mostly
  no: internal overload wants adaptive concurrency limits/bulkheads
  (capacity signals) not contractual rates
  (`05-resilience/02-circuit-breakers.md` §2.4) — knowing the boundary
  between the two tools is the point.

## Self-test

1. The three limiter jobs and where each gets its numbers.
2. Why is the per-request central hop rejected? Show the math.
3. The batch design: mechanism, overshoot bound, and the per-class
   tuning move.
4. Write token-bucket state and the lazy-refill update.
5. Failure policy per class, with the reasoning for each direction.
6. Why is Retry-After part of correctness, not politeness?
7. The last-token race: where it lives in each deployment shape and the
   fix.
8. Why layered keys (user + IP + global), and what's special about the
   global key operationally?
9. Shadow-mode rollout: what it measures and what skipping it risks.
10. When is a rate limiter the wrong tool for overload?

<details>
<summary><b>Answers</b></summary>

1. Protection — from measured system/partner capacity; abuse control —
   from "no legitimate actor does this" (human-scale numbers);
   quotas/fairness — from contracts/plans.
2. 0.5–1 ms store RTT on every one of 500 k RPS = 250–500 CPU-seconds/s
   of added fleet latency plus a hard tier-1 dependency at p99 on
   *every* API call; the ranking said latency ≈ availability >
   accuracy, so per-request precision buys the wrong thing.
3. Pods claim token batches per (class,key) from the central store,
   decide locally (~µs), return unused after idle; overshoot ≤
   batch_size × pods-holding-batches. Tune per class: abuse limits get
   batch→1 (central precision where it matters), protection limits get
   loose batches (throughput where precision doesn't).
4. State (tokens, last_ts). On arrival: tokens = min(B, tokens +
   (now−last_ts)·r); if tokens ≥ cost → subtract, ALLOW; else REJECT
   with retry_after ≈ (cost−tokens)/r.
5. Protection: fail-open — availability of payments/API outranks limit
   precision; bulkheads/shedding still bound damage. Abuse: fail-
   degraded-strict — conservative per-pod local limits, because an
   auth brute-forcer is the main beneficiary of an open window.
6. Rejections without back-off guidance produce synchronized immediate
   retries — the limiter manufactures the storm it exists to prevent;
   Retry-After (jittered) converts rejection into traffic shaping.
7. Central: two INCR/claims race past the limit — fix with atomic
   Lua/CAS (single-threaded Redis; Aerospike generation ops). Local:
   two threads race the pod's bucket — per-key atomics/striped locks.
   Same check-then-act shape as idempotency reservations.
8. Each catches what others miss: per-user fairness (needs auth),
   per-IP pre-auth abuse (CGNAT caveats), endpoint-global capacity
   backstop. The global key is ONE key at fleet RPS — itself a hot
   key: shard its counter and accept looser precision.
9. Would-be rejection rate per class against real traffic = the
   false-positive measurement; skipping it risks turning on a limiter
   that 429s legitimate peak traffic — the limiter causes the outage
   it was bought to prevent.
10. When the problem is capacity, not contract: internal service
    overload wants adaptive concurrency limits, bulkheads, and load
    shedding driven by live signals (queue age, latency) — contractual
    rates go stale with capacity and traffic mix; limiters are for
    demand you must *police*, not capacity you must *protect*.

</details>
