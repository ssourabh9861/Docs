# SuperPay Later (SBMD) — Resume Arsenal

Resume section under attack:

> **SuperPay Later — Buy-Now-Pay-Later on UPI (Single-Block-Multiple-Debit)**
> - Led end-to-end design and delivery of a BNPL product on NPCI's UPI Single-Block-Multiple-Debit, integrating a third-party BNPL partner, the payment provider, and Flipkart checkout across 3 microservices; isolated the integration from the PCI-scoped payment service to contain compliance scope, launching to [X]M+ users / [₹X Cr] GMV.
> - Resolved a callback race condition — partner callbacks arriving before the mandate record was persisted — by buffering callbacks to a Pulsar queue and processing them with a controlled delay, eliminating mandate-state corruption.
> - Designed a dual-timeout resilience strategy (800 ms fail-fast balance check on the checkout critical path vs 3.5 s for mandate setup) behind Hystrix circuit breakers and isolated thread pools, preventing partner latency from cascading into other UPI flows.
> - Built a 3-stage checkout-eligibility pipeline (SBMD-bank account filtering → device validation → partner balance check) with a short-circuit that skips the partner balance API when no active mandate exists, reducing partner load by [X]% on the high-frequency checkout path.

---

## 0. Primer — the concepts you must be able to explain from zero

You will be asked to explain the domain to an interviewer who has never seen UPI.
If you can't do this cleanly in 60 seconds, nothing after it lands.

- **UPI (Unified Payments Interface):** India's real-time account-to-account payment
  network, operated by NPCI (National Payments Corporation of India). A payment moves
  money directly between bank accounts, authorized by the user's UPI PIN, routed
  through NPCI between the payer's and payee's banks. There is **no card** anywhere
  in the flow — this matters for your PCI story (see attack A4).
