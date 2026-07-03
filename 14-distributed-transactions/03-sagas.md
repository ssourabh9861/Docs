# Sagas

The pattern your platform actually runs — mandate setup across four
organizations, accounting event flows, refund matrices — even if nobody at
Flipkart says the word "saga" in standup. This doc gives you the formal
pattern, the two coordination styles, the compensation design discipline, and
the isolation problem — then maps every piece onto flows you own, so you can
answer saga questions from lived experience while speaking the standard
vocabulary.

---

## 1. Plain definition

A **saga** is a sequence of **local transactions** T₁, T₂, … Tₙ — each
committing independently in its own system — paired with **compensating
transactions** C₁ … Cₙ₋₁ such that if step Tᵢ fails, the saga runs
Cᵢ₋₁ … C₁ to semantically undo what already committed. The end state is
either "everything done" or "everything undone" — **atomicity stretched over
time**, without shared locks or a shared commit point.

The two words doing the heavy lifting:

- **Local:** each step is a real, durable, immediately-visible commit in one
  system. No prepared/in-doubt state, no held locks — which is exactly why
  sagas work across trust boundaries where 2PC can't
  (`02-2pc-and-friends.md`).
- **Compensating, not undoing:** you cannot roll back a committed step; you
  execute a NEW forward action whose business meaning cancels it. A refund
  is not an un-charge — it's a second money movement, with its own record,
  its own failure modes, and (often) its own fees and timing. Compensation
  is business design, not database mechanics.

Analogy: booking a trip — flight, hotel, car — from three companies. No
travel agent can make it atomic; you book each in sequence, and if the hotel
is full after the flight is ticketed, you *cancel* the flight (a new
transaction, possibly with a fee — semantics, not rollback). Meanwhile, for
an hour, the world genuinely contained "flight booked, no hotel" — the
intermediate state was *real and visible*. That visibility is the isolation
problem (§3).

---

## 2. How it works in practice

### 2.1 Choreography vs orchestration (the eternal interview question)

**Choreography:** no central brain. Each service listens for events and
reacts: OrderService emits `OrderCreated` → PaymentService charges, emits
`PaymentCompleted` → InventoryService reserves, emits… Failure events
(`PaymentFailed`) trigger compensations in earlier services the same way.
- Wins: loose coupling (services don't know the workflow, only their
  triggers), no coordinator to fail or scale, natural fit for event-driven
  platforms.
- Loses: **the workflow exists nowhere** — it's emergent from N services'
  subscriptions; answering "where is order 123 stuck?" requires
  correlating N logs; adding a step means touching multiple services'
  event handling; cyclic event dependencies creep in; testing the
  *composite* is hard.

**Orchestration:** a saga orchestrator (a state machine, persisted) drives
the flow: invoke T₁ → record → invoke T₂ → … and on failure drives the
compensation chain. The workflow is *explicit code/state* in one place.
- Wins: legibility (one place answers "where is order 123?"), state
  timeouts and dead-man switches are natural, compensation logic is
  centralized, adding steps is one change.
- Loses: the orchestrator is a component to build/operate (availability,
  persistence — though it's a *state* SPOF, not a lock-holding SPOF like
  a 2PC coordinator: orchestrator downtime pauses progress, never blocks
  participants); risk of it swelling into a god-service that re-couples
  everything.

Modern practice note: dedicated workflow runtimes (**Temporal**,
Cadence-lineage; AWS Step Functions) are productized orchestrators —
durable execution, retries, timers as platform features. One name-drop
sentence: "today I'd reach for Temporal-class durable execution rather
than hand-rolling orchestrator persistence" — currency signal, cheap.

Choosing: choreography for short, stable, few-step flows with genuinely
independent reactors (2–3 steps); orchestration once flows are long,
compensating, evolving, or operationally interrogated ("where is X
stuck?" is a support requirement in payments — which is why payment
platforms orchestrate). Hybrids are normal: orchestrated core, event
side-effects (notifications, analytics) choreographed off its events.

### 2.2 Step taxonomy and ordering (the design discipline)

Classify every step:
- **Compensatable:** has a workable Cᵢ (reserve inventory ↔ release;
  charge ↔ refund).
