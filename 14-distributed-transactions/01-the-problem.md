# The Problem — Why Cross-Service Atomicity Is Hard

Every doc in this directory answers one question asked five ways: **how do you
change state in two places such that the world never ends up half-changed —
when the two places don't share a database, a lock manager, or even an
employer?** For a payments engineer this isn't a pattern-catalogue topic; it's
the job description. This doc frames the problem precisely, maps the solution
space, and sets the vocabulary the next five docs use.

---

## 1. Plain definition

Inside one database, atomicity is a solved problem: the engine's transaction
machinery (undo logs, commit records — `02-databases/04-transactions-isolation.md`)
guarantees all-or-nothing. The moment an operation spans **two systems** —
two databases, two services, your service and a partner's API — that machinery
evaporates, because it depended on three things you no longer have:

1. **A shared commit point.** One database has a single instant (the commit
   record hitting the WAL) where the transaction becomes real. Two systems
   have two instants, and *something can fail between them* — always.
2. **A shared lock manager.** One database can hold locks across all touched
   rows until commit. Service B will not hold its rows locked while service A
   thinks — and a partner across a trust boundary absolutely will not.
3. **Abort authority.** One database can undo anything uncommitted. You
   cannot reach into the partner's ledger and un-happen their write.

The money framing (use it in every interview — it makes the stakes concrete):
**debit account X in system A, credit account Y in system B.** Enumerate the
failure matrix:

| A (debit) | B (credit) | World state |
|---|---|---|
| ✓ | ✓ | Correct |
| ✗ | ✗ | Correct (nothing happened) |
| ✓ | ✗ | **Money destroyed** (debited, never credited) |
| ✗ | ✓ | **Money created** (credited, never debited) |
| ✓ | timeout | **Unknown** — the worst cell: B may or may not have credited (`05-resilience/01-timeouts.md`: timeout ≠ failure) |

The last three rows are the entire field of distributed transactions. And the
timeout row is the deepest: you cannot even *know* which of the other rows
you're in without asking.

---

## 2. Why the "obvious" fixes don't work

**"Put it all in one database."** Sometimes right (that's Q2 of
`02-databases/08-when-to-pick-what.md` — co-locate what transacts together)!
But it stops working when: the systems belong to different owners (your
platform vs super.money vs NPCI — trust boundaries don't share databases,
ever); scale forced partitioning (cross-shard is cross-system with familiar
branding); or organizational autonomy is the point of the service split.
One-database is a valid *avoidance* strategy, not a solution — say it as
option zero, then move on.

**"Use a distributed lock."** A lock gives mutual exclusion, not atomicity:
holding a ZK lock while you call A then B leaves you in exactly the same
failure matrix when B times out — plus now you've added lock-holder-death
semantics and fencing (`01-distributed-systems/05-consensus.md` P3). Locks
serialize; they do not make two writes one write.

