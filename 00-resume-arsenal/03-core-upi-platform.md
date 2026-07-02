# Core UPI Payments Platform — Resume Arsenal

Resume section under attack:

> **Core UPI Payments Platform — Async Execution & Data Pipeline**
> - Built an event-driven async payment-execution path (Apache Pulsar + Apache Storm) decoupling the user-facing API from the 30–60 s NPCI round-trip, eliminating thread/connection exhaustion and enabling payment workers to scale horizontally via queue-depth back-pressure.
> - Implemented a single stream-processing topology serving 4 execution paths (P2P, collect-pay approval, provider callback, receive-money) plus a dead-letter recovery path that force-queries NPCI to reconcile stuck terminal states, reducing stuck transactions by [X]%.
> - Developed a Change Data Capture pipeline streaming HBase mutations as protobuf events through Storm to the analytics platform across 4 entity types, delivering real-time analytics and fraud data without querying operational stores.
> - Secured the API gateway with device-fingerprint validation (Aerospike), request deduplication under retry storms, rate limiting, two-tier auth, and HMAC webhooks, hardening every payment before creation.

This is the story that proves you operate a real high-scale money system, not just a
feature on top of one. It's also where "double payment" questions live — the most
dangerous 90 seconds of any payments interview. Drill section 2's attack B1 until
it's reflexive.

---

## 0. Primer — concepts you must explain from zero

- **Why payments are slow here:** submitting a UPI payment means our PSP partner
  (Juspay) talks to NPCI, which talks to the payer's bank and the payee's bank; the
  payer authorizes with a PIN; banks can be slow or flaky. End-to-end confirmation
  can take **30–60 s** in the tail. A synchronous design would hold a server thread
  + HTTP connection open per in-flight payment for that entire time.
- **Apache Pulsar (one paragraph):** a distributed messaging/streaming system.
  Producers publish to topics; brokers serve them; storage is delegated to BookKeeper
  nodes ("bookies") — compute and storage separate (contrast Kafka, where brokers own
  both; deep-dive in `04-messaging-streaming/02-pulsar-vs-kafka.md`). Consumers hold
  subscriptions with acks; unacked messages are redelivered → **at-least-once** by
  default. Messages persist (your platform: ~5 days retention), so a consumer crash
  loses nothing.
