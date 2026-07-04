# Worked Design 3: Notification System

A deceptively rich prompt: multi-channel delivery, provider abstraction,
fan-out, dedup, preferences, and rate control — and you've *operated* one
(the UPI notification topology). The trap is treating it as "a queue and
some senders"; the substance is the delivery contract per notification
class and the provider boundary.

**Prompt:** "Design a notification system: push, SMS, email, in-app — for
all our products."

---

## 1. Requirements & scope (0–5)

Functional: (1) products submit notification *requests* (template + data +
recipient + class); (2) system resolves channels per user preference +
notification class; (3) renders, rate-controls, dedupes, and delivers via
external providers (APNs/FCM, SMS gateways, email ESPs); (4) tracks
delivery status; (5) respects opt-outs/quiet hours — **compliance, not
courtesy** (regulatory for SMS/email).

The scoping move that structures everything: **notification classes with
different contracts** — transactional (OTP, payment status: must-deliver,
seconds-latency, never dropped) vs product/marketing (may drop, batch,
strict caps). Say it in minute 2; every later decision keys off it.

Non-functional: 100 M notifications/day assumed (~1.2 k avg / ~5 k peak
NPS); at-least-once delivery with idempotent send (duplicate SMS
tolerable-but-minimized; duplicate OTP fine; dropped OTP not fine —
error-direction per class); provider outages are routine (multi-provider
per channel).

## 2. Estimation (5–9)

5 k peak NPS × ~1 KB payload — trivial bus/storage load; **which means**
the system is I/O-bound on *provider* APIs (SMS gateway ~100s TPS per
account with strict rate contracts; APNs/FCM high-throughput but
connection-managed) — the architecture is a **demand-shaping funnel onto
rate-limited partners**, which is your day job in another costume.
Status/tracking storage: 100 M/day × ~300 B × 90 d ≈ 3 TB — one
wide-column table, TTL'd.

## 3. API & data model (9–14)

