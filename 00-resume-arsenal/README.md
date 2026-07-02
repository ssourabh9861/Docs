# 00 — Resume Arsenal

Every bullet on your resume, weaponized: the full story behind it, the 30–60 second
spoken answer, and the follow-up attacks a Google L5 interviewer will fire — each with
a model answer AND the trap answer that fails candidates.

## Files

| File | Covers |
|------|--------|
| `01-superpay-later-sbmd.md` | SuperPay Later (SBMD BNPL): end-to-end design, PCI isolation, callback race fix, dual-timeout resilience, 3-stage eligibility pipeline |
| `02-upi-rewards.md` | Rewards: checkpoint aggregation, idempotency under at-least-once, CAS concurrency, pluggable earn/burn |
| `03-core-upi-platform.md` | Core platform: async execution path, single Storm topology + DLQ force-query, CDC pipeline, gateway hardening |
| `04-superpay-in-3.md` | PayIn3 (installment BNPL) — not on your current resume bullets but in your project record; adds a second BNPL story and unique attack surfaces |
| `05-cross-cutting-attacks.md` | Attacks that cut across projects: "why Pulsar not Kafka", "why is Hystrix on your 2026 resume", "why Storm not Flink", "why HBase", stack-choice defenses |
| `06-gap-analysis.md` | **Read first.** Blunt list of what will collapse under probing today, the `[X]` placeholder audit, and ownership-claim verification you must do before any interview |

## How a STAR story is scored at L5 (calibration before you read the stories)

Generic advice says: Situation → Task → Action → Result. That structure is necessary
but nowhere near sufficient at L5. A Google interviewer scoring for L5 is listening
for five extra signals layered on top of STAR:

1. **Scope & ambiguity.** Did the problem arrive well-defined, or did you define it?
   L4 executes a defined task well. L5 turns an ambiguous business/technical situation
   into a defined plan and drives it across teams.
2. **Trade-off ownership.** Not "we used Pulsar" but "we chose X over Y and Z; here is
   what we knowingly gave up, and here is the trigger that would make us revisit."
   Every story in this arsenal names the rejected alternative — memorize those, they
   are the L5 signal.
3. **Blast-radius thinking.** What could this have broken? How did you know it worked?
   What did the rollback plan look like? Metrics, alerts, and the failure you planned
   for that didn't happen.
4. **Cross-boundary influence.** Partner teams, external partners (super.money, Juspay,
   NPCI), compliance. L5 stories almost always cross a team boundary.
5. **Result with a number, then a durable change.** "Latency dropped from A to B" is
   the result; "and the pattern became the standard for the next two integrations" is
   the L5 coda.

**The interviewer's method — expect it:** Google interviewers are trained to drill
past prepared narratives with "why", "what else did you consider", "what would you do
differently", and "what exactly was YOUR part vs the team's". The attack trees in each
file are built around exactly those four drills. If you cannot answer the third "why"
in a chain, the story is scored as *exposure*, not *ownership* — that is an L4 signal
and, on a bad day, a hire/no-hire swing.

## Non-negotiable honesty rule

Several bullets say "Led", "Designed", "Architected". Your own context documents have
unchecked "personal contributions to validate" checklists. Before you use any story in
a live interview, do the ownership audit in `06-gap-analysis.md`. Claiming design
ownership of a component you only extended is the single fastest way to fail —
interviewers triangulate ("who reviewed this?", "what did the first design look like
before review?") and the collapse is unrecoverable. Everything in these files is
written from your context docs; where the docs are ambiguous about YOUR role, the
story is marked **[OWNERSHIP: verify]**.