- **Apache Storm (one paragraph):** a stream processor. A **topology** is a graph of
  spouts (sources — here, Pulsar consumers) and bolts (processing steps) that runs
  forever across worker JVMs. Storm tracks each input tuple through the graph (the
  "tuple tree" via ackers); if any step fails or times out, the spout replays the
  tuple → at-least-once processing. Parallelism is per-component ("this bolt runs
  N executors"), so throughput scales by config + adding workers.
- **CDC (Change Data Capture):** instead of apps double-writing to the database AND
  the analytics bus (dual-write — famously unreliable, because the two writes can't
  be atomic), you tap the database's own replication stream so every committed
  mutation becomes an event. Your HBase abstraction exposes this via SEP
  (Side-Effect Processor / replication hook), streaming cell mutations to Pulsar.
- **Terminal vs non-terminal state:** a payment ends in exactly one terminal state
  (SUCCESS / FAILURE / EXPIRED). "Stuck" = non-terminal past its deadline. Every
  payments system's health is measured by how few and how briefly transactions sit
  non-terminal.

---

## Bullet 1 — Async execution path (Pulsar + Storm)

### The design

```
submit API → gateway (device check, dedup) → txn-svc writes INITIATED row (HBase)
          → publishes SendMoneyProduceEvent to Pulsar → API returns immediately
Storm topology consumes → calls PSP-svc → Juspay → NPCI (the slow part)
          → calls txn-svc to update state (PENDING → terminal)
Client learns the outcome by polling status API / push notification.
```

### The real "why" — this is where candidates get it wrong

The lazy justification is "async frees threads". True but shallow — modern NIO/async
servlet stacks can hold 100k idle connections cheaply, and an interviewer who knows
that will use it to gut a threads-only answer. The complete justification has
**four legs**; give all four:

1. **Durability of intent.** A payment accepted from a user must survive process
   death. In a synchronous design, the in-flight execution state lives in a thread
   stack — deploy, OOM, or node loss silently kills payments. Persisting INITIATED
   + a durable queue event makes "we will resolve this payment" a fact on disk,
   not a hope in memory. This is the leg that matters for money.
2. **Resource decoupling under tail latency.** Little's Law: at [X]k payments/sec
   **[FILL your real peak]** with 30–60 s tails, synchronous = tens of thousands of
   concurrent held requests through every hop (gateway, txn-svc, PSP) — connection
   pools, load balancer state, memory per request, all sized to the *slowest
   partner's worst day*. Async sizes the API tier to its own fast work only.
3. **Independent scaling + backpressure.** Payment execution capacity (Storm
   workers) scales on queue depth, independent of API capacity; a slow NPCI day
   makes the queue deeper (visible, bounded, monitorable) instead of exhausting
   API-tier resources (invisible until everything dies at once).
4. **The network is asynchronous anyway.** Final outcomes often arrive as PSP
   *callbacks*, not synchronous responses. A sync API over an async reality is a
   lie you pay for during incidents; the architecture matches the domain.

### 30–60 s spoken answer

> "A UPI payment's confirmation can take 30–60 seconds through NPCI and the banks,
> and outcomes often arrive as provider callbacks — the domain is asynchronous. So
> the API path only does fast, local work: validate at the gateway, persist the
> transaction as INITIATED, publish an execution event to Pulsar, return. Storm
> workers consume and drive the slow PSP/NPCI conversation, then update transaction
> state. That bought us three things beyond thread math: durability — an accepted
> payment survives deploys and crashes because intent is on disk, not in a thread
> stack; independent scaling — execution workers scale on queue depth, not API
> traffic; and honest backpressure — a slow NPCI day shows up as measurable queue
> depth instead of connection-pool exhaustion cascading through every tier. The API
> tier is sized for its own latency, not for NPCI's worst day."

### Attack tree

**A1. "NIO/async-servlets/virtual threads hold cheap connections. Why a queue?"**
- *Model answer:* concede the thread-math point, then win on durability: cheap
  parked connections still mean execution state and client liveness are coupled —
  process death or client disconnect mid-flight loses the driver of a *money*
  operation. The queue is a durable, replayable record of intent with built-in
  retry; NIO is a concurrency optimization, not a reliability mechanism. Then the
  2026 kicker: virtual threads (Loom) make the *thread* argument even weaker — and
  the design still stands, because it was never really about threads.
- *Trap answer:* defending on thread cost alone. That's the L4 version, and it
  dies to "Netty exists".

**A2. "API returned 'accepted', then Pulsar publish failed — or the DB write
succeeded and the publish crashed. Now what?"** ← dual-write probe
- *Model answer:* order is write-then-publish, so the dangerous case is a persisted
  INITIATED row with no event. That transaction is *stuck-by-birth* — and the system
  already has the machinery for stuck transactions: recon/status-check sweeps
  non-terminal rows past age thresholds and force-queries downstream (or re-drives
  execution). Also the client polls status and its status-check can trigger
  resolution. So the answer is "we don't prevent it; we detect and repair it within
  a bounded window" — plus, if you designed it today, transactional outbox (emit the
  event FROM the DB write via CDC) removes the gap entirely; you already run the CDC
  infra that would enable it. Saying that last sentence shows growth, not weakness.
- *Trap answer:* "publish basically never fails." Dual-write is a top-3 payments
  interview probe; denial = fail.

**A3. "Explain exactly how queue-depth backpressure works here. What's the metric,
who reacts, and what happens at saturation?"**
- *Model answer:* the signal is subscription **backlog** (unacked/undelivered count)
  and its derivative (are we draining or growing?). Reactions in order: Storm
  consumer parallelism absorbs bursts up to provisioned max; scale workers when
  backlog trend is positive at max parallelism **[verify: was scaling manual or
  automated?]**; alert thresholds on backlog age (oldest unprocessed event = worst
  user wait). At true saturation, the *API keeps accepting* (payments queue safely —
  degraded time-to-resolution, not lost payments) until backlog age crosses product
  tolerance, at which point gateway rate limiting sheds new submissions — better to
  reject at the door than accept and resolve in 20 minutes. Pulsar's ~5-day
  retention means even extreme backlogs don't lose data.
