# Worked Design 1: Payment System

Your home turf — which raises the bar: an adequate answer here is a *failure*
for you specifically, because the interviewer will know your background. This
design must be flawless, and your lived patterns
(`14-distributed-transactions/06-payment-consistency-patterns.md`) should
surface naturally, not as recitation.

**Prompt:** "Design a payment system for an e-commerce platform" (the
checkout/pay-in shape; adjust if the interviewer means P2P or payouts —
*ask*).

---

## 1. Requirements & scope (minutes 0–5)

Functional (prioritized): (1) charge a customer for an order via external
payment rails (cards/UPI/wallets through PSPs); (2) expose payment status to
order systems (query + push); (3) refunds; (4) merchant-facing ledger/
settlement views. Out of scope unless asked: payouts to sellers, FX,
subscriptions, fraud scoring (name the integration point), PCI details
(`09-security/05` when written — note card data goes tokenized/hosted-fields
so we stay out of CDE).

Non-functional — say these with conviction, they drive everything:
- **Correctness over latency, with one exception:** money must never be
  silently wrong ("eventually right, never silently wrong"); but checkout
  UX needs the *initiation* to feel instant — resolve via async + pending
  states.
- **The failure matrix rules:** every external call can succeed, fail, or
  time out unknown (`14-.../01-the-problem.md`) — the design is organized
  around the unknown cell.
