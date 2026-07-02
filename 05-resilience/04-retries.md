# Retries — Backoff, Jitter, Budgets, and Storms

Retries are the resilience mechanism most likely to *cause* your next outage.
Used well, they erase transient failures invisibly; used naively, they turn a
5-second blip into a 45-minute metastable collapse. Interviewers love this topic
because it has clean math, famous postmortems, and a sharp L4/L5 line: L4 adds
retries, L5 governs them.

---

## 1. Plain definition

A **retry** is attempting a failed operation again on the bet that the failure
was **transient** — a dropped packet, a momentary queue spike, a node mid-restart
— rather than **persistent** (bad request, dead feature, sustained overload).
That bet is the entire theory: retries convert transient failures into latency.
Against persistent failures they convert one failure into N failures *plus N
times the load*.

Analogy: redialing a call that didn't connect. Reasonable once, after a pause.
Now picture 50,000 people redialing the same overloaded switchboard every second
— the redials *are* the outage. That crowd behavior, not the individual redial,
is what this doc is really about.

Three governing questions for any retry design — **what** (which failures are
retryable), **how** (spacing, attempts, deadlines), and **where** (which layer
of the stack owns the retry) — and a precondition that outranks all three:
**the operation must be safe to repeat** (idempotent, or identity-deduped),
because a retry after a timeout may repeat work that already succeeded
(cross-ref `07-idempotency.md`, and the double-debit catechism in
`00-resume-arsenal/03-core-upi-platform.md`).

---

## 2. How it works in practice

### 2.1 What to retry (the taxonomy — most real bugs live here)

| Outcome | Retry? | Why |
|---|---|---|
| Connect failure / connection reset before send | Yes, freely | Request never reached the server; no side effects possible |
| 503 / explicit "overloaded, retry later" | Yes, with backoff, honoring `Retry-After` | Server-declared transient |
| 429 rate-limited | Only after `Retry-After`; ideally back off harder | You are the problem |
| Timeout | **Only if idempotent/identity-keyed** | Outcome unknown — may have executed |
| 500 internal error | Cautiously, if idempotent | May be persistent; may have side-effected |
| 4xx validation/auth/business | **Never** | Persistent by definition; retrying is pure waste |
| Breaker-open / bulkhead-rejected | Never immediately | The system just told you to stop |

The taxonomy must be *encoded*, not tribal knowledge: retry predicates on
exception/status classes, not `catch (Exception) { retry(); }` — which is the
single most common retry bug in production code.

### 2.2 Spacing: exponential backoff + jitter (know the formulas)

- **Naive exponential:** delay_n = base × 2ⁿ, capped: min(cap, base × 2ⁿ).
  E.g., base 100 ms, cap 10 s → 100, 200, 400, 800, 1600…
- **The synchronization problem:** a mass failure (deploy, blip) fails
  thousands of clients *at the same instant*; pure exponential means they all
  retry at the same instants too — traffic arrives as synchronized waves that
  can re-kill a recovering server, wave after wave.
- **Full jitter (the AWS-recommended default):** delay_n = random(0, min(cap,
  base × 2ⁿ)). Spreads each wave uniformly across its window — the aggregate
  arrival becomes smooth. Trades individual predictability for crowd safety;
  the crowd is what matters.
- **Equal jitter** (half fixed, half random) and **decorrelated jitter**
  (delay = min(cap, random(base, prev × 3))) exist; knowing full jitter + why
  is sufficient — being able to *draw* the synchronized-waves-vs-smear picture
  is worth more than naming variants.

### 2.3 Attempts, deadlines, and where the retry lives

- **Attempt count is the wrong primary control; the deadline is.** "3 retries"
  with exponential backoff can outlive any caller budget. The retry loop must
  be deadline-aware: stop when remaining budget < next attempt's worst case
  (attempt timeout + backoff). Otherwise you retry into a void — the user is
  gone (cross-ref `01-timeouts.md`, deadline propagation).