- *Trap answer:* "Kubernetes autoscales it." On what metric? Queue-depth-based
  scaling is precisely the thing you claimed; be able to name the metric and the
  threshold philosophy or the bullet reads as decoration.

**A4. "What's your p50/p99 submit-to-terminal time, and what's the queue's
contribution when healthy?"**
- **[FILL — you must know these cold: healthy p50 ≈ a few seconds end-to-end, queue
  dwell ≈ milliseconds when drained. Unanswered, this question converts 'built' into
  'sat near'.]**

---

## Bullet 2 — One topology, 4 execution paths + DLQ force-query

### The design

One Storm topology consumes the payment-execution topic; the processor branches on
event type:

| Path | What it does |
|---|---|
| P2P / intent send-money | PSP send-money call (long timeout ~55 s), then txn-svc status update |
| Collect-pay approval | PSP collect-approve call, response mapped into the same status-update shape |
| Provider (Juspay) callback | PSP resolve/status call with gateway response codes → status update |
| Receive-money | No PSP call; records incoming credit via txn-svc |

Failure handling ladder: exception → Storm replay (bounded retries) → sideline flag
→ **DLQ topic** → DLQ topology. The DLQ topology's key decision: for receive-money
it simply retries; **for everything else it does NOT re-execute — it force-queries**
(`status/check?force=true`), making txn-svc interrogate NPCI via the PSP for the
authoritative current state and settle the row into a terminal state.

### Why force-query instead of replay — the money-safety argument (memorize)

After N failed attempts you cannot know how far any attempt got: the PSP call may
have succeeded while its *response* was lost (timeout ≠ failure). Re-executing risks
a second debit; doing nothing strands the user's money in limbo. The only safe move
is to **ask the source of truth what actually happened** and converge our record to
it. General principle, quotable: *"in payments, retry the question, never blindly
retry the action."* Receive-money is the exception that proves the rule — it's a
local, idempotent record-keeping write with no external money action, so plain
retry is safe.

### 30–45 s spoken answer

> "One topology served four execution paths — P2P sends, collect-pay approvals,
> provider callbacks, and receive-money — branching on event type, with shared retry
> and DLQ machinery. The part I'd highlight is the dead-letter recovery semantics:
> when retries exhaust, we don't replay the action, because after a timeout you
> can't know whether the debit happened — replaying risks paying twice, dropping it
> strands the transaction. Instead the DLQ path force-queries NPCI through the PSP
> for the authoritative state and converges our record to it. Retry the question,
> never blindly retry the action. Receive-money is the deliberate exception — it's a
> local idempotent write, so it just retries. That cut stuck-in-non-terminal
> transactions by [X]%."

### Attack tree

**B1. "Storm is at-least-once. Worker executes the PSP send-money call, dies before
acking. The tuple replays. Did you just debit the user twice?"** ← THE question.
Practice until reflexive.
- *Model answer, layer by layer:* No — because idempotency is enforced below us, and
  we built for replay on our side. (1) The execution event carries OUR transaction
  ID; the PSP send-money call is keyed on it, so a replayed call for an
  already-submitted txn is recognized by the PSP/NPCI layer (same txn reference →
  returns current status rather than initiating a second debit)
  **[VERIFY the exact PSP dedup contract — is it txnId? RRN? You must know which
  field is the idempotency key]**. (2) Our txn-svc state machine rejects illegal
  transitions, so a stale replayed status-update can't regress a terminal row.
  (3) The gateway already deduped client retries before creation, so one user intent
  = one txn row = one execution stream. Summary sentence: *"replays collapse onto
  the same transaction identity at every layer — gateway, PSP, NPCI — so
  at-least-once delivery degrades into at-most-once money movement."*
