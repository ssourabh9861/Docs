# Dead-Letter Queues and Poison Messages

Every bounded retry needs a terminal state; the DLQ is that state — and the
difference between a mature platform and a naive one is what happens *after* a
message lands there. Your force-query recovery path is one of the best DLQ
stories a candidate can own; this doc generalizes it into the full pattern
language so you can design DLQ policy for any system an interviewer invents.

(Retry ladders and the deterministic-vs-transient split are introduced in
`05-resilience/04-retries.md` P5; this doc owns the DLQ side in depth.)

---

## 1. Plain definition

A **poison message** is one that fails processing *every time* — not because
the system is unlucky but because something about this message and this
consumer is deterministically incompatible: malformed payload, schema the code
can't parse, data violating an invariant, a reference to state that doesn't
exist. Retrying a poison message is running the same experiment expecting a
different result.

A **dead-letter queue (DLQ)** is where messages go when the system gives up
retrying — a durable parking area, separate from the main flow, so that:
(a) the main queue keeps draining (the poison message stops consuming attempts
and blocking capacity), and (b) the message is **preserved for resolution**
rather than dropped.

Analogy: a mail-sorting facility. A letter with an unreadable address
shouldn't loop through the sorting machine forever (jamming it), nor be
shredded (it might be a check). It goes to the manual-resolution desk — with
a sticker saying how many times sorting was attempted and why it failed.
The desk is the DLQ; the sticker is the metadata; and whether the desk has
staff and procedures is what separates real operations from a warehouse of
lost mail.

Why DLQs are structurally necessary (not optional hygiene): bounded retries
have exactly three possible terminal outcomes — success, **silent drop**, or
**park durably**. For anything that matters, silent drop is data loss with
extra steps; infinite retry is a self-inflicted outage (one message pinning a
consumer forever). The DLQ is the only remaining option. "Every bounded
retry needs a terminal state" — say it as an axiom.

---

## 2. How it works in practice

### 2.1 The classification gate (the highest-leverage design decision)

Not all failures deserve the same ladder. Classify at the exception/result
level:

- **Transient** (timeout, connection refused, 503, lock conflict, CAS
  failure): retry with backoff — the failure is about *now*, not about the
  message.
- **Deterministic** (parse error, schema mismatch, validation failure,
  impossible state transition): **sideline immediately** — zero retries;
  every retry is wasted capacity plus duplicated partial side effects.
  Your platform encodes exactly this split
  (`SidelineOnFailureException` vs retryable `ProcessHandlerException`) —
  it's a design pattern worth presenting by name: *the classification
  gate*.
- **Ambiguous** (500 from downstream, unknown error): a small retry budget,
  then DLQ — buy information cheaply, then stop.

### 2.2 Mechanics per ecosystem

- **Pulsar:** subscription-level `deadLetterPolicy` — after
  `maxRedeliverCount`, the broker republishes to a DLQ topic
  automatically; pairs with negative-ack backoff and retry-letter topics.
  Broker-native because per-message state exists
  (`02-pulsar-vs-kafka.md`).
- **Kafka:** DIY — the consumer catches the terminal failure and produces
  to a `*.dlq` topic itself (framework sugar exists: Spring/Connect DLT
  support). Subtlety: the *consumer* must not crash-loop instead
  (poison message + crash = offset never commits = the partition wedges —
  the poison-pill-partition incident every Kafka shop has had once).
- **Metadata is the product:** a DLQ message must carry original topic/
  partition/offset (or message ID), first/last failure timestamps, attempt
  count, exception class + message, consumer version, and trace ID.
  A DLQ entry without diagnosis metadata is a corpse without a chart.

### 2.3 What happens AFTER — the four resolution patterns

This is where interviews are won. A DLQ with no consumption plan is a
write-only graveyard with an SLA of never.

1. **Repair and replay:** fix the code/data, then re-drive DLQ messages
   through the main flow. Requires: idempotent + stale-tolerant consumers
   (a re-driven message is maximally late — `05-ordering.md` P3), replay
   throttling, and dedup against anything that already succeeded.
2. **Compensate/resolve out-of-band:** don't re-run the action — run a
   *different* action that converges state. **Your force-query is the
   canonical instance:** for unknown-outcome money effects, the DLQ
   handler interrogates the authority (NPCI via PSP) and converges the
   record instead of re-executing. "Retry the question, not the action."
3. **Discard with judgment:** some classes are safely droppable after
   inspection (stale analytics events past usefulness) — an explicit,
   logged, per-class decision by the business owner, not a default.
