# Bulkheads

The least glamorous, most load-bearing resilience pattern. Timeouts bound how long
you wait; breakers decide whether to call; **bulkheads bound how much of you can be
consumed waiting**. Your `SupermoneyPool` is a bulkhead, and "prevented partner
latency from cascading into other UPI flows" is a bulkhead claim — this doc makes
you able to defend it to the last decimal.

---

## 1. Plain definition

A **bulkhead** is a capacity partition: a hard cap on how much of a shared
resource (threads, connections, memory, pods) any one workload/dependency may
consume. Named after ship construction — watertight compartments so a hull breach
floods one section, not the vessel.

The failure it prevents, mechanically: without partitions, all requests draw from
one pool of workers/connections. A single slow dependency makes *its* requests
hold workers longer (Little's law: held = arrival rate × hold time); as hold time
grows, that dependency's requests silently accumulate workers until the shared
pool is exhausted — and now requests that never touch the sick dependency can't
get a worker either. **One dependency's latency became everyone's outage.** That
is "cascading failure" in its most common concrete form, and a bulkhead is the
structural fix: the sick dependency can exhaust *its* compartment (200 threads)
and not one thread more.

Key mental shift: bulkheads don't make anything faster or more reliable — they
**convert unbounded failures into bounded ones**. The feature behind the flooded
compartment still fails; the ship still floats.

---

## 2. How it works in practice

### 2.1 The isolation mechanisms, JVM edition

**Thread-pool isolation** (Hystrix's signature): calls to dependency X execute on
a dedicated pool via handoff; the caller waits on a Future with a deadline.
- Buys: a hard concurrency cap; **enforceable timeouts** (caller detaches at the
  deadline even if the underlying client hangs — the worker is abandoned, not
  the request thread); freedom to reject instantly when pool + queue are full.
- Costs: handoff overhead (context switch + queuing, ~50–500 µs typical
  (estimate — measure)); memory (~1 MB default stack per thread → 200 threads
  ≈ 200 MB virtual, less resident); ThreadLocal context doesn't cross the
  handoff (the classic Hystrix pain: request context/MDC/traces must be
  explicitly transferred — your `HystrixRequestContext` plumbing exists for
  exactly this).

**Semaphore isolation:** a counter capping concurrent entries; call runs on the
*caller's* thread.
- Buys: near-zero overhead; no context-transfer problem.
- Costs: **cannot interrupt a hung call** — the timeout becomes advisory; a
  wedged client library holds the caller's thread indefinitely. Right for
  fast/local/trusted calls (in-memory, intra-DC with well-behaved clients);
  wrong for WAN partners.

**Connection pools as bulkheads:** the HTTP/DB client's pool caps concurrency at
the transport layer. Every service already has these; the L5 move is *aligning*
them: connection pool ≥ thread pool (or the bulkhead queues on connections
instead of its own queue — an invisible second bulkhead with different, usually
worse, rejection behavior).

**Queue in front of the pool:** Hystrix allows a small queue before rejection.
Keep it small (your ~20 vs pool 200): a queue adds latency, not capacity — 20
queued items at 100 ms each is 2 s of guaranteed extra wait for item 20, and
under sustained overload any finite queue fills anyway. Deep queues just delay
and fatten the failure. Reject fast; the fallback is cheaper than the wait.

### 2.2 Sizing (the math you must do live)

Little's law: **required concurrency L = λ (arrival rate) × W (hold time)**.
Work your real example both directions:
- Healthy: partner p50 ~100 ms at, say, 500 rps → L ≈ 50 threads busy. Pool of
  200 = 4× headroom.
- Degraded to timeout: W → 0.8 s → L = 200 threads saturates at exactly
  **250 rps**; beyond that, rejections — *which is the design working*: demand
  above what the sick partner can absorb is shed at the bulkhead instead of
  eating the service.
- The sizing statement for interviews: "pool ≈ peak λ × timeout-W, i.e., sized
  to survive *full-timeout latency at peak load* — or consciously smaller,
  accepting shed above that." If you size to healthy W, the bulkhead rejects
  during every brownout (maybe intended!); if to timeout-W at peak, it never
  sheds but holds more idle threads. Name which you chose and why
  **[VERIFY: was 200 derived or inherited?]**.

### 2.3 Beyond the JVM: bulkheads at every altitude

- **Instance/pod-level:** separate deployments per traffic class (e.g., a
  dedicated pool of pods for partner callbacks vs user traffic) — the strongest
  isolation, at infrastructure cost.
- **Kubernetes requests/limits:** CPU/memory caps are resource bulkheads
  between co-tenant pods; PodDisruptionBudgets bulkhead availability during
  ops.
- **Client-side per-tenant caps:** a rate/concurrency ceiling per API key —
  bulkheading *your callers* so one noisy tenant can't starve the rest.
- **Data-tier:** per-service DB users with connection caps; HBase RPC handler
  pools; Pulsar per-topic quotas **[verify what your platform exposes]**.
- **Priority classes as soft bulkheads:** reserving capacity for CRITICAL
  traffic (admission control) — bulkhead semantics without hard partitions
  (cross-ref `06-load-shedding-degradation.md`).

### 2.4 What breaking looks like

- Bulkhead **absent**: the cascade — request-thread starvation, every endpoint
  slow, thread dumps full of one dependency's stack traces (the smoking gun).
- Bulkhead **too small**: rejection rate on healthy traffic during ordinary
  peaks; pager: `threadpool.rejected` climbing while partner latency is normal.
- Bulkhead **too big**: it's not a bulkhead, it's the whole ship — 2000 threads
  "isolated" for one partner can still starve CPU/memory globally.
- Bulkhead **misaligned with client pool**: rejections replaced by mysterious
  queuing at the connection layer; latency histograms bimodal.

---

## 3. Senior-level depth

- **Granularity trades capacity efficiency against blast radius.** One pool per
  dependency-operation is maximal isolation and maximal waste (idle threads
  can't be shared across compartments); one pool for everything is maximal
  efficiency and zero isolation. The practical middle: compartment per
  *failure domain* — per external partner, per storage system — with
  per-operation breakers *inside* the shared compartment (exactly your
  SupermoneyPool + per-command-key design; that architecture is defensible,
  say it as a choice).
- **Static partitions waste capacity by design.** 10 pools × 4× headroom = 40×
  aggregate headroom that can never be pooled. The adaptive end of the
  spectrum: shared pool + per-class *concurrency limits* (semaphore-style caps
  that overlap), or adaptive concurrency limits per dependency — isolation as
  a limit, not a partition. Trade: soft limits can be gamed by bursts; hard
  partitions can't.
- **Virtual threads (Loom) change the arithmetic, not the principle.** With
  ~KB-stack virtual threads, "thread exhaustion" evaporates and thread-pool
  bulkheads lose their *mechanical* justification — but the resource being
  protected was never really threads: it's **concurrency toward a dependency**
  (its capacity) and **your memory/socket budget**. On Loom the bulkhead
  becomes a semaphore (Resilience4j Bulkhead) capping in-flight calls per
  dependency — same invariant, ~zero overhead, and timeouts enforced by
  cancellation-aware clients rather than thread abandonment. This is the
  modern answer to "would you still use thread pools?" — the cap survives,
  the pool doesn't.
- **Bulkheads and goodput:** rejection at the bulkhead is *early, cheap
  shedding* — µs-cost failure at the door vs 800 ms-cost failure at the
  timeout. A well-tuned bulkhead is a load shedder scoped to one dependency;
  seeing the two patterns as one mechanism at different scopes is an L5+
  synthesis.
- **L4/L5/L6:** L4 — "we isolate dependencies in thread pools." L5 — sizing
  math from λ×W both healthy and degraded, thread-vs-semaphore mechanics
  (interruptibility!), queue-depth philosophy, alignment with client pools,
  granularity-vs-efficiency trade, Loom's impact. L6 — capacity isolation as
  platform policy: per-tenant quotas, priority admission, cell-based
  architecture (bulkheads at the *deployment* altitude), org-wide adaptive
  limits.

---

## 4. Resume connection

- **SupermoneyPool = compartment-per-partner, breakers-per-operation.** 200
  threads, queue ~20, shared by four commands with independent circuit
  breakers. Defend the shape: the failure domain is the *partner* (network
  path, their capacity), so isolation is per-partner; health is per-*endpoint*,
  so detection is per-command. Two mechanisms, two granularities, deliberately.
- **The claim on your resume — "preventing partner latency from cascading into
  other UPI flows" — is precisely:** partner hangs → its 200 threads fill →
  201st call rejected in µs → grey-out fallback → P2P/checkout/other flows,
  running on *service* worker threads and other pools, never queue behind the
  partner. You can now narrate the counterfactual thread-dump (every jetty
  worker stuck in SmClient.call) — do so; counterfactuals prove understanding.
- **Little's law numbers:** 200/0.8 s = 250 rps saturation under full timeout;
  at healthy ~100 ms, ~2000 rps capacity. Interviewers *will* multiply these
  in their head — arrive with your real peak eligibility QPS **[FILL]** so the
  4×-headroom (or shed-above-X) statement is yours, not improvised.
- **Two-layer timeout alignment** (OkHttp read ≈ Hystrix deadline) is the
  companion fact — without it, the compartment floods with abandoned threads
  (arsenal C2).
- **Honest gaps:** ThreadLocal/request-context transfer across the Hystrix
  handoff — know how your stack solved it (`HogwartsRequestFilter` initializes
  Hystrix context **[VERIFY the mechanism]**); and whether connection-pool
  sizes were aligned with the 200 **[VERIFY]**.

**30–60 s spoken answer** ("how did you isolate the partner?"):

> "A dedicated Hystrix thread pool — 200 threads with a deliberately tiny
> queue — as the compartment for everything partner-bound, with per-operation
> circuit breakers inside it. The granularity is intentional: the failure
> domain is the partner — their capacity, that network path — so capacity
> isolation is per-partner; but health is per-endpoint, so detection is
> per-command. Sizing is Little's law both directions: at healthy hundred-
> millisecond latency, 200 threads clears about two thousand RPS; if the
> partner degrades to the full 800-millisecond timeout, the pool saturates at
> two-fifty and everything above that is rejected in microseconds into the
> grey-out fallback — which is the design working: demand the sick partner
> can't absorb gets shed at the bulkhead instead of eating the service. Thread
> isolation rather than semaphore because a WAN partner can hang below any
> advisory timeout, and only the handoff model lets the caller detach on
> deadline — with the HTTP client's read timeout aligned just above so
> abandoned workers are reclaimed instead of graveyarding the pool. On virtual
> threads I'd keep the cap and drop the pool: the invariant was never threads,
> it's bounded concurrency toward a dependency."

---

## 5. What the interviewer will push on

**P1. "Size the pool for me. Peak 1,000 rps to the partner, healthy p99
150 ms, timeout 800 ms. Go."**
- *Model:* healthy L = 1000 × 0.15 = 150 busy threads → pool must exceed 150
  with headroom (~200–300). Degraded-to-timeout L = 1000 × 0.8 = 800 — so
  either provision ~800 (never shed, huge idle cost) or state the policy:
  "size ~250 for healthy+headroom and *intentionally shed* above ~310 rps
  when the partner runs at timeout — the feature degrades, the service
  survives." There is no number without a policy; giving the policy IS the
  answer. Follow with queue: near-zero, rejection over waiting.
- *Trap:* producing one number silently. Also: forgetting that at degraded
  latency the *same pool* serves less throughput — candidates who size only
  the healthy case fail the follow-up.

**P2. "Thread-pool vs semaphore isolation — make the call for three cases: the
BNPL partner, an Aerospike read, an internal user-service call."**
- *Model:* Partner (WAN, third-party client lib, hang risk): thread pool —
  interruptible deadline is worth the handoff tax. Aerospike read (sub-ms,
  battle-tested client, its own timeouts): semaphore — a thread handoff
  costing ~100 µs on a 1 ms call is a 10% tax for protection you don't need;
  cap concurrency, trust client timeouts. Internal service (intra-DC, ms
  latency, generally well-behaved): semaphore by default, thread pool only if
  its client has hang history. The decision variable: *can the call hang past
  its advisory timeout, and what does that cost?*
- *Trap:* one-size answers in either direction; or missing that Hystrix
  semaphore mode exists at all.

**P3. "Your bulkhead rejects a request in 50 µs. The user still fails. What
did you actually win?"**
- *Model:* bounded blast radius and preserved goodput: (1) the failure costs
  µs not 800 ms — the service's worker thread serves someone else; (2)
  failure is *scoped* — only partner-dependent features degrade, everything
  else runs at full health (the counterfactual is total-service brownout);
  (3) the rejection is a clean, fast signal driving the fallback (grey-out)
  and metrics/alerts, versus ambiguous slow timeouts; (4) the partner gets
  less pile-on. Bulkheads never save the flooded compartment — they save the
  ship. If the interviewer wants the feature saved too, that's the fallback
  ladder's job, not the bulkhead's.
- *Trap:* overclaiming ("the user gets a cached answer") — that's the
  fallback's property, only if one exists; keep the mechanisms' credits
  separate.

**P4. "Loom lands in your stack. Do bulkheads survive?"**
- *Model:* the *cap* survives, the *pool* doesn't. What bulkheads protect was
  never thread scarcity per se — it's (a) the dependency's capacity (unbounded
  concurrency toward a browning-out service is a DDoS you aim at yourself),
  (b) your own memory/sockets/downstream pools. On virtual threads:
  semaphore-style per-dependency concurrency limits (near-zero cost), timeouts
  via cancellation-aware clients, and the freed complexity budget goes to
  adaptive limits. What to *stop* doing: paying handoff tax and managing pool
  sizes. Bonus nuance: pinning (synchronized blocks) was the caveat, fixed
  ~JDK 24 [VERIFY] — shows you track the detail.
- *Trap:* "Loom makes bulkheads unnecessary" — unbounded concurrency toward a
  finite dependency is the original cascade, threads or no threads.

---

## Self-test

1. State the cascade mechanism a bulkhead prevents, using Little's law, and
   name the thread-dump smoking gun.
2. Thread-pool isolation: what it uniquely buys, its three costs, and the
   ThreadLocal problem.
3. Why must semaphore isolation never front a hang-capable WAN client?
4. Why keep the bulkhead queue near zero? Quantify the harm of a deep queue.
5. Compute: 200 threads, 800 ms degraded latency — saturation rps? At healthy
   100 ms? What happens above each?
6. Give the sizing *policy* question hidden inside every sizing *number*
   question.
7. Compartment-per-partner with breakers-per-operation: defend the two
   granularities.
8. Name four bulkheads in your stack at altitudes other than Hystrix.
9. What does misalignment between thread pool and connection pool produce?
10. Static partitions vs shared-pool-with-limits: the trade, and where
    adaptive concurrency limits fit.
11. "Loom kills bulkheads" — refute in two sentences, then say what Loom
    *does* kill.
12. Connect bulkhead rejection to load shedding: same mechanism at what
    scope, and why is early rejection "goodput-preserving"?

<details>
<summary><b>Answers</b></summary>

1. Held workers = λ × W; a slow dependency grows W, so its requests silently
   accumulate workers from the shared pool until exhaustion, starving
   requests that never touch it. Smoking gun: thread dump where nearly every
   worker's stack ends in the one dependency's client call.
2. Buys an enforceable deadline (caller detaches at timeout even if the
   client hangs — worker abandoned, not the request thread) plus hard
   concurrency cap and instant rejection. Costs: handoff overhead
   (~50–500 µs), ~1 MB stack per thread, and ThreadLocals (trace/MDC/request
   context) don't cross the handoff — must be explicitly propagated (Hystrix
   request-context plumbing).
3. The call runs on the caller's own thread; if the client hangs past its
   advisory timeout there is no handoff to abandon — the caller's thread is
   gone until the socket gives up, and enough of those is the exact cascade
   bulkheads exist to prevent.
4. A queue adds wait, not capacity: item k waits ~k × service-time (20 × 100
   ms = 2 s guaranteed extra latency for the last slot) and under sustained
   overload any finite queue fills anyway — you've fattened every failure by
   the queue's worth of delay before rejecting regardless. Reject fast, run
   the fallback.
5. 200/0.8 = 250 rps saturated-degraded; 200/0.1 = 2,000 rps healthy. Above:
   instant rejections into fallback (degraded case — by design, shedding
   demand the partner can't absorb) / above healthy capacity you'd also
   reject — meaning the pool, not the partner, is the constraint: resize or
   accept the ceiling.
6. "Do you size for degraded-at-peak (never shed, pay idle threads) or for
   healthy-plus-headroom (intentionally shed during brownouts)?" The number
   is an output of that policy plus λ×W; a number without the policy is
   unfounded.
7. Failure domain = partner (shared network path, shared capacity, shared
   auth) ⇒ capacity isolation per partner so any partner-wide failure is
   capped. Health = per endpoint (one API can be sick while others are fine)
   ⇒ detection/tripping per command so a sick endpoint doesn't condemn
   healthy ones. Isolation and detection are different questions;
   granularities may differ.
8. HTTP/DB connection pools (transport-layer caps); Kubernetes CPU/memory
   requests+limits (co-tenant resource isolation); separate deployments/pod
   pools per traffic class (callbacks vs user traffic) [if used — verify];
   per-service DB users with connection caps / HBase RPC handler pools /
   Pulsar per-topic quotas; per-tenant rate/concurrency caps at the gateway.
9. If connections < threads: threads queue invisibly at the connection pool —
   bimodal latency, rejections replaced by opaque waiting, the bulkhead's
   fast-fail behavior silently defeated. If connections ≫ threads: harmless
   idle cost. Rule: align, with connections ≥ threads.
10. Hard partitions can't be gamed but strand idle capacity (headroom ×
    compartments never pools); shared pool with per-class semaphore limits
    reclaims efficiency but bursts contend and enforcement is softer.
    Adaptive concurrency limits sit at the soft end: per-dependency caps
    that track measured capacity, no static number to go stale.
11. Unbounded concurrency toward a finite dependency is self-inflicted DDoS
    whether carried by 200 platform threads or 2 million virtual ones — the
    cap must survive. What dies is the *pool as mechanism*: handoff tax,
    stack memory math, and abandonment-based timeouts, replaced by semaphore
    caps + cancellation.
12. Same mechanism — refuse work you can't serve well — scoped to one
    dependency instead of the whole service. Early rejection costs µs at the
    door instead of a timeout's worth of held resources per doomed request,
    so capacity keeps flowing to requests that can still succeed: goodput
    preserved, failure bounded.

</details>