- **Pivot:** the point of no return — not compensatable (or
  compensation is unacceptable): e.g., the actual interbank debit,
  shipping the package, notifying the user of success.
- **Retryable:** idempotent and guaranteed to eventually succeed
  (record-keeping writes, notifications with retry).

**The ordering rule (memorize):** compensatable steps first → the pivot →
retryable steps after. Everything before the pivot can be walked back;
the pivot fires only when the saga is otherwise certain; everything after
must never *need* walking back — it just retries to completion. A saga
that puts a non-compensatable step before an uncertain step is a design
bug you can spot in review in ten seconds — and interviewers plant
exactly that bug in design questions.

### 2.3 Compensation design rules

1. **Idempotent** — compensations run under the same at-least-once
   machinery as everything else (`05-resilience/07-idempotency.md`).
2. **Must not fail permanently** — a compensation with a business-failure
   mode ("refund rejected") needs its own escalation: retry ladder →
   park → human/ops queue. "Who un-sticks a stuck compensation?" is a
   design-review question.
3. **Semantically honest** — compensation may be imperfect (cancellation
   fee, coupon-restoration edge cases); the business must sign off on
   the residue, not discover it.
4. **Compensation ≠ symmetric API call** — refund-to-source routing,
   partial compensation (some items shipped), and time-limits
   (refund windows) make Cᵢ its own designed flow, not `Tᵢ⁻¹`.

### 2.4 The isolation problem (what sagas gave up, and the countermeasures)

Sagas have **A, C-ish, D — and no I**: between T₁ and Tₙ, other
transactions see committed intermediate states. Named anomalies: another
flow reads the order as "paid" and ships it while the saga is about to
compensate the payment (**dirty-read-across-services**); two sagas
interleave on the same entity (**lost update at the business level**).

Countermeasures (Bernstein/Richardson's list — know them as a kit):
- **Semantic locks:** mark the entity's state as *PENDING/PROCESSING* —
  a flag other flows must respect (block, queue, or reroute). Your
  platform's pending states ARE this — the mandate in `update_pending`,
  transactions in INITIATED/PENDING: business-level intention locks.
- **Commutative/associative updates:** design steps so interleaving
  doesn't matter (increments with identity, set-adds).
- **Pessimistic view / reordering:** move the riskiest reads/steps to
  where anomalies can't hurt (e.g., compute eligibility at the pivot,
  not step 1).
- **Reread/version check (semantic OCC):** before the pivot, re-validate
  the assumptions T₁ made (prices, limits) — your version-checked
  writes again.
- **By-value routing:** high-risk entities take the strict path,
  low-risk take the fast one (risk-tiering — very payments).

---

## 3. Senior-level depth

- **Saga state must be durable and owned.** Whether choreographed
  (implicit in each entity's state) or orchestrated (explicit state
  machine), *someone* must know each saga's position after a crash —
  which is why orchestrator state lives in a DB (or the entity carries
  its saga position as a status column) and why every saga needs
  **timeouts + a sweeper**: a saga stuck at step 2 for an hour is a
  liveness bug that no step will ever report. Your recon/stuck-state
  sweeps are exactly this sweeper, platform-wide
  (`05-reconciliation.md`).
- **Events + orchestration both need the outbox.** The orchestrator's
  "record step done + emit next command" and choreography's "commit
  state + emit event" are both dual-writes — the saga literature quietly
  assumes `04-outbox-and-cdc.md` underneath. Point this out unprompted;
  it stitches the directory together.
- **Sagas rename, not remove, the hard part.** The protocol is easy;
  the *business decomposition* — what's compensatable, where the pivot
  sits, what residue is acceptable, who eats a failed compensation —
  is the actual work, and it belongs to domain experts + engineers
  jointly. L6 framing: saga design is API design for organizations.
- **L4/L5/L6:** L4 defines saga + choreography/orchestration. L5 adds
  the step taxonomy and ordering rule, compensation design rules, the
  isolation problem with named countermeasures, durable state +
  sweepers, and the outbox dependency. L6 runs the org layer: pivot
  placement as business negotiation, compensation residue sign-off,
  workflow-runtime platform choices, recon as saga-repair-of-last-
  resort.

---

## 4. Resume connection (your flows, in saga vocabulary)