- *Trap answer:* "Storm guarantees exactly-once." It does not (Trident aside, which
  you don't use); claiming it ends the interview. Equally fatal: "that can't
  happen" — it happens every deploy.

**B2. "Four paths in ONE topology: a collect-pay flood or a poison-message storm now
delays P2P payments. Why not four topologies?"**
- *Model answer:* acknowledge the coupling honestly — shared topology = shared
  worker capacity, so cross-path interference is real in the limit. The trade:
  four topologies = 4× operational surface (deploys, monitoring, capacity puddles
  that can't be shared) for isolation we could largely get cheaper: per-component
  parallelism tuning, per-path Hystrix pools on the *downstream* calls (the actual
  bottleneck — PSP capacity — is shared regardless of topology count), and
  sideline/DLQ that ejects poison quickly so storms don't hold workers. And the
  paths share domain logic + deploy cadence, so cohesion argued for one unit.
  Revisit trigger: sustained cross-path SLO interference — at which point split the
  hottest path out first (P2P). Name the trigger; that's the L5 move.
- *Trap answer:* pretending there's no interference ("Storm isolates them"). It
  doesn't; executors share workers unless you configure otherwise.

**B3. "Force-query hits NPCI. NPCI has an outage — your DLQ now hammers a recovering
partner. What protects them?"**
- *Model answer:* the force-query path sits behind the same PSP-adapter Hystrix
  breakers as live traffic, so an NPCI outage opens the breaker for recon traffic
  too; DLQ redelivery is backoff-paced, not tight-loop; and recon-class traffic is
  the first thing to shed under partner degradation because its latency SLO is
  minutes, not milliseconds **[verify whether recon traffic had explicit
  deprioritization; if not, say "breakers + pacing" only]**. Bonus: mention NPCI/PSP
  rate agreements — partners meter you; recon bursts count against the same quota.
- *Trap answer:* "the DLQ is small so it doesn't matter" — after a 30-minute NPCI
  outage the DLQ is precisely NOT small; that's its busiest hour.

**B4. "'Reduced stuck transactions by [X]%' — measured how, and stuck for how long
before vs after?"**
- **[FILL: definition of stuck (non-terminal > T minutes), the before/after rate,
  and the dashboard it lives on. A resilience claim without its measurement is the
  most common resume collapse in reliability stories.]**

---

## Bullet 3 — CDC pipeline (HBase → protobuf → Storm → analytics)

### The design

Every committed HBase mutation on 4 entity types (transactions, users, mandates,
complaints) streams through the store's replication hook (SEP) onto Pulsar as a
protobuf envelope (table, row key, column qualifier, versioned binary blob). Storm
FDP topologies deserialize (version-prefixed blob → decompress → domain object),
**filter on column qualifier** (e.g., only the transaction-timeline column triggers
a transaction event — otherwise every cell write would fan out), map to a versioned
analytics entity (MapStruct), and post to the data platform. Unrecoverable parse
failures sideline immediately; transient failures retry then DLQ.

### Why CDC instead of the two obvious alternatives (know both)

- **vs dual-write from the app** (write DB + publish event in code): the two writes
  can't be atomic; crashes between them create silent divergence that nobody detects
  until an analyst does. CDC has one source of truth — the committed mutation — so
  the stream *cannot* disagree with the store, only lag it.
- **vs batch ETL / querying replicas:** minutes-to-hours of staleness (fraud signals
  need seconds), plus analytical scan load on operational stores or the operational
  team owning replica capacity for analysts. CDC is push, near-real-time, and
  zero-read-load on the source.

State the cost too: CDC couples consumers to the *storage representation* (you ship
row keys, qualifiers, serialized blobs — hence the versioned-blob codec and schema-
versioned entities), and gives you at-least-once with per-region ordering only —
downstream must be idempotent/upsert-style. You handled both; say so.

### 30–45 s spoken answer

> "Analytics and fraud needed near-real-time views of four entity types without
> touching operational stores. Dual-writing events from the app is the classic
> wrong answer — app write and event publish can't be atomic, so they drift
> silently. Instead we tapped HBase's replication hook: every committed mutation
> streams as a protobuf envelope through Pulsar into Storm topologies that filter
> on the specific column qualifiers that mean 'business event' — otherwise every
> cell write would fan out — decode versioned blobs, map to schema-versioned
> analytics entities, and push to the data platform. The stream can lag the store
> but can never disagree with it. Costs we accepted and engineered around: coupling
> to storage representation, handled with versioned codecs; and at-least-once with
> only per-region ordering, handled by making downstream consumption upsert-style."

### Attack tree

**C1. "What ordering does your CDC actually guarantee? Two updates to the same
transaction 5 ms apart — can they arrive swapped?"**
- *Model answer:* per-row/per-region order is preserved by the replication stream
  (same row → same region → same ordered stream) **[VERIFY against your SEP
  behavior, esp. across region splits/moves]**; cross-row and cross-region order is
  not guaranteed, and retries/DLQ can reorder even within a key at the consumer.
  Design consequence: downstream entities carry modTime/version and consumers
  upsert-with-version, so a stale event can't overwrite a newer state. Never claim
  global order; claim "engineered so order doesn't matter beyond per-key
  last-write-wins".
- *Trap answer:* "Pulsar preserves order" — partition ≠ pipeline; the interviewer
  will walk you into the retry-reorder case.

**C2. "Why protobuf for the envelope?"**
- *Model answer:* compact binary at CDC volume (every mutation on 4 hot tables — an
  order of magnitude above business-event volume **[estimate]**), fast serde on the
  hot replication path, and — the real reason — **disciplined schema evolution**:
  field numbering with forward/backward compatibility lets producers and the many
  downstream consumers deploy independently, which JSON gives you only by
  convention. Cost: opacity (need schema to inspect), tooling.
- *Trap answer:* "protobuf is faster" with no mechanism (varint encoding, no field
  names on wire, generated parsers) — the ban on hand-waving applies to you too.

**C3. "CDC lag hits 30 minutes during a compaction storm. Who notices, and what's
the blast radius?"**
- *Model answer:* consumer-lag/backlog-age alerts on the FDP subscription notice
  first; blast radius is analytics/fraud freshness only — the operational payment
  path is fully decoupled (that's the design's point), so user-facing payments are
  untouched. Fraud-signal staleness is the one real risk; name it and its
  mitigation (fraud-critical checks live in the gateway path, not behind CDC).
- *Trap answer:* not knowing whether payments depend on the pipeline. You built the
  decoupling — claim it.

---

## Bullet 4 — Gateway hardening

### The layers (defense in depth, each with its mechanism)

1. **Device-fingerprint validation (Aerospike):** every pay call must present device
   details matching the fingerprint stored at device-binding time (SIM+OTP
   ceremony). Aerospike because this is a sub-ms read on the critical path of every
   payment at [X]k QPS — in-memory-class latency with persistence. Blocks tampered/
   unbound devices *before* any transaction exists.
2. **Request dedup under retry storms:** clients retry on timeout (mobile networks);
   without dedup, one tap = N transactions. The UPI request ID is checked/registered
   in Aerospike (short-TTL token set) so retries collapse onto the first request.
   This is the *front* line of the idempotency story that continues through PSP/NPCI
   (see B1). Key detail: dedup by *client-generated* request identity, not payload
   hash **[verify the exact key]**.
3. **Rate limiting** on sensitive endpoints (balance checks, eligibility, MPIN
   attempts) — abuse and brute-force control, and load protection for downstreams.
4. **Two-tier auth:** internal service auth (bearer/AuthN) for app-originated calls
   via the BFF chain, session-based auth (Kevlar) for web — plus separate
   authentication for partner callbacks.
5. **HMAC webhook verification:** provider callbacks carry an HMAC signature over
   the payload with a shared secret; the gateway recomputes and compares before
   trusting any state-changing callback. Without it, anyone who finds the public
   callback URL can move transaction states.

### 30–45 s spoken answer

> "The gateway enforces every cross-cutting control so downstream services never
> re-implement them: device-fingerprint validation against Aerospike on every pay
> call — sub-millisecond at payment QPS — so unbound devices die before a
> transaction exists; request dedup keyed on the client's UPI request ID in a
> short-TTL Aerospike set, because mobile clients retry on timeout and one tap must
> never become two debits; rate limiting on abuse-sensitive endpoints; two auth
> tiers for app versus web sessions; and HMAC verification on provider webhooks,
> because an unauthenticated callback endpoint is an open invitation to forge
> payment outcomes. The theme is: everything that must be true for every payment is
> enforced once, at the boundary."

### Attack tree

**D1. "HMAC verifies integrity. What about replay — I capture a valid signed
callback and send it again tomorrow?"**
- *Model answer:* signature alone doesn't stop replay; the defenses are (a) the
  callback's business identity maps onto a transaction whose state machine won't
  regress or re-apply (idempotent consumption — our actual primary defense), and
  (b) timestamp-in-signed-payload with freshness window / nonce if the provider
  supports it **[verify what Juspay actually signs — know your own contract]**.
  Honest shape: "integrity by HMAC, replay-safety by idempotent state transitions."
- *Trap answer:* "HMAC prevents replay." It cryptographically cannot; this is a
  standard security probe.

**D2. "Your dedup cache (Aerospike) has a blip — 30 s of failed reads. Fail open or
fail closed on payments?"**
- *Model answer:* reason out loud: fail-closed (reject when dedup can't be checked)
  = availability incident on ALL payments from a cache blip; fail-open = a window
  where a retry could double-create — but the next layers (PSP/NPCI txn-identity
  dedup) still catch true duplicates, so fail-open is defensible *because* dedup is
  layered. State what your system actually does **[VERIFY]**, then the reasoning.
  This question is asked precisely because both answers are defensible — they're
  scoring the reasoning, not the letter.
- *Trap answer:* an instant answer with no trade-off analysis, either direction.

**D3. "Which rate-limiting algorithm, and why does the choice matter at a payment
gateway?"**
- *Model answer:* know what yours is **[verify — likely token bucket or fixed/
  sliding window in the gateway framework]**, then show you understand the space:
  token bucket allows controlled bursts (right for user-facing payment traffic —
  humans are bursty), fixed windows have boundary spikes (2× at window edges),
  sliding-window counters fix that for ~O(1) cost; and at a *gateway* the limiter
  must be distributed-consistent-ish (per-instance limits multiply by pod count —
  either centralize counters in Aerospike/Redis or accept the multiplier and set
  limits per-instance deliberately). Full treatment: `05-resilience/05-rate-limiting.md`.
- *Trap answer:* "we rate limit" as an atomic fact. The follow-up is always "how".

---

## Self-test (answers hidden below)

1. Give all four legs of the async-path justification. Which one survives the
   "Netty/virtual threads exist" attack, and why?
2. Write the exact sequence: user taps Pay → what happens, in order, through
   terminal state — including where each failure would be caught.
3. DB write succeeded, Pulsar publish failed. What repairs it, within what bound?
   What pattern removes the gap entirely, and what infra of yours would power it?
4. Storm replays a send-money tuple after the PSP call already succeeded. Walk the
   three layers that prevent a double debit.
5. Why does the DLQ force-query instead of replay — and why is receive-money exempt?
6. "Retry the question, never blindly retry the action" — explain what makes an
   action safe to retry directly. Name the property.
7. Defend one-topology-for-four-paths, including the honest cost and the split
   trigger.
8. What ordering does the CDC pipeline guarantee, what doesn't it, and what
   downstream discipline makes the gap harmless?
9. Why does CDC beat app-level dual-write? Name the exact failure dual-write
   suffers.
10. Why filter CDC events on column qualifier?
11. HMAC on webhooks: what property does it provide, what property does it NOT, and
    what covers the gap?
12. Dedup cache outage: argue fail-open AND fail-closed in two sentences each, then
    state which is right here and the single fact that decides it.
13. Queue backlog is growing at max consumer parallelism. List your actions in
    order, with the metric that triggers each.

<details>
<summary><b>Answers</b></summary>

1. (i) Durability of intent (accepted payment survives process death); (ii) resource
   decoupling from partner tail latency (Little's Law sizing); (iii) independent
   scaling + visible backpressure via queue depth; (iv) the domain is asynchronous
   (outcomes arrive as callbacks). Leg (i) survives: NIO/virtual threads make
   holding connections cheap but still couple execution state to process/client
   liveness — they optimize concurrency, not reliability.
2. Gateway: device-fingerprint check (Aerospike) → request dedup (Aerospike token) →
   rate limit/auth → txn-svc writes INITIATED (HBase) → publish execution event
   (Pulsar) → API returns → Storm consumes → PSP send-money (long timeout) → PSP/
   NPCI/banks execute → status update to txn-svc (PENDING → terminal) → CDC +
   notification fan-out. Failures: gateway rejects pre-creation; publish failure →
   stuck-by-birth caught by recon/status-check; Storm/PSP failure → replay → DLQ →
   force-query; stale updates rejected by state machine.
3. Recon/status sweeps find non-terminal rows past age threshold and force-drive
   resolution; the client's own status polling can also trigger it. Bound = sweep
   interval + processing. Transactional outbox removes the gap — emit the event
   from the committed DB mutation — and your existing HBase→Pulsar CDC is exactly
   the machinery that could power it.
4. (1) Gateway dedup means one user intent = one txn identity. (2) PSP/NPCI dedup
   on that transaction identity: a repeat submit for the same txn returns current
   state, doesn't re-debit. (3) txn-svc state machine rejects regressions/
   re-applications from stale replayed updates. Net: replays collapse onto one
   money movement.
5. After exhausted retries you can't know how far any attempt got (timeout ≠
   failure); re-executing risks double debit, dropping strands money. Force-query
   converges our record to the source of truth. Receive-money makes no external
   money action — it's a local idempotent record write, so direct retry is safe.
6. Idempotency: applying the action N times ≡ once (stable identity + dedup at the
   effector, or a pure/upsert write). If and only if the action is idempotent,
   retrying the action IS retrying the question.
7. For: one deploy/monitor/capacity unit, shared domain logic, the true bottleneck
   (PSP capacity) is shared regardless; per-component parallelism + downstream
   bulkheads + fast sideline give most of the isolation. Cost: shared worker
   capacity → cross-path interference under floods/poison storms. Trigger:
   sustained cross-path SLO violation → split hottest path (P2P) out first.
8. Guaranteed: per-row (per-region stream) order in the happy path. Not: cross-row/
   cross-region order, and order under retries/DLQ. Discipline: events carry
   version/modTime; consumers upsert with last-write-wins on version, so stale
   events can't overwrite newer state.
9. App write + event publish can't be atomic; a crash between them (or a partial
   failure) silently diverges store and stream, and nothing detects it. CDC derives
   the stream from committed mutations — it can lag but cannot disagree.
10. A row has many cells; most cell writes are bookkeeping, and mutation volume ≫
    business-event volume. Gating on the qualifier that encodes the business change
    (e.g., timeline) prevents fan-out amplification and duplicate entity emissions.
11. Provides: integrity + authenticity (payload signed by secret-holder). Not:
    freshness — a captured valid message verifies forever. Covered by idempotent,
    state-machine-guarded consumption (and timestamp/nonce freshness if the
    provider signs one).
12. Fail-closed: no payment proceeds unverified, but a cache blip becomes a full
    payment outage — availability catastrophe for a low-probability duplicate.
    Fail-open: payments continue; a duplicate window opens but PSP/NPCI identity
    dedup still catches true doubles. Right answer here: fail-open — the deciding
    fact is that dedup is *layered*, so the gateway check is not the last line of
    defense. (State your system's actual behavior after verifying it.)
13. (1) Confirm it's demand not poison: DLQ/sideline rate metric — if poison, eject.
    (2) Scale consumers/workers — backlog trend at max parallelism is the trigger.
    (3) Check downstream (PSP latency/breaker state) — if the bottleneck is the
    partner, scaling consumers just moves the queue; pace instead. (4) Backlog *age*
    crossing product tolerance → shed at the gateway (rate limit new submissions).
    (5) Throughout: alert on oldest-event age, not just count.

</details>
