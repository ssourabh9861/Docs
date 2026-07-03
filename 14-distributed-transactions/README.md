# 14 — Distributed Transactions & Sagas

**Status: ✅ Complete.** Six documents on the five-part contract, each ending
in a hidden-answer self-test. This is your most predictable deep-dive as a
payments SDE-3 — and the directory where your platform stops being examples
and becomes the curriculum.

## Reading order

| # | Document | One-line takeaway |
|---|----------|-------------------|
| 1 | [The problem](01-the-problem.md) | The failure matrix (timeout is the worst cell), why locks/retries/one-DB don't solve it, the four solution families, and banking's pre-computer answers |
| 2 | [2PC and friends](02-2pc-and-friends.md) | The blocking case walked precisely, the cost ledger, 3PC's partition failure — and "Spanner didn't fix the protocol; it fixed the coordinator's mortality" |
| 3 | [Sagas](03-sagas.md) | Choreography vs orchestration, the step taxonomy and ordering rule (compensatable → pivot → retryable), the isolation countermeasure kit — your mandate flows in saga vocabulary |
| 4 | [Outbox and CDC](04-outbox-and-cdc.md) | The dual-write cure, the inbox twin, the HBase single-row adaptation, event sourcing's honest boundary — "delayed truth is repairable; announced fiction is not" |
| 5 | [Reconciliation](05-reconciliation.md) | Three styles with disjoint blind spots, the four match buckets, authority-per-field, canary mismatches — recon as the floor that licenses eventual consistency |
| 6 | [Payment consistency patterns](06-payment-consistency-patterns.md) | The capstone: ten named patterns assembled into "eventually right, never silently wrong," plus the five standard interview drills |

## The five sentences to walk into any interview with

1. "The timeout cell is the worst one: you don't know which world you're in,
   so every cross-boundary money API must offer identity-keyed retry or a
   status query — or it's un-integrable."
2. "NPCI doesn't join anyone's transaction — trust boundaries make the
   pattern choice for you: sagas, identity, and recon."
3. "Compensatable steps before the pivot, retryable after — a
   non-compensatable step before an uncertain one is the ten-second review
   catch."
4. "Outbox makes send atomic with my write; inbox makes receive atomic with
   yours — effectively-once with no distributed transaction anywhere."
5. "Patterns lower the divergence rate; recon bounds the divergence
   duration — and only recon handles the failures you didn't anticipate."

## Self-test discipline

Cold self-tests ≥3 days after reading; misses go to the spaced-repetition
deck (`15-mock-interviews/` when written).
