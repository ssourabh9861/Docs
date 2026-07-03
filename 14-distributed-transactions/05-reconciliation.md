# Reconciliation

The unglamorous pattern that makes all the glamorous ones honest. Sagas leak,
outboxes lag, callbacks vanish, partners have bugs, operators fat-finger —
and recon is the subsystem that says: *divergence is inevitable; detection
and convergence are engineering.* In payments, recon isn't a safety net
bolted on later — it's a load-bearing floor, budgeted and staffed, and the
fact that you've built and operated it is one of your strongest
differentiators. This doc generalizes what you know so you can design recon
for any system an interviewer invents.

---

## 1. Plain definition

**Reconciliation** = systematically comparing the state of two (or more)
systems that are supposed to agree, detecting divergence, and driving
convergence toward a designated source of truth.

Analogy you should actually use (it's the origin of the word): balancing a
checkbook. Your register and the bank's statement *should* match; monthly,
you compare line by line; mismatches are investigated (their error, your
error, timing — a check not yet cashed); and the bank's cleared record wins
where authority is theirs. Note everything already present in the analogy:
periodic comparison, line-level matching, **timing differences as a benign
category**, authority designation, and an investigation path for residue.

Why it's necessary even in a well-designed system — the leak inventory:
- Every at-least-once + idempotency chain has TTL horizons and edge cases
  (`05-resilience/07-idempotency.md` §3).
- Callbacks get lost *after* all retries (partner-side bugs, retention
  windows).
- Timeout cells resolved wrongly by anyone's bug become divergence.
- Deploys ship bugs that mis-transition state for hours before detection.
- Humans run manual fixes that miss a table.
The design stance: **assume a nonzero divergence rate from unknown causes,
forever** — then make detection cheap, convergence safe, and the rate itself
a monitored health metric. A recon that finds nothing for a month is more
likely broken than the system is likely perfect.

---

## 2. How it works in practice

### 2.1 The three recon styles (you run all three)

1. **Continuous / state-based ("stuck-state sweeps"):** scan your OWN store
   for entities in non-terminal states older than a threshold, and drive
   each to resolution by querying the authority. Your platform's
   stuck-transaction sweep + DLQ force-query is exactly this. Properties:
   near-real-time (minutes), catches liveness failures (the silent-stuck
   saga — `03-sagas.md` P5), cheap (indexed scan of pending states —
   the partial-index/work-queue pattern from `02-databases/03-indexing.md`).
2. **Batch / file-based ("settlement recon"):** at defined times, exchange
   complete records (settlement files) and match line by line. The
   payments-industry standard: NPCI/banks produce daily settlement files;
   **2-way recon** (your records vs partner's) or **3-way** (you vs PSP vs
   bank/NPCI — three books, majority/authority rules). Properties:
   complete (catches what event-driven paths missed entirely — the
   unknown-unknowns), slow (T+1), and the *only* style that catches
   "transactions the other side has that you don't" — state sweeps can't
   find records you never created.
3. **Event-driven recon:** a divergence *signal* triggers targeted
   comparison — CDC feeding a comparator, a mismatched webhook field
   raising a flag, an invariant checker on the event stream. Middle
   ground: faster than batch, broader than state sweeps.

The completeness insight worth stating: sweeps find **your stuck records**;
files find **records that disagree or exist on only one side**; you need
both because they have disjoint blind spots.

### 2.2 The matching engine (batch recon's core)

- **Match key:** the shared identity (txn ID / RRN / UTR in UPI-land —
  the identity chain again). Match-rate is the headline metric.
- **Buckets after matching:** matched-and-equal (✓); matched-but-
  different (amount/status mismatch — the scary bucket); **ours-only**
  (we think it happened, they don't — potential money loss or their
  missing record); **theirs-only** (they think it happened, we don't —
  potential unrecorded liability, or our lost record). Each bucket gets
  its own playbook and severity.
- **Timing windows:** a transaction near the file's cutoff legitimately
  appears on one side only — *aging rules* (unmatched < X hours = wait,
  not alarm) separate timing noise from true divergence. Getting aging
  wrong either pages you hourly (too tight) or hides theft-shaped
  problems (too loose).
- **Tolerance rules:** exact-match on money amounts (never tolerance-band
  money **[unless currency conversion introduces defined rounding —
  then the tolerance is a documented business rule]**), status mapped
  through the normalization layer (your config-driven response-code
  resolver earns its keep here).

### 2.3 Convergence actions (ordered by safety)

1. **Query-and-converge:** ask the authority, update your record
   (force-query — always safe, idempotent by construction).
2. **Replay/re-drive:** re-process a lost event through the front door
   (`04-messaging-streaming/06-dlq-...md` — guards required).
3. **Compensate/adjust:** create correcting entries (refund, ledger
   adjustment) — a *business* action with maker-checker controls.
4. **Escalate:** park with full context into a human queue with SLOs —
   the residue is small if 1–3 are good, but it's never zero, and
   pretending otherwise just means unstaffed queues.
Rule: convergence must be **idempotent and audit-logged** — recon that
writes must be as disciplined as the systems it repairs (a buggy recon is
a divergence *generator* with root access).

### 2.4 Authority design ("who wins")

Per FIELD, not per system — the polyglot spine again
(`02-databases/02-sql-vs-nosql-taxonomy.md` §3): NPCI/bank wins on
debit-happened; the partner ledger wins on credit-limit/balance
(super.money in your BNPL); YOUR store wins on user-intent and product
state. Mismatch resolution follows the authority map mechanically;
arguments during incidents mean the map was never written down.

---

## 3. Senior-level depth

- **Recon is what licenses eventual consistency.** The whole
  availability-and-latency-first architecture (async paths, AP caches,
  bounded-staleness reads) is *permissible* because divergence is
  detectable and convergent at known cost within known time. No recon ⇒
  eventual consistency is just hope with a dashboard. This is the
  reconciliation-economy argument from `01-distributed-systems/08-cap-pacelc.md`,
  and it's the single most senior sentence in this directory.
- **Recon coverage as a review gate:** for every cross-boundary arrow in
  a design — "who detects divergence here, within what time, and what
  converges it?" Three answers exist: a recon covers it; the risk is
  accepted and documented; or the design is incomplete. Make the
  question a habit and you sound like a staff engineer in reviews.
- **Recon metrics are system-health leading indicators:** mismatch rate
  by bucket trending up = something upstream broke *before* customers
  notice (a deploy that drops callbacks shows in ours-only counts within
  hours). Wire recon dashboards into release health, not just finance
  ops.
- **Scale engineering:** recon reads must not hurt production — run
  against replicas/CDC-fed stores/warehouse (your FDP data is the
  natural recon substrate), incremental watermark-based comparison
  instead of full scans, partitioned matching (by date/key range), and
  the force-query class rate-limited against partners
  (`00-resume-arsenal/03-core-upi-platform.md` B3: recon traffic is the
  first shed under partner degradation).
- **The human half:** unmatched-residue queues with SLOs, maker-checker
  on money adjustments, audit trails on every convergence write, and
  periodic *recon-of-the-recon* (sampling matched pairs to test the
  matcher — matchers have bugs too).
- **L4/L5/L6:** L4: "we have recon jobs that catch mismatches." L5: the
  three styles with their disjoint blind spots, bucket playbooks with
  aging rules, authority-per-field maps, idempotent audited convergence,
  recon-as-license argument. L6: recon as an organizational capability —
  coverage policy across all products, recon platform/tooling
  investment, divergence-rate SLOs owned by product teams, and the
  finance/engineering joint operating model.

---

## 4. Resume connection

You own all three styles — say so with specifics:

- **Continuous:** the DLQ force-query path and stuck-transaction sweeps —
  non-terminal-age detection, query-the-authority convergence, "retry
  the question, never the action."
- **Batch:** TPAP-side recon against NPCI settlement cycles; your SBMD
  design decision (piggyback the SuperPay mandate state onto the
  existing TPAP recon pass rather than a new topology) is a *recon
  coverage design decision* — you extended the floor to a new product
  and consciously accepted the coupling **[VERIFY details from your
  SBMD context: recon Option 3]**.
- **Event-driven-ish:** callback processing with recon backstop; the
  SFTP cashback backfill was a one-shot recon (compare external record
  set, converge through the front door — the re-drive discipline).
- **Authority map, lived:** NPCI for debit truth (force-query target),
  super.money ledger for credit state (SM as source of truth — stated
  in your PayIn3 doc), your store for product/user state.
- **The one-line summary for interviews:** "I didn't add recon to my
  systems; my systems were designed *around* recon — it's the floor
  that let us choose async and eventual everywhere else."

**30–60 s spoken answer** ("how do you make sure your system and your
partners agree?"):

> "Three recon styles with disjoint blind spots, so we run all of them.
> Continuous: sweeps over our own store for anything non-terminal past
> an age threshold — a stuck saga emits nothing, so only age can detect
> silence — converged by force-querying the authority, never by
> re-executing, because after a timeout you retry the question, not the
> action. Batch: settlement-file recon against the network on its
> cycle — the only style that catches records existing on one side
> only, which sweeps structurally can't see; matches bucket into equal,
> different, ours-only, theirs-only, each with its own playbook and
> aging rules so cutoff timing noise doesn't page anyone. And
> event-driven checks riding our CDC stream as the early-warning layer.
> Two design rules make it trustworthy: authority is designated per
> field, not per system — the network wins on whether a debit happened,
> the partner ledger wins on credit state, we win on product state —
> and every convergence action is idempotent and audit-logged, because
> a buggy recon is a divergence generator with root access. And the
> deeper point: recon is what licenses everything else — our async
> paths and eventual consistency are safe precisely because divergence
> is detectable and convergent within a known window. Mismatch-rate
> trends are also our best deploy-health signal — a dropped-callback
> bug shows up in ours-only counts hours before a customer notices."

---

## 5. What the interviewer will push on

**P1. "Design recon for your BNPL partner integration from scratch."**
- *Model:* start with the authority map (SM ledger: balances, credit,
  collections; you: mandate product state, user intent; NPCI/PSP:
  debit truth). Then coverage per style: continuous — sweep mandates/
  installments in non-terminal states > age, converge via SM status
  API (idempotent); batch — daily record exchange (all mandates,
  executions, accounting events BLOCK/RELEASE/REFUND) matched on
  mandate-ID/txn-ID into the four buckets with aging for callback lag;
  event-driven — invariant checkers (every BLOCK eventually RELEASEd
  or executed; refunds ≤ collections). Convergence ladder + human
  queue with maker-checker for ledger adjustments. Metrics: match
  rate, bucket counts by age, convergence latency; mismatch-rate
  trend wired to deploy health. Close with what you'd negotiate INTO
  the partner contract: file formats, cutoffs, status-query APIs,
  dispute SLAs — recon requirements are integration requirements.
- *Trap:* designing only the happy-path sweep; the ours-only/theirs-
  only buckets (and the contract-negotiation point) are where senior
  shows.

**P2. "Recon finds: you say SUCCESS, partner says FAILED, user was
debited. Walk the resolution."**
- *Model:* triage by authority: debit-happened is NPCI/bank truth →
  force-query the network first (maybe the partner's record is stale —
  their bug). If network confirms debit but the *service* wasn't
  delivered (partner-side failure after debit): this is the
  money-collected-service-failed bucket → compensation flow (refund
  back-to-source) with maker-checker, user comms, and an incident
  ticket against the callback path that let it happen (recon found a
  bug, not just a mismatch — trace why the FAILED callback didn't
  transition us). If network says no-debit: our SUCCESS is the lie —
  who transitioned us and from what evidence? (Replayed/forged
  callback? State-machine bug?) → correct with audit, and the
  postmortem is about the transition guard. Both branches end with:
  fix the class, not the instance.
- *Trap:* jumping to "refund the user" before establishing debit truth
  and which record is wrong — resolution order IS the competence
  signal.

**P3. "Your recon would hammer production stores and partner APIs at
your scale. Make it cheap."**
- *Model:* reads — never the primary path: recon runs on CDC-fed
  replicas/warehouse (your FDP data), or incremental comparison with
  watermarks (only entities changed/created since last pass), or
  digest-first (compare per-partition counts/sums/hashes; drill into
  line-level only where digests differ — Merkle-style narrowing).
  Partner calls — the force-query class is rate-limited, batched
  where the partner offers bulk status APIs, prioritized by age and
  amount, and first-shed under partner degradation. Sweeps ride
  pending-state indexes (tiny by design — the partial-index pattern).
  Numbers instinct: recon compares millions of rows; digests make it
  effectively O(changed + divergent), not O(all).
- *Trap:* "run it at night" — scale, not schedule, is the question;
  the digest/incremental/replica toolkit is the answer.

**P4. "Recon has found zero mismatches for six weeks. Good news?"**
- *Model:* suspicious news. Possibilities ranked: recon broken (silent
  job failure, empty file matched against empty extract, matcher bug
  auto-matching everything) — verify with **canary mismatches**
  (inject a known divergence, assert detection: test the smoke
  detector); coverage gap (recon watches fields that don't diverge
  while the diverging ones are unwatched); or genuinely healthy — the
  least likely at scale, and only claimable after the first two are
  excluded. Then the practice: recon liveness metrics (rows compared
  per run, buckets per run — a zero-rows run alarms), periodic
  matched-pair sampling audits. "A recon that never fires is more
  likely broken than the world is likely perfect" — say it.
- *Trap:* "yes, great news." This is a smoke-detector-with-dead-
  battery question and interviewers deploy it verbatim.

**P5. "Why does recon exist at all if your idempotency and outbox
patterns are correct?"**
- *Model:* three-part answer. (1) Horizon leaks: every dedup memory has
  TTLs, every retention window ends, every retry ladder exhausts —
  correctness machinery is bounded; divergence beyond the bounds needs
  a floor. (2) Unknown-unknowns: partner bugs, operator actions,
  deploy regressions — no pattern prevents what you didn't anticipate;
  recon detects by *comparing outcomes*, which requires no model of
  the failure. (3) The economic argument: recon's existence *licenses*
  cheaper choices everywhere else (AP caches, async paths, best-effort
  publishes where warranted) — remove recon and every component must
  individually approach perfection, which is slower and still fails
  point 2. Close: "patterns lower the divergence rate; recon bounds
  the divergence *duration*. You need both, and only one of them
  handles surprises."
- *Trap:* defending recon as "just in case" — the licensing argument
  and the unknown-unknowns argument are the substance; belt-and-
  suspenders is the L4 version.

---

## Self-test

1. Define reconciliation with its three components, and give the leak
   inventory that makes it necessary in a *correct* system.
2. The three recon styles: mechanism, latency, and the blind spot of
   each — and why sweeps can't find theirs-only records.
3. The four match buckets and one playbook line for each.
4. What are aging rules and what goes wrong at each extreme?
5. The convergence-action ladder, ordered by safety, with the
   discipline rule for recon writes.
6. Authority-per-field: your platform's map (three entries).
7. State the "recon licenses eventual consistency" argument in two
   sentences.
8. The recon-coverage review question and its three acceptable
   answers.
9. Make recon cheap: four techniques.
10. Zero mismatches for six weeks — the ranked diagnosis and the
    canary practice.
11. Your SUCCESS vs their FAILED with a real debit: the resolution
    order and why it matters.
12. Why do correct idempotency + outbox patterns still need recon?
    Three arguments.

<details>
<summary><b>Answers</b></summary>

1. Systematic comparison of systems that should agree + divergence
   detection + convergence toward designated authority. Leaks:
   dedup/retention horizons expire; callbacks lost beyond retries;
   timeout ambiguity mishandled by anyone's bug; deploy regressions
   mis-transitioning state; manual operations missing a table —
   nonzero divergence from unknown causes, forever.
2. Continuous state sweeps (scan own store for non-terminal > age;
   minutes-fresh; blind to records you never created). Batch file
   recon (full record exchange at cutoffs, line matching; T+1;
   blind to nothing but slow). Event-driven checks (signals trigger
   targeted comparison; fast; only as broad as its triggers).
   Sweeps read YOUR records — a transaction existing only on the
   partner's side leaves nothing in your store to scan.
3. Matched-equal: count it, feed match-rate. Matched-different:
   authority lookup → converge; trend by field (deploy-health
   signal). Ours-only: within aging window wait; beyond → force-
   query network/partner (our record may be stale or theirs lost).
   Theirs-only: highest alarm — potential unrecorded liability or
   our lost record → query authority, reconstruct through the front
   door, incident the ingestion path.
4. Rules that treat recently-created unmatched records as timing
   noise (cutoff straddling, callback lag) rather than divergence.
   Too tight: constant false pages, recon ignored (alarm fatigue).
   Too loose: real divergence — including fraud-shaped patterns —
   hides inside the "probably timing" window for days.
5. (1) Query-and-converge (idempotent, always safe); (2) replay/
   re-drive through the front door with guards; (3) compensate/
   adjust — business action, maker-checker controlled;
   (4) escalate to human queue with SLOs. Rule: every convergence
   write idempotent + audit-logged — a buggy recon is a divergence
   generator with root access.
6. Debit-happened / transaction network truth: NPCI (via
   PSP force-query). Credit state, balances, limits, collections:
   super.money ledger. Product/user state (mandate product status,
   user intent, UX state): our HBase store.
7. Async paths, AP caches, and bounded-staleness reads are safe only
   because divergence is detectable and convergent within a known
   window at known cost. Without recon, eventual consistency is an
   unmonitored promise — hope with a dashboard.
8. "For this cross-boundary arrow: who detects divergence, within
   what time, and what converges it?" Acceptable: a named recon
   covers it; the risk is consciously accepted and documented; or
   the design goes back — silence is not an option.
9. Run comparisons on CDC-fed replicas/warehouse, not primaries;
   incremental watermark-based scope (changed-since-last-pass);
   digest-first narrowing (per-partition counts/sums/hashes, drill
   only into differing partitions); rate-limit/batch/priority-order
   partner-facing queries and shed them first under partner stress.
10. Ranked: recon silently broken (job failure, empty inputs,
    matcher auto-matching) → coverage gap (watching non-diverging
    fields) → genuinely healthy (claimable only after excluding the
    first two). Practice: canary mismatches (inject known
    divergence, assert detection), liveness metrics (rows/buckets
    per run — zero rows alarms), matched-pair sampling audits.
11. Establish debit truth first (network authority) — it determines
    which record lies and whether money moved. Network-confirmed
    debit + failed service → compensation flow with controls + fix
    the callback path. No debit → our SUCCESS transition is the bug
    → correct with audit + fix the transition guard. Refunding
    before establishing truth risks paying out on a stale partner
    record — order is competence.
12. (1) All correctness machinery is horizon-bounded (TTLs,
    retention, retry exhaustion) — divergence past the bounds needs
    a floor. (2) Unknown-unknowns: recon compares outcomes and needs
    no model of the failure — the only defense against bugs you
    didn't anticipate. (3) Economics: recon's floor licenses cheaper
    choices platform-wide; patterns lower divergence *rate*, recon
    bounds divergence *duration* — and only recon handles surprises.

</details>
