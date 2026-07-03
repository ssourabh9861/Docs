# Payment Consistency Patterns — The Problem You Actually Own

The capstone doc: the five preceding docs' machinery, assembled into the
specific system of record-keeping that moves money correctly across five
organizations — because that is literally your job, and "how do you keep your
state and your partner's ledger consistent?" is the most predictable deep-dive
of your entire loop. This doc names each pattern, grounds it in your flows,
and ends with the design drills interviewers actually run.

---

## 1. The concrete problem (state it like this)

One BNPL purchase touches **five bookkeepers**: your UPI platform (product
and transaction state), super.money (credit ledger, limits, collections),
Juspay (PSP processing records), NPCI (network truth of debits), and the
banks (actual account balances). No two share a database; no one may hold
another's locks; every pair communicates by request + callback + file. Yet
the composite must satisfy hard invariants: *no debit without an order; no
credit consumed without a ledger entry; every block eventually released or
executed; refunds never exceed collections; every record eventually agrees
with the network's version of money truth.*

The one-sentence thesis of the whole directory, applied: **you cannot make
five bookkeepers atomic, so you make every movement identified, every state
visible-and-pending until confirmed, every effect idempotent, and every book
comparable — then convergence does the rest.**

---

## 2. The pattern kit (ten patterns, each named, each yours)

### 2.1 Source-of-truth designation (per field)

The authority map from `05-reconciliation.md` §2.4: network truth (did the
debit happen) = NPCI; credit truth (limit, balance, owed) = SM ledger;
product truth (mandate product state, user intent) = you. Every consistency
question starts by consulting the map; every design review asks "who is
authoritative for this new field?"

### 2.2 State machines with terminal states

Every money entity (transaction, mandate, installment, refund) is a state
machine with: legal transitions only (stale/replayed updates rejected —
your ordering posture), explicit terminal states (SUCCESS/FAILED/EXPIRED —
"every entity reaches terminal or recon drags it there"), and *age in
non-terminal state* as the universal liveness SLI.

### 2.3 Pending states as semantic locks

INITIATED/PENDING/update_pending are not placeholders — they're the saga
isolation countermeasure (`03-sagas.md` §2.4): other flows read them and
gate (no shipping on unconfirmed payment; no second mandate update while
one is pending). Pending ≠ wrong — designed, visible, converging.

### 2.4 The reservation pattern (reserve/capture) — payments' native 2PC

Two-phase money without a coordinator: **reserve** (compensatable hold) →
decide → **capture** (the pivot) or **release** (the compensation). Card
auth/capture; SBMD's lien + multiple debits; PayIn3's BLOCK →
executions → RELEASE/REFUND. This is `02-2pc-and-friends.md`'s
"prepare as a product feature": the hold has a business-level timeout,
visible semantics, and a designed compensation instead of protocol
messages. When an interviewer says "design two-phase anything," reach for
reservation before 2PC.

### 2.5 The identity chain

One user intent = one identity, propagated end-to-end (client request ID →
txn ID → PSP/NPCI references → settlement records), so that: retries
collapse (idempotency), status is queryable at every hop, and recon can
match books line-to-line. The API rule: every effectful cross-boundary
call carries identity AND offers a status query — or it's un-integrable
(`01-the-problem.md` P2).

### 2.6 Timeout ⇒ query, never blind retry

The unknown cell's standing resolution (`05-resilience/01-timeouts.md`,
your force-query): convert unknown to known by interrogating the
authority; re-execute only through identity-deduped paths.

### 2.7 Dual-channel truth propagation: push + pull

Callbacks (push: fast, lossy) + status-query/recon (pull: slow, complete).
Never rely on push alone — a callback is an optimization of the pull
path's latency, not a replacement for its completeness. Your
callback-buffering + recon backstop is the pattern; state it as
push-for-latency, pull-for-truth.

### 2.8 Double-entry bookkeeping (the mental model that organizes ledgers)