**"Retry until it works."** Retries + idempotency handle the *transient*
rows of the matrix (they're how you resolve the timeout cell safely) — but
retries can't compensate a *business* failure: B rejects the credit
(account closed) after A debited. Retrying a rejection forever is not a
strategy; you need an *undo* concept — which is the saga insight
(`03-sagas.md`).

---

## 3. The solution space (the map for this directory)

Four families, ordered by how much coordination they buy and what they pay:

1. **Atomic commit protocols (2PC/3PC, `02-2pc-and-friends.md`):** make the
   two systems genuinely share a commit decision, at the price of
   synchronous coordination, held locks, blocking failure modes, and both
   sides implementing "prepared" state. Works inside trusted, latency-close
   infrastructure (databases internally, Spanner, Kafka txns); essentially
   never across trust boundaries or plain HTTP APIs.
2. **Sagas (`03-sagas.md`):** give up atomicity's *illusion of
   simultaneity*; embrace a sequence of local transactions, each
   independently committed, with **compensating actions** to semantically
   undo on failure. The world sees intermediate states (no isolation) —
   managed with pending states and design discipline. This is how money
   actually moves between real institutions.
3. **Event-driven eventual consistency (outbox/CDC, `04-outbox-and-cdc.md`):**
   make the *first* write atomic with the *announcement* of it (same-
   transaction outbox event), then let downstream systems converge
   asynchronously with at-least-once delivery + idempotent consumers. This
   solves "state + publish" atomicity — the dual-write problem — which is
   the most common instance of the whole topic.
4. **Reconciliation (`05-reconciliation.md`):** accept that *all of the
   above leak* (bugs, lost callbacks, operator error, cosmic rays) and run
   systematic detect-and-converge as a first-class subsystem. In payments,
   recon isn't a fallback — it's the load-bearing floor that licenses
   every eventual-consistency decision above it.

And beneath all four, the two universal prerequisites you already own
(`05-resilience/07-idempotency.md`): **stable identity** for every operation
(so retries/replays collapse) and **idempotent effects** (so convergence
actions are safe to repeat). No pattern in this directory works without
them; with them, even crude patterns become safe.

---

## 4. Senior-level depth

- **The consistency boundary as a design object.** Inside the boundary
  (one DB, one row in HBase): engine transactions, cheap. Across it:
  protocols, expensive. The L5 skill is *drawing the boundary
  deliberately* — co-locating what must be atomic (entity-group thinking,
  your row designs), and making everything that crosses it either
  compensatable, idempotent-convergent, or recon-covered. The design
  review question: "for every arrow that crosses a system boundary, what
  happens if the world stops right after it?"
- **Trust boundaries dominate technique choices.** Within your
  infrastructure you *could* run 2PC; with Juspay/super.money/NPCI you
  can't even propose it — their API is the interface, period. Hence the
  payments stack is sagas + callbacks + recon all the way down. The
  recurring line: **"NPCI doesn't join anyone's transaction."**
- **The industry already solved this — before computers.** Banking's
  answer to cross-institution atomicity is centuries old: **double-entry
  bookkeeping** (every movement recorded in two places whose sum is
  invariant), **clearing and settlement** (batch agreement at defined
  times), and **reconciliation with dispute processes** (detect, converge,
  adjudicate). Modern payment systems are these ideas with lower latency.
  Framing your recon/settlement work as "the classical answer, sped up"
  is a genuinely senior move — it shows you know the domain's bones, not
  just its APIs.
- **Availability math of synchronous composition** (from
  `01-distributed-systems/01-fault-tolerance-resilience-ha.md`):
  atomic-commit couples N systems' availability multiplicatively AND
  holds locks during the slowest participant's worst case. Async patterns
  decouple availability at the price of temporary inconsistency — which
  is *visible* inconsistency (pending states) rather than *wrong*
  inconsistency, if designed. That distinction — pending ≠ wrong — is
  the emotional core of payments engineering.
- **L4/L5/L6:** L4 names "sagas or 2PC" as a menu. L5 enumerates the
  failure matrix unprompted, resolves the timeout cell via
  identity+query-the-authority, chooses per boundary (trust, latency,
  capability), and always states who repairs residual divergence. L6
  designs the *boundary layout itself* — which invariants deserve
  co-location, where the pivot points sit, what the org's recon coverage
  policy is.

---

## 5. Resume connection

You live in row 5 of the failure matrix professionally:

- **Your platform's whole shape is the solution space instantiated:**
  single-row atomicity as the co-location strategy (consistency boundary
  drawn at the HBase row); Pulsar-buffered async flows as
  eventual-consistency machinery; pending states everywhere; force-query
  for the timeout cell; recon as the floor. You didn't read this
  directory — you built it.
- **The SBMD/PayIn3 flows are cross-trust-boundary sagas** (mandate setup
  across FK ↔ SM ↔ Juspay ↔ NPCI, accounting BLOCK/RELEASE/REFUND events
  as saga steps, back-to-source refunds as compensations) — made explicit
  in `03-sagas.md` and `06-payment-consistency-patterns.md`.
- **Honest boundary:** you haven't run 2PC/XA in production (almost nobody
  has, on purpose) — own that and reason from mechanism in
  `02-2pc-and-friends.md`.

