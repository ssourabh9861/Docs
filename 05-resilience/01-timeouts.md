# Timeouts

The most underestimated topic in backend engineering. Everyone sets timeouts;
almost nobody can defend theirs. Your resume advertises a *designed* timeout
strategy (800 ms vs 3.5 s), which means interviewers are licensed to go deep here
— this doc makes sure the depth exists.

---

## 1. Plain definition

A **timeout** is a self-imposed deadline on waiting: "if the answer hasn't arrived
in T, stop waiting and act as if it won't." It exists because of the fact
underneath all of distributed systems (see `01-distributed-systems/07-failure-detection.md`):
a non-response is ambiguous — slow, dead, or unreachable look identical. A timeout
doesn't resolve the ambiguity; it **bounds how long you'll pay for it**.

Analogy: you order at a restaurant. Without a timeout, a lost order means you sit
there forever. With one — "if food hasn't arrived in 30 minutes, I ask/leave" —
you bound your worst case. Note what the timeout does *not* tell you: whether the
kitchen never got the order or your food is 30 seconds away. Both matter later
(see §3, "timeout ≠ failure").

Why timeouts are the *first* resilience mechanism, not an optional one: every
thread, connection, and memory buffer waiting on a response is capacity held
hostage. Without deadlines, one slow dependency accumulates hostages until the
caller dies — the root mechanic of cascading failure. Circuit breakers, bulkheads,
and retries all *presuppose* working timeouts; a breaker can't count failures that
never resolve.

---

## 2. How it works in practice

### 2.1 The timeout stack (know every layer you actually have)

A single "call the partner" line of code crosses many timers, and they are set in
different places by different people:

| Layer | Timer | Typical values | What it bounds |
|---|---|---|---|
| TCP connect | SYN + retransmits | 1–3 s config (OS retries can stretch to ~2 min unconfigured!) | Reaching the host at all |
| TLS handshake | often folded into connect | +1–2 RTT | Crypto setup |
| HTTP client read/socket | time between bytes (OkHttp `readTimeout`) or per-request | 0.5–5 s | A stalled response stream |
| HTTP client call/total | whole request incl. redirects/retries | explicit or absent (!) | The full attempt |
| Wrapper (Hystrix TimeLimiter) | end-to-end command | your 800 ms / 3.5 s | What the business is willing to wait |
| Caller's own budget | server request deadline | e.g., 2 s page SLA | Everything downstream |

Two rules that separate practitioners from tourists:

1. **Unset timeouts exist somewhere in your stack right now.** Default infinite
   (or absurd: OS-level TCP ~2 minutes) timeouts are the norm in unconfigured
   clients. Audit finding #1 in every postmortem.
2. **Enforce at two layers minimum:** the wrapper timeout frees the *caller*
   (Hystrix at 800 ms), but the worker thread stays hostage until the *client*
   timeout fires (OkHttp read timeout). Set the client timeout at/just above the
   wrapper timeout or a hung partner turns your bulkhead into a graveyard of
   abandoned threads (the exact mechanism in your arsenal attack C2).

### 2.2 Choosing the number (the formula, not the vibe)

**Top-down:** start from the user/product SLA and decompose. Checkout page budget
2 s → gateway processing + hops eat X → the partner leg gets ≤ Y. Every hop's
timeout must fit inside the caller's *remaining* budget, or you have **timeout
inversion**: the caller gives up while the callee happily keeps working (wasted
work, and the retry lands on a server still busy with the abandoned attempt —
load doubling in disguise).

**Bottom-up:** measure the dependency's healthy latency distribution. Set the
timeout above healthy p99/p99.9 (so timeouts are rare when things work — a
timeout that fires on healthy traffic is a self-inflicted error budget) and below
the point where waiting longer stops being worth it (conversion loss, budget
ceiling). The gap between healthy-p99 and your product ceiling is your room; if
there's no room, the *architecture* is wrong (make the call async/precomputed),
not the number.

**The two-timeout insight (your design, generalized):** the same dependency
deserves different deadlines per *calling context* — deadline follows the
journey's budget, not the dependency's identity. Balance check on the hot path:
800 ms, fail fast, degrade. Same partner's mandate create inside an explicit
setup flow: 3.5 s, fail visibly, let the user retry. Most shops set one timeout
per dependency and get both journeys wrong.