- **Mandate (UPI AutoPay):** a standing authorization a user grants once ("this
  merchant may debit up to ₹N under these conditions"), after which debits execute
  without the user present. Think of it as a pre-approved, amount-capped permission
  slip registered with the user's bank via NPCI.
- **SBMD (Single Block, Multiple Debit):** an NPCI mandate variant where a **lien**
  (a hold — funds stay in the user's account but can't be spent) is placed once, and
  the merchant may execute **multiple debits** against that single block. Contrast:
  classic AutoPay has no fund blocking and each execution is a normal debit attempt
  that can fail for insufficient balance. SBMD gives the merchant *secured* headroom.
  Requires banks supporting the newer UPI spec (your docs say UPI 2.17+ **[VERIFY the
  exact spec version before quoting it]**).
- **Your product:** user blocks a lien as security → gets one-click "SuperPay Later"
  checkout → purchases accumulate → consolidated bill executes against the block on
  the 5th of each month. Entities: Flipkart UPI (you), **super.money** (TSP holding
  mandate state, ledger, and credit limit — the source of truth for eligibility and
  balance), **Juspay** (payment aggregator that actually talks to NPCI), and FKPG
  (Flipkart's PCI-scoped payment orchestration, where card payments live).
- **TSP (Technology Service Provider):** the partner that operates the credit/ledger
  side. In interviews say "third-party BNPL partner" and name super.money only if asked.

---

## Bullet 1 — End-to-end design, 3 services, PCI-scope isolation

### STAR story (the full version you compress on demand)

- **Situation.** Flipkart wanted a BNPL offering on UPI checkout. NPCI had just made
  SBMD available; almost no one had built a consumer product on it. The integration
  had to span Flipkart checkout (FKPG), our UPI stack, Juspay, and a new external
  partner (super.money) that would own the credit ledger — four organizations, one
  user flow, and a hard constraint: the card-handling payment service (FKPG/PGS) is
  PCI-DSS-scoped, and anything we attached to it would be dragged into audit scope.
- **Task.** Design where the partner integration lives, define the API surface across
  our services, and deliver the mandate lifecycle (create, update, callbacks,
  accounting events) end to end. **[OWNERSHIP: verify — "led end-to-end design" must
  mean you authored the design doc and drove the reviews. If a senior/staff engineer
  owned the HLD and you owned services within it, say exactly that; it is still a
  strong L5 story if you own the trade-offs you present.]**
- **Action.** Evaluated two integration homes. Option A: put the super.money
  integration in PGS (it's "payments", and PGS already orchestrates checkout).
  Rejected: (1) PGS is PCI-scoped — every new integration expands the audited surface,
  and PCI audits cost real engineering weeks per year; (2) mandate onboarding is not
  card processing — coupling them means BNPL deploys ride the most change-averse
  service we have. Option B (chosen): integrate in the UPI PSP-adapter service, which
  already speaks to external payment partners (Juspay) and has the anti-corruption
  layer pattern (internal domain objects ↔ partner contracts) established. Result:
  super.money became "just another external partner" behind an existing seam.
  Then split the work across three services: gateway (new eligibility API for
  checkout + authenticated callback receivers for partner mandate-status and
  accounting events), autopay/mandate service (mandate state, reusing the existing
  mandate tables with a new row-key namespace instead of a new table), PSP service
  (partner client behind Hystrix with per-operation commands and a config-driven
  response-code translation layer so partner contract changes need no deploy).
- **Result.** Shipped to production; launched to **[X]M+ users / ₹[X] Cr GMV — FILL
  THESE OR DELETE THE CLAIM**. PCI audit scope unchanged (zero new PCI-scoped
  components). The PSP-adapter seam was reused wholesale for the second BNPL product
  (PayIn3) — the durable-change coda.

### 30–60 s spoken answer

> "I led the design of Flipkart's BNPL product on NPCI's Single-Block-Multiple-Debit —
> a UPI mandate variant where you place one lien on the user's account and execute
> multiple debits against it. The interesting design problem was placement: the
> integration with the credit partner could have gone into our checkout payment
> service, but that service is PCI-scoped because it handles cards, and attaching a
> non-card integration to it would have expanded our audit surface and coupled BNPL
> releases to our most change-sensitive service. I put the partner behind our UPI
> PSP-adapter instead — it already had the anti-corruption-layer pattern for external
> partners — and split the product across the gateway (eligibility API + partner
> callback receivers), the mandate service (state, reusing existing tables under a new
> row-key namespace), and the PSP adapter (partner client behind circuit breakers with
> config-driven response-code mapping). We launched to [X] users, kept PCI scope flat,
> and the same seam was reused for our second BNPL product."

### Attack tree

**A1. "Walk me through what happens end-to-end when a user with an active mandate
clicks Pay."**
- *Model answer:* Checkout orchestration calls the gateway eligibility API →
  3-executor pipeline (registered SBMD-eligible accounts → device fingerprint
  validation against Aerospike → mandate-service check for an active SUPERPAY_LATER
  mandate; if active, PSP-adapter fetches available balance from the partner under
  the 800 ms budget). Eligible → one-click option renders. On pay, the debit
  completes within the PIN/pwd call itself (no separate initiate leg), the partner
  sends an accounting BLOCK event to our authenticated callback endpoint, which we
  route through Pulsar to the mandate service's ledger handling. If the transaction
  isn't terminal after the live flow, reconciliation queries the partner — the partner
  ledger is the source of truth. Consolidated execution happens on the 5th.
- *Trap answer:* narrating boxes and arrows without ever saying **who is the source
  of truth for money state** (the partner ledger) and **what reconciles divergence**
  (recon querying SM). Payments interviewers listen for exactly those two sentences.

**A2. "You said 'led end-to-end'. What was the hardest disagreement during design,
and who pushed back?"**
- *Model answer:* have ONE real conflict ready. Candidates from your docs: (a) PGS
  team vs PSP placement (compliance vs convenience), (b) new mandate table vs row-key
  namespace reuse (analytics flexibility vs delivery speed — you chose reuse and
  knowingly gave up independent CDC/analytics on the new mandate type for V1),
  (c) recon strategy (chose piggy-backing on TPAP recon over a new Storm topology —
  gave up future FDP reports on the new table). Pick the one you genuinely fought.
- *Trap answer:* "there wasn't much disagreement, the design was straightforward."
  That converts your "led" claim into "attended".

**A3. "Why reuse the existing mandate table with a row-key prefix instead of a new
table? Defend it under scale."**
- *Model answer:* one less state machine, one less schema, faster to ship, and the
  mandate access patterns are identical (point lookups by account + mandate type,
  which the `ACC:SUPERPAY_LATER:MDid` key serves directly in HBase). Costs accepted
  and named up front: analytics/CDC for the new product is entangled with the old
  pipeline, and a future divergence in lifecycle (e.g., SBMD-specific states) would
  force a migration. Trigger to revisit: when SBMD mandate volume or lifecycle
  diverges enough that filtering in the shared pipeline dominates cost.
- *Trap answer:* "HBase is schemaless so tables don't matter." Row-key namespace
  choices in HBase determine region distribution and scan locality — an interviewer
  who knows HBase will follow up with hot-region questions and you'd better have the
  key-design story (see `02-databases/05-hbase-internals.md` when written).

**A4. "You said PCI scope. UPI has no card data. What exactly was PCI-scoped, and
what does 'in scope' concretely cost?"** ← this is the probe that kills bluffers
- *Model answer:* Correct — UPI itself carries no PAN, so the UPI stack is not
  PCI-scoped. The PCI-scoped system is Flipkart's payment gateway service (card
  storage/processing for regular checkout). The design decision was about *not
  attaching* the BNPL partner integration to that service, which would have put new
  code, hosts, and data flows inside the CDE (cardholder data environment) boundary.
  In-scope concretely means: the component is inside the annual PCI-DSS assessment —
  network segmentation requirements, access-control and logging requirements,
  quarterly scans, change-control overhead, and audit evidence for every release.
  Keeping BNPL out kept the CDE boundary unchanged.
- *Trap answer:* implying UPI data itself is PCI-scoped, or hand-waving "compliance
  reasons". If you can't define CDE and what an assessor audits, drop the acronym
  and say "card-compliance-scoped checkout service" — accurate and defensible.
  (Deep dive coming in `09-security/05-pci-scoping.md`.)

**A5. "What breaks if super.money is down for 6 hours? What did users see, and what
did money do?"**
- *Model answer:* Eligibility balance-check fails fast (800 ms timeout, breaker
  opens) → SuperPay option greys out → users fall back to normal UPI/cards; no new
  exposure is created (fail-closed for credit issuance — the safe direction).
  In-flight mandate setups fail visibly in the setup flow (3.5 s timeout) and can be
  retried. Partner callbacks (mandate status, accounting) are the partner's to retry;
  our side is idempotent on requestId, and recon force-queries the partner's state
  once it's back, so ledger divergence is bounded by recon lag, not lost. Metrics
  that page: breaker-open state, callback lag, recon mismatch count.
- *Trap answer:* "Hystrix handles it." Name the *product* behavior (grey-out), the
  *money* behavior (no exposure created; recon repairs), and the *observability*.

### Known weak points to fix before interviews
- `[X]M+ users / ₹[X Cr]` — a scale claim with placeholder numbers is worse than no
  claim. Get the real launch numbers or rewrite the bullet without them.
- **[OWNERSHIP: verify]** on "led end-to-end" — see README rule.
- Be ready for "what would V2 look like?" — your docs give you the answer for free:
  independent mandate lifecycle table + CDC once volume justifies it, real-time
  underwriting, partial payments.

---

## Bullet 2 — Callback race fixed via Pulsar buffering

### The mechanism, precisely (you must be able to draw this)

The race: user completes mandate setup → partner (and Juspay) fire status callbacks
to our gateway *at nearly the same moment* the synchronous "live flow" response is
still being processed and the mandate row is being persisted by the mandate service.
If the callback processor runs before the row exists, its update targets a missing
row: with a read-modify-write handler, that's a failed or — worse — silently dropped
state transition. Symptom in production: mandates stuck in PENDING with the partner
showing ACTIVE; support tickets; recon catching divergence hours later.

The fix: callbacks are not processed inline. The gateway acknowledges receipt,
publishes the callback payload to a Pulsar topic, and a consumer processes it after a
controlled delay. Two properties do the real work:

1. **Durability + at-least-once redelivery.** Once in Pulsar, the callback cannot be
   lost to a crashed handler; if processing fails (row still missing), the message is
   negatively acknowledged and redelivered with backoff. So the mechanism is not
   "hope the delay is long enough" — it is *retry until the write it depends on is
   visible*, with the delay merely making the first attempt cheap to get right.
2. **Idempotent apply.** Redelivery means the same callback may be processed more
   than once; the state update is keyed on mandate ID + status transition, so
   replays are no-ops.

Backstop: reconciliation force-queries the partner for any mandate not terminal, so
even a poisoned callback cannot strand state forever.

### STAR (compressed)

- **S:** Post-launch (or in integration testing — verify which) mandate records were
  intermittently corrupted/stuck: partner callbacks raced the live-flow persist.
- **T:** Eliminate the corruption without adding synchronous coordination between
  the live flow and the callback path.
- **A:** Moved callback handling off the synchronous path into Pulsar: ack-then-queue
  at the gateway, delayed consumption, negative-ack redelivery on missing-row,
  idempotent state transitions, recon as backstop. Applied the same pattern to both
  partner and Juspay mandate callbacks (it became the house pattern).
- **R:** Mandate-state corruption eliminated **[get the number: stuck-mandate rate
  before/after, or ticket count]**; pattern reused across mandate flows.

### 30–45 s spoken answer

> "Partner mandate callbacks were racing our own persist — the callback could arrive
> before the mandate row existed, and the update would fail silently, leaving state
> corrupted until recon caught it. Rather than coordinate the two paths synchronously,
> I made the callback path asynchronous and retryable: the gateway acks and publishes
> the callback to Pulsar, a consumer processes it after a short delay, and if the row
> still isn't there the message is redelivered with backoff. Combined with idempotent
> state transitions, the delay just optimizes the first attempt — correctness comes
> from retry-until-visible plus reconciliation as the backstop. That killed the
> corruption and became the standard pattern for all mandate callbacks."

### Attack tree

**B1. "A fixed delay is a band-aid. What happens when persistence takes longer than
your delay?"** ← guaranteed question; your resume wording invites it
- *Model answer:* Agreed — a delay alone is a race condition with better odds. That's
  why the delay is not the correctness mechanism: on missing-row the consumer nacks
  and Pulsar redelivers with backoff, so the invariant is "callback applies after the
  row is visible, eventually", not "the row is ready within N seconds". The delay
  exists to make the *common case* succeed on attempt one (cheaper, lower callback
  lag). Beyond retry exhaustion → DLQ/sideline + recon force-query.
- *Trap answer:* defending the delay itself ("we measured persist latency and set the
  delay above p99"). The interviewer's next question is "and at p99.9?" — you lose.

**B2. "Why not fix the ordering at the source — persist before triggering the
partner, or use a transactional outbox?"**
- *Model answer:* The race is with an *external* partner's callback timing, which we
  don't control — the partner fires when its side completes, not when ours does. The
  initiating write and the partner call can't share a transaction across company
  boundaries. Options actually available: (a) block the callback handler until the
  row appears (holds partner's connection, couples their timeout to our persist —
  no); (b) write a placeholder row before calling the partner (helps, but callbacks
  can still precede *that* write's visibility, and it adds a cleanup path for
  abandoned setups); (c) park-and-retry via queue (chosen — decouples, durable,
  bounded staleness). An outbox solves "publish my own events atomically with my
  writes" — a different problem.
- *Trap answer:* accepting the premise and saying "yes, outbox would have been
  better." Know what an outbox is for; misapplying it is a negative signal.

**B3. "Your consumer applies callbacks idempotently — what's the idempotency key,
and what happens with out-of-order callbacks (ACTIVE arrives, then a stale PENDING)?"**
- *Model answer:* Key is mandate ID + partner request/callback ID for dedup; for
  ordering, state transitions are validated against a state machine — a transition
  from a terminal/later state to an earlier one is rejected (stale update dropped),
  optionally with partner timestamp comparison. So duplicates are no-ops and
  reordering can't regress state.
- *Trap answer:* "Pulsar preserves order so it can't happen." Per-key order holds
  only within one topic/partition with key-based routing AND a single logical
  producer — two independent callback sources (partner + Juspay) into a delayed,
  retried pipeline give you no end-to-end ordering guarantee. Claiming otherwise
  fails you with anyone who runs queues in production.

**B4. "What did 'eliminating mandate-state corruption' look like in a dashboard?"**
- *Model answer you need to own:* stuck-in-PENDING count by age, recon mismatch rate,
  callback processing lag p99, DLQ depth. Know the before/after values **[FILL]**.

---

## Bullet 3 — Dual-timeout resilience (800 ms vs 3.5 s) + Hystrix isolation

### The design, from first principles

Two calls to the same partner have completely different latency contracts because
they sit on different user journeys:

| Call | Journey | Budget | On timeout |
|------|---------|--------|-----------|
| Balance/eligibility fetch | Checkout page load & pay click — the highest-traffic, most latency-sensitive surface at Flipkart | **800 ms** | Fail fast, grey out SuperPay, user pays another way (degradation, not error) |
| Mandate create/update/status | Onboarding/setup — user has explicitly entered a setup flow | **3.5 s** | Visible failure, user retries |

Both run in a dedicated Hystrix **thread pool** (`SupermoneyPool`, 200 threads, queue
rejection at ~20 — treat internal numbers as yours to explain, not to print on a
resume) with **per-operation command keys**, so each operation gets its own circuit
breaker and stats while sharing the bulkhead.

Why this shape:
- **Isolated thread pool (bulkhead):** if the partner hangs, at most 200 threads —
  not the service's request workers — are stuck. Other UPI flows (P2P, checkout via
  other instruments) never queue behind partner latency. That is the precise meaning
  of "preventing partner latency from cascading".
- **Thread-pool vs semaphore isolation:** thread isolation lets Hystrix time out the
  call even if the underlying HTTP client misbehaves (the caller thread detaches at
  timeout; the worker thread is abandoned to finish/die). Semaphore isolation is
  cheaper (no context switch, no thread handoff) but cannot interrupt a hung call —
  your timeout becomes advisory. For an external partner over WAN you pay the thread
  cost. Cost math: ~200 threads × ~1 MB default stack = ~200 MB virtual, far less
  resident; plus ~0.05–0.5 ms handoff overhead per call (estimate — measure).
- **Per-operation command keys:** a slow eligibility endpoint must not open the
  breaker for mandate creation (different endpoint, different health). Shared pool +
  separate breakers = one bulkhead, independent failure detection.
- **Fail direction is a product decision:** timing out the balance check *hides a
  credit option* (safe: no money moves, worst case lost conversion). If this were,
  say, a fraud check, fail-open vs fail-closed would flip. Saying this sentence in an
  interview is an instant L5 marker.

### Throughput sanity check you must be able to do live (Little's Law)

Concurrency = throughput × latency. With 200 threads: at healthy ~100 ms partner
latency → sustains ~2,000 rps; if the partner degrades to the full 800 ms timeout →
~250 rps before the pool saturates and Hystrix starts rejecting (which is the design
working: shed partner-bound load, protect everything else). If the interviewer asks
"how did you size 200?", this is the equation, plus measured peak eligibility QPS
with headroom. **[VERIFY your real peak QPS so the math lands.]**

### 30–45 s spoken answer

> "The same partner served two journeys with different latency contracts. The balance
> check sits on checkout — Flipkart's hottest, most latency-sensitive path — so it got
> an 800 ms fail-fast budget where timeout means we grey out the BNPL option and the
> user pays another way; degradation, not error, and fail-closed in the safe direction
> because no credit is offered when we can't verify headroom. Mandate setup is an
> explicit user flow, so it got 3.5 s. Both run in a dedicated Hystrix thread pool so
> a hanging partner can only ever consume that bulkhead, never the service's request
> workers, with per-operation circuit breakers so a sick eligibility endpoint doesn't
> trip mandate creation. Sizing was Little's-Law-driven: 200 threads covers peak
> eligibility QPS even at full timeout latency."

### Attack tree

**C1. "How did you arrive at 800 ms — why not 500 or 1200?"**
- *Model answer:* top-down budget + bottom-up partner reality. Checkout options page
  has an end-to-end SLA (say ~1.5–2 s **[VERIFY your real number]**); subtract
  gateway/mandate-service hops and rendering → the partner leg gets under a second.
  Bottom-up: partner balance API p99 measured at [X] ms healthy. 800 ms sits above
  healthy p99 (so timeouts are rare in steady state) and below the budget ceiling.
  The real trade: every ms of timeout is conversion protection for slow-but-successful
  calls vs page-latency risk; we tuned against measured timeout-rate + conversion
  impact after launch **[verify whether tuning happened — don't claim it if not]**.
- *Trap answer:* "it was the partner's SLA." Outsourcing your latency budget to a
  partner's marketing number is an anti-signal.

**C2. "Hystrix timeout fires — what happens to the thread that's still blocked on
the partner call? Can abandoned threads exhaust the pool anyway?"** ← the question
that separates people who ran Hystrix from people who read about it
- *Model answer:* The caller unblocks at 800 ms with a fallback, but the worker
  thread stays occupied until the underlying HTTP client's own socket/read timeout
  fires. So yes — if the client-level timeout were, say, 30 s, a hung partner turns
  the pool into a graveyard of abandoned threads and the effective capacity collapses;
  Hystrix then rejects instantly (breaker/queue rejection), which still protects the
  host service but kills the partner feature harder than necessary. Defense in depth:
  the OkHttp client's connect/read timeouts are set just above the Hystrix timeout so
  abandoned threads are reclaimed quickly. Timeout must be enforced at *both* layers.
- *Trap answer:* "the thread is interrupted and freed at 800 ms." Java can't kill a
  thread blocked in native socket I/O by interrupt alone in the general case; if you
  claim this, the follow-up ("how does interrupt reach a blocked socket read?") ends
  the story.

**C3. "Why Hystrix in [current year]? It's been in maintenance mode since 2018."**
- Full model answer in `05-cross-cutting-attacks.md` (attack X2). Short form: platform
  standard predating me, understood trade-offs, and I can map every concept to
  Resilience4j (TimeLimiter/Bulkhead/CircuitBreaker) and to adaptive approaches
  (gradient/limit-based concurrency control) — then demonstrate that mapping.

**C4. "Circuit breaker opens on the balance check during a flash sale. Walk me
through recovery."**
- *Model answer:* Open after error-rate threshold over the rolling window → all calls
  short-circuit to fallback (grey-out) for the sleep window (Hystrix default 5 s) →
  one trial request (half-open); success closes, failure re-opens. During open state
  the partner gets breathing room (load shedding is the point). Product impact:
  SuperPay hidden for seconds-to-minutes; acceptable by design. What I watch: breaker
  state metric, fallback rate, partner-side recovery, and — critically during a sale —
  that the *trial* traffic pattern doesn't flap the breaker (threshold tuning).
- *Trap answer:* not knowing half-open exists, or claiming the breaker "slowly ramps
  traffic" (that's more like adaptive/limiter behavior — Hystrix's half-open is a
  single-probe design).

---

## Bullet 4 — 3-stage eligibility pipeline with short-circuit

### The design

`SuperpayCheckEligibilityProcessor` orchestrates three executors, in this order:

1. **Registered-accounts + SBMD bank filter** (internal: user service, which filters
   the user's linked banks against the SBMD-capable bank list). Cheap, internal,
   eliminates users who *cannot* use the product (not on UPI → onboarding CTA; no
   SBMD-capable bank → add-bank CTA).
2. **Device validation** (Aerospike fingerprint check — runs on the pay/PWD flow where
   device details are present; skipped on the options-page flow). Cheap (~1 ms cache
   read), local, security-relevant: no eligibility disclosure to unvalidated devices.
3. **Partner eligibility/balance** (mandate service → PSP → partner, the expensive
   WAN call under the 800 ms budget) — with a **short-circuit inside**: if no active
   SUPERPAY_LATER mandate exists in our own store (a local HBase point-read), skip
   the partner call entirely and return UNREGISTERED.

Ordering principle to state out loud: **cheapest and most-local first, expensive and
external last, and each stage's failure produces a distinct product outcome** (a
different CTA), so early exit is both a latency and a UX win. The short-circuit is
the big lever: on a checkout surface, the overwhelming majority of users have no
active mandate — every one of those is a partner call avoided. That's what
"reducing partner load by [X]%" means — **and you must replace [X] with the real
number or the fraction of users without mandates (which approximates it).**

### 30–45 s spoken answer

> "Checkout eligibility ran as a three-stage executor pipeline ordered by cost and
> locality: first, filter the user's bank accounts to SBMD-capable banks — internal
> and cheap, and it catches users who can't use the product at all; second, device
> fingerprint validation against Aerospike on the pay flow — a millisecond cache read
> that gates eligibility disclosure to validated devices; last, the expensive partner
> balance call. Inside that last stage I added a short-circuit: we check our own
> mandate store first — a local HBase point read — and only call the partner if an
> active mandate exists. Since most checkout users have no mandate, that removed the
> bulk of partner traffic from Flipkart's highest-frequency path, which mattered
> because the partner's capacity was far below Flipkart checkout QPS."

### Attack tree

**D1. "Why sequential? Run all three in parallel and you save latency."**
- *Model answer:* parallelizing spends the partner's capacity on users stages 1–2
  will reject — the exact traffic the short-circuit exists to avoid; the partner call
  is also useless without knowing a mandate exists (stage-3 dependency). Stages 1–2
  are a few ms combined, so the parallelism saving is noise next to the 100+ ms
  partner call. Parallel fan-out is right when branches are independent and
  comparably expensive; here they're dependent and wildly asymmetric.
- *Trap answer:* "parallel is always faster." It's faster *and* it DDoSes your
  partner with junk traffic on every page load.

**D2. "Your mandate-existence check reads YOUR store, but the partner is the source
of truth. What if they disagree — you say no mandate, partner says active?"**
- *Model answer:* the short-circuit trades bounded staleness for load: divergence
  windows exist (callback lag, recon lag) and the failure mode is *under-offering*
  (user doesn't see SuperPay until our state catches up) — safe direction, no wrong
  money movement, self-heals via callbacks/recon. The reverse divergence (we say
  active, partner says no) is caught at the balance call, which the partner answers
  authoritatively. State the direction-of-error analysis; that's the L5 move.
- *Trap answer:* "they can't disagree, we get callbacks." Any cached view of a
  remote source of truth can be stale; denying it is disqualifying in a payments
  interview.

**D3. "Device validation is stage 2. An attacker replays a valid user's request from
another device — what actually checks?"**
- *Model answer:* device fingerprint captured at device-binding time (SIM+OTP flow)
  is stored in Aerospike keyed by user/device; the eligibility request's device
  details must match the bound fingerprint. It gates *this* flow; transaction
  authorization still requires UPI PIN at the bank — device check is defense in
  depth for disclosure and pre-transaction flows, not the money-moving control.
  Know the layered-auth story (gateway two-tier auth doc: `03-core-upi-platform.md`).
- *Trap answer:* overclaiming ("device check makes fraud impossible") — an
  interviewer will immediately construct a bypass and you'll defend a wall you
  claimed was the whole castle.

**D4. "The short-circuit means a brand-new mandate holder might get UNREGISTERED for
a while after setup. How long, and why is that OK?"**
- *Model answer:* window = callback propagation (Pulsar delay + processing) —
  seconds in the common case, bounded by recon in the worst case. Post-setup UX
  routes the user through a success screen that reflects local state written in the
  setup flow itself, so the practical exposure is small **[verify this UX detail
  before claiming it]**. Quantify, name the mitigation, name the backstop.

---

## Self-test (answers hidden below — do this cold, days later)

1. Explain SBMD to a non-payments engineer in three sentences, including what a lien is.
2. Why was the partner integration placed in the PSP adapter and not the checkout
   payment service? Give both reasons and the cost of the road not taken.
3. What are the TWO properties that actually make the Pulsar callback fix correct,
   and why is the delay itself not one of them?
4. A callback is redelivered three times. What prevents triple-applying the state
   change? Be specific about the key.
5. Stale PENDING callback arrives after ACTIVE was applied. What happens and why?
6. Derive the max sustainable QPS of a 200-thread bulkhead when partner latency
   degrades to the full 800 ms timeout. Show the law you used.
7. At Hystrix timeout, what happens to (a) the caller thread, (b) the worker thread,
   (c) the TCP connection to the partner? What config prevents pool graveyarding?
8. Why thread-pool isolation instead of semaphore isolation for this partner —
   and when would semaphore be the right call?
9. Give the fail-open/fail-closed analysis for the 800 ms balance-check timeout.
   Then flip it: name a call where timing out should fail OPEN.
10. Why is the 3-stage pipeline sequential, in one sentence an interviewer would
    quote in feedback?
11. Your local mandate store says "no active mandate" but the partner says active.
    What user impact, what money impact, what heals it?
12. What did you knowingly give up by reusing the mandate table with a row-key
    namespace, and what event would trigger revisiting it?

<details>
<summary><b>Answers</b></summary>

1. UPI lets Indians pay directly between bank accounts in real time. SBMD is a
   mandate type where the user authorizes one *block* — a lien, meaning funds are
   held in their account and unspendable but not yet taken — and the merchant may
   then execute multiple debits against that single block. It gives the merchant
   secured headroom for products like BNPL, unlike classic AutoPay where each debit
   is an unsecured fresh attempt.
2. (1) The checkout payment service is PCI-scoped (handles cards); attaching the
   BNPL integration would expand the CDE/audit boundary — more audited components,
   more evidence, more change-control drag. (2) Coupling: onboarding/credit logic
   would ride the most change-averse service. Cost of PSP placement: essentially
   none structurally — the PSP adapter already had the external-partner
   anti-corruption pattern; the trade was accepting BNPL logic living in a
   UPI-domain service.
3. Durability with at-least-once redelivery (nack → backoff retry until the mandate
   row is visible) and idempotent, state-machine-validated application. The delay
   only raises first-attempt success probability; correctness would hold with zero
   delay, just with more retries.
4. Dedup on mandate ID + callback/request ID, plus state-machine transition checks —
   an already-applied transition is a no-op.
5. The state machine rejects regression from ACTIVE to PENDING (illegal transition /
   older-timestamp update dropped). State never moves backward.
6. Little's Law: L = λW → λ = L/W = 200 / 0.8 s = **250 rps**. Above that, queue
   rejection kicks in — by design.
7. (a) Caller unblocks with fallback at 800 ms. (b) Worker thread remains blocked in
   the HTTP call until the client's own socket/read timeout — Hystrix abandons, it
   doesn't kill. (c) The TCP connection stays open until client timeout/close.
   Prevention: HTTP client connect/read timeouts set at/just above the Hystrix
   timeout so abandoned threads are reclaimed in ~the same order of time.
8. Thread pool: enforceable timeout on an external WAN call even if the client
   hangs, plus hard bulkhead. Semaphore: right when the call is fast/local/trusted
   to respect its own timeouts and the thread-handoff overhead matters (very high
   QPS in-memory or intra-DC calls) — Hystrix itself used semaphore isolation for
   its own metadata calls.
9. Timeout → option hidden → no credit extended on unverified headroom: fail-closed
   in the safe direction; cost is conversion, not money. Flip example: a
   *promotional-banner* service or recommendation call should fail open (show
   default content) — availability outweighs the risk because no money/security
   decision depends on it.
10. "Cheapest, most-local checks first; the expensive external call last and only
    when a local point-read proves it can matter — so the hot path protects the
    partner instead of DDoSing it."
11. User impact: SuperPay option not shown (under-offering) until callback/recon
    syncs. Money impact: none — no debit can occur without our flow. Healed by:
    partner callback processing, then recon force-query as backstop.
12. Gave up: independent CDC/analytics streams and schema freedom for the SBMD
    lifecycle (entangled with the legacy mandate pipeline); also future
    SBMD-specific state machine divergence forces a migration. Revisit trigger:
    SBMD volume or lifecycle divergence large enough that shared-pipeline filtering
    and coupled schema changes dominate the cost of a migration.

</details>