**30–60 s spoken answer** ("how do you handle transactions across
services?"):

> "By never pretending I have them. Cross-system atomicity fails for three
> missing ingredients — no shared commit instant, no shared locks, no
> abort authority over the other side — so I start from the failure
> matrix: for a debit here and a credit there, the dangerous states are
> half-done and — worse — unknown-after-timeout. The toolkit is layered.
> First, draw the consistency boundary deliberately: co-locate what must
> be atomic — in our platform that's the HBase row, which is why
> transaction state lives in one row. Second, everything crossing the
> boundary becomes a saga of local commits with pending states the world
> is allowed to see and compensations that semantically undo — that's
> what our mandate and accounting flows are across the BNPL partner and
> the PSP. Third, state-plus-announcement atomicity comes from the
> outbox/CDC shape rather than dual writes. And underneath everything,
> reconciliation as a first-class subsystem — because every pattern
> leaks, and in payments recon isn't the fallback, it's the floor that
> licenses eventual consistency everywhere else. The two prerequisites
> that make all of it safe are stable identity on every operation and
> idempotent effects — so the timeout cell resolves by asking the
> authority what happened, never by blindly redoing it."

---

## 6. What the interviewer will push on

**P1. "Transfer $100 from an account in bank A to an account in bank B.
Design it. You own neither bank."**
- *Model:* immediately reject atomic-commit (trust boundary). Shape: a
  transfer *record* with its own state machine (INITIATED → DEBITED →
  CREDITED / COMPENSATING → REFUNDED / FAILED) in YOUR system as
  orchestrator; step 1 debit A with idempotency key; persist outcome;
  step 2 credit B with idempotency key; on B's business failure →
  compensate (refund A — a new semantic action, not an undo); on B
  timeout → query B's status by identity, never blind-retry the credit;
  pending state visible to the user throughout ("processing"); recon
  sweep for anything stuck non-terminal; and the ledger view: every
  movement double-entered so the books can prove convergence. This is
  the directory in one answer — deliver it as a checklist.
- *Trap:* any design with a window where money is silently wrong (vs
  visibly pending); or "use 2PC/XA across the banks" — trust boundary
  blindness is the primary screen here.

**P2. "Why is the timeout the worst cell in your failure matrix?"**
- *Model:* every other cell is a *known* state you can act on; timeout is
  epistemic — the action may or may not have happened, so both "assume
  failed and redo" (double effect) and "assume succeeded and proceed"
  (missing effect) are wrong. Resolution requires converting unknown to
  known: idempotent retry with the same identity (safe because dedup
  collapses it) or interrogation of the authority (status query /
  force-query). Design consequence: every cross-boundary effect MUST have
  a status-query path or an idempotent identity — an API with neither is
  un-integrable for money. That last sentence is an API-design review
  rule worth quoting.
- *Trap:* "treat timeout as failure and retry" — the exact bug that
  double-pays; this is the same probe as the Storm double-debit question
  wearing different clothes.

**P3. "Your team proposes splitting the monolith; the order flow will now
span three services. What do you demand before approving?"**
- *Model:* the boundary audit: (1) enumerate every invariant the flow
  maintains and classify — which become cross-service (order-payment-
  inventory consistency)? (2) for each crossing arrow: failure semantics —
  compensatable, retryable-idempotent, or pivot (irreversible)?
  (3) pending states designed into the domain model + UX (the world will
  see intermediates); (4) identity propagated end-to-end; (5) recon
  coverage — who detects and converges residual divergence, with what
  SLO; (6) the honest question — do these pieces *need* separate
  databases, or is this a deployment split with a shared consistency
  boundary? The demand list is the answer; approving architecture is
  refusing to let atomicity dissolve silently.
- *Trap:* answering with team/process concerns only, or accepting the
  split as free — the question is fishing for whether you know
  decomposition's price is exactly this directory.

---

## Self-test

1. Name the three ingredients of single-database atomicity that vanish
   across systems.
2. Reproduce the five-row failure matrix for debit-A/credit-B, and say
   why the timeout row is categorically worse.
3. Why doesn't a distributed lock solve atomicity? What does it actually
   provide?
4. What can retries + idempotency resolve, and what class of failure
   requires compensation instead?
5. Map the four solution families to what they buy and what they pay.
6. State the two universal prerequisites and what each makes safe.
7. Define "consistency boundary" and give your platform's boundary with
   its consequence.
8. Why can't 2PC cross trust boundaries? (Two independent reasons.)
9. What are banking's three pre-computer answers to this problem, and
   what does each map to in your platform?
10. "Pending ≠ wrong" — explain the distinction and its UX/product
    implication.
11. The API-design rule that falls out of the timeout cell.
12. Give the boundary-audit checklist for a service split.

<details>
<summary><b>Answers</b></summary>

1. A single commit instant (one WAL commit record), a shared lock manager
   spanning all touched state, and abort authority (undo) over
   everything uncommitted.
2. ✓✓ correct; ✗✗ correct; ✓✗ money destroyed; ✗✓ money created;
   ✓/timeout — unknown. Worse because it's epistemic: you don't know
   which world you're in, so both redo and proceed are unsafe until the
   unknown is converted to known (query or idempotent retry).
3. Mutual exclusion — one actor in the critical section at a time. The
   failure matrix is unchanged inside the section: B can still timeout
   after A committed. Plus new failure modes (holder death, fencing).
   Locks serialize access; atomicity needs a shared commit decision or
   compensation.
4. Retries+idempotency resolve *transient* and *unknown-outcome*
   failures (the timeout cell — same identity collapses duplicates).
   They cannot resolve *business rejections* after a prior step
   committed (credit refused after debit succeeded) — that needs a
   semantic undo: compensation.
5. Atomic commit (2PC): buys a genuine shared decision; pays sync
   coordination, held locks, blocking on coordinator failure,
   participant "prepared" capability — infrastructure-internal only.
   Sagas: buy availability and trust-boundary compatibility; pay visible
   intermediate states + compensation design. Outbox/CDC: buys
   state+announcement atomicity; pays at-least-once + consumer
   idempotency. Recon: buys a floor under everything; pays a
   subsystem's worth of engineering + bounded divergence windows.
6. Stable identity per operation (retries/replays/queries all reference
   the same intent — dedup and status-query become possible) and
   idempotent effects (convergence/repair actions safe to repeat).
   Together: at-least-once anything → effectively-once outcomes.
7. The scope within which engine transactions make writes atomic;
   crossing it requires protocols. Platform: the HBase row — hence
   transaction state modeled into one row (co-location), markers/CAS
   for the two-row cases, sagas/recon beyond.
8. (a) Prepared state = holding locks/resources at a stranger's command
   — no institution lets an external coordinator freeze its books;
   (b) capability: partner APIs (HTTP) expose business operations, not
   prepare/commit/abort endpoints with persistent in-doubt state; you
   can't retrofit a voting protocol onto someone else's interface.
9. Double-entry bookkeeping (every movement recorded twice, sum
   invariant) → your ledger/accounting events and balanced BLOCK/
   RELEASE/REFUND flows. Clearing & settlement (agree in batch at
   defined times) → NPCI settlement cycles your recon aligns with.
   Reconciliation + disputes (detect, converge, adjudicate) → force-
   query, TPAP recon, complaint/dispute flows.
10. Pending is a *designed, visible, converging* intermediate ("payment
    processing") with an owner and an SLA; wrong is silent divergence
    (balance incorrect with no process converging it). Product
    implication: model pending into UX and domain states — users
    tolerate honest pending far better than fast wrongness; engineers
    get breathing room for async correctness.
11. Every cross-boundary effectful API must offer at least one of:
    idempotency by caller-supplied identity, or a status-query endpoint
    keyed by that identity. Lacking both, timeouts are unresolvable and
    the API is unfit for money integration.
12. Enumerate invariants → classify which go cross-service; per crossing
    arrow: compensatable / retryable / pivot; pending states designed
    into model + UX; identity propagation end-to-end; recon coverage
    with SLO and ownership; and the challenge question — do they truly
    need separate consistency boundaries, or just separate deployments?

</details>
