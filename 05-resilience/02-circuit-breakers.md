# Circuit Breakers — All Types

Your resume says "Hystrix circuit breakers"; the interviewer's job is to find out
whether that means "I annotated a method" or "I understand the state machine, the
counting windows, what counts as failure, and what replaced Hystrix." This doc
covers every breaker type you asked for — count-based, time-based, sliding-window,
adaptive — plus the tuning judgment that separates levels.

---

## 1. Plain definition

A circuit breaker wraps calls to a dependency and **stops calling it when it's
judged unhealthy**, failing fast instead. Named after the electrical device: when
current (errors) exceeds a safe threshold, the circuit opens and current stops
flowing — protecting both the house wiring (the caller: no more threads/latency
burned on a dead dependency) and the appliance (the callee: breathing room to
recover instead of being hammered mid-collapse).

The canonical **three-state machine**:

- **CLOSED** (healthy): calls flow; outcomes are counted in a window.
- **OPEN** (tripped): calls short-circuit immediately to a fallback/error; no
  traffic reaches the dependency. After a cool-down, transition to…
- **HALF-OPEN** (probing): a limited number of trial calls pass through.
  Success → CLOSED; failure → OPEN again. This is the failure detector's
  "refutation probe" (cross-ref `01-distributed-systems/07-failure-detection.md`
  — a breaker IS a failure detector whose signal is real request outcomes and
  whose verdict is "stop calling").

Why fail-fast matters more than it sounds: without a breaker, every call to a
dead dependency costs a *full timeout* (800 ms of a held thread, times QPS);
with one, it costs microseconds. The breaker converts "slow failure" — the
expensive, cascading kind — into "instant failure" — the cheap, handleable kind.

---

## 2. The breaker taxonomy (the four types, mechanically)

### 2.1 Count-based sliding window

Track the outcomes of the **last N calls** (ring buffer). Trip when
failure-rate over those N exceeds a threshold, subject to a minimum number of
calls. Resilience4j: `slidingWindowType=COUNT_BASED, slidingWindowSize=100,
failureRateThreshold=50, minimumNumberOfCalls=20`.
- Wins: constant memory; behavior independent of traffic rate; intuitive.
- Loses: at very low traffic, N calls can span a long wall-clock time — the
  window "remembers" stale history; at very high traffic, N calls is
  milliseconds — twitchy.

### 2.2 Time-based (rolling window)

Track outcomes over the **last T seconds**, usually as B buckets of T/B each
(rotate a bucket, drop the oldest — cheap and O(1)). **Hystrix's model:** 10 s
window, 10 × 1 s buckets, `requestVolumeThreshold=20` (don't judge on thin
evidence), `errorThresholdPercentage=50`, `sleepWindowInMilliseconds=5000`.
Resilience4j: `slidingWindowType=TIME_BASED`.
- Wins: verdicts reflect "now" regardless of traffic; natural for rate-style
  SLO thinking.
- Loses: bucket granularity artifacts; a burst can be diluted by an
  otherwise-quiet window.

### 2.3 Slow-call-aware windows (the modern default)

Resilience4j adds what Hystrix lumped into timeouts:
`slowCallDurationThreshold` + `slowCallRateThreshold` — calls that *succeed
slowly* count toward tripping. This matters because **brownout precedes
blackout**: dependencies usually degrade (p99 explodes) before they error, and
a breaker that only counts errors reacts one phase too late, after your pools
are already full of slow successes. Treating slowness as failure is the single
most valuable Resilience4j upgrade — say this unprompted.

### 2.4 Adaptive (no fixed threshold at all)

Static thresholds go stale: capacity changes, traffic mixes shift, "50% errors
over 10 s" is right for one regime and wrong for the next. Adaptive approaches
regulate instead of tripping:

- **Adaptive concurrency limits** (Netflix `concurrency-limits`, Envoy adaptive
  concurrency): treat the dependency like TCP treats a network — probe for the
  concurrency at which latency starts rising (gradient of observed RTT vs
  baseline), and continuously adjust an in-flight-request limit
  (AIMD/gradient). No open/closed cliff; the system settles at the
  dependency's actual capacity. This is Netflix's own successor direction to
  Hystrix — the L5 name-drop that proves you followed the plot.
- **Outlier detection** (Envoy/mesh): per-*endpoint* ejection — consecutive
  5xx/latency outliers get a host ejected from the load-balance set for a
  cool-down, with a cap on % ejected. It's a breaker at per-replica
  granularity, solving gray failure (one limping pod) that a service-level
  breaker can't see.
- **Error-budget–driven** brownout: trip degradation when the burn rate of an
  SLO budget exceeds a threshold — couples the breaker to the *business*
  contract rather than a local ratio.

Decision rule of thumb: fixed-window breakers for *binary* dependency health
(it's up or it's down — external partners), adaptive concurrency for *capacity*
protection (shared internal services that brown out), outlier ejection for
*replica-level* gray failure. They compose; mature platforms run all three.

---

## 3. Senior-level depth

### What counts as failure (the tuning decision that matters most)

- **Transport errors & timeouts:** yes, always.
- **5xx:** yes. **429/503 with Retry-After:** yes for tripping *toward the
  callee's own signal* (it's telling you to back off).
- **4xx business errors: NO.** A validation error or "insufficient balance" is
  a *successful conversation* — counting it trips the breaker on your own
  users' behavior. Misclassifying 4xx as failure is the most common real-world
  breaker bug; it converts a bad-input spike (say, a client app bug) into a
  full feature outage.
- **Slow successes:** yes (see §2.3) — with the threshold set from the caller's
  budget, not the dependency's habits.
- Also decide the **fallback's own failure accounting** (a failing fallback
  shouldn't re-trip anything) and whether **breaker-rejected calls** count in
  your SLO error rate (they should count as degradation, tracked separately).

### Granularity

Per-operation (your per-command keys: `balanceFetch` vs `createMandate`) so one
sick endpoint doesn't condemn the healthy ones; per-host/per-replica via
outlier detection; per-tenant if a partner multiplexes customers. Cost of finer
granularity: thinner traffic per breaker → slower, noisier verdicts
(`minimumNumberOfCalls` takes longer to accumulate). There's a real floor: a
breaker on a 0.1-QPS operation is statistical fiction — for those, share the
breaker at the service level and accept coarse verdicts.

### Interactions that bite

- **Retries × breakers:** retries multiply the error count (1 failure → 4
  counted attempts with 3 retries) → breakers trip faster than intended; and
  when HALF-OPEN admits one probe, a retry storm behind it can slam the door
  (probe drowned in queued demand). Order the decorators deliberately:
  breaker *outside* retry (each logical operation judged once) or retry
  *outside* breaker with retry-on-CallNotPermitted disabled — know which your
  stack does **[Hystrix had no native retry — your retries live in Pulsar
  redelivery, which is the outside-the-breaker shape; verify and claim it]**.
- **The reclose stampede:** breaker closes after recovery → full traffic hits a
  cold dependency (empty caches, fresh connections, JIT-cold) → re-trips →
  flapping. Fixes: HALF-OPEN with *multiple gradual* probes
  (`permittedNumberOfCallsInHalfOpenState`), slow-start/ramp in the LB, or
  adaptive limits (which never slam anything).
- **Fallback quality:** the breaker only converts failure modes; the *product*
  outcome is the fallback. Ladder: cached/stale answer → default/degraded
  answer → feature removal (your grey-out) → queued deferral (your async
  path) → error. A breaker with a bad fallback is just a faster outage.