### 2.3 Deadline propagation

Mature RPC stacks (gRPC deadlines, Envoy timeout headers) pass the *remaining*
budget downstream: caller says "you have 750 ms", each hop subtracts its
spend and forwards the rest; a hop that receives 20 ms of budget for a 100 ms
job **fails immediately** (deadline check on arrival) rather than doing doomed
work. Without propagation, tail requests burn full effort at every layer after
the user has already seen the spinner die. If your stack lacks it (Dropwizard/
Jersey has no native deadline propagation), say so honestly and name the
mitigations: conservative static budgets per hop + queue-age shedding.

### 2.4 What firing looks like in production

Symptoms by misconfiguration:
- **Too tight:** timeout rate tracks the dependency's healthy p99 tail; errors
  spike under modest load; retries amplify; the dependency team sees "cancelled"
  work. Metric: timeout rate ≫ dependency's real error rate.
- **Too loose:** latency SLO burns before any timeout fires; thread/connection
  pools saturate during a partner brownout; the pager fires on *your* saturation
  instead of *their* slowness. Metric: pool utilization pegged while error rate
  is "fine".
- **Inverted:** upstream 499s/timeouts while downstream logs successful
  responses nobody consumed; retry load with no user-visible improvement.

---

## 3. Senior-level depth

- **Timeout ≠ failure.** A timed-out request has *unknown* outcome — maybe never
  arrived, maybe executed with the response lost. For idempotent reads: retry
  freely. For money movements: only identity-carrying retries or
  ask-the-authority follow-ups are safe (your DLQ force-query institutionalizes
  this — cross-ref `00-resume-arsenal/03-core-upi-platform.md`). Any timeout
  discussion that doesn't reach this point is an L4 discussion.
- **Abandoned work and cancellation.** When the caller times out, what happens
  to the work? Java threads blocked in socket I/O can't be interrupted reliably;
  the work completes into the void. Costs: capacity spent on dead requests
  (during overload, a system can approach 100% utilization producing ~0%
  goodput — everything it finishes has already been abandoned), plus
  side-effects landing after the caller gave up (the callback-race genre).
  Mitigations: client-timeout alignment (§2.1), deadline checks at work-start
  and between phases, cancellation propagation where the stack supports it.
