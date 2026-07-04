# Worked Design 5: Chat (Messenger/WhatsApp-class)

The classic stateful-connection design: long-lived sockets, per-conversation
ordering, multi-device sync, presence, and group fan-out. Rich territory for
you — the storage is wide-column keyed exactly like your HBase tables, the
delivery guarantees are your queue semantics, and ordering is
`04-messaging-streaming/05-ordering.md` applied.

**Prompt:** "Design WhatsApp / a chat system."

---

## 1. Requirements & scope (0–5)

Functional: 1:1 messaging; group chat (cap? ask — assume 512, it bounds
fan-out); delivery states (sent/delivered/read); multi-device sync; offline
delivery; presence + typing (cheap-to-degrade tier — say so); media via
blob-store URLs (out of scope: the blob store itself — that's
`09-object-store-s3.md`; E2E encryption noted as a constraint that moves
features server-side→client-side, scoped out unless asked).

Non-functional: 100 M DAU assumed; message latency p95 < ~200 ms
online-to-online; **no message loss, ever** (durability before delivery —
the one non-negotiable); per-conversation ordering (global ordering
explicitly NOT needed — score the scoping point); connection churn is
constant (mobile networks).

## 2. Estimation (5–9)

100 M DAU × 40 msgs sent/day = 4×10⁹/day ≈ 45 k avg / ~150 k peak msg/s —
**which means** wide-column LSM territory for the message store
(`02-databases/08` anchors). Concurrent connections: ~10–20 M sockets ⇒ at
~100 k–1 M connections/gateway node (epoll/NIO-class), ~50–200 gateway
nodes — connection state is a *first-class tier*. Storage: 4×10⁹ × 300 B
× 1 y ≈ 400 TB (× replication) — fine for the family. Fan-out: group 512
× 150 k/s worst-case is the number to watch (§5.2).

## 3. API & connections (9–14)

- **WebSocket** (assume; long-polling fallback) to a **chat gateway**
  tier: stateful, holds the socket, does auth once at connect, heartbeats
  (`01-distributed-systems/07` — timeouts sized against mobile-network
  jitter).
- **Session/routing registry:** user → {gateway nodes} (multi-device =
  multiple entries) in a fast KV (Redis/Aerospike-class, TTL'd by
  heartbeat) — the "where do I push?" lookup. This registry is the
  design's coordination heart; treat it with cache-store discipline
  (`03-caching/01` classification: it's ephemeral *state*, rebuilt by
  reconnects — loss = reconnect storm, not corruption).
- Send API (over the socket): `send(conv_id, client_msg_id, payload)` —
  **client_msg_id is the idempotency identity** (retries over flaky
  radios are the norm); server replies with (server_msg_id, conv_seq).

## 4. Data model & ordering (14–24)

`messages`: **key (conv_id, conv_seq)** — your row-key discipline
verbatim: conversation-first for locality (history scans = contiguous
range reads), sequence-suffix for order; wide-column/LSM store.
`conversations`: members, per-member last-read/delivered cursors (read
receipts = cursor positions, NOT per-message flags — the design insight
that collapses receipt storage from O(msgs×members) to O(members)).
`user_inbox` (optional, for fan-out-on-write variants): per-user timeline
of (conv_id, seq) pointers.

**Ordering — the deep-dive they always pick:** per-conversation total
order, manufactured by ownership (`04-messaging/05` posture A at
conversation scope): each conv_id hashes to a **sequencer** — the
partition owner that assigns conv_seq monotonically (a Kafka-partition-
leader-shaped role; or the storage row's single-writer does it via
atomic increment on the conversation row — say both, pick the sequencer
for latency). Clients render by conv_seq; gaps trigger pull-based
backfill ("have 41–45, missing 43 → fetch"). Cross-conversation order:
explicitly none. Client clocks: display only, never order — the
`06-time-and-ordering.md` discipline.