- **Distributed state:** each instance trips independently (N pods = N
  breakers = 1/N'th the evidence each). Usually correct (verdict follows each
  instance's own view/connections); centralizing breaker state adds a
  dependency and correlation — generally don't. But know the consequence:
  under partial failure, some pods open, some closed → users see inconsistent
  behavior; mesh-level outlier detection restores coherence.

### L4 vs L5 vs L6

- **L4:** states/threshold/fallback; "Hystrix does it."
- **L5:** window mechanics + what-counts-as-failure judgment + slow-call
  awareness + retry/stampede interactions + per-operation granularity with its
  statistical floor + the Hystrix→Resilience4j→adaptive-limits timeline.
- **L6:** platformizes it — mesh-level policies so teams can't misconfigure;
  adaptive regulation replacing thresholds; degradation tied to error budgets
  and product tiers.

---

## 4. Resume connection

Your arsenal already carries the SuperPay breaker story
(`00-resume-arsenal/01-superpay-later-sbmd.md`, C3/C4; `05-cross-cutting-attacks.md`
X2 for the "Hystrix is dead" defense). What this doc adds:

- **Name your windows precisely:** Hystrix rolling 10 s window / 20-request
  volume threshold / 50% error threshold / 5 s sleep window, single-probe
  half-open **[VERIFY your actual configs — quoting your own thresholds and
  their rationale is the difference between "used" and "tuned"]**.
- **The 4xx lesson applied:** partner "insufficient balance" responses are
  *successful* conversations mapped through your config-driven response-code
  resolver — they must not count as breaker failures, or a promotion-driven
  spike of low-balance users would grey out BNPL for everyone. Whether your
  Hystrix commands classified these correctly is a question you should be able
  to answer **[VERIFY]** — and the resolver design is your evidence that
  partner codes were first-class citizens.
- **Your half-open exposure:** Hystrix's single-probe reclose against a
  flash-sale traffic wall is the stampede risk in §3; your mitigation story is
  the grey-out fallback (demand doesn't queue behind the probe — it degrades).
- **Slow-call blindness:** Hystrix counts timeouts but not slow-successes
  under the timeout; your 800 ms budget means a partner running at 750 ms is
  "healthy" to the breaker while eating your entire margin. If asked "what
  would you improve," this is a precise, honest answer: migrate to
  slow-call-rate tripping.

**30–60 s spoken answer** ("tell me about your circuit breakers"):

> "Per-operation Hystrix commands over the partner integration — separate
> breakers for balance fetch and mandate operations sharing one bulkhead, so a
> sick eligibility endpoint can't condemn healthy mandate creation. Rolling
> ten-second windows with a volume floor so we never judge on thin evidence,
> and the failure taxonomy tuned so partner *business* responses — like
> insufficient balance, which arrive as partner codes we normalize through a
> config-driven resolver — never count against the breaker; only transport
> errors and timeouts do, because tripping on your own users' behavior is how
> a client bug becomes a feature outage. Fallback is deliberate degradation:
> grey out the credit option, no queued demand piling behind the half-open
> probe. And I know where this design ages: Hystrix is threshold-based and
> blind to slow-successes under the timeout, so today I'd move to
> Resilience4j's slow-call-rate tripping for the brownout-before-blackout
> phase, and adaptive concurrency limits — the Netflix successor approach —
> for shared internal capacity."

---

## 5. What the interviewer will push on

**P1. "Walk me through the exact sequence from healthy to tripped to recovered,
with your real numbers."**
- *Model:* closed, counting in the rolling window → partner degrades → timeouts
  cross 50% of ≥20 requests in 10 s → open: all calls short-circuit to
  grey-out fallback for the 5 s sleep window → half-open: one probe admitted →
  success closes (full traffic resumes — name the cold-dependency stampede
  risk and your mitigation), failure re-opens for another sleep window. Then
  the ops layer: breaker-state metric, fallback-rate alert, and how long you'd
  let it flap before a human intervenes.
- *Trap:* not knowing half-open exists, or your own thresholds. Both are
  instant "used, didn't understand" verdicts.

**P2. "A client app ships a bug sending malformed requests — 60% of calls now
return 400. What does your breaker do, and what should it do?"**
- *Model:* if 4xx counts as failure, the breaker trips and the feature dies
  for *everyone* — the breaker turned a partial client bug into a total
  outage; that's the misclassification bug. Correct behavior: 4xx is a
  successful conversation about bad input — excluded from failure rate
  (Resilience4j `ignoreExceptions` / recordException predicates); the defense
  for the *callee* against a 400-storm is rate limiting, not breaking. Close
  by generalizing: the failure taxonomy IS the breaker's design; the state
  machine is commodity.
- *Trap:* "the breaker protects us from the bad client" — it protects nobody
  and amputates the feature; confusing breaker (dependency health) with rate
  limiter (demand control) is the diagnostic the question runs.

**P3. "Hystrix vs Resilience4j vs adaptive concurrency — when is each right?"**
- *Model:* Hystrix: legacy platform standard, maintenance-mode since 2018;
  thread-pool-centric; right only as an installed base you understand deeply.
  Resilience4j: composable decorators (breaker/bulkhead/timelimiter/retry),
  count- or time-based windows, slow-call-rate tripping, multi-probe
  half-open — the correct default for new JVM services. Adaptive concurrency
  limits: when the failure mode is *capacity* (shared internal services that
  brown out) rather than binary partner death — no threshold to go stale;
  regulates instead of tripping. Compose: static-window breakers on external
  partners (binary health, contractual behavior), adaptive limits on internal
  shared tiers, outlier ejection at the mesh for replica-level gray failure.
- *Trap:* framing it as a version upgrade ("Resilience4j is newer Hystrix")
  instead of a philosophy shift (thresholds → regulation).

**P4. "Should you put a circuit breaker on your database?"**
- *Model:* mostly no for the classic breaker: a primary DB is usually a
  *hard* dependency — failing fast to no fallback just relabels the outage,
  and a false trip on the one dependency you can't degrade around is
  self-harm. What you actually want on a DB: connection-pool bulkheads +
  aggressive statement timeouts (bound the damage), load shedding upstream,
  and *maybe* breakers on **specific degradable queries** (an expensive
  analytics read with a cached fallback). Exception: replica reads with a
  fallback-to-primary or fallback-to-stale — breaker-shaped logic earns its
  keep there. The principle: breakers require a meaningful open-state
  behavior; no fallback, no breaker — just timeouts and shedding.
- *Trap:* reflexive "breakers on everything." The question probes whether you
  know breakers are a *degradation* tool, not a magic reliability sticker.

**P5. "Your breaker is per-instance and you run 40 pods. What are the
consequences?"**
- *Model:* each pod judges from 1/40th of traffic → verdicts are slower and
  noisier (volume threshold takes 40× longer to fill at the margin);
  partial-failure views diverge (pods with bad connections open, others stay
  closed) → inconsistent user experience but *correct* local behavior — each
  pod's breaker reflects its own reality, which matters when the failure is
  path-specific (one AZ's route to the partner is bad). Centralizing state
  would give coherent verdicts at the cost of a new dependency + losing
  path-specific truth — usually the wrong trade; mesh outlier detection is
  the better coherence layer. Know the per-instance math when quoting
  thresholds: "20 requests in 10 s" must hold *per pod*.
- *Trap:* never having considered that thresholds are per-instance — quoting
  fleet-level QPS against per-pod volume thresholds is a real config bug
  interviewers have seen (and maybe caused).

---

## Self-test

1. Draw the three-state machine with transition conditions, and name what
   half-open corresponds to in failure-detector vocabulary.
2. Count-based vs time-based windows: the failure mode of each at traffic
   extremes.
3. Why is slow-call-rate tripping the most valuable modern upgrade? Name the
   phase it catches that error-counting misses.
4. Describe adaptive concurrency limits: signal, algorithm family, and what
   problem of static thresholds they dissolve.
5. Build the what-counts-as-failure table: transport errors, timeouts, 5xx,
   429, 4xx, slow successes — and justify the 4xx row with the outage it
   prevents.
6. Retries × breakers: the two interaction bugs and the decorator-ordering
   fix.
7. The reclose stampede: mechanism and three mitigations.
8. Your Hystrix defaults (window, volume threshold, error %, sleep) — and
   which of them is per-instance in a 40-pod fleet.
9. Why per-operation command keys? And what's the statistical floor that
   limits granularity?
10. Breaker on the primary database: the principled answer and the exception.
11. What does Envoy outlier detection catch that a service-level breaker
    cannot?
12. Give the fallback ladder from best to worst, with your platform's example
    at each rung you can fill.

<details>
<summary><b>Answers</b></summary>

1. CLOSED —(failure rate ≥ threshold over ≥ min calls)→ OPEN —(sleep window
   elapses)→ HALF-OPEN —(probe success)→ CLOSED, —(probe failure)→ OPEN.
   Half-open = the refutation probe of a failure detector (breaker = detector
   whose signal is real outcomes, verdict "stop calling").
2. Count-based: at low traffic the last-N window spans huge wall-clock time
   (stale memory drives verdicts); at high traffic N spans milliseconds
   (twitchy). Time-based: at low traffic the window may never reach the
   volume floor (no verdicts); bucket rotation granularity can dilute or
   chop bursts.
3. Dependencies brown out before they black out — p99 explodes while calls
   still succeed. Error-only breakers react after pools are already full of
   slow successes; slow-call-rate thresholds trip during the brownout phase,
   one phase earlier, when degradation is cheap.
4. Signal: observed latency/RTT gradient vs a baseline (and queue-ability)
   per in-flight concurrency. Algorithm: TCP-congestion-style probing
   (gradient/AIMD) of a concurrency limit, continuously adjusted. Dissolves:
   static thresholds going stale as capacity/traffic-mix changes — regulation
   replaces the open/closed cliff.
5. Transport errors: count. Timeouts: count. 5xx: count. 429/503+Retry-After:
   count (callee's own back-off signal). 4xx business responses: never —
   they're successful conversations about input; counting them lets a client
   bug or a low-balance user spike trip the breaker and amputate the feature
   for everyone. Slow successes: count, threshold from the caller's budget.
6. (a) Each logical failure counted multiple times through retries → early
   tripping; (b) retry queue slams the single half-open probe. Fix: order
   deliberately — breaker outside retry (judge once per logical op), or retry
   outside breaker with no retry on breaker-rejection; queue-level redelivery
   (Pulsar) is naturally outside.
7. Close → full cold traffic (empty caches, cold connections/JIT) → latency/
   error spike → re-trip → flap. Mitigations: multi-call gradual half-open,
   LB slow-start/ramp, adaptive limits (no cliff), pre-warming.
8. Hystrix: 10 s rolling window (10×1 s buckets), requestVolumeThreshold 20,
   errorThresholdPercentage 50, sleepWindow 5 s, single-probe half-open
   [verify your overrides]. All counting is per-instance: 20-in-10 s must
   hold per pod — fleet QPS ÷ 40.
9. So one sick endpoint (balance fetch) doesn't condemn healthy ones (mandate
   create): different endpoints, different health. Floor: each breaker needs
   enough traffic to fill its volume threshold in a meaningful time — a
   0.1 QPS operation can't sustain statistically honest verdicts; share
   coarser breakers there.
10. No fallback ⇒ no breaker: for a hard primary, fail-fast to nothing just
    relabels the outage and false trips are self-harm — use connection-pool
    bulkheads, statement timeouts, upstream shedding. Exception: degradable
    reads (replica reads with fallback-to-primary/stale, expensive queries
    with cached fallback) where an open state has meaning.
11. Replica-level gray failure: one limping pod among N healthy ones. A
    service-level breaker sees a diluted (1/N) error rate and stays closed;
    outlier detection compares endpoints against each other and ejects the
    outlier.
12. Cached/stale answer (eligibility could serve last-known-good [if product
    accepted it — verify]) → default/degraded answer → feature removal
    (grey-out — your real rung) → queued deferral (async payment path —
    your real rung for execution) → clean fast error. Lower rungs cost more
    product; the breaker only buys you the *choice*.

</details>