- **SBMD mandate setup = an orchestrated saga across four parties:**
  create-mandate at partner (T₁, compensatable — mandate can be
  cancelled) → user authorization via UPI/PIN (T₂ — user-driven step
  with timeout) → activation on callbacks (T₃) → your local state
  finalization (retryable). Pending states (`update_pending`, PENDING
  mandates) are the semantic locks; callbacks+Pulsar retries are the
  step transport; recon force-query is the sweeper. The ordered
  DB-write sequence for mandate updates is crash-consistent saga-state
  persistence, hand-built.
- **PayIn3 accounting flow = choreographed saga steps:** BLOCK (reserve
  — compensatable via RELEASE) → mandate executions (pivots! actual
  debits) → REFUND (compensation, back-to-source —
  `00-resume-arsenal/04-superpay-in-3.md`). The refund matrix is a
  compensation-design table; partial execution of multi-mandate
  installments is the partial-compensation problem, lived.
- **The reserve/capture shape:** SBMD's lien = compensatable
  reservation before the pivot (debits) — the ordering rule embodied
  in an NPCI product (and `02-2pc-and-friends.md`'s prepare-as-product
  observation).
- **Gap to own:** no formal orchestrator/workflow engine — your
  orchestration is distributed across processors + state machines +
  recon. Honest framing: "we run orchestrated sagas whose state machine
  is the entity's own status column and whose sweeper is recon; a
  Temporal-class runtime would centralize the legibility, and that's
  the upgrade I'd evaluate."

**30–60 s spoken answer** ("have you used the saga pattern?"):

> "Extensively — just without the word in the room. Our BNPL mandate
> setup is an orchestrated saga across four organizations: create the
> mandate at the partner — compensatable, it can be cancelled; user
> authorization with a timeout; activation driven by callbacks; local
> finalization as retryable steps. The saga's state machine is the
> entity's own status column, pending states act as semantic locks so
> concurrent flows respect in-progress work — that's the isolation
> countermeasure, since sagas give up I — and reconciliation is the
> sweeper that un-sticks anything stalled mid-saga, because a saga stuck
> at step two reports nothing by itself. The accounting flow is the
> compensation side: BLOCK reserves — releasable; mandate executions are
> the pivots, the actual debits; REFUND is compensation, and it's
> designed, not symmetric — back-to-source routing, partial-execution
> handling, its own failure escalation, because a refund is a new money
> movement, not an un-charge. The design rule I enforce in reviews:
> compensatable steps before the pivot, retryable after — a
> non-compensatable step sitting before an uncertain one is the bug.
> What we lack is a centralized orchestrator — our legibility comes from
> state machines plus recon; a Temporal-class runtime is the upgrade I'd
> evaluate."

---

## 5. What the interviewer will push on