4. **Escalate to humans:** unresolvable classes page or ticket with the
   full metadata chart — bounded by an SLO ("nothing sits in DLQ
   unreviewed > X hours").

Mature shops wire pattern selection to the classification: deterministic
parse failures → repair-and-replay after deploy; unknown-outcome effects →
compensate/interrogate; stale low-value → discard-with-log.

### 2.4 Operations: the DLQ is a first-class SLI surface

- **Alert on arrival rate and age**, not just depth: depth 10k of one
  poison class ≠ depth 3 of "payment stuck" — and the *oldest unresolved*
  age is the real SLO. Segment alerts by failure class.
- **DLQ growth is a leading indicator:** a deploy that breaks parsing
  shows up in the DLQ before it shows up in user metrics — treat DLQ rate
  as a canary signal wired to rollback.
- **The DLQ consumer is code too:** it fails, it needs its own error
  handling (DLQ-of-the-DLQ is usually one level of "park + page" — don't
  build turtles all the way down; two levels then humans).
- **Retention:** DLQ topics need *long* retention (resolution takes days;
  a 5-day default silently shreds unresolved evidence) — and possibly
  archival to durable storage for compliance-relevant flows
  **[VERIFY your DLQ retention vs main-topic retention]**.

---

## 3. Senior-level depth

- **The DLQ is an ordering hole and a consistency window — by design:**
  sidelining message N while N+1..N+k process means the DLQ'd entity is
  *behind* until resolution; anything joining on it sees a gap. Design
  consequences: stale-tolerant consumers everywhere (posture B,
  `05-ordering.md`), entity-level "in DLQ" visibility for support tooling
  (your stuck-transaction dashboards are this), and resolution SLOs sized
  to the product's tolerance for the gap (money: minutes-hours; analytics:
  days).
- **Partial side effects are the hard part of replay:** a message that
  failed at step 3 of 4 executed steps 1–2; re-driving it re-executes
  them. This is why the replay path must run the SAME idempotency
  machinery as the live path (same handlers, same guards) — a special
  "replay script" that bypasses the normal flow is where double-effects
  come from. Rule: **re-drive through the front door, never the side
  door.**
- **Head-of-line vs sideline — the queue-theory view:** in strictly-ordered
  consumption (Kafka partition), a poison message *blocks its partition*
  until handled — sidelining is mandatory for liveness. In shared/
  work-queue consumption it "only" burns attempts — sidelining is
  mandatory for capacity. Either way the DLQ is what lets bounded retry
  coexist with liveness; frame it as the release valve of the retry
  system.
- **DLQ abuse patterns (name them to show scar tissue):** (a) *DLQ as
  backpressure* — overflow routed to DLQ under load, mixing "poison" with
  "unlucky" and making resolution triage impossible; keep overload
  handling (shedding/backpressure) separate from failure handling.
  (b) *DLQ as feature flag* — teams shipping known-broken parsers because
  "it'll DLQ" — the DLQ becomes a work queue for permanent negligence.
  (c) *Auto-replay loops* — automated re-drive without a fix = a slow
  infinite retry with extra infrastructure.
- **L4/L5/L6:** L4 — "failed messages go to a DLQ." L5 — classification
  gate, metadata chart, the four resolution patterns wired per class,
  age-based SLOs, front-door replay, the ordering-hole consequence. L6 —
  the DLQ as an organizational contract: ownership per failure class,
  resolution SLOs in team charters, DLQ rate as a release-quality gate,
  tooling (message hospital / triage UI) as a platform product.

---

## 4. Resume connection

Your DLQ story is unusually complete — present it as the full pattern
language, not an anecdote:

- **Classification gate:** transient exceptions retry via Storm/Pulsar
  redelivery; `SidelineOnFailureException` (unrecoverable parse/invariant
  failures) sidelines immediately, zero retries.
- **Terminal state with a resolution path:** exhausted attempts →
  DLQ topic → dedicated DLQ topology — not a graveyard, a *handler*.
- **Resolution pattern matched to effect class:** receive-money (local
  idempotent write) → repair-and-replay (pattern 1); everything touching
  external money effects → force-query NPCI and converge (pattern 2) —
  the textbook compensate/interrogate instance, and you built it.
- **The measurable outcome:** stuck-transaction reduction **[FILL the %
  from your gap-analysis homework]** — the DLQ path's business value in
  one number.
