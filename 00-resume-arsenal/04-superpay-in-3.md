# SuperPay in 3 (PayIn3) — Resume Arsenal

**Status:** this project is in your context record but NOT currently a resume bullet.
Two reasons it earns a file anyway:

1. **You will need a second story.** Interviewers frequently say "tell me about
   something else" after you've spent your best project. PayIn3 is a full BNPL
   product with unique attack surfaces (regulatory caps, refund splitting,
   installment contracts) that SBMD doesn't cover.
2. **Consider adding one bullet for it** — suggestion in `06-gap-analysis.md`. Two
   shipped BNPL products on one resume reads as "owns the credit-on-UPI domain",
   which is exactly the L5 scope narrative.

---

## 0. Primer

**PayIn3:** cart value split into 3 equal installments — first paid at order time,
second and third auto-collected monthly via UPI AutoPay mandate. Unlike SBMD (a
*secured* product — lien blocked upfront), PayIn3 is *unsecured deferred credit*:
Flipkart's partner (super.money) underwrites installments 2–3. Whitelisted users
only; eligibility, credit limit, and the ledger live with the partner (source of
truth). Billing cycle: bill cut on the 20th, mandate executes on the 5th; on
failure, partner retries ~1, 2, 5, 10 min then hourly up to 10 attempts; unpaid
past 90 days → non-recoverable. **UPI AutoPay regulatory constraint: ₹15,000 cap
per mandate execution [VERIFY the current cap and its exact scope — NPCI has
revised AutoPay limits by category over time; quoting a stale regulatory number in
a payments interview is a self-inflicted wound].**

Coexists with SBMD behind **one unified eligibility API** returning both products'
eligibility in a single call.

---

## Story 1 — Unified eligibility API for two credit products

### Design

The gateway eligibility endpoint accepts a list of payment instruments
(`[SUPERPAY_LATER, PAY_IN_3]`) and returns one response with both sub-objects; for
PayIn3 the response carries the full **installment schedule** — per-installment
amount, date, and *payment instrument* (`FK_UPI` vs mandate) — which downstream
checkout logic executes literally. One partner round-trip prices both products.

### Why it matters (say this)

The schedule-as-contract move is the interesting design: instead of checkout
hard-coding "first installment is always a UPI debit", the eligibility response
*declares* per-installment routing, and execution reads the declaration. All the
business variance (mandate exists? 5-minute setup window expired? cart within
limit?) collapses into data, not branching client code. When the rules changed,
the contract didn't. That's the generalizable design lesson — "policy in data,
mechanism in code".

### Attack tree

**P1. "Two products, one call — but SBMD needs a balance fetch and PayIn3 needs an
underwriting decision. Doesn't bundling couple their latencies?"**
- *Model answer:* yes, deliberately: both are answered by the same partner in one
  API (partner aggregates internally), and the alternative — two calls on the
  checkout hot path — doubles partner load and takes the max of two tails anyway.
  The 800 ms budget covers the bundle; degradation greys out *both* credit options
  together, which product accepted because they render in one widget. If the
  products' latency profiles diverged, split the calls and render independently —
  named trigger, L5 signal.
- *Trap:* "one call is simply better." Bundling is a trade; name both sides.

**P2. "The 5-minute window: mandate created, but first transaction happens 6 minutes
later. Why does the flow flip to a direct UPI debit, and what breaks if you get
this wrong?"**
- *Model answer:* mandate-execution-as-first-payment is only valid within a short
  window of setup **[verify whether the 5-min window is partner policy or NPCI
  rule]**; past it, the first installment must be collected as a live, PIN-authorized
  UPI debit. Getting it wrong either fails the payment (executing an ineligible
  mandate) or, worse, double-collects if both paths fire. The schedule's
  per-installment `paymentInstrument` field is what makes the routing explicit and
  testable rather than implicit in timing.

---

## Story 2 — The ₹15,000 cap and multi-mandate installments

### Design