**P1. "Design the order → payment → inventory → shipping saga. I'll fail
steps at random."**
- *Model:* classify first: inventory reserve (compensatable — release),
  payment charge (compensatable — refund, with residue caveats),
  shipping dispatch (**pivot** — can't unship cheaply), notifications
  (retryable). Order: reserve → charge → *pivot check* (re-validate) →
  dispatch → notify. Orchestrated (support must answer "where is order
  123") with persisted state + per-step timeouts + sweeper. Failure
  drills: charge fails → release reservation, order → FAILED (visible
  state); dispatch fails after charge → retry ladder (it's before
  nothing — actually pivot: park + ops if permanently failed, refund as
  business decision); crash mid-saga → state machine + sweeper resume;
  duplicate events → identity + idempotent steps. Volunteer the
  isolation case: order shows "paid" while about to compensate → status
  gates shipping (semantic lock).
- *Trap:* putting dispatch before charge confirmation, missing the
  pivot concept entirely, or compensations without idempotency/
  escalation — interviewers fail steps *twice* to catch non-idempotent
  compensation.

**P2. "Your compensation fails. Refund API returns 'account closed.'
Now what?"**
- *Model:* compensation failure is a *business* event, not a retry
  target: classify (transient → ladder; deterministic → stop). For
  'account closed': park in a resolution queue with full context, saga
  state → COMPENSATION_STUCK (visible, alertable, SLO'd), escalate to
  an ops/manual flow (alternative rails: source-account refund vs
  voucher vs contact user — business decides the fallback chain,
  pre-agreed, not invented during the incident). Books stay honest
  meanwhile: the ledger shows money held/owed explicitly — pending ≠
  wrong. The systemic point: every compensation needs its own failure
  path *designed*, or your saga's error handling has error handling
  with no error handling.
- *Trap:* "retry until it works" (deterministic failure) or hand-waving
  "manual intervention" without the queue/SLO/ledger-honesty mechanics.

**P3. "Choreography or orchestration for a payments platform — and
defend against the opposite camp."**
- *Model:* orchestration for the money core, and the deciding argument
  is operational legibility: support and recon must answer "exactly
  where is this payment and why" from one state machine — in
  choreography that answer is a distributed log-join. Rebut the
  coupling objection: the orchestrator couples *workflow*, which for
  money you WANT explicit and reviewed (the flow IS the product); the
  god-service risk is governed by keeping orchestrators per-flow, thin,
  and calling dumb services. Concede choreography its wins: fan-out
  side effects (notifications, analytics, rewards) hang off events
  beautifully — hybrid is the real answer. Cite your platform's shape
  as evidence.
- *Trap:* religious answers either way; the money-core/side-effect
  split with the legibility argument is what's scored.

**P4. "Sagas have no isolation. Construct a concrete anomaly in MY
system and fix it three ways."** (interviewer offers e.g. a booking
system)
- *Model:* construct: saga A (book seat: reserve → charge) at step 1;
  saga B reads "seat reserved" count for availability display —
  oversells or blocks wrongly when A compensates. Or: two sagas
  charge-then-fail interleaved on one wallet → business-level lost
  update. Fixes: (1) semantic lock — reservation state PENDING,
  availability counts exclude-or-include-by-policy, other writers
  blocked/queued per state machine; (2) commutative design — counter
  with identity-carrying deltas instead of read-modify-write;
  (3) pivot-time revalidation — re-check the invariant (seats, limits)
  in the same local transaction as the pivot with a version/CAS guard.
  Name the kit (semantic lock / commutative / re-read) — the
  countermeasures have names, use them.
- *Trap:* proposing global locks across the saga (you've reinvented
  2PC's held locks and lost the availability you came for).

**P5. "A saga is stuck at step 3 for six hours. No errors were logged.
Diagnose and fix systemically."**
- *Model:* the silent-stuck class: a step's request or callback was
  lost/never-delivered, and nothing owns liveness. Diagnose: saga
  state table (orchestrated) or entity status (choreographed) for
  position + last transition; then the step's transport (queue backlog,
  DLQ, partner callback logs). Systemic fixes: per-step timeouts with
  explicit timeout-transitions (→ retry/compensate/park — a timeout is
  a *state*, not an absence); a sweeper scanning for
  age > threshold-by-state (your recon force-query pattern —
  generalize it: every saga system needs its recon); and
  liveness-as-SLI — "oldest in-flight saga age" on a dashboard, alarmed.
  Close: "no errors logged" is the argument for orchestration/sweepers —
  silence is the failure mode, and only owned state + age can detect
  silence.
- *Trap:* answering with logging improvements only — the structural
  answer is timeouts-as-states + sweeper + age SLI; silence can't be
  logged.

---

## Self-test

1. Define a saga formally (Ts and Cs), and explain why "local" and
   "compensating, not undoing" carry the pattern.
2. Choreography vs orchestration: two wins and two losses each, and the
   deciding criterion for a payments core.
3. State the step taxonomy and the ordering rule; construct a
   ten-second-spottable violation.
4. Four compensation design rules, with the payments example for each.
5. What did sagas give up from ACID, and what anomaly does that create?
   Name three countermeasures from the kit.
6. Why does every saga system need timeouts-as-states plus a sweeper?
   What plays sweeper in your platform?
7. Why do both saga styles secretly depend on the outbox pattern?
8. Map SBMD mandate setup onto saga vocabulary (steps, classes, locks,
   sweeper).
9. Map the PayIn3 accounting flow (BLOCK/executions/REFUND) onto the
   taxonomy — where are the pivots?
10. Your compensation-stuck escalation design in four elements.
11. What's the honest gap in your platform's saga machinery and the
    named upgrade?
12. Why is a pivot a *business* decision rather than a technical one?
    Give two examples where the business moved the pivot.

<details>
<summary><b>Answers</b></summary>

1. T₁…Tₙ local transactions each committing independently; C₁…Cₙ₋₁
   compensations run backward from a failure point. "Local" = real
   commits, no locks/in-doubt state → works across trust boundaries.
   "Compensating" = new forward business actions that cancel meaning,
   not rollbacks — committed history is immutable; only its business
   effect can be neutralized.
2. Choreography wins: loose coupling, no coordinator component;
   loses: workflow exists nowhere (debugging = distributed log join),
   evolution touches many services. Orchestration wins: explicit
   state ("where is order X" answerable), natural timeouts/
   compensation logic; loses: a component to operate, god-service
   risk. Payments core → orchestration; criterion: operational
   legibility for support/recon on money flows.
3. Compensatable (has workable C) / pivot (point of no return) /
   retryable (idempotent, eventually succeeds). Rule: compensatable
   → pivot → retryable. Violation to spot: ship-the-goods (or debit
   the account) placed before payment confirmation/eligibility —
   a non-compensatable step preceding an uncertain one.
4. Idempotent (compensations ride at-least-once transport — refund
   keyed by original txn identity); must-not-fail-permanently
   (refund rejection → park + ops queue + SLO); semantically honest
   (refund fees/timing residue signed off by business); not a
   symmetric inverse (back-to-source routing, partial refunds for
   partially-shipped orders are designed flows).
5. Isolation. Committed intermediate states are visible to everyone:
   dirty-reads-across-services (ship on "paid" that's about to
   compensate) and business-level lost updates (interleaved sagas on
   one entity). Countermeasures: semantic locks (PENDING states
   gating other flows), commutative updates, pivot-time revalidation
   (re-read/version check), pessimistic reordering, risk-based
   routing.
6. A stuck saga emits nothing — failure by silence; steps can't
   report what never arrived. Timeout transitions make silence a
   state; a sweeper (scan for age > threshold per state) makes it
   detected; age-of-oldest-in-flight is the SLI. Platform sweeper:
   recon/stuck-transaction sweeps + DLQ force-query.
7. Every step ends with "commit my state AND publish the next
   event/command" — a dual write. Without outbox/CDC (same-
   transaction event emission), a crash between them silently halts
   the saga or double-fires the next step; the saga literature's
   reliability assumes exactly-once-ish step handoff that only the
   outbox shape provides (with idempotent consumers).
8. T₁ create-mandate at partner (compensatable — cancel); T₂ user
   authorization (timeout-bound user step); T₃ activation on partner/
   PSP callbacks (retryable apply, state-machine guarded); T₄ local
   finalization (retryable). Semantic locks: PENDING/update_pending
   states; step transport: callbacks buffered through Pulsar with
   redelivery; sweeper: recon force-query; saga state: the mandate's
   own status column with ordered crash-consistent writes.
9. BLOCK = compensatable reservation (C = RELEASE); each mandate
   execution = a pivot (real debit — after it, remedies are refunds,
   not releases); REFUND = designed compensation (back-to-source,
   partial-capable); notifications/comms = retryable tail. Multi-
   mandate installments: several pivots per installment → partial-
   execution states tracked per mandate, dunning on residue.
10. Explicit COMPENSATION_STUCK state (visible, alertable);
    resolution queue with full context (original txn identity,
    attempts, failure class); pre-agreed business fallback chain
    (alternate rail → voucher → contact); ledger honesty throughout
    (owed/held shown explicitly — pending, never silently wrong) +
    SLO on queue age.
11. No centralized orchestrator/workflow runtime — orchestration is
    distributed across processors, entity state machines, and recon.
    Upgrade: Temporal-class durable execution for one-place
    legibility, platform-managed retries/timers — evaluated against
    the cost of another stateful platform component.
12. The pivot is where compensation stops being acceptable — an
    economics/UX/legal judgment, not a technical property. Examples:
    treating dispatch as pivot until the business priced returns
    (making it compensatable at a cost); moving the credit pivot
    earlier (instant refunds as goodwill — business absorbing float
    risk to improve UX); refund windows defining when a charge stops
    being compensatable.

</details>
