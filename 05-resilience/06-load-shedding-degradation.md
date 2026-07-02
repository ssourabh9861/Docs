# Load Shedding & Graceful Degradation

When demand exceeds capacity, something will not be served. The only question is
whether *you* choose what, where, and how cheaply — or whether physics chooses for
you (and physics chooses "everyone, slowly, then all at once"). This doc covers
overload mechanics, shedding signals and policies, degradation as a product
discipline, and the goodput lens that ties all of resilience together.

---

## 1. Plain definition

**Load shedding** = deliberately rejecting or dropping work when the system is
(or is about to be) overloaded, so that the work you *do* accept completes within
its usefulness window. **Graceful degradation** = continuing to serve when full
service is impossible, by serving something reduced: stale data, fewer features,
simpler responses, deferred processing.

They're two halves of one decision: shedding says *no* to some requests;
degradation says *yes, but less* to the rest.

Why "just serve everyone slower" doesn't work (the queueing story you must be
able to tell): as utilization approaches 100%, queue length and wait time grow
without bound (in M/M/1 terms, W ∝ 1/(1−ρ): at ρ=0.5 wait ≈ 1× service time, at
0.9 ≈ 9×, at 0.99 ≈ 99×). Past saturation, every queued request waits longer
than its caller's timeout ⇒ callers abandon and retry ⇒ demand *rises* ⇒ the
system does full work for requests nobody is waiting for. **Utilization 100%,
goodput ~0%** — the congestion-collapse signature (and the entry ramp to the
metastable failures of `04-retries.md`). Shedding is how you cap ρ below the
cliff: serve N well and reject the rest in microseconds, instead of serving
everyone a timeout.

**Goodput** — work completed *within its deadline/usefulness* — is the metric
this whole doc optimizes. Throughput counts what you finished; goodput counts
what mattered.

---

## 2. How it works in practice

### 2.1 Signals: how you know you're overloaded

Ranked roughly by quality for admission decisions:
- **Queue depth and — better — queue *age*:** the oldest waiting item's age is
  a direct measurement of "how late is work getting served" (your Pulsar
  backlog-age framing). Depth without age lies when drain rate varies.
- **Concurrency in flight:** requests currently being processed vs a limit —
  the signal adaptive concurrency limits regulate on; responds instantly.
- **Latency vs baseline:** rising p99 at stable traffic = saturation somewhere;
  the signal Envoy-style adaptive controllers probe.
- **CPU/memory/executor saturation:** true but *lagging and noisy* (GC, co-
  tenants); good for autoscaling, coarse for admission.
- **Downstream signals:** breaker states, 429/503s from dependencies — you can
  be "healthy" while your dependency drowns; shed the traffic that feeds it.

### 2.2 Where to shed: as early and as cheap as possible