```
POST /notifications  Idempotency-Key: <caller-uuid>
  {recipient_id, class: TRANSACTIONAL|PRODUCT|MARKETING, template_id,
   data{}, channel_hint?, dedup_key?, ttl?}
  → 202 {notification_id}
GET /notifications/{id} → per-channel delivery states
Webhooks/events → callers: delivered / failed / suppressed
```
Entities: `notification` (state machine per channel: QUEUED → RENDERED →
SENT → DELIVERED/FAILED/SUPPRESSED, keyed notification_id; index by
recipient+time); `preferences` (user × class × channel + opt-outs + quiet
hours — read-heavy: cache with **short TTL and the staleness direction
called out**: a stale opt-out that still sends is a compliance incident ⇒
opt-outs get write-through/push invalidation, not lazy TTL —
`03-caching/02` P4's logic); `templates` (versioned).

## 4. High-level design (14–24)

```
Producers → API (validate, idempotency, class) → outbox → BUS (topic per
class — priority isolation) → Pipeline workers:
  preference/opt-out gate → dedup/collapse → render → per-user rate
  control → channel router → PROVIDER ADAPTERS (per-provider bulkhead +
  breaker + rate limiter + identity) → providers → status callbacks →
  state machine + events; DLQ per stage; recon sweep for stuck states.
```

Decisions to argue:
1. **Queue-per-class, not one queue:** transactional must never sit
   behind a 5 M-message marketing blast — priority isolation by topic
   (bulkhead thinking at the bus layer; rejected: single queue with
   priority fields — head-of-line through shared consumers anyway).
2. **Provider adapter layer** (strategy + factory — literally your
   PGFactory/ICreditHandler pattern): per-provider identity, rate
   contracts, response normalization; multi-provider failover per
   channel **gated on provider-terminal failure** (same rule as payment
   rails: timeout ≠ failed; blind cross-provider retry = duplicate SMS
   storm — `00-resume-arsenal/02` D1's logic).
3. **Dedup/collapse at two levels:** delivery dedup (idempotency key +
   notification_id through the pipeline — at-least-once bus, idempotent
   send) and *semantic* collapse (dedup_key: "3 payment-failed alerts
   in 5 min → 1 message" — business rule, producer-declared).
4. **Rate control per (user × class):** token buckets — marketing capped
   hard, transactional effectively uncapped; plus per-provider outbound
   limiters matching contracts (the funnel's neck).

## 5. Deep dives (24–39)

- **The OTP path (transactional worst case):** latency budget seconds;
  design: dedicated topic + reserved worker capacity (criticality tiers —
  `05-resilience/06` §2.3), provider failover on fast-fail errors,
  fallback channel escalation (SMS → voice) on delivery-callback timeout,
  and the honest duplicate-vs-drop call: retry aggressively because a
  duplicate OTP is free and a missing one is a support call — error
  direction, stated per class.
- **Device-token lifecycle (push):** tokens go stale at scale (~
  double-digit % churn/quarter (estimate)); APNs/FCM feedback marks dead
  tokens ⇒ prune-on-feedback + registration refresh; ignoring this is
  the classic "our push delivery rate mysteriously decays" incident.
- **Status truth:** SENT (provider accepted) ≠ DELIVERED (device/carrier
  confirmed — where available); expose per-channel states honestly;
  callbacks + provider status pulls = push-for-latency, pull-for-truth
  again.

## 6. Operations (39–45)

Page on: per-class queue backlog **age** (transactional age > seconds =
incident; marketing age > hours = fine — same metric, class-scoped SLOs),
per-provider success rate + breaker state, opt-out gate failures (compliance
pager), DLQ age. 10×: provider contracts are the wall — negotiate/add
providers before scaling workers (the funnel's neck doesn't widen with your
fleet).

---

## Probes & traps

- **"One queue with priorities vs queue-per-class?"** — shared consumers
  reintroduce head-of-line regardless of message priority fields;
  separate topics + reserved capacity = real isolation; cost: N pipelines'
  worth of config, mitigated by shared code. Trap: priority-field
  hand-wave.
- **"Marketing blast of 50 M lands at 9 AM. Walk the system."** —
  producer batch → marketing topic absorbs (backlog by design, age SLO
  hours) → workers drain at provider-contract pace (outbound limiters =
  the shaping) → transactional traffic unaffected (separate topic +
  capacity) → per-user caps drop over-frequency sends → collapse
  aggregates. The design IS the answer: the blast becomes backlog, not
  outage.
- **"User gets the same push twice — full trace."** — enumerate the
  duplicate factories (`04-messaging-streaming/04` §2.4): producer retry
  without key? bus redelivery + non-idempotent send? cross-provider
  failover on timeout? Each has a named wall; find which leaked (the
  layered-audit answer shape from the payments double-charge runbook).
- **"Why at-least-once + idempotency instead of exactly-once?"** — the
  standing answer (`04-messaging-streaming/04` §3.3): external effects
  (SMS gateways) can't join transactions; match idempotency effort to
  stakes per class.

## Self-test

1. The class-contract move: what differs per class across delivery,
   latency, drops, and duplicates?
2. Why is the system a "demand-shaping funnel," and what's at the neck?
3. The two dedup levels and who declares each.
4. Why do opt-outs get push invalidation while preferences get TTL
   caching?
5. Queue-per-class vs priority fields — the isolation argument.
6. Cross-provider failover: the gating rule and what it prevents.
7. The OTP path's four design elements and its error-direction call.
8. SENT vs DELIVERED, and the two-channel truth pattern behind it.
9. What decays push delivery rates over months and the fix?
10. The 9 AM blast: four mechanisms that make it boring.

<details>
<summary><b>Answers</b></summary>

1. Transactional: must-deliver, seconds latency, drops unacceptable,
   duplicates tolerable (OTP) — aggressive retry, reserved capacity.
   Product: best-effort, minutes, drops acceptable under pressure,
   duplicates annoying — normal pipeline. Marketing: droppable,
   hours-latency fine, hard frequency caps, collapse aggressively —
   compliance-gated.
2. Ingest/bus/storage are trivial at 5 k NPS; external providers have
   hard rate contracts (SMS gateways ~100s TPS) — all architecture
   (queues, limiters, priorities) exists to shape internal demand onto
   those contracted necks. The neck: per-provider rate limits.
3. Delivery dedup — system-owned: idempotency key at ingest +
   notification_id flowing through an at-least-once bus into idempotent
   provider sends. Semantic collapse — producer-declared dedup_key with
   a window ("N similar alerts → 1 message"): a business rule the
   system enforces but cannot invent.
4. Staleness direction: a stale preference sends a slightly-unwanted
   message (annoyance); a stale opt-out sends to someone who revoked
   consent (compliance/legal incident) — the harm owner sets the bound
   (`03-caching/02` P4): opt-outs get write-through/pushed
   invalidation + short TTL backstop.
5. Priority fields in one queue still share consumer capacity and
   redelivery machinery — a 50 M blast occupies the same workers and
   backlog that OTPs need (head-of-line at the consumer). Separate
   topics with reserved worker capacity give bulkhead-grade isolation;
   cost is duplicated pipeline config over shared code.
6. Fail over only on provider-terminal evidence (fast rejection,
   confirmed failure) — never on timeout, whose outcome is unknown:
   the first provider may have delivered; cross-provider retry on
   timeouts = duplicate messages at scale (same rule as payment
   rails: timeout ≠ failure).
7. Dedicated topic + reserved capacity (criticality tier); provider
   failover on fast-fail; channel escalation on delivery timeout
   (SMS → voice); aggressive retry policy. Direction: duplicate OTP
   costs ~nothing, dropped OTP costs a login/support incident —
   so bias every ambiguity toward re-send.
8. SENT = provider accepted the request (your funnel worked);
   DELIVERED = carrier/device confirmation where the channel offers
   it. Truth arrives by callback (push, fast, lossy) backstopped by
   provider status pulls (complete) — push-for-latency,
   pull-for-truth.
9. Device-token churn: uninstalls, OS token rotation, device changes
   silently invalidate tokens (double-digit %/quarter). Fix: consume
   APNs/FCM feedback to prune dead tokens, refresh registration on
   app open, and monitor delivery-rate-per-cohort as the SLI.
10. Marketing topic absorbs the batch as backlog (age SLO in hours);
    outbound provider limiters drain at contract pace; reserved
    transactional capacity keeps OTPs at seconds; per-user frequency
    caps + semantic collapse shrink the blast. It becomes a
    slow-draining queue, not an event.

</details>