- **Hedged requests** (the tail-latency tool that isn't a retry): send the
  request; if no answer by ~p95, send a *second* to a different replica and take
  the first answer. Bounds tail latency at a small (~5%) duplicate-load cost —
  but only for **idempotent** operations, and needs cancellation (or you pay 2×
  under stress). Know it as the read-path complement to your write-path
  identity discipline; naming "hedging" unprompted in a latency discussion is a
  reliable senior tell.
- **Timeouts on queues are age-based, not wait-based:** an event that sat in
  Pulsar for 10 minutes may be past its usefulness (an eligibility check) or
  more urgent than ever (a payment execution). Per-message TTL vs
  process-regardless is a *business* decision per event class; blanket queue
  TTLs are a classic silent-drop bug.
- **L4 vs L5 vs L6:** L4 sets timeouts from folklore ("3 seconds seems fine").
  L5 derives them from budget decomposition + measured distributions, enforces
  at two layers, differentiates by calling context, and knows what happens to
  abandoned work. L6 makes deadlines a *platform property* — propagation,
  deadline-aware scheduling, goodput-oriented shedding — so individual teams
  can't get it wrong.

---

## 4. Resume connection

This is your home turf; the arsenal file covers the 800 ms/3.5 s story in full
(`00-resume-arsenal/01-superpay-later-sbmd.md`, bullet 3). What this doc adds to
that story:

- The **55 s PSP send-money timeout** on the Storm path is the same principle at
  the other extreme: the deadline follows the journey — an async worker whose
  "user" is a queue can afford NPCI's full round-trip envelope; a checkout page
  cannot. One partner ecosystem, three deadlines (800 ms, 3.5 s, 55 s), each
  derived from its caller's budget. Saying it as a *system* of deadlines, not a
  pair, upgrades the story.
- **Two-layer enforcement** is your concrete answer to "what happens to the
  thread at timeout": Hystrix frees the caller; OkHttp's read timeout reclaims
  the worker. You know the graveyard failure mode by name.
- **Where you lack deadline propagation** (Dropwizard stack), your compensations
  are: conservative static decomposition, queue-age visibility, and shedding at
  the gateway. Volunteering the gap + compensation beats being caught claiming
  a property you don't have.

**30–60 s spoken answer** ("how do you set timeouts?"):

> "Top-down from the caller's budget, bottom-up from the dependency's healthy
> tail — and the deadline follows the journey, not the dependency. Our BNPL
> partner has three deadlines in our stack: 800 milliseconds for the balance
> check, because it sits inside a checkout page budget and the correct failure
> is greying out the option; 3.5 seconds for mandate setup, because the user is
> in an explicit flow where visible retry beats false failure; and 55 seconds
> for payment execution on the async path, because there the caller is a queue
> worker and the real constraint is NPCI's round-trip envelope. Each number sits
> above the operation's healthy p99 so timeouts stay rare in steady state, and
> each is enforced at two layers — the Hystrix deadline frees the caller, and
> the HTTP client's read timeout, set just above it, reclaims the worker thread
> so a hung partner can't turn the bulkhead into a graveyard of abandoned
> threads. And because a timeout means *unknown outcome*, not failure, anything
> money-moving that times out is either retried with the same identity or
> resolved by force-querying the source of truth — never blindly re-executed."

---

## 5. What the interviewer will push on

**P1. "Your timeout fires. The downstream call actually succeeded. Enumerate
everything that can now go wrong."**
- *Model:* (1) caller treats it as failure → user retries / system retries →
  duplicate effect unless identity-deduped (your layered dedup); (2) state
  divergence — downstream committed, upstream recorded failure → recon must
  converge (force-query); (3) late side effects — the response/callback arrives
  after compensating actions began (callback-race genre); (4) wasted capacity
  billed to a request nobody wants; (5) misleading metrics — downstream sees
  success, upstream sees error; incident channels argue. The fix set:
  idempotency identity, ask-the-authority reconciliation, state machines
  rejecting stale transitions, aligned two-layer timeouts.
- *Trap:* only naming the duplicate-payment risk. The divergence/observability
  consequences are what distinguish someone who's run this.

**P2. "Why is one timeout per dependency wrong? And why is one timeout per
*call* also not the full answer?"**
- *Model:* per-dependency ignores the caller's context — the same partner API
  legitimately deserves 800 ms from checkout and 3.5 s from onboarding; the
  budget belongs to the journey. Per-call static numbers still ignore
  *remaining* budget: the 3rd hop of a slow request may hold a 500 ms static
  timeout while the user's deadline has 50 ms left — deadline propagation
  (gRPC-style) fixes that by passing remaining budget and failing doomed work
  at arrival. Static per-context timeouts are the 90% solution; propagation is
  the principled one.
- *Trap:* "we set timeouts per service in config" delivered as the end state.

**P3. "Your dependency's healthy p99 is 600 ms and your budget ceiling is
700 ms. Where do you set the timeout?"**
- *Model:* the honest answer is "that gap is too thin to be a timeout problem."
  With 100 ms between healthy-tail and ceiling, any variance fires timeouts on
  healthy traffic (self-inflicted errors) or blows the budget. Escalate the
  *design*: move the call off the critical path (precompute/cache — your
  short-circuit pattern), parallelize it with other work, negotiate the
  dependency's tail down, or hedge (if idempotent) to cut the effective tail.
  Then, if forced: ~650 ms + aggressive degradation + monitor timeout rate as
  a first-class SLI.
- *Trap:* picking a number confidently. The question tests whether you
  recognize an architectural smell dressed as a tuning question.

**P4. "Explain hedged requests, when they're safe, and their failure mode
under overload."**
- *Model:* fire a duplicate to another replica after ~p95 delay, take the first
  response, cancel the loser. Safe iff idempotent (reads, idempotent-keyed
  writes). Overload failure: hedging rate is latency-triggered, and overload
  raises latency → hedge rate climbs exactly when capacity is scarcest →
  amplification. Guards: hedge budgets (cap duplicate traffic at a few %),
  disable hedging under shed/brownout signals, and honor cancellation.
- *Trap:* calling any retry-after-delay "hedging", or recommending it for
  non-idempotent writes.

---

## Self-test

1. What ambiguity does a timeout bound (not resolve), and why does every other
   resilience mechanism presuppose timeouts?
2. Name five timer layers between your code and a partner's response, and the
   classic unconfigured default hiding in the lowest one.
3. State the two-layer enforcement rule and the failure mode it prevents (name
   the arsenal attack it answers).
4. Give the top-down and bottom-up derivations for a timeout, and define
   timeout inversion.
5. Why does the same dependency deserve different timeouts? Give your three
   partner deadlines and each one's justification.
6. What is deadline propagation, what does it fix, and what's your honest
   answer if your stack lacks it?
7. "Timeout ≠ failure" — the state of a timed-out request and the two safe
   follow-ups for non-idempotent effects.
8. What happens to abandoned work in a JVM, and why can an overloaded system
   show 100% utilization and ~0% goodput?
9. Hedged requests: mechanism, safety precondition, overload failure mode,
   and the guard.
10. Too-tight vs too-loose timeouts: one production symptom + one metric each.
11. Why are queue timeouts age-based business decisions? Give a payment
    example on each side.
12. An interviewer offers you a 100 ms gap between healthy p99 and budget
    ceiling. What's the L5 move?

<details>
<summary><b>Answers</b></summary>

1. Silence's ambiguity (slow vs dead vs unreachable) — the timeout bounds how
   long you pay for it, not what happened. Breakers need resolved outcomes to
   count; bulkheads need bounded hold-times to size; retries need a decision
   point — all downstream of deadlines.
2. TCP connect (OS SYN retransmits — unconfigured can stretch to ~2 minutes),
   TLS handshake, HTTP read/socket (between-bytes), HTTP call/total, wrapper
   (Hystrix/TimeLimiter), caller's request budget. Classic default: infinite
   or OS-level-huge connect/read timeouts in unconfigured clients.
3. Wrapper timeout frees the caller; client (socket/read) timeout set at/just
   above it reclaims the worker thread. Prevents bulkhead graveyarding —
   abandoned threads accumulating against a hung partner (arsenal C2).
4. Top-down: decompose the user/journey SLA so each hop fits the caller's
   remaining budget. Bottom-up: above dependency healthy p99/p99.9 (rare
   steady-state firing), below the product ceiling. Inversion: caller's
   deadline shorter than callee's — callee completes work nobody consumes;
   retries land on a still-busy server.
5. Because the budget belongs to the calling journey, not the dependency:
   800 ms balance check (checkout page budget; correct failure = grey-out);
   3.5 s mandate ops (explicit setup flow; visible retry acceptable); 55 s
   send-money (async queue worker; constraint is NPCI's envelope, no human
   waiting on a thread).
6. Passing remaining budget downstream (gRPC deadlines) so each hop subtracts
   spend and doomed work fails at arrival instead of executing after the user
   is gone. Lacking it: conservative static per-hop decomposition, queue-age
   monitoring, gateway shedding — name gap + compensation.
7. Unknown outcome (never arrived / executed with lost response / still
   running). Safe: retry carrying the same idempotency identity, or query the
   authority (force-query) and converge. 
8. Threads blocked in socket I/O aren't reliably interruptible; work completes
   into the void. Under overload, queue wait exceeds caller deadlines, so
   everything served was already abandoned — full utilization, zero useful
   output (goodput collapse); requires shedding at the door, not more
   capacity at the back.
9. After ~p95 silence, duplicate to another replica, first answer wins,
   cancel the loser. Safe only for idempotent operations. Overload: latency
   triggers hedges exactly when capacity is scarce → amplification. Guard:
   hedge budget (cap % duplicates) + disable under overload + real
   cancellation.
10. Too tight: error spikes tracking the dependency's healthy tail; metric —
    timeout rate ≫ dependency's true error rate. Too loose: pools saturate
    during partner brownouts before timeouts fire; metric — pool utilization
    pegged while measured error rate stays low.
11. Message value vs age is business-specific: a stale eligibility check is
    worthless (drop/TTL); a stale payment-execution event is *more* urgent
    (must process — the user's money is in limbo). Blanket queue TTLs
    silently drop the second kind.
12. Refuse the tuning frame: the gap is thinner than natural variance, so no
    number works. Change the architecture — take the call off the critical
    path (precompute/short-circuit), parallelize, hedge if idempotent, or
    renegotiate the dependency's tail; only then pick ~650 ms with
    degradation and first-class timeout-rate monitoring.

</details>