Cost of a rejection grows with every layer it penetrates. The ladder:
client-side (don't send: self-throttle, feature flags off) → edge/LB (reject
before any app work) → gateway admission (after auth, before fan-out — your
platform's natural point) → per-service (bulkhead/limiter rejections) →
in-handler (last resort; you've already paid most of the cost). A rejection at
the door costs microseconds; the same rejection discovered at the database
costs the full request minus one hop.

### 2.3 What to shed: priority is a design input, not an accident

- **Criticality tiers:** classify every request class (Google-style:
  CRITICAL_PLUS / CRITICAL / SHEDDABLE_PLUS / SHEDDABLE). Shed lowest tier
  first; reserve capacity for the top tier. The tier must be assigned by the
  *owner of the business*, propagated on the request (header/metadata), and
  honored by every hop — otherwise each service invents its own opinion.
  In your platform: payment execution > payment status reads > eligibility
  checks > rewards display > analytics/CDC lag-tolerant work — being able to
  rank your own traffic classes on the spot is the interview moment.
- **New vs retried work:** prefer fresh work at the margin (retries have
  already failed once and their callers may be gone) — but never starve
  identity-carrying payment retries; tier them, don't blanket-drop.
- **User-visible fairness:** per-tenant shedding (max-min) so one bulk caller
  absorbs the pain before everyone shares it — shedding and rate limiting
  converge here (`05-rate-limiting.md`).
- **LIFO under overload (the counterintuitive one):** FIFO queues under
  saturation serve the *oldest* request first — precisely the one most likely
  already abandoned. Adaptive LIFO (switch to newest-first when queue age
  crosses caller-timeout territory) + CoDel-style queue management (drop when
  sojourn time exceeds target) serve requests that still have live callers.
  Facebook's queueing writeups made this canon; citing "adaptive LIFO +
  CoDel" with the *why* is a strong senior tell.

### 2.4 Degradation modes: decided in advance, tested regularly

A degradation catalogue per surface, each with a trigger and an owner:
- **Stale-instead-of-fresh:** serve cached/last-known-good (rewards totals,
  eligibility from local state — your short-circuit is a permanent version).
- **Fewer features (brownout):** disable expensive decorations — the term
  "brownout" = deliberately dimming non-essential load. Your grey-out of BNPL
  is a brownout of one payment instrument.
- **Simpler responses:** skip personalization/enrichment; default content.
- **Defer, don't refuse:** accept and queue for later (your async path
  converts overload into backlog age — payments queue rather than fail).
- **Read-only / essential-only modes:** the deepest rung; requires product
  sign-off *before* the incident.
The operational discipline: each mode has a flag, a dashboard, an SLO for how
long it may persist, and a game-day that exercised it. An untested degraded
mode is a rumor, not a capability.

### 2.5 Fail-open vs fail-closed (the per-dependency decision)

When a *non-capacity* dependency fails (fraud check, limiter store, dedup
cache), degradation means choosing an error direction: fail-open (proceed
without the check) when the check is advisory/layered; fail-closed (refuse)
when the check gates irreversible harm. Your platform's worked examples:
dedup cache → fail-open (deeper idempotency layers); credit balance check →
fail-closed for *offering* credit (grey-out); fraud-check-shaped calls →
depends on loss model and layering — the answer is always "which direction
does the error point, and what bounds it" (same lens as
`01-distributed-systems/08-cap-pacelc.md`).

---

## 3. Senior-level depth