UPI AutoPay caps a mandate execution at ₹15,000 **[VERIFY]**. Installments above the
cap are covered by **multiple mandates** created at setup and executed together on
the due date; the schedule exposes multiple entries per installment with distinct
mandate references, and user comms reflect multiple executions on one date.

### Why this is a great interview story

It's a *regulatory constraint forcing an architectural shape* — the purest form of
"engineering under external constraints", which Google design rubrics explicitly
reward. The alternatives were: cap the product (max cart ₹15k × 3 — product said
no), route big installments to a non-UPI rail (new integration, new failure modes),
or split across mandates (chosen: stays on one rail, complexity contained in setup
+ execution fan-out). Failure-mode analysis you must volunteer: **partial execution**
— mandate A of an installment succeeds, mandate B fails → the installment is
half-collected. Handling: partner ledger tracks per-mandate execution; retries
target only the failed mandate; user comms and dunning reason about the installment,
not the mandate **[verify the partial-failure handling — this is the first
follow-up an interviewer will fire]**.

### Attack tree

**P3. "Partial execution: one of the two mandates for installment 2 fails
permanently. What does the user owe, what does recon show, and who chases it?"**
- *Model answer:* partner ledger is authoritative: installment 2 shows partially
  collected; the failed mandate follows the retry ladder (10 attempts) then falls
  into collections (SMS/IVR/email) against the residual amount; our side reflects
  mandate-level states via callbacks and never invents an installment-level
  "success" by summing optimistically. The design rule: *money truth is per-mandate;
  product truth is per-installment; the mapping layer is explicit.*
- *Trap:* not having thought about partial failure at all — with a split-execution
  design it's not an edge case, it's a certainty at volume.

---

## Story 3 — Polymorphic accounting callbacks (BLOCK / RELEASE / REFUND)

### Design

One authenticated callback endpoint receives three structurally different event
types from the partner. Jackson `@JsonTypeInfo/@JsonSubTypes` on a discriminator
field deserializes to typed subclasses; MapStruct `@SubclassMapping` maps each to
the mandate-service contract — compile-time-verified, zero reflection-based
dispatch hand-rolled. Events carry txnId/requestId/orderId + line items;
idempotency on requestId.

### Attack tree

**P4. "Why one polymorphic endpoint instead of three endpoints?"**
- *Model answer:* the partner's contract, mostly — they emit one accounting stream;
  and one endpoint means one auth interceptor, one queue-buffering path, one
  idempotency scheme, with type dispatch in code where it's testable. Three
  endpoints would duplicate the pipeline for zero isolation gain (same producer,
  same consumer service). Counter-case: if event types had different SLOs or
  security postures, separate endpoints would earn their keep.
- *Trap:* religious answers either way. It's plumbing; the signal is knowing what
  would change your mind.

**P5. "A REFUND event arrives for an order whose BLOCK you never saw. What do you
do?"**
- *Model answer:* out-of-order and gap tolerance must be explicit: validate against
  partner state (query if needed) rather than trusting local sequence; park/nack
  unresolvable events for redelivery; alert on sustained orphan rate (indicates a
  dropped-callback bug on either side, surfaced by recon). Never silently drop a
  money event; never apply it against a guessed state.

---

## Story 4 — Refund splitting

The refund matrix is a gift of an interview story — recite it precisely:

| Scenario | What was collected | Refund routing |
|---|---|---|
| Cancel; mandate pre-existed, 1st EMI was live UPI debit | 1/3 via UPI, 0 via mandate yet | 1/3 back via UPI rail, 2/3 released via partner/PA (back-to-source) |
| Cancel; mandate created at checkout, 1st EMI via mandate | all via mandate rail | full 3/3 via partner/PA back-to-source |
| Return after all 3 EMIs paid | 3/3 | full refund of all paid installments |

The principle to state: **refunds return by the rail they arrived on**
(back-to-source) — because settlement identities differ per rail and cross-rail
refunds break reconciliation and, in regulated flows, rules. The ledger entry is
created with the partner first; execution follows via the payment aggregator.