- **Retry at ONE layer — the layer that has both idempotency and context.**
  The amplification theorem every interviewer wants: if each of L layers
  retries R times, worst-case attempts = R^L. Three layers × 3 retries = 27
  requests from one user tap. Convention: retry near the *edge* (which knows
  the user's budget and the operation's identity) or at a designated
  middle layer; everything below propagates failure fast. Client-app retries
  + gateway retries + service retries + client-library retries is how
  companies discover R^L empirically.
- **Per-try timeout vs overall budget:** overall 2 s with per-try 600 ms and
  full-jitter backoff → 2–3 attempts fit. Configure both explicitly; defaults
  disagree across libraries.

### 2.4 Retry budgets (the fleet-level governor)

Per-request policies can be individually correct and collectively fatal. A
**retry budget** caps retries as a *ratio of successful traffic* — e.g.,
retries may add at most 10–20% extra load (token bucket: earn retry tokens
from successes, spend per retry; Finagle's implementation, and Google SRE's
"retry only if the failure rate is below X" guidance are both this idea).
Effect: when failures are rare (transient world), retries flow freely; when
the dependency is *down or saturated* (persistent world), the budget starves
retries and the system degrades to ~1× load instead of R×. The budget is the
difference between "retries hide blips" and "retries triple the load on a
system at 105% capacity." This concept — more than jitter — is the L5 marker.

### 2.5 Server-side participation

The callee isn't passive: `Retry-After` headers, throttling responses that
distinguish "back off" from "give up", and admission control that rejects
*cheaply* (so retried load costs little) are the server's half of the
contract. A server that fails *slowly* under overload (timeouts rather than
fast 503s) maximizes the damage retries do to it.

---

## 3. Senior-level depth

### Metastable failure (the concept that names the big outages)

Sequence: trigger (deploy blip, 10-second dependency stall) → failures spawn
retries → load rises above capacity → more failures → more retries. The
feedback loop **sustains itself after the trigger heals**: the system sits in
a stable overloaded state (goodput ≈ 0) that only load shedding, retry
disabling, or traffic draining can break — turning it off and on again works
precisely because it breaks the loop. Named "metastable failures" in the
literature (Huang et al.; Meta/AWS postmortems abound). Two properties to
articulate: (1) the trigger and the sustaining mechanism are *different
things* — fixing the trigger doesn't fix the outage; (2) the sustaining load
is *your own* retries/timeouts/health-checks — self-inflicted. Every guard in
this doc (jitter, budgets, deadline-awareness, breakers, fast rejection) is
an attack on the loop's gain.

### Work amplification below the failure point

A request that fails at hop 4 of 5 consumed work at hops 1–4; its retry
re-consumes them. Under brownout, deep-stack retries multiply *upstream* cost
for *downstream* failures. Mitigations: fail as early/cheap as possible
(validation and admission at the door), retry as close to the failure as
correctness allows *if* cheap (hedges/replica-retry for reads), otherwise
surface fast to the owning layer.

### Retries vs the rest of the toolbox

- Breaker = retry suppressor at dependency scope (stop betting on transient).
- Retry budget = retry suppressor at fleet scope.
- Hedging = latency tool (parallel bet) not failure tool — needs idempotency
  and cancellation.
- **Queue-as-retrier:** a durable queue with redelivery-on-nack + delayed
  redelivery *is* a retry mechanism — with better properties for async work:
  survives process death, centralizes backoff policy, exposes depth/age as
  backpressure signals, and has a terminal state (DLQ) instead of silent
  drop. This is your platform's shape (next section).

### L4 vs L5 vs L6

- **L4:** adds `@Retryable(3)` with exponential backoff; can say "jitter".
- **L5:** encodes the retryability taxonomy; deadline-aware loops; single
  retry layer with the R^L argument; retry budgets; jitter with the crowd
  story; knows metastability by name and mechanism; designs the server's
  half (fast rejection, Retry-After).