- **Shedding must be cheaper than serving — by orders of magnitude.** If
  rejection runs the full middleware stack, deserializes the body, and calls
  auth, overload still kills you (you've built a slightly cheaper outage).
  Admission checks belong before expensive work: header-level tier checks,
  pre-parse limits, LB-level rules. Measure the cost of your 503.
- **Shedding vs autoscaling — timescales:** scaling adds capacity in minutes
  (pod spin-up, JIT warm, cache fill); overload arrives in seconds. Shedding
  is the shock absorber that buys autoscaling its lead time; autoscaling is
  the resolver that makes shedding temporary. Systems with only autoscaling
  fall over during the gap; systems with only shedding stay small. You need
  the pair, and interviewers probe whether you know which handles which
  timescale.
- **Backpressure vs shedding:** backpressure *propagates* "slow down" to the
  producer (bounded queues, blocking, credit/flow control — Pulsar
  backlog as signal); shedding *absorbs* the excess by dropping. Backpressure
  preserves work but couples tiers (a full queue stalls the producer);
  shedding decouples but loses work. Async pipelines want backpressure until
  the buffer's usefulness window is exceeded, then shedding/TTL — your
  "backlog age crosses product tolerance ⇒ gateway sheds new submissions" is
  exactly the handoff point, articulated.
- **The control-loop view (L6 flavor):** shedding is a feedback controller —
  signal (queue age, latency), setpoint (SLO), actuator (admission rate).
  Controller pitfalls apply: lag (act on stale signals → oscillation),
  gain (shed too aggressively → underutilization; too gently → collapse),
  and priority inversion (shedding cheap-to-serve work while expensive work
  floods). Adaptive concurrency limits are this loop, productized.
- **Brownout precedes blackout — instrument for it:** goodput, queue age,
  and rejection rate by tier belong on the front page of your dashboard;
  "CPU%" alone hides the collapse until it's total.
- **L4 vs L5 vs L6:** L4 — "we return 503 when overloaded and autoscale."
  L5 — goodput framing, early-cheap shedding, criticality tiers propagated,
  LIFO/CoDel, degradation catalogue with triggers, backpressure-to-shedding
  handoff, timescale pairing with autoscaling. L6 — org-level criticality
  taxonomy, utilization targets set from the collapse math, degradation
  modes as tested product features, capacity planning integrated with
  shedding policy.

---

## 4. Resume connection

- **Your async path is a shedding-avoidance machine:** the queue converts
  demand spikes into backlog age instead of failures — payments defer, not
  die. And you know its limit: when backlog *age* (not depth) crosses product
  tolerance, the gateway sheds new submissions — reject at the door rather
  than accept into a 20-minute resolution queue. That two-stage story
  (absorb, then shed by age) is textbook and it's yours
  (`00-resume-arsenal/03-core-upi-platform.md` A3).
- **Grey-out = brownout with a product sign-off baked in:** the degraded mode
  was decided at design time (timeout ⇒ option hidden ⇒ user pays another
  way), has a trigger (breaker state), an owner, and a dashboard. Present it
  in degradation vocabulary, not just circuit-breaker vocabulary.
- **Bulkhead rejections = per-dependency shedding** (already framed in
  `03-bulkheads.md`): demand above what the sick partner absorbs is shed in
  microseconds at the pool boundary.
- **Recon/analytics as your SHEDDABLE tier:** force-query sweeps and CDC/FDP
  consumers tolerate lag by design — under platform stress they're the first
  capacity you'd reclaim **[VERIFY whether any explicit deprioritization
  exists; if not, say "implicitly sheddable by lag-tolerance, and I'd
  formalize the tiers" — an honest improvement answer]**.
- **Honest gap:** you likely lack formal criticality propagation
  (tier headers honored across hops) and adaptive LIFO/CoDel-style queue
  management — name them as the upgrades you'd make, with the mechanism.

**30–60 s spoken answer** ("how does your platform handle overload?"):

> "In two stages, with goodput as the metric. First stage: absorb — the
> payment path is asynchronous, so demand spikes become Pulsar backlog rather
> than failures; workers drain by queue depth, and the thing we alert on is
> backlog *age*, because age is the direct measure of how late payments are
> resolving. Second stage: shed, early and cheap — when backlog age crosses
> product tolerance, the gateway rejects new submissions at the door, because
> accepting a payment into a twenty-minute queue is worse than an honest
> fast no. Around that core, degradation is pre-decided per surface: partner
> trouble greys out the BNPL option — a brownout of one payment instrument,
> signed off at design time, triggered by breaker state; bulkhead rejections
> shed partner-bound demand in microseconds; and our lag-tolerant tiers —
> reconciliation sweeps, the CDC analytics feed — are the implicit sheddable
> class. The pairing matters: shedding is the shock absorber on a
> seconds timescale, autoscaling is the resolver on a minutes timescale —
> the first buys the second its lead time. What I'd add next is formal
> criticality propagation, so 'payment execution beats rewards display'
> is a header every hop honors instead of a convention."

---

## 5. What the interviewer will push on

**P1. "Flash sale: 5× normal traffic arrives in 60 seconds. Autoscaling takes
4 minutes. Walk me through minutes 0–5."**
- *Model:* t0: concurrency/queue-age signals cross setpoints; admission
  control sheds by tier at the edge (sheddable classes first: rewards
  display, non-critical reads), payment submissions keep flowing into the
  queue — backlog age starts rising within tolerance; bulkheads reject
  partner-bound overflow to grey-out. t+1–2 min: if backlog age approaches
  product tolerance, shed new submissions at the gateway with Retry-After;
  LIFO-lean the queues that have caller timeouts. t+4 min: capacity arrives
  — *ramp admission gradually* (reclose stampede logic: cold caches/JIT),
  drain backlog oldest-usefulness-first, lift shedding tier by tier.
  Throughout: goodput and rejection-by-tier on one dashboard; retries
  suppressed by budgets so shed traffic doesn't re-amplify. The structure —
  signals → tiered shedding → age-gated deferral → ramped recovery — is the
  answer; numbers optional but tiers mandatory.
- *Trap:* "autoscaling handles it" (4-minute gap = the outage), or shedding
  without tiers (dropping payment execution while serving rewards banners).

**P2. "Why can a system at 100% CPU be doing zero useful work? What's the
fix's first principle?"**
- *Model:* the abandonment loop: wait > caller timeout ⇒ every completed
  request was already abandoned; retries replace them; the system does full-
  cost work with zero goodput (congestion collapse / metastable state).
  First principle: admission control keeps ρ below the collapse knee —
  serve fewer, serve them within deadline, reject the rest cheaply; then
  break the loop's gain (retry budgets, LIFO/CoDel so served work has live
  callers). 