**P6. "Why not just refund the whole amount over the simplest rail?"**
- *Model answer:* back-to-source is both a recon requirement (each rail's
  settlement books must balance independently) and frequently a scheme/regulatory
  expectation; cross-rail refunds create money that one ledger paid and another
  received — unreconcilable by construction. Payments interviewers score this
  sentence highly because it shows ledger thinking, not just API thinking.

---

## 30–60 s spoken answer (whole project)

> "PayIn3 was our second BNPL product — unsecured this time: cart split into three
> installments, first collected at order time, the rest via UPI AutoPay mandate
> with a partner underwriting the credit. Three designs I'd call out: a unified
> eligibility API that prices both of our credit products in one partner call and
> returns an installment schedule where each installment declares its own payment
> instrument — so routing policy lives in data, and checkout just executes the
> contract; multi-mandate handling for the AutoPay per-mandate cap, where a large
> installment fans out across mandates, which forced us to be rigorous about
> partial-execution states — money truth per mandate, product truth per
> installment; and back-to-source refund splitting across two rails, because
> refunds must return by the rail they arrived on or the settlement books stop
> reconciling."

---

## Self-test

1. SBMD vs PayIn3 in two sentences: security model and money flow.
2. What does "schedule as contract / policy in data" buy when business rules change?
3. Why does the first installment sometimes route via live UPI debit instead of the
   mandate? Name both triggers.
4. State the multi-mandate design and its inevitable failure mode. How is partial
   execution represented and recovered?
5. Why is bundling two products into one eligibility call defensible, and what
   would trigger unbundling?
6. REFUND arrives before BLOCK — what's the wrong response and the right one?
7. Why back-to-source refunds? What breaks with cross-rail refunds?
8. Who is the source of truth for PayIn3 money state, and what is our system's
   relationship to it?
9. What are the retry and collections parameters of the repayment lifecycle?
10. Which single number in this file must you verify before quoting, and why is
    quoting it stale uniquely damaging?

<details>
<summary><b>Answers</b></summary>

1. SBMD is secured: a lien blocks funds up front and debits execute against the
   block. PayIn3 is unsecured: nothing is blocked; the partner underwrites
   installments 2–3 and collects via ordinary AutoPay mandate executions.
2. Rule changes (windows, limits, mandate-vs-direct routing) become changes to the
   data the eligibility response emits; execution code — client and server — is
   untouched. Fewer coordinated deploys, testable as data.
3. (a) No mandate exists yet at pay time (user chose mandate-less path /
   setup incomplete); (b) the mandate-execution window since setup (~5 min) expired.
   Both are declared per-installment in the schedule's paymentInstrument field.
4. Installments above the per-mandate cap are covered by multiple mandates executed
   together on the due date. Inevitable failure: partial execution (subset
   succeeds). Representation: partner ledger tracks per-mandate collection;
   retries target only failed mandates; dunning/comms reason at installment level
   over the residual.
5. One partner answers both in one API; two hot-path calls double partner load and
   take max-of-tails latency while both products render in one widget and degrade
   together. Unbundle when latency profiles or availability needs diverge enough
   that one product's slowness shouldn't hide the other.
6. Wrong: silently drop, or apply against guessed state. Right: treat as
   out-of-order/gap — verify against partner state (the source of truth), nack for
   redelivery if unresolvable, and alert on sustained orphan rates because they
   indicate systemic callback loss.
7. Each rail's settlement must balance on its own books; a refund over a different
   rail than collection creates unmatchable entries on both ledgers (and can
   violate scheme rules). Back-to-source keeps recon closed.
8. The partner (super.money) ledger. Our system mirrors state via callbacks and
   converges via recon force-queries; we never treat local state as authoritative
   for money owed.
9. On failed mandate execution: retries at ~1, 2, 5, 10 minutes then hourly, up to
   10 attempts; then collections comms; unpaid past 90 days marked
   non-recoverable.
10. The ₹15,000 AutoPay cap (and the 5-minute window's provenance). Regulatory
    numbers change by circular; misquoting one signals stale domain knowledge in
    the exact area you claim expertise — worse than saying "the cap at the time
    was ₹15k; I'd verify the current figure."

</details>