Every movement is recorded as balancing entries (debit one account, credit
another) in an **append-only** ledger; balances are *derived* (folds over
entries — event sourcing's ancestor, `04-outbox-and-cdc.md` §2.4).
Consequences that answer interview questions instantly: corrections are
new reversing entries, never edits (audit trail by construction); the
books can be *proven* internally consistent (entries sum to zero) before
ever comparing with a partner; and "balance" questions become "as-of which
entries" questions (point-in-time reconstruction). Even where your
platform delegates the formal ledger to SM, the accounting-event flows
(BLOCK/RELEASE/REFUND with itemized line data) are double-entry thinking
crossing an API.

### 2.9 Back-to-source and compensation honesty

Refunds return by the rail they came on (settlement books must close
per-rail — `00-resume-arsenal/04-superpay-in-3.md`); compensations are
designed flows with their own failure escalation
(`03-sagas.md` §2.3) — never assumed inverses.

### 2.10 Authorization vs settlement separation

The real-time layer (authorize, reserve, record) is deliberately decoupled
from the money-movement layer (clearing, settlement at T+1 cycles) —
letting the fast layer be optimistic-but-identified while the slow layer
is complete-and-final, with recon stitching them
(`05-reconciliation.md` batch style). UPI compresses this versus cards
(near-real-time rails) but the layering survives in settlement files and
dispute windows — and *your* BNPL adds its own second layer (monthly
billing cycles over per-purchase authorizations).

---

## 3. Senior-level depth: the composite properties

- **The system is "eventually right, never silently wrong."** Decompose
  any flow and check: at every instant, every book is either correct or
  visibly-pending-with-an-owner; no state exists where money is wrong
  AND nothing is converging it. That property — not atomicity — is what
  payment systems actually guarantee, and articulating it as the design
  target is the most senior sentence available in this topic.
- **Invariants become recon checks, not runtime locks.** "Refunds ≤
  collections" isn't enforced by a distributed transaction — it's
  enforced locally where possible (SM validates) and *verified* globally
  by recon invariant checkers. The general move: global invariants
  migrate from prevention (needs coordination) to detection + bounded
  correction (needs recon) as boundaries harden.
- **Money has a dimension of time nothing else has:** float, cutoffs,
  billing cycles, dispute windows, NPA aging — every consistency
  question carries "as of when, per whose clock/cutoff." This is why
  aging rules exist, why settlement is batch, and why "are we consistent
  *right now*" is often the wrong question (right question: "is
  everything within its convergence SLA").
- **L4/L5/L6:** L4 knows payments are "eventually consistent with
  retries." L5 wields the ten-pattern kit with your flows as instances
  and states the composite property. L6 negotiates the kit *into
  contracts and org design*: partner API requirements (identity, status
  queries, files, dispute SLAs), authority maps as governance, recon
  coverage as product policy, pivot placement as business decisions.

---

## 4. Resume connection + spoken answer

This doc IS the resume connection. The one framing to add: in interviews,
*lead* with the composite property, then let the interviewer pull patterns
out of you one drill at a time — it reads as depth revealed under
pressure, which scores higher than a recited list.

**30–60 s spoken answer** ("how do you keep money consistent across your
platform and partners?"):

> "Five bookkeepers touch one BNPL purchase — us, the credit partner, the
> PSP, NPCI, the banks — and no two share a database, so atomicity was
> never on the menu. The design target instead is: eventually right,
> never silently wrong — at every instant, every book is either correct
> or visibly pending with an owner and a convergence path. The kit that
> achieves it: authority designated per field — NPCI owns whether a
> debit happened, the partner ledger owns credit state, we own product
> state; every entity is a state machine where pending states double as
> semantic locks and age-in-non-terminal is the liveness alarm; one
> identity per user intent propagated end to end, so retries collapse
> and books match line-to-line; timeouts resolve by querying the
> authority, never blind re-execution; truth propagates on two channels
> — callbacks for latency, status-query and reconciliation for
> completeness, because push is an optimization of pull, not a
> replacement; and money movement itself uses the reservation shape —
> block, then execute or release — which is two-phase commit's prepare
> turned into a product feature with business timeouts and designed
> compensations. Underneath it all, double-entry thinking: append-only
> records, corrections as reversing entries, balances as derivations —
> so the books can be proven consistent internally before we ever
> compare them with a partner."

---

## 5. What the interviewer will push on (the standard drills)

**P1. "Design wallet-to-bank transfer (or UPI-like payment) end to end.
Money must never be lost or duplicated."**
- *Model:* run the kit as a checklist. Identity minted at intent;
  transfer entity with a state machine (INITIATED → DEBITED →
  CREDITED/COMPENSATING → terminal); reservation on the wallet side
  (hold, not deduct — compensatable); debit as ledger entries
  (append-only, double-entry); credit leg via the bank rail with
  identity + status-query; timeout ⇒ query; business rejection after
  debit ⇒ compensation (release/refund) with its own escalation;
  pending visible to the user throughout; sweeps on non-terminal age;
  daily file recon with the rail; authority map stated (bank/network
  wins on credit-happened). Then answer "never lost or duplicated"
  precisely: duplication prevented by the identity chain at every
  effector; loss prevented by durable intent + sweeps (nothing
  non-terminal is ever abandoned); and the honest form of the
  guarantee — eventually right, never silently wrong.
- *Trap:* deducting the wallet balance directly at step 1 (no
  reservation → compensation becomes money-creation risk), or claiming
  literal never-duplicated without the identity mechanism.

**P2. "A user reports being charged twice. Trace the investigation and
the fix."**
- *Model:* investigation order: (1) identity — are there two txn IDs or
  one? One ID twice at a downstream = a dedup layer failed (which
  one? gateway token TTL? PSP identity? — the layered audit); two IDs =
  intent duplicated upstream (client bug minting two intents — the
  payload-hash-vs-intent lesson). (2) Network truth — force-query both
  IDs at NPCI: did two debits actually happen, or one debit +
  one stale/failed record displaying as charged? (3) Converge: genuine
  double debit → refund flow (back-to-source, maker-checker) + incident
  on the failed dedup layer; display-only → correct the record via
  authority. (4) The class fix: which horizon/bug let it through —
  extend the layer, add the recon invariant check (same-user+amount+
  merchant within Δt → flag). Deliver as an ordered runbook — the
  order (identity → truth → converge → class-fix) is the score.
- *Trap:* refunding before establishing network truth (maybe no second
  debit exists), or treating it as one-off without the which-layer-
  failed analysis.

**P3. "How do you know, right now, that your books and super.money's
agree?"**
- *Model:* reject the premise gently: "right now" is the wrong
  granularity for cross-org books — the honest claim is layered:
  (1) continuous — nothing of ours is non-terminal beyond age SLAs
  (sweeps green); (2) invariant checkers on the accounting-event stream
  (every BLOCK has a terminal disposition; refunds ≤ collections);
  (3) batch — last settlement/file recon matched at X% with residue in
  aged buckets under investigation; (4) canary-verified — the recon
  itself is alive (`05-reconciliation.md` P4). So: "we agree to within
  the convergence SLA, and I can show you the residue and its age."
  That's the professionally-correct answer; false certainty is the
  fail.
- *Trap:* "we're consistent because callbacks keep us in sync" — push
  without pull, the exact anti-pattern; also claiming zero divergence
  (smoke-detector-dead-battery).

**P4. "Your BNPL user's limit is ₹10 k at SM. Two checkouts for ₹8 k
race. What prevents ₹16 k of exposure, and at which layer?"**
- *Model:* not your layer — and knowing that is the answer: limit
  enforcement is the ledger-owner's job (SM decrements/validates
  authoritatively at mandate-creation/execution — their local
  transaction, their invariant). Your layer contributes: eligibility
  pre-checks (advisory, stale-tolerable — under-offering safe), the
  reservation shape (BLOCK reserves against the limit — the semantic
  lock at the ledger), identity (two checkouts = two intents = two
  ledger conversations SM serializes). The general rule: **race
  conditions on an invariant are resolved at the invariant's
  authority** — everyone else's checks are UX optimizations. Then the
  write-skew connection (`02-databases/04-transactions-isolation.md`):
  this is the materialize-the-invariant fix, organizationally — the
  limit lives in ONE ledger that all deciders must touch.
- *Trap:* proposing your-side locking/coordination to "help" — you'd
  be building distributed enforcement of an invariant someone else
  owns; the authority answer is the senior answer.

**P5. "Monthly billing executes a mandate for ₹4,600 across ten users'
purchases. Something fails halfway. Design the recovery posture."**
- *Model:* decompose by the kit: the execution is per-user (one
  mandate execution per user's consolidated bill — failures are
  per-user, not batch-atomic); each execution is a pivot with identity
  → timeout ⇒ query, retries by the partner's ladder (minutes →
  hourly → collections — the business retry schedule from
  `05-resilience/04-retries.md`); partial-batch state is normal and
  visible (per-user installment states), no batch-level rollback
  exists or is needed; residue flows to dunning/collections with
  aging (90-day NPA), and recon invariants track
  billed-vs-collected-vs-outstanding continuously. The posture:
  **per-entity sagas, not batch transactions** — the batch is just a
  schedule; the correctness unit stays the entity. 