- *Trap:* "add capacity" — inside the collapsed state, added capacity feeds
  retried/abandoned work first unless admission is fixed; the loop, not the
  capacity, is the problem.

**P3. "Design criticality tiers for your payment platform and defend one
uncomfortable ranking."**
- *Model:* CRITICAL_PLUS: payment execution, provider callbacks (money in
  flight); CRITICAL: payment submission, status reads (user staring at a
  spinner); SHEDDABLE_PLUS: eligibility/balance checks (degrade to
  grey-out), transaction history; SHEDDABLE: rewards display, analytics/CDC,
  recon sweeps (deferrable by design). Uncomfortable one to defend:
  *status reads below execution* — during overload you'd rather resolve
  payments than answer "is it done yet?", even though users feel the
  latter more; mitigation: cached/stale status. Or: *new submissions shed
  before in-flight resolution* — protect promises already made over new
  promises. Owning a controversial ranking with reasoning is the point of
  the question.
- *Trap:* refusing to rank ("it's all critical") — that's the L4 tell; if
  everything is critical, overload decides randomly.

**P4. "Backpressure or shedding — for a payment queue, a log pipeline, and a
synchronous API?"**
- *Model:* payment queue: backpressure first (defer, bounded by backlog
  *age*, since payments must not be silently dropped), shedding only at the
  admission edge with explicit rejection to the user. Log/CDC pipeline:
  backpressure until buffer costs bite, then shed by *sampling/dropping
  oldest* (lag-tolerant, loss-tolerant with recon/rebuild paths). Sync API:
  no queue worth having — shed immediately at admission (a queue in front
  of a synchronous call just converts rejection into timeout). The variable:
  is the work deferrable, droppable, or neither — and who finds out.
- *Trap:* backpressure everywhere ("never drop data") — full buffers stall
  producers into *their* callers' timeouts; you've traded visible rejection
  for distributed mystery latency.

**P5. "Your degraded mode has never been triggered in production. What do you
actually know about it?"**
- *Model:* almost nothing — degraded modes rot: flags drift, fallback paths
  lose test coverage, caches the fallback needs get repurposed, the person
  who understood it leaves. Discipline: game days that force each mode
  (breaker forced open, limiter store blackholed, queue backlog injected),
  assertions on the *product* behavior (does grey-out actually render?),
  and drills for the human half (who flips read-only mode, with what
  authority?). "Untested degraded mode is a rumor" — deliver the line, then
  the mechanism.
- *Trap:* "it's simple, it just serves a default" — simplicity claims about
  untested paths are how incidents get their second act.

---

## Self-test

1. Define goodput vs throughput, and narrate the utilization-100%/goodput-0%
   state mechanically.
2. Why does queueing theory forbid "serve everyone slower"? Give the
   W ∝ 1/(1−ρ) intuition with two numbers.
3. Rank four overload signals by decision quality and say what's wrong with
   CPU%.
4. State the early-cheap shedding ladder and why rejection cost matters as
   much as rejection policy.
5. Design the criticality-tier mechanism: who assigns, how it propagates,
   who honors it.