- **Honest gaps to check:** DLQ *age* alerting vs depth-only
  **[VERIFY]**; DLQ retention length **[VERIFY]**; whether re-drives go
  through the front door (the normal consumer path) **[VERIFY — if yes,
  say it proudly; it's the mark of a correct replay design]**.

**30–60 s spoken answer** ("what happens when a message can't be
processed?"):

> "It hits a classification gate first: transient failures — timeouts,
> connection errors — retry with backoff through the queue's redelivery;
> deterministic failures — parse errors, invariant violations — sideline
> immediately with zero retries, because rerunning the same experiment
> just burns capacity and duplicates partial side effects. Exhausted or
> sidelined messages land in a dead-letter topic with their diagnosis —
> attempt counts, exception, original position — and the key design point
> is that our DLQ has a *handler*, not just retention. The resolution
> pattern matches the effect class: a receive-money event is a local
> idempotent write, so it's repaired and replayed through the normal
> path — front door, never a side script; anything that touched an
> external money effect is never re-executed — the handler force-queries
> NPCI for what actually happened and converges our record to it. Retry
> the question, not the action. And operationally the DLQ is a leading
> indicator: arrival-rate spikes segmented by failure class catch a bad
> deploy before user metrics do, and the SLO is on the *age* of the
> oldest unresolved message, because depth lies."

---

## 5. What the interviewer will push on

**P1. "A poison message is wedging a Kafka partition. Walk me through the
incident and the permanent fix."**
- *Model:* symptom: one partition's lag climbs while others drain;
  consumer crash-loops or error-loops on the same offset (offset never
  commits). Immediate: hotfix the consumer to catch-classify-produce-to-
  DLQ-and-commit past it (or, blunt tool: manually advance the offset —
  acknowledging that's a deliberate drop, logged). Permanent: the
  classification gate in the consumer framework (deterministic ⇒ DLQ +
  commit; transient ⇒ bounded retry), DLQ metadata, alerts on
  per-partition lag skew + DLQ arrivals, and a contract test so the
  schema break that caused it fails CI instead of production. Naming the
  liveness mechanism (commit must advance past the poison) is the core.
- *Trap:* "restart the consumer" (it re-reads the same offset — the loop
  IS the design) or skipping the offset without acknowledging it's a
  drop decision someone must own.

**P2. "Your DLQ has 50,000 messages after a bad deploy. Design the
re-drive."**
- *Model:* triage by failure class first (one bad parser version? all
  same exception ⇒ one fix covers all). Fix + deploy. Then re-drive
  **through the front door** (produce back to the main topic / normal
  consumer path) so all idempotency and state-machine guards apply —
  never a bypass script. Throttled (the live system is serving; replay
  competes — rate-limit to spare capacity, off-peak), monitored
  (re-failure rate: if >~0, stop — the fix is incomplete), and idempotent
  against partial success (some of the 50k half-executed before failing;
  guards absorb). Keep provenance: mark re-driven messages (header) so
  metrics distinguish replay from live. Success criterion: DLQ age → 0,
  zero duplicate effects, live SLOs undisturbed.
- *Trap:* a bespoke replay script that "just applies the fix" —
  side-door replays bypassing guards are where double-payments come
  from; the front-door principle is the answer being fished for.

**P3. "Why does your DLQ handler force-query instead of replay? When would
replay be correct instead?"**
- *Model:* the arsenal answer, generalized: after exhausted attempts
  against an external money effect, attempt outcomes are *unknown*
  (timeout ≠ failure) — replay risks re-execution (double debit), doing
  nothing strands state; interrogating the authority converges safely and
  idempotently. Replay is correct when the effect is local + idempotent
  (receive-money: an upsert whose re-run is a no-op) or when the external
  effector dedupes on identity so replay collapses. Decision variable:
  *can a re-run cause an unrecoverable second effect?* If yes,
  interrogate; if provably no, replay.
- *Trap:* absolutes in either direction ("never replay" / "always
  replay") — the classification-by-effect is the content.

**P4. "DLQ depth is 12,000. Is that an incident?"**
- *Model:* insufficient data — depth without class and age is noise.
  12,000 stale analytics events from a known upstream burp with a
  discard decision pending: not an incident. 3 payment-execution messages
  aged 6 hours: incident. The metrics that decide: arrival *rate* by
  failure class (regression detector), *age* of oldest unresolved per
  class vs its SLO (the real breach), and re-failure rate during
  re-drives. Then the org half: every class has an owner; unowned DLQ
  classes are the actual incident.
- *Trap:* "yes, page someone" / "no, DLQs are normal" — both skip the
  segmentation that IS the answer.

**P5. "Where should the retry-vs-sideline decision live — message, consumer,
or platform?"**
- *Model:* layered. The *consumer* owns semantic classification (only it
  knows a parse failure from a timeout — exception taxonomy in code, your
  SidelineOnFailure pattern). The *platform* owns the ladder mechanics
  (redelivery counts, backoff, DLQ routing, metadata capture —
  subscription policy, so teams can't forget). The *message* carries the
  evidence (attempt count, provenance headers) but never the policy —
  producers can't know consumers' failure modes. Anti-pattern: policy in
  producer code ("this message is important, retry forever") — importance
  is the consumer's SLO, not the producer's opinion.
- *Trap:* "the platform handles it all" — platforms can't classify
  semantics; "each consumer decides everything" — hand-rolled ladders
  drift and the org loses the paved road. The layering is the answer.

---

## Self-test

1. Define poison message precisely, and state the axiom about bounded
   retries.
2. The classification gate: three classes, the action for each, and your
   platform's encoding of it.
3. Why is immediate sidelining of deterministic failures strictly better
   than retrying them? Two costs of retrying.
4. Pulsar vs Kafka DLQ mechanics — and the Kafka wedged-partition
   pathology with its liveness fix.
5. List the metadata chart a DLQ message must carry (≥6 fields) and why
   each earns its place.
6. The four resolution patterns, each matched to a failure/effect class.
7. "Front door, never the side door" — what goes wrong through the side
   door?
8. Why is the DLQ an ordering hole, and what design posture makes that
   survivable?
9. Name the three DLQ abuse patterns.
10. Design the alert set for a DLQ (three signals) and say why depth alone
    lies.
11. Your force-query: which resolution pattern, why replay is unsafe
    there, and the exception that proves the rule.
12. The 50k re-drive: five disciplines that make it safe.

<details>
<summary><b>Answers</b></summary>

1. A message that fails deterministically — the failure is a property of
   (message, consumer-version), not of transient conditions; retries
   cannot change the outcome. Axiom: every bounded retry needs a terminal
   state — success, silent drop, or durable park — and for data that
   matters, the DLQ (durable park) is the only acceptable third option.
2. Transient (timeout/5xx/lock/CAS-miss) → bounded retry with backoff.
   Deterministic (parse/schema/invariant) → sideline immediately, zero
   retries. Ambiguous (unknown 500s) → small retry budget then DLQ.
   Platform encoding: retryable ProcessHandlerException vs
   SidelineOnFailureException routed straight to sideline.
3. Retrying a deterministic failure: (a) burns consumer capacity and
   redelivery slots that transient failures need (and in ordered
   consumption, blocks the partition); (b) re-executes any partial side
   effects on every attempt, multiplying the cleanup surface. Zero
   information is gained — the outcome is a pure function of the message.
4. Pulsar: broker-native subscription deadLetterPolicy — after
   maxRedeliverCount, auto-republish to the DLQ topic (per-message state
   makes it possible). Kafka: consumer-implemented — catch, produce to a
   DLQ topic, then COMMIT the offset; the pathology is failing to commit
   (crash-loop on the same offset) which wedges the partition — liveness
   requires committing past the poison after parking it.
5. Original topic/partition/offset or message ID (provenance — find
   neighbors, enable precise re-drive); attempt count (ladder evidence);
   first/last failure timestamps (age SLOs); exception class + message
   (triage/classification); consumer/app version (was it the deploy?);
   trace/correlation ID (join to logs and the business entity). 
6. Repair-and-replay → deterministic code/schema bugs on local/idempotent
   effects. Compensate/interrogate (force-query) → unknown-outcome
   external effects (money). Discard-with-judgment → stale low-value
   events past usefulness, per business-owner policy. Human escalation →
   unclassifiable or high-stakes residue, bounded by an age SLO.
7. Side-door replay scripts bypass the live path's idempotency keys,
   state-machine guards, and validation — a half-executed message
   re-applied raw duplicates its completed steps (double effects) and can
   write states the live flow forbids. The front door re-runs the same
   guards that make the live system safe.
8. Sidelining message N lets N+1.. process first; the entity behind N is
   stale/gapped until resolution, and re-drive delivers N maximally late.
   Survivable under posture B: state machines rejecting stale
   transitions, versioned upserts, re-derivation — order-tolerant
   consumers (plus entity-level "in DLQ" visibility for support).
9. DLQ-as-backpressure (overflow routed to DLQ, mixing unlucky with
   poison); DLQ-as-feature-flag (shipping known-broken code because
   "it'll DLQ"); auto-replay-without-fix (an infinite retry loop with
   extra steps).
10. Arrival rate by failure class (regression/canary signal — wire to
    deploy rollback); age of oldest unresolved per class vs its SLO (the
    true breach condition); re-failure rate during re-drives (fix
    completeness). Depth lies because 10k discardable analytics events
    and 3 six-hour-old payment messages invert severity.
11. Pattern 2 (compensate/interrogate). Unsafe to replay: exhausted
    attempts against NPCI-touching effects have unknown outcomes — replay
    risks a second debit. Exception proving the rule: receive-money — a
    local idempotent record write with no external effect — replays
    plainly (pattern 1).
12. Triage by class before touching anything; fix deployed and verified
    first; re-drive through the front door (normal consumer path, all
    guards live); throttled and monitored (rate-limited vs live SLOs,
    stop-on-re-failure); provenance-marked messages + idempotency
    absorbing partial prior execution (and long-retention DLQ so nothing
    was shredded meanwhile).

</details>