- *Trap:* designing batch-level atomicity/rollback ("re-run the whole
  billing job transactionally") — the per-entity decomposition +
  business retry ladder is how money actually works.

---

## Self-test

1. Name the five bookkeepers and state the thesis sentence.
2. Reproduce the ten-pattern kit from memory (names + one clause
   each).
3. "Eventually right, never silently wrong" — define it as a checkable
   property of a design.
4. Why is reservation "payments' native 2PC"? Map reserve/capture/
   release onto prepare/commit/abort and name the two things that
   replaced protocol machinery.
5. Push + pull: why is a callback an optimization, not a replacement?
6. Three consequences of double-entry, append-only ledgers that answer
   interview questions directly.
7. The double-charge runbook in four ordered steps.
8. Who prevents the racing-checkouts over-limit, and what's the
   general rule it instantiates? Connect it to write skew.
9. Why do global invariants migrate from prevention to
   detection-and-correction as boundaries harden?
10. What's the honest answer shape to "are your books consistent right
    now"?
11. The billing-run failure posture in one sentence.
12. For a brand-new partner integration, list the six things you'd
    demand in the contract for consistency's sake.

<details>
<summary><b>Answers</b></summary>

1. Your UPI platform (product/txn state), super.money (credit ledger),
   Juspay (PSP records), NPCI (network debit truth), banks (account
   balances). Thesis: five bookkeepers can't be atomic, so every
   movement is identified, every state visible-and-pending until
   confirmed, every effect idempotent, every book comparable — and
   convergence does the rest.
2. (1) Source-of-truth per field; (2) state machines with terminal
   states + age SLIs; (3) pending states as semantic locks;
   (4) reservation (reserve/capture/release); (5) identity chain
   end-to-end + status-query APIs; (6) timeout ⇒ query, never blind
   retry; (7) push+pull truth propagation; (8) double-entry
   append-only ledgers, balances derived; (9) back-to-source +
   designed compensations; (10) authorization/settlement layering
   with batch recon stitching.
3. At every instant, for every book and field: the value is either
   correct per its authority, or in an explicitly-pending state that
   (a) other flows respect, (b) has an owner and convergence
   mechanism, (c) has a monitored age bound. Checkable: enumerate
   states × fields and demand one of the two conditions; any state
   that is wrong-with-no-converger fails the design.
4. Reserve = prepare (durable hold, bound to a later decision);
   capture = commit (the pivot); release = abort (compensation).
   Replacements: business-level timeout (holds expire by rule, no
   blocked-coordinator state) and designed compensation semantics
   (release/refund as product features) instead of protocol messages
   and in-doubt recovery.
5. Push (callbacks) delivers truth fast but lossily — retries
   exhaust, endpoints break, retention ends; pull (status query +
   file recon) is complete but slow. Only pull can bound divergence
   duration; push merely shortens the common case. Systems relying
   on push alone have unbounded silent divergence — push optimizes
   pull's latency.
6. Corrections are reversing entries, never edits → audit trail by
   construction (answers "how do you fix mistakes"). Entries sum to
   zero → internal consistency is provable before external
   comparison (answers "how do you know YOUR books are right").
   Balances are folds over entries → point-in-time reconstruction
   ("as of when") is native (answers dispute/audit questions).
7. (1) Identity: one txn ID or two? — locates which dedup layer (or
   upstream intent-minting) failed. (2) Network truth: force-query
   NPCI for actual debits. (3) Converge: real double debit →
   back-to-source refund with maker-checker; display-only → correct
   the record from authority. (4) Class fix: repair the failed
   layer/horizon + add the recon invariant check for the pattern.
8. The invariant's authority — SM's ledger serializes limit
   consumption in its local transactions; your checks are advisory
   UX. Rule: races on an invariant are resolved where the invariant
   lives; distributed "helping" is redundant coordination. Write-skew
   connection: the limit is the materialized invariant — one row/
   ledger all deciders must touch, converting skew into a visible
   conflict at the authority.
9. Prevention requires coordination (shared locks/transactions)
   which trust boundaries forbid and availability math punishes;
   detection + bounded correction requires only comparable books and
   idempotent convergence — recon. As coordination cost rises with
   boundary hardness, the economic optimum shifts to
   detect-and-correct with SLAs.
10. Layered confidence, not point certainty: sweeps green (nothing
    non-terminal beyond age), invariant checkers passing, last batch
    recon matched at X% with aged residue enumerated, and recon
    liveness canary-verified — "consistent to within the convergence
    SLA, residue visible."
11. Per-entity sagas on a shared schedule — the batch is a calendar,
    not a transaction; failures decompose to per-user pivots with
    business retry ladders and dunning, never batch rollback.
12. (1) Caller-supplied idempotency identity honored on every
    effectful operation; (2) status-query API keyed by that identity;
    (3) callback delivery with retries + signing (and documented
    retention); (4) settlement/recon files — format, completeness,
    cutoff times; (5) documented response-code semantics (mappable —
    your resolver); (6) dispute/adjustment process with SLAs and an
    authority map (who wins on what). — Recon requirements ARE
    integration requirements.

</details>