- Scale (assume, state, adjust): 1 M payments/day baseline (~12 avg /
  ~50 peak TPS — *small*; say so: "payments volume is rarely the scaling
  problem; correctness and partner tails are"), 10× headroom, spikes at
  sales (10–20×).
- Availability: degrade by *payment method*, never whole-checkout
  (bulkheads per PSP — your SupermoneyPool pattern).

## 2. Estimation (5–9)

50 TPS peak × 5 KB/payment record × ~10 state transitions ≈ trivial write
load for any store — **which means**: storage choice is driven by
consistency semantics and audit needs, not throughput. Partner calls
dominate latency (PSP p99 ~1–3 s; bank/3DS redirects seconds-to-minutes) —
**which means**: never hold a synchronous thread across authorization;
async with pending states. Retention: regulatory (~7 y) ⇒ append-only,
cheap cold tier.

## 3. API (9–14)

```
POST /payments               Idempotency-Key: <client-uuid>   ← the load-bearing header
  {order_id, amount, currency, method, return_url}
  → 202 {payment_id, status: "PROCESSING", next_action?: {redirect_url}}
GET  /payments/{id}          → current state (poll path)
POST /payments/{id}/refunds  Idempotency-Key: ...  {amount}   ← partial refunds
Webhooks → order service:    payment.succeeded / payment.failed / refund.*  (signed, retried)
```
Design notes said aloud: 202-not-200 (acceptance ≠ outcome); idempotency
key per §5.1; webhooks push + GET pull — push for latency, pull for truth;
`next_action` models redirect/3DS/UPI-collect flows without coupling the
API to rails.

## 4. Data model (the part that IS the design)

- **`payments`** — the state machine row: id, order_id, amount, method,
  PSP refs, **status** (CREATED → PROCESSING → SUCCEEDED / FAILED /
  EXPIRED; + REFUND_PENDING/REFUNDED sub-machine), version (OCC),
  created/updated. Partitioned by payment_id; index tables by order_id,
  merchant+time (`02-databases/03-indexing.md`).
- **`ledger_entries`** — **append-only double-entry**: (txn_id, account,
  debit/credit, amount, currency, entry_type, payment_id, created_at).
  Every money movement = balanced entries (customer_receivable ↔
  psp_clearing; fees; refunds as *new reversing entries, never edits*).
  Balances = derived views. This table is the audit trail and the recon
  substrate — introducing it unprompted is the single strongest signal
  available in this design.
- **`outbox`** — same-transaction event rows powering webhooks + internal
  events (`14-.../04-outbox-and-cdc.md`).
- Store: relational is the honest default at this volume (real
  transactions bind payment-row + ledger + outbox writes atomically);
  wide-column + single-row discipline + sagas at UPI-platform scale —
  present both, pick per the stated scale, cite your platform for the
  large end.

## 5. High-level flow (14–24) — narrate write path first

```
Checkout → Payment API →(validate, idempotency reserve, create CREATED row
        + ledger PENDING + outbox in ONE txn)→ 202 w/ next_action
→ Executor (async, from outbox/queue) → PSP adapter (per-PSP bulkhead,
  timeouts 800ms-style budgets for sync legs; identity = payment_id)
→ PSP → rails → webhook/callback → verify signature → buffered via queue
→ state machine transition (guarded, idempotent) + ledger entries + outbox
→ webhook to order service; recon sweeps anything non-terminal > T.
```

The five decisions to argue (each one sentence + rejected alternative):
1. **Async execution with pending states** vs sync call-through: partner
   tails (seconds) would couple checkout availability to PSP worst-case;
   202 + pending + push/pull status wins (rejected: sync — acceptable
   only for instant rails with tight SLAs… and still wrong at spikes).
2. **PSP adapter layer with per-PSP bulkheads + breakers** (your
   anti-corruption layer): isolates partner failures per method;
   grey-out one method, checkout survives.
3. **Outbox everywhere** a state change must be announced (rejected:
   dual-write; the crash between commit and publish is a customer-facing
   lie).
4. **Ledger as append-only double-entry** (rejected: mutable balance
   column — un-auditable, un-reconcilable, and lost-update-prone).
5. **Recon as a subsystem from day one:** stuck-payment sweeps
   (non-terminal > T ⇒ query PSP by identity), daily settlement-file
   recon against PSP/banks into the four buckets
   (`14-.../05-reconciliation.md`).

## 6. Deep dives (24–39) — the three they always pick

### 6.1 "Exactly-once" charging (the must-win)

Layered identity: client Idempotency-Key (atomic reservation, IN_PROGRESS
lease, stored-response replay — `05-resilience/07-idempotency.md` P1);
payment_id propagated as the PSP idempotency reference (their dedup =
second wall); state machine rejects illegal/duplicate transitions (third);
recon converges residue (floor). Timeout on the PSP call ⇒ **query by
identity, never blind re-submit** ("retry the question"). Say the honest
form: at-least-once attempts + identity at every effector =
effectively-once money movement.

### 6.2 Refunds

A refund is a **new payment-shaped object** (own state machine, own
idempotency key, own ledger entries reversing the originals,
back-to-source rail), *not* a status flip. Partial refunds: sum(refunds) ≤
captured amount enforced where the invariant lives (conditional
write/CAS on captured-remaining, or serialized per payment). Compensation-
failure path: refund rejected ⇒ park + ops queue + ledger shows liability
explicitly (`14-.../03-sagas.md` P2).

### 6.3 PSP outage / degradation

Per-PSP breaker opens ⇒ route new payments to alternate PSP for the same
method where contracts allow (routing table), or grey the method; in-flight
payments stay PENDING (never auto-fail on breaker state — outcome unknown!)
and resolve via recon when the PSP returns. Queue absorbs; backlog age
gates shedding (`05-resilience/06`). What users see per phase — say it.

## 7. Operations wrap (39–45)

Page on: stuck-payment age (non-terminal > SLA), recon mismatch rate by
bucket (deploy-health leading indicator), PSP breaker state + success-rate
per method, webhook delivery lag, DLQ age. First 10× bottleneck: nothing in
storage — it's PSP rate limits and ops/recon toil ⇒ demand-shaping and
recon automation before infra. Evolution: multi-region active/standby with
payment-home pinning (a payment lives in one region — cross-region
consistency avoided by ownership, `01-distributed-systems/03-replication.md`
P2).

---

## Probes & traps

- **"Why not just call the PSP synchronously and return the result?"** —
  partner tail latency × checkout SLA + thread/connection hostage math +
  the unknown-timeout cell needing pending states anyway. Trap: agreeing
  for "simplicity" — you of all candidates can't.
- **"Where's the distributed transaction between payment row and
  ledger?"** — same local transaction (relational) or same-row/saga with
  markers (wide-column); across services it's outbox + idempotent
  consumers; never 2PC across the PSP boundary
  (`14-.../02-2pc-and-friends.md` P2). 
- **"User clicked pay twice."** — the double-charge runbook: same
  idempotency key ⇒ replayed response; different keys/two intents ⇒
  two payments *by design*, caught by order-level dedup (order_id
  uniqueness on active payments) — identity captures intent, and the
  order service owns "one payment per order" (`05-resilience/07` P2's
  payload-hash lesson).
- **"How do you KNOW the books are right?"** — internal proof first
  (double-entry sums to zero), then recon layers with residue and age
  (`14-.../06` P3's layered-confidence answer).
- **Trap for you specifically:** reciting your platform instead of
  designing for the stated scale. At 50 TPS, Postgres + outbox + one
  queue is the right answer; name where the UPI-scale machinery kicks
  in (10⁸/day: wide-column, single-row discipline, CDC spine) — scale-
  appropriate design is the L5 signal; over-engineering is the L4 tell.

## Self-test

1. Why 202 + pending rather than 200 + result? Two independent reasons.
2. Reproduce the four-wall idempotency chain and the timeout rule.
3. Why double-entry + append-only? Three operational consequences.
4. What binds payment-row, ledger, and event atomically — at both scale
   points?
5. A PSP webhook arrives before your executor's response lands — what
   prevents corruption? (Your callback-race fix, generalized.)
6. Why is a refund a new object? What invariant guards partial refunds
   and where does it live?
7. Breaker opens mid-flight: what happens to PENDING payments and why
   must they never auto-fail?
8. The five paging metrics and why recon mismatch rate is a
   deploy-health signal.
9. Where does this design's first 10× bottleneck actually sit?
10. Give the scale-appropriate storage answer at 50 TPS and at 10⁸/day.

<details>
<summary><b>Answers</b></summary>

1. (a) Outcome genuinely unknown at response time (rails take seconds-
   to-minutes; 3DS/redirect flows require user action) — 200 would lie;
   (b) decouples checkout availability/latency from partner tails —
   acceptance is your SLA, outcome is theirs, pending states bridge.
2. Client Idempotency-Key (atomic reservation + response replay) →
   payment_id as PSP idempotency reference (their dedup) → state-machine
   transition guards (replays/stale updates no-op) → recon convergence
   (floor). Timeout ⇒ status-query by identity; blind re-submit is the
   double-charge generator.
3. Corrections are reversing entries → audit trail by construction;
   entries sum to zero → internal consistency provable before partner
   comparison; balances as derived views → point-in-time reconstruction
   for disputes/regulators. (Plus: the ledger is the recon substrate.)
4. 50 TPS/relational: one ACID transaction (payment row + ledger rows +
   outbox row). Wide-column scale: single-row atomicity for the state
   machine + saga/marker discipline for ledger+outbox (event rides the
   owning row), recon covering the seams.
5. Callbacks are buffered through a queue and applied via guarded,
   idempotent state transitions with retry-until-visible (nack/
   redelivery if the row isn't there yet); ordering can't regress
   terminal states. Delay optimizes the first attempt; retry + guards
   provide correctness.
6. Own lifecycle, own failure modes, own idempotency, own ledger
   entries, back-to-source routing — flipping a status would destroy
   audit and partial-refund semantics. Invariant Σrefunds ≤ captured
   enforced at the invariant's home: conditional write/CAS on a
   captured-remaining column (or per-payment serialization) — the
   materialize-the-invariant move.
7. They remain PENDING and resolve by recon/status-query when the PSP
   recovers — breaker-open means *we stopped calling*, not that
   outcomes are known; auto-failing risks contradicting a success that
   already happened at the rails (money moved, we said failed —
   silent wrongness).
8. Stuck-payment age; recon mismatch rate by bucket; per-PSP success
   rate + breaker state; webhook delivery lag; DLQ age. A deploy that
   breaks a callback parser or drops transitions shows in ours-only/
   matched-different buckets within hours — before user complaints.
9. Not storage (trivial TPS) — partner-side rate limits/tails and
   human recon/ops toil; then webhook fan-out. So: demand shaping,
   PSP routing, recon automation before any infra scaling.
10. 50 TPS: Postgres — ACID binds row+ledger+outbox, boring and
    correct; queue for execution, Debezium-style tail for outbox.
    10⁸/day: wide-column (HBase-class) with single-row state machines,
    hand-built indexes, CDC spine for events/analytics, saga+recon
    replacing multi-row ACID — the machinery earns its complexity only
    at that volume.

</details>