6. Why LIFO under overload? What pairs with it, and what problem does the
   pair solve?
7. List five degradation modes with a platform example each (yours where
   possible).
8. Fail-open vs fail-closed: the deciding question, plus your two worked
   examples.
9. Shedding vs autoscaling: timescales, and the sentence that pairs them.
10. Backpressure vs shedding: definitions, the coupling trade, and your
    platform's handoff point between them.
11. Give the two-stage overload story of your platform (absorb, then shed)
    with the metric that gates stage two.
12. What makes a degraded mode real rather than rumored? Three disciplines.

<details>
<summary><b>Answers</b></summary>

1. Goodput = work completed within its usefulness window (deadline);
   throughput = work completed at all. At saturation, queue wait exceeds
   caller timeouts: every request served was already abandoned and retried —
   the system burns full cost per request, produces nothing anyone receives,
   and retry load holds it there.
2. Wait scales as service_time × ρ/(1−ρ)-ish: at ρ=0.9, ~9× service time;
   at ρ=0.99, ~99×. Approaching 100% utilization, wait grows unboundedly —
   so past a knee, admitting more work only manufactures lateness; capping
   admission below the knee is the only way everyone-served-well can exist.
3. Queue *age* (direct lateness measurement) > in-flight concurrency
   (instant, regulable) > latency vs baseline (saturation surfaced, slightly
   lagging) > CPU/memory (lagging, noisy — GC and co-tenants pollute it, and
   it says nothing about whether work is completing usefully).
4. Client (don't send) → edge/LB → gateway admission → service bulkhead →
   in-handler. Each layer penetrated adds cost to the rejection; if a 503
   costs nearly a 200 (full middleware, parsing, auth), overload still wins
   — shedding must cost microseconds to be a defense at all.
5. Business owners assign tiers per request class (not engineers ad hoc);
   the tier rides the request as metadata/header from the edge; every hop's
   admission control and queues honor it (shed lowest first, reserve for
   highest). Without propagation each service guesses, and inversion
   (serving banners while dropping payments) follows.
6. FIFO at saturation serves the oldest request — the one most likely past
   its caller's timeout (abandoned). LIFO serves the freshest, which still
   has a live caller. Pairs with CoDel-style drop (evict when queue sojourn
   exceeds target). Together: served work has live callers; hopeless work is
   dropped instead of processed — goodput recovered.
7. Stale-instead-of-fresh (local-state eligibility, cached rewards totals);
   brownout/feature-off (BNPL grey-out); simplified responses (default
   instead of personalized content); defer-don't-refuse (async payment
   backlog); read-only/essential-only mode (deepest rung, pre-authorized by
   product).
8. "Which direction does the error point, and what bounds it?" Dedup-cache
   outage: fail-open — duplicate risk bounded by deeper identity layers.
   Partner balance-check timeout: fail-closed for offering credit —
   unverifiable headroom must not create exposure; cost is conversion only.
9. Shedding acts in milliseconds-to-seconds; autoscaling delivers in
   minutes (provision, warm, fill caches). "Shedding is the shock absorber
   that buys autoscaling its lead time; autoscaling is the resolver that
   makes shedding temporary."
10. Backpressure propagates "slow down" upstream (bounded queues, credits) —
    preserves work, couples tiers (stalls producers). Shedding drops excess
    — decouples, loses work. Handoff: absorb into the queue while backlog
    AGE is within product tolerance; once age crosses tolerance, shed new
    work at the gateway with explicit rejection.
11. Stage one: async queue absorbs spikes as backlog (payments defer, not
    fail), workers scale on depth. Stage two, gated on backlog *age*
    crossing product tolerance: gateway sheds new submissions fast and
    explicitly. Age, not depth, gates — depth lies when drain rate varies.
12. A flag/trigger that's exercised (game days forcing the mode), assertions
    on product-level behavior in the degraded state (not just "no 500s"),
    and rehearsed human operations (who activates, with what authority, on
    what dashboard) — plus an SLO on how long the mode may persist.

</details>