- **L6:** platform-level policy — budgets and taxonomies as library/mesh
  defaults nobody can skip; degradation modes rehearsed; org-wide "who may
  retry" architecture rules.

---

## 4. Resume connection

Your platform's retry story is unusually good — it's mostly *not* in-process
loops, and that's a strength to present deliberately:

- **Pulsar redelivery as the retry engine:** consumer nack → broker
  redelivers with backoff → bounded attempts → DLQ. Durable (survives
  worker death), centrally configured, observable (redelivery count,
  backlog age), terminal-stated (DLQ + force-query instead of infinite
  retry). Frame: "we moved retries out of request threads into the queue,
  where they're durable and governable."
- **The retryability taxonomy, applied to money:** receive-money (local
  idempotent write) → plain retry; send-money-ish paths (external effect,
  unknown outcome on timeout) → *no blind re-execution*; retries carry the
  same transaction identity, and exhaustion triggers force-query — "retry
  the question, not the action." You implemented the taxonomy's hardest row
  correctly; most candidates have only read about it.
- **Client retry storms absorbed by design:** mobile clients retry on
  timeout (you don't control them) → gateway dedup makes the storm
  idempotent; the retry problem is solved on the *receiving* side. That's
  the server's-half-of-the-contract point made concrete.
- **SM's mandate-execution retry ladder** (1, 2, 5, 10 min, then hourly ×10)
  — a *business-level* retry policy: spacing matched to the failure mode
  (insufficient balance recovers on human timescales, not milliseconds).
  Great example that backoff schedules should model the *recovery process*,
  not just multiply by 2.
- **Honest gaps:** no fleet-wide retry *budget* (your governors are
  redelivery caps + breakers + dedup) **[VERIFY]**; in-process retry configs
  in HTTP clients may exist unaudited **[VERIFY — the R^L audit question:
  does OkHttp retry on connection failure by default? (it does unless
  disabled) — know whether your stack double-retries]**.

**30–60 s spoken answer** ("how do you handle retries?"):

> "The design rule is: one governed retry layer per path, and the operation's
> idempotency decides everything. On the async payment path, retries live in
> the queue, not in threads — a failed execution is negatively acknowledged
> and Pulsar redelivers with backoff, bounded attempts, then dead-letter.
> That's durable across worker death and centrally observable. The taxonomy
> is encoded per path: a receive-money event is a local idempotent write, so
> it just retries; anything that touched an external money effect never
> blindly re-executes — redelivery carries the same transaction identity, and
> when attempts exhaust we force-query NPCI for what actually happened,
> because a timeout means unknown outcome, not failure. On the inbound side
> we're the retried-against party — mobile clients storm on timeouts — so the
> gateway absorbs it with request-identity dedup rather than hoping clients
> behave. And where humans set schedules, they model the recovery process:
> mandate execution retries at minutes-then-hourly, because insufficient
> balance heals on human timescales, not exponential ones."

---

## 5. What the interviewer will push on

**P1. "Design the retry policy for the payment-submit API, end to end."**
- *Model:* walk the layers assigning exactly one retrier per hop-class.
  Client→gateway: client retries on timeout with full jitter, capped, carrying
  an idempotency key; gateway dedups (so client retries are free). Gateway→
  txn-svc: fail fast, no retry (edge already owns it). Async execution: queue
  redelivery with backoff + DLQ + force-query (identity-keyed). External
  effect (PSP/NPCI): retry only with same txn identity; timeout ⇒
  status-query path, never re-initiate. State the deadline: retries stop when
  the user-facing budget is spent; the *transaction* continues asynchronously
  (async is how payments escape the retry-deadline bind — the user stops
  waiting, the system keeps resolving). Add the taxonomy table and 4xx-never.
- *Trap:* retries at every layer ("defense in depth" — it's R^L amplification
  in depth), or any blind re-execution after timeout.

**P2. "Why jitter? Prove it matters."**
- *Model:* mass failures synchronize clients; deterministic backoff preserves
  the synchronization, so retries arrive as impulse waves (thousands of
  requests in the same 10 ms), each wave re-toppling the recovering server —
  observed as sawtooth load. Full jitter draws each delay uniformly over the
  window: the wave's integral is unchanged but its *peak* drops by orders of
  magnitude (spread over seconds instead of ms). Sketch: N clients, wave
  peak ≈ N/(bucket width) vs jittered ≈ N/(window width). AWS's
  architecture-blog simulation is canonical citation.
- *Trap:* "jitter avoids collisions" (vague) or defining it as random extra
  wait without the synchronized-crowd mechanism.

**P3. "What's a retry budget, and what failure does it prevent that per-request
policy can't?"**
- *Model:* a fleet-level cap on retries as a fraction of successful traffic
  (token bucket earned by successes, ~10–20%). Per-request policy is blind to
  the *aggregate*: when a dependency is persistently down/saturated, every
  request's individually-reasonable 3 attempts multiply fleet load 3–4× at
  the worst moment — the metastable input. The budget detects the regime
  shift implicitly (failures dominate → tokens starve → retry rate → ~0) and
  degrades the fleet to ~1× load with fast failures. One knob converts
  "retries as amplifier" into "retries as noise filter."
- *Trap:* re-describing backoff. Budgets are orthogonal to spacing — that's
  the point.

**P4. "Tell me about a time retries made an outage worse"** (or: "narrate how
a 10-second blip becomes a 40-minute outage").
- *Model:* the metastable script with numbers: blip → timeouts at 30 s of
  held threads → clients retry ×3 → load 3–4× on a system at ~80% capacity →
  sustained saturation → queues grow → *everything* times out → more retries;
  trigger heals at T+10 s, load stays >100% indefinitely; recovery required
  shedding at the LB + disabling retries + draining queues; permanent fixes:
  jitter, budgets, fast rejection (fail in µs not 30 s), breaker in front.
  If you have a real war story **[you were asked to prepare one — X9 in the
  arsenal]**, use it; a truthful near-miss beats a textbook recitation.
- *Trap:* "we fixed the trigger and it recovered" — the interviewer is
  testing whether you know the loop outlives the trigger.

**P5. "Your consumer nacks a poison message. Walk the redelivery math and the
failure mode if you forget the DLQ."**
- *Model:* redelivery with backoff caps at N attempts; a *deterministic*
  failure (parse error, invariant violation) fails all N identically —
  without a DLQ/sideline it redelivers forever: one message consuming a
  consumer slot eternally, head-of-line blocking others (per-key or
  per-subscription depending on semantics), redelivery metrics polluted,
  and — the quiet killer — infinite retry of a *side-effecting* handler.
  Hence: attempt caps + immediate-sideline for unrecoverable classes
  (your `SidelineOnFailureException` distinction: transient vs deterministic
  exceptions routed differently — name it, it's exactly the right design)
  + DLQ with a resolution path (your force-query), not a graveyard.
- *Trap:* treating DLQ as optional hygiene rather than the terminal state
  every bounded retry needs; or not distinguishing deterministic-vs-transient
  failure classes.

---

## Self-test

1. State the bet a retry makes, and what retries convert transient vs
   persistent failures into.
2. Reproduce the retryability table: connect-failure, 503, 429, timeout,
   500, 4xx, breaker-open — with the one-line reason each.
3. Write full jitter's formula and tell the synchronized-waves story it
   solves.
4. Why is attempt-count the wrong primary control? What replaces it?
5. R^L: three layers, three retries — worst case? Where should the single
   retry layer live and why?
6. Define a retry budget mechanically (tokens), and the regime shift it
   detects.
7. Metastability: trigger vs sustaining mechanism, why fixing the trigger
   fails, and the three interventions that work.
8. Why must timeouts never trigger blind re-execution of money movements?
   What are the two safe designs?
9. Present queue-based redelivery as a retry mechanism: four properties that
   beat in-process loops for async work.
10. What is the *server's* half of the retry contract? Three mechanisms.
11. Your platform: name the retrier, the taxonomy split, and the terminal
    state on the async payment path.
12. Why does the SM mandate retry ladder use minutes-then-hourly instead of
    exponential milliseconds? Generalize the principle.

<details>
<summary><b>Answers</b></summary>

1. Bet: the failure was transient. Transient → converted into (bounded)
   latency. Persistent → converted into N× failures and N× load aimed at
   something already failing.
2. Connect-failure: retry freely (request never arrived — no side effects).
   503: retry with backoff, honor Retry-After (declared transient). 429:
   retry only after Retry-After, back off harder (you're the overload).
   Timeout: retry only with idempotency/identity (outcome unknown). 500:
   cautious, idempotent-only (may be persistent, may have executed). 4xx:
   never (persistent; your request is wrong). Breaker-open/bulkhead-reject:
   not immediately (the system said stop).
3. delay_n = random(0, min(cap, base × 2ⁿ)). Mass failure synchronizes
   clients; deterministic backoff re-synchronizes each wave at the same
   instants → impulse loads re-topple the recovering server; full jitter
   smears each wave uniformly over its window, collapsing peak arrival rate
   by the window/bucket ratio.
4. Backoff makes attempt-count a wall-clock wildcard that can outlive any
   caller budget — you retry for users who are gone. Replace with
   deadline-aware loops: stop when remaining budget < next attempt's worst
   case; count becomes a secondary cap.
5. 3³ = 27 attempts per user action. The layer with both the operation's
   idempotency identity and the user's budget/context — typically the edge
   (or one designated orchestrator); layers below fail fast and propagate.
6. Token bucket: successes earn retry tokens at ratio r (~0.1–0.2); each
   retry spends one; no tokens → no retry, fail fast. Detects the
   transient→persistent regime shift: rare failures leave tokens plentiful
   (retries free), mass failure starves tokens (fleet degrades to ~1× load
   instead of R×).
7. Trigger: any blip (deploy, stall). Sustainer: the feedback loop — failures
   → retries/timeouts → load > capacity → failures. The loop's input is
   self-generated, so it persists after the trigger heals. Interventions:
   shed load below capacity, suppress retries (budgets/disable), drain
   queues/restart (break state) — all reduce loop gain below 1.
8. Timeout = unknown outcome: the debit may have succeeded with the response
   lost; re-execution = double payment. Safe: (a) retry carrying the same
   transaction identity into an idempotent effector (PSP/NPCI dedup collapses
   it), (b) stop acting, query the authority (force-query) and converge on
   the actual state.
9. Durable (survives process/worker death — intent is on disk); centrally
   governed (backoff/attempt policy in one place, not N codebases);
   observable (redelivery counts, backlog depth/age as backpressure signals);
   terminal-stated (bounded attempts → DLQ with a resolution path, vs silent
   drop or infinite loop).
10. Fail fast and cheap under overload (instant 503, not slow timeout — makes
    retried load survivable); emit explicit back-pressure (Retry-After,
    throttle-vs-fatal error distinction); dedup/idempotency keys so the
    retries it does receive are harmless.
11. Retrier: Pulsar redelivery (nack → backoff → bounded attempts). Taxonomy:
    local idempotent writes (receive-money) retry plainly; external-effect
    paths retry only by identity and never re-initiate on unknown outcome.
    Terminal state: DLQ whose handler force-queries NPCI and converges the
    transaction — a resolution path, not a graveyard.
12. Because the failure it retries against — insufficient balance — recovers
    on salary-and-reminder timescales, not network timescales; retrying at
    200 ms is pure waste. Principle: backoff schedules should model the
    *recovery process* of the failure class (network blip: ms-exponential;
    capacity: seconds-minutes + budget; human/business state: hours-days +
    comms), not apply one curve universally.

</details>