## 5. High-level flow + deep dives (24–39)

### 5.1 The message path (narrate this cold)

```
Sender device → gateway A → sequencer/owner for conv → durably APPEND to
message store (+outbox) → ack "sent" to sender → fan-out: for each
recipient device: registry lookup → online? push via its gateway →
device acks → "delivered" cursor advances | offline? nothing extra to do —
the store IS the offline queue; on reconnect, device pulls from its
last-synced (conv, seq) cursors → push notification via 03-notification-
system for the offline nudge.
```
Key sentence: **durability precedes any delivery ack** ("sent" means "on
disk in the log," not "recipient has it") — no-loss falls out of
store-then-fan-out, and offline delivery is just "read the log from your
cursor" — the log-consumer model (`04-messaging/01`) applied to humans.
Delivery is at-least-once (redeliver on unacked push); client dedups by
server_msg_id — effectively-once rendering.

### 5.2 Group fan-out

512 members × online-fraction pushes per message — write amplification is
per-*device* pushes, not per-member storage: store the message ONCE per
conversation (not per member — messages are conversation-scoped, unlike
feeds); fan-out is a *notification* problem (registry lookups + pushes),
batched per gateway (all recipients on gateway C = one batch). Mega-groups
(10 k+) flip to fan-out-on-read: no per-device push storm, members pull
on open + a single "conversation updated" signal — the write/read fan-out
dial (`06-news-feed.md` owns the general theory; chat sits at the
easy end because storage isn't fanned out, only signals).

### 5.3 Multi-device sync

Each device holds per-conversation cursors; every device of a user is an
independent consumer of the conversation logs (the log model pays again).
Read receipts: read-cursor advances propagate to *other* devices and to
senders — small events, same fan-out machinery. New device: bootstrap =
snapshot + log tail (the CDC snapshot-seam pattern —
`04-messaging-streaming/07` P2 — in miniature; E2E encryption makes this
device-to-device instead, one sentence).

### 5.4 Presence (the degradable tier)

Online/offline from gateway heartbeats → presence service → *pull +
short-TTL cache* for "is X online" and push only to actively-open
conversations (never broadcast every flap to every contact — presence
fan-out at 100 M DAU would dwarf message traffic; do this arithmetic
aloud: it's the trap). Typing indicators: fire-and-forget, at-most-once,
TTL seconds — the error-direction lens: lost typing signal costs nothing
(`04-messaging/04` self-test 12's criterion).

## 6. Operations (39–45)

Page on: message-path p99 (send→deliver), store append latency,
undelivered-age per conversation (the stuck-sweep — recon thinking),
registry health, gateway connection balance (one node holding 3× sockets
= failure-blast-radius skew). Failure drills: gateway node dies → its
sockets drop → reconnect storm (jittered backoff client-side, connection
admission ramps — `05-resilience/04` jitter + `06` ramp logic) → devices
resync from cursors (no loss, by design). 10×: sequencer heat for
mega-hot conversations and registry QPS are the walls; both shard.

---

## Probes & traps

- **"How do you guarantee no message loss through a gateway crash?"** —
  durability-before-ack: the sender's "sent" arrives only after the
  store append; a gateway dying pre-append means the client never got
  the ack → client retries with client_msg_id → idempotent. Post-append,
  every recipient pulls from cursors regardless of which gateways died.
  Trap: any answer where an ack precedes durability.
- **"Two messages sent simultaneously to one group — who orders them?"**
  — the conversation's sequencer assigns seq atomically (single-writer
  per conv); "simultaneous" is undefined until it does
  (`06-time-and-ordering.md`: order is manufactured, not observed).
  Clients may reorder their *optimistic local echo* — UX handles the
  visual jump.
- **"Why not Kafka as the message store?"** — per-conversation topics
  don't scale (millions of convs vs partition economics), consumer-
  per-device cursor management is exactly what you'd hand-build anyway,
  and history queries (range reads by conversation) want a table, not
  a log retention window. The log *model* is right; the storage is a
  wide-column table that behaves like per-conv logs — keyed
  (conv_id, seq). Trap: brand-first storage
  (`00-method.md` anti-checklist #5).
- **"Read receipts for a 512-group — storage?"** — cursors per member
  (O(members) per conv), not flags per message (O(msgs×members));
  "read by up to seq N" is monotone and tiny. The cursor insight is
  the score.
- **"Presence for 100 M users?"** — do the fan-out math (500 contacts ×
  flaps/day each = broadcast apocalypse) → pull + cache + scoped push.
  The trap is designing push-everything presence.

## Self-test

1. The one non-negotiable and the design rule it forces on the message
   path.
2. Why (conv_id, conv_seq) as the message key — both halves.
3. Read receipts as cursors: the complexity collapse and why it works.
4. Who assigns order, and what do client timestamps get used for?
5. Offline delivery: why is there "nothing extra to do"?
6. Group fan-out: what's fanned out and what isn't — and where the
   mega-group flip happens.
7. Multi-device sync as the log-consumer model; the new-device
   bootstrap pattern.
8. Presence: the arithmetic trap and the three-part design.
9. Gateway crash → reconnect storm: three mitigations.
10. Delivery semantics end-to-end: name each layer's contribution to
    effectively-once rendering.

<details>
<summary><b>Answers</b></summary>

1. No message loss, ever. Rule: durability precedes every ack —
   "sent" is emitted only after the append to the replicated store;
   fan-out/delivery are downstream of durability, never a
   precondition of it.
2. conv_id first: all of a conversation's messages contiguous —
   history fetch = one range scan (locality; hash-distributed across
   conversations so no global hot region). conv_seq suffix: storage
   order = display order, gap detection trivial, cursors are plain
   integers.
3. Per-member "read/delivered up to seq N" cursors: O(members) state
   per conversation vs O(messages × members) per-message flags.
   Works because seq is a total order per conversation — receipts
   are monotone high-water marks, so one integer summarizes all
   history.
4. The conversation's single-writer (sequencer/partition owner, or
   the conversation row's atomic increment) assigns conv_seq —
   ownership manufactures order. Client timestamps: display and
   local echo only; never ordering, never conflict resolution.
5. Because the store IS the queue: messages are durably appended
   once per conversation, and each device is a cursor-holding
   consumer — offline just means the cursor lags; reconnect = pull
   from cursor. No shadow mailbox, no separate offline queue to
   keep consistent.
6. Storage is NOT fanned out (one copy per conversation); pushes/
   signals are (per online recipient device, batched per gateway).
   At mega-group scale even signal fan-out storms — flip to
   fan-out-on-read: a single conversation-updated hint, members
   pull on open.
7. Every device independently consumes conversation logs from its
   own cursors — multi-device consistency for free (each converges
   by reading the same ordered log). New device: snapshot (recent
   history/conversation list) + tail from the snapshot's seq — the
   snapshot-then-stream seam in miniature.
8. Contacts × transitions: 100 M users × 500 contacts × several
   flaps/day = fan-out that dwarfs messaging traffic — push-to-all
   is bankrupt. Design: gateway heartbeats → presence service;
   pull + short-TTL cache for lookups; push only within actively
   open conversations; typing = fire-and-forget at-most-once.
9. Client-side jittered exponential backoff on reconnect (prevents
   the synchronized wave); connection-admission ramps/shedding at
   gateways (absorb in steps); cursors make the resync cheap and
   loss-free (no per-user server-side recovery work). Plus registry
   TTLs self-clean the dead node's entries.
10. Client retry with client_msg_id + server idempotent accept
    (dedup at ingest); durable append (no loss); at-least-once push
    with redelivery on missing device-ack; client-side dedup by
    server_msg_id before render — at-least-once transport,
    exactly-once appearance.

</details>
