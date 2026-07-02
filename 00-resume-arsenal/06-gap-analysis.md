# Gap Analysis — Read This First, Fix These First

No softening in this file. Everything below is either broken on your resume today
or will collapse under a competent interviewer. Ordered by damage.

---

## 1. Your resume is full of literal placeholders. This is disqualifying as-is.

The copy I read contains, verbatim: `[your.email@gmail.com]`,
`[linkedin.com/in/your-handle]`, `[X]+ years`, `[MM/YYYY] – Present`,
`~[X]M transactions/day`, `[X]M+ users / [₹X Cr] GMV`, `reducing partner load by
[X]%`, `from [X] ms to [X] ms at [X] QPS`, `reducing stuck transactions by [X]%`.

A recruiter screens this out before an interviewer ever sees it, and if it slips
through, an interviewer who sees bracketed metrics assumes every number you *do*
say is invented. **Action, this week, in priority order:**

| Placeholder | What to do |
|---|---|
| Email / LinkedIn / employment dates / years | Fill. Zero excuse. |
| Transactions/day, peak TPS | Pull from your dashboards. If exact values are sensitive, use order-of-magnitude ("~Xm/day, peak ~X k TPS") — but they must be real. |
| Rewards read latency before → after @ QPS | Pull from the launch-era dashboards or perf-test reports. If genuinely unrecoverable, rewrite the bullet qualitatively ("converted O(history) scans into O(1) point reads") — a fabricated latency pair is worse than none. |
| Partner-load reduction % | Reconstructable: ≈ fraction of eligibility calls short-circuited (users without active mandates). One log/metric query. |
| Stuck-transaction reduction % | Define "stuck" (non-terminal > T min), pull before/after rates. This number also powers interview story B4 in `03-core-upi-platform.md`. |
| Users / GMV for SuperPay Later | Get real launch figures or delete the claim from the bullet. |

Rule going forward: **every number you print, you must be able to say how it was
measured.** That sentence is itself an interview answer.

## 2. Ownership claims you have not verified

Your own context documents end with *unchecked* "personal contributions to
validate" checklists — for all three major projects. Meanwhile the resume says
"Led end-to-end design", "Architected", "Designed". `05-cross-cutting-attacks.md`
X8 explains how triangulation exposes this. Before any interview, for each project
write a one-line truthful RACI: **authored / built / extended / adopted**. Where
the honest verb is weaker than the resume verb, change the resume — an owned
"built and extended" story at full depth outscores a hollow "led" every time.

## 3. Resume wording that invites losing battles

- **"processing them with a controlled delay"** — you are advertising a delay as a
  race-condition fix; every strong interviewer will attack it (see attack B1 in
  `01-superpay-later-sbmd.md`). Reword to what the mechanism actually is:
  *"buffering callbacks through Pulsar with retry-until-consistent redelivery,
  eliminating the race"*. Same system, no bullseye painted on it.
- **"Hystrix" by name** in the skills line — invites X2 ("dead since 2018") as a
  *screening* filter, before you're in the room to give the good answer. Consider
  "circuit breakers, bulkhead isolation (Hystrix/Resilience4j)" — signals concept
  ownership, not tool loyalty.
- **"eliminating mandate-state corruption"** — absolute claims ("eliminated",
  "prevented") get probed as absolutes ("so it can NEVER happen?"). Keep them only
  where you can defend the invariant by construction; you can here (retry +
  idempotency + recon), so know the proof, or soften the verb.
- **No PayIn3 bullet.** You shipped a *second* BNPL product with distinct hard
  problems (regulatory mandate caps → multi-mandate fan-out, back-to-source refund
  splitting across rails, unified two-product eligibility API). One bullet turns
  "did a BNPL project" into "owns the credit-on-UPI domain". Draft in
  `04-superpay-in-3.md`.

## 4. The L5 signal that is entirely missing: leadership surface

Every bullet is a technical achievement. L5 at Google is scored heavily on scope
and influence: mentoring, design review, cross-team leverage, driving standards.
Your record contains raw material — the callback pattern "became the standard for
mandate flows", the PSP-adapter seam "was reused for the second product", the
cross-org coordination with super.money/Juspay/NPCI compliance — but none of it is
*claimed*. Add one bullet of the form: "Drove design reviews and cross-team
integration across N services and 3 external partners; patterns from X adopted as
team standard for Y." Then be ready to defend it with named examples. Also gather
the human evidence: whom did you mentor/onboard, which designs did you review?
If the honest answer is "nobody and none," that is your single biggest L5 risk —
start accumulating that evidence at work *now*; it matters more than any document
in this repo.

## 5. The missing incident story

You own payment infrastructure and have no prepared production-incident narrative
(X9). Write one this week while details are fresh: detection → wrong first theory →
diagnosis → fix → blast radius in numbers → systemic prevention. The
callback-corruption saga and the stuck-transaction work both plausibly contain one.

## 6. Facts to verify before you quote them (collected from all arsenal files)

- Exact PSP/NPCI idempotency contract for send-money (which field dedups: txnId?
  RRN?) — powers the double-debit answer, the single most dangerous question you'll
  face.
- Current NPCI AutoPay per-mandate/per-execution cap (₹15,000 at your build time)
  and the SBMD-capable spec version ("UPI 2.17+" per your docs).
- Dedup-cache failure behavior at the gateway: fail-open or fail-closed, actually.
- What Juspay signs in webhook HMAC (timestamp? nonce?) — powers the replay answer.
- Whether Storm scaling on queue depth was automated or manual.
- Rewards checkpoint window (10 days) rationale + your per-user reward-rate
  distribution.
- Your five scale numbers (X7 list).
- Cross-rail cashback failover behavior (D1 in `02-upi-rewards.md`).

## 7. Predicted five weakest areas today (ranked; final ranked version ships with
the completed repo)

1. **Coding under interview conditions.** Nothing in your materials evidences
   timed, communicated problem-solving — and it's 2 of ~5 rounds. Highest variance,
   only fixable with volume. Start daily today (see PROGRESS.md).
2. **Distributed-systems theory beyond your stack.** Your experience is deep but
   vertical (Pulsar/Storm/HBase). Consensus, quorums, clocks, linearizability
   formalcy — the vocabulary Google design interviewers calibrate with — needs
   deliberate study (`01-distributed-systems/`).
3. **Design breadth outside payments.** Chat, feeds, geo-proximity, object storage —
   different bottleneck shapes than payment flows (fan-out, read-heavy, spatial
   indexing). Payments depth won't transfer automatically (`07-system-design/`).
4. **Java/JVM depth to back the resume's stack claim.** "Java 17" on a resume
   licenses GC, JMM, and concurrency probes; your materials show no evidence
   either way (`06-concurrency-java/`).
5. **Behavioral/leadership inventory.** See §4 — thinnest evidence base of all,
   and the one gap no amount of studying this repo fixes without action at work.

## 8. This week's checklist

- [ ] Fill every resume placeholder or delete the claim (§1 table).
- [ ] Write the truthful RACI per project (§2).
- [ ] Reword the three risky phrases; draft the PayIn3 + leadership bullets (§3, §4).
- [ ] Write the incident narrative (§5).
- [ ] Verify the §6 fact list from dashboards/code/partner docs.
- [ ] Begin daily timed coding practice (2 problems, out loud).
