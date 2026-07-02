# Idempotency

The keystone of the whole resilience arch. Timeouts create unknown outcomes;
retries and at-least-once delivery repeat requests; failovers replay work — and
all of it is survivable only if repeating an operation is harmless. Your resume
touches idempotency in four separate places (gateway dedup, rewards markers,
webhook consumption, force-query convergence), which makes this the topic where
an interviewer can hand you the whiteboard and say "design it" expecting mastery.
This doc delivers that mastery.

---

## 1. Plain definition

An operation is **idempotent** if performing it N times has the same effect as
performing it once: f(f(x)) = f(x). "Same effect" means *on the system's state*
— the caller may get the same response replayed, but the money moves once, the
row updates once, the email sends once.

Analogy: an elevator button. Pressing it five times ≠ five elevator trips — the
system absorbed the repeats into one intent. Contrast a vending machine coin
slot: five coins = five charges. Distributed systems are full of impatient
button-pressers (retries, redeliveries, replays); your job is to build elevator
buttons, not coin slots.

Why it's non-negotiable rather than nice-to-have: every reliability mechanism
in the stack **manufactures duplicates as a side effect of its job** — client
retries on timeout, queue redelivery on unacked messages, stream-processor
replay on worker death, failover re-execution, recon re-drives. The
alternative to idempotency is exactly-once delivery, which does not exist
end-to-end across trust boundaries (see §3). At-least-once delivery +
idempotent processing = effectively-once **outcome** — that equation is the
architecture of your entire platform.

Vocabulary precision (cheap senior points):
- **Idempotency** ≠ **determinism** (same answer for same input) — a
  GET is both; "set-status=SUCCESS" is idempotent but its *response* may
  differ if state moved meanwhile.
- **Naturally idempotent:** absolute writes (`x = 5`, PUT-semantics, upserts,
  deletes) — repeats are free. **Not naturally idempotent:** relative writes
  (`x += 5`, append, "create new", "send") — these need machinery.
- **Commutativity** is the stronger sibling: order-independence (a ∘ b =
  b ∘ a). Idempotency survives duplicates; commutativity also survives
  reordering. Your rewards design needed both — duplicates (redelivery) and
  reordering (two channels, shared subscriptions).

---

## 2. How it works in practice

### 2.1 The idempotency-key pattern (the Stripe-shaped answer — know it cold)

For APIs whose operations are *inherently* non-idempotent ("create a payment"),
the client attaches a unique **idempotency key** (UUID per logical intent);
the server remembers keys it has seen and the outcome each produced.

The mechanics that separate a working design from a hand-wave:

1. **Key scope:** key is unique per *logical intent*, scoped to (client/
   endpoint) — the same key on the same endpoint means "same intent, dedupe
   me"; a retry reuses the key, a genuinely new action gets a new key. The
   server treats (scope, key) as the identity.
2. **The check-and-act race:** "look up key; if absent, execute; store
   result" has a window — two concurrent duplicates both find it absent.
   The check must be an **atomic reservation**: insert the key with state
   `IN_PROGRESS` under a uniqueness constraint (or CAS/`checkAndPut`/
   `SETNX`); exactly one wins and executes; the loser either waits/polls or
   receives 409/`RetryLater` — never executes in parallel.
3. **The key record is a state machine, not a flag:** `IN_PROGRESS →
   SUCCEEDED(response) | FAILED(error class)`. Crash after reservation but
   before completion leaves `IN_PROGRESS` — the retry must not hang forever
   (lease/timeout on the reservation, after which recovery logic decides:
   re-execute if the underlying work is verifiably absent, or reconcile).
   This crash case is where interviewers go first — see P1.
4. **Response replay:** duplicates of a completed key get the *stored
   response* (same status, same body) — the retry is indistinguishable from
   the original to the caller. Decide retention: keys live for the maximum
   plausible retry horizon (24 h is a common API default; your gateway
   dedup tokens use short TTLs matched to client retry windows
   **[VERIFY yours]**), while the *business* identity (txn ID) lives forever.
5. **Same key, different payload:** reject loudly (422/409) — it's a client
   bug, and silently honoring either payload corrupts intent.

### 2.2 Identity without client keys: natural/business identity

When you control both sides or the domain has a true identity, derive the key
from the business: (txnId, offerId) for a reward; UMN for a mandate; your UPI
request ID from the client app. **Payload hashing is a trap** as identity:
two legitimate identical payments ("send ₹100 to Mom", twice, on purpose)
hash identically — you'd silently drop the second; and trivial payload
differences (timestamp field) make true duplicates hash differently. Identity
must capture *intent*, and only the intent-holder (client or business domain)
knows it. This distinction — delivery-dedup vs business-dedup — is the exact
line your rewards design drew (arsenal B1) and a favorite probe.

### 2.3 Making the operation itself idempotent (often better than keys)

- **Absolute-state writes:** replace "increment balance" with "set balance to
  X computed from ground truth" — your rewards re-derivation is precisely
  this transformation (delta → replacement).
- **Conditional writes:** CAS on version — a replay's precondition fails
  harmlessly (your aggregate updates).
- **State machines with legal-transition guards:** re-applying "PENDING →
  SUCCESS" to a SUCCESS row is a no-op; regressions rejected (your txn and
  mandate handlers, your webhook consumption).
- **Upserts keyed by identity:** the CDC/analytics consumers — replays
  overwrite themselves.
The pattern hierarchy: prefer *structurally* idempotent operations (nothing
to remember), fall back to identity + dedup memory when the effect is
external or inherently "create/send"-shaped.

### 2.4 The layering (your platform as the worked example)

One user tap, four identity layers, each absorbing what leaks past the one
above:

| Layer | Identity | Absorbs |
|---|---|---|
| Gateway | UPI request ID in Aerospike (TTL window) | Client/mobile retry storms |
| Txn service | Transaction row + state machine | Anything re-driving creation |
| PSP/NPCI | Transaction identity in the network | Storm replays, redelivered executions |
| Recon | Force-query convergence | Everything else — the backstop |

Defense in depth is what licenses each layer to be imperfect (the dedup cache
can fail open — arsenal D2 — because it is not the last line).

---

## 3. Senior-level depth

- **"Exactly-once" — say it precisely or get destroyed:** exactly-once
  *delivery* across arbitrary boundaries is impossible (Two Generals — an
  unacknowledgeable last message always exists). What real systems offer is
  exactly-once *processing/state-update* within a closed scope (Kafka
  transactions/Flink checkpoints: consume-process-produce inside one
  transactional domain) — and the moment a side effect crosses the boundary
  (HTTP call, email, NPCI debit), you're back to at-least-once + idempotent
  effector. The interview-grade sentence: *"exactly-once state inside a
  transactional scope, effectively-once effects via identity — end-to-end
  exactly-once side effects is a contradiction."*
- **Idempotency has a freshness horizon:** dedup memory is finite; a
  duplicate arriving after key expiry executes again. Horizon = max
  plausible replay window per channel (client retries: minutes; queue
  redelivery: retention window ~days; recon re-drives: design for it
  explicitly with business identity, which never expires). Mismatched
  horizons are a real bug class: 5-minute dedup TTL + 5-day queue retention
  = replayable money.
- **Idempotent ≠ side-effect-free on the *response* path:** replayed
  responses must not re-trigger downstream actions in the caller (webhooks
  that fire "payment.success" on every status read). Emitting events belongs
  to the state *transition* (fire once when PENDING→SUCCESS commits), not to
  the state *observation*.
- **Cross-system idempotency needs agreed identity:** you and the partner
  must share the key (their requestId, your txnId, NPCI's identity) —
  and the contract must say which field it is and how long they honor it.
  "What's the PSP's dedup key and window" is a question you flagged to
  verify (arsenal gap list) — it is *the* load-bearing fact of your
  double-debit answer.
- **Fencing is idempotency's dual:** idempotency makes the *same* actor's
  repeats safe; fencing (epochs/tokens) makes a *stale* actor's writes safe.
  Systems need both — your version column is simultaneously an OCC device
  and a fence against zombie consumers.
- **L4/L5/L6:** L4 — "we use idempotency keys." L5 — atomic reservation +
  state-machine key records + crash semantics; identity-vs-payload;
  structural idempotency preferred; layered horizons; the exactly-once
  boundary argument. L6 — idempotency as platform contract: every internal
  API declares its identity field and dedup window; event schemas carry
  intent IDs from birth; recon as the universal backstop, budgeted and
  measured.

---

## 4. Resume connection

You built all four canonical shapes — say them as a taxonomy, not anecdotes:

1. **Dedup-memory shape:** gateway UPI-request-ID tokens in Aerospike
   absorbing client retry storms (short-TTL identity cache; the reservation
   pattern in its simplest form).
2. **Structural shape:** rewards — natural keys collide replays onto the
   same row; `is_aggregated` marker = completion state machine; CAS = the
   loser's writes fail; re-derivation = delta-to-replacement transformation.
   (The full crash matrix lives in `00-resume-arsenal/02-upi-rewards.md`.)
3. **State-machine shape:** webhook/callback consumption and txn updates —
   transition guards make redelivered callbacks no-ops and reject
   regressions; replay-safety without any memory beyond the entity itself.
4. **Backstop shape:** recon force-query — convergence to authority is
   idempotent by construction (asking twice changes nothing), which is why
   it can safely re-drive anything.

**30–60 s spoken answer** ("how do you handle duplicate requests?"):

> "By assuming duplicates are the normal case — every mechanism that makes
> our platform reliable manufactures them: client retries, Pulsar
> redelivery, Storm replay, recon re-drives. The design taxonomy has four
> shapes, and we run all of them. At the gateway, a dedup memory: the
> client's UPI request ID reserved atomically in Aerospike, so a retry
> storm collapses to one transaction. In rewards, structural idempotency —
> replays collide onto natural business keys, a completion marker tells a
> redelivery how far the crashed attempt got, and recovery re-derives from
> ground truth rather than re-applying deltas, because replacement is
> idempotent and increments aren't. On callbacks and transaction updates,
> state machines: a redelivered 'SUCCESS' onto a SUCCESS row is a no-op and
> regressions are rejected — replay-safe with no memory beyond the entity.
> And underneath everything, the backstop: reconciliation force-queries the
> source of truth, which is idempotent by construction. The layering is the
> point — it's why the gateway cache can fail open without risking money:
> it was never the last line of defense."

---

## 5. What the interviewer will push on

**P1. "Design idempotency for a payment-create API. I'm going to crash your
server at the worst moment."** (the whiteboard classic — the crash is the
question)
- *Model:* client sends `Idempotency-Key` per intent. Server: atomic
  reservation — insert (scope, key, IN_PROGRESS, lease) under uniqueness;
  winner executes, stores outcome + response, flips to
  SUCCEEDED/FAILED; duplicates of completed keys get the stored response;
  concurrent duplicate during IN_PROGRESS waits or gets 409-retry-later.
  Now the crash: reservation exists, work state unknown. On retry after
  lease expiry: **do not blindly re-execute** — recover by *querying* the
  downstream effect (was the txn created? ask the store/PSP by business
  identity), then either complete the record or re-execute knowing the
  effect is absent. If the downstream is itself keyed by the same identity
  (propagate the key!), blind re-execution becomes safe — propagation is
  the elegant fix. Finish with: same-key-different-payload → 422; retention
  = retry horizon; keys per endpoint scope.
- *Trap:* the check-then-act race (non-atomic lookup) and "IN_PROGRESS
  forever" (no lease) — the two bugs the interviewer is fishing for. Also
  fatal: re-executing after crash without interrogating the effect.

**P2. "Why not hash the request payload as the key?"**
- *Model:* payload ≠ intent, in both directions. Two legitimate identical
  intents (₹100 to Mom, twice deliberately) share a hash — you'd silently
  swallow real money movement #2. Two representations of one intent
  (client retry adds a timestamp/trace field) hash differently — the true
  duplicate sails through. Identity must be minted by the intent-holder
  (client key) or exist in the domain (business ID); hashes are neither.
  Concede the legitimate use: payload hash as a *secondary sanity check*
  (same key + different payload-hash ⇒ 422).
- *Trap:* accepting the premise, or rejecting it without the two-direction
  argument.

**P3. "Your dedup TTL is 15 minutes. Your queue retains for 5 days. Find the
bug."**
- *Model:* horizon mismatch — a message redelivered on day 2 (backlog,
  DLQ replay, recon re-drive) meets a dedup memory that has forgotten it;
  the effect executes twice. Fixes: match dedup horizon to the *longest*
  replay channel, or better — don't rely on TTL'd memory for long-horizon
  channels: those must hit *structural* idempotency (business identity in
  the store: the txn row itself, state-machine guards) which never expires.
  Generalize: TTL'd dedup for high-frequency/short-horizon storms;
  permanent business identity for everything that can legally replay late.
- *Trap:* "make the TTL 5 days" — you've bought memory cost and still lose
  to the recon re-drive at day 6; the structural answer is the point.

**P4. "The team says our Kafka+Flink pipeline gives exactly-once, so
consumers don't need idempotency. Attack or defend."**
- *Model:* attack, precisely. Exactly-once there means *state updates
  inside the transactional scope* (offsets+state+outputs commit
  atomically). Valid — until any effect leaves the scope: an HTTP call to
  a partner, an email, a debit. Those fire during processing and are NOT
  rolled into the transaction — on failure+replay they repeat.
  So: exactly-once state, at-least-once side effects; external effectors
  still need identity/idempotency. Two Generals for why end-to-end
  delivery guarantees can't close the gap. Defend only the narrowed claim.
- *Trap:* either full agreement ("great, no dedup needed") or a blanket
  "exactly-once is a myth" — both miss the scope boundary that IS the
  correct answer.

**P5. "A webhook consumer processes `payment.success` and, as part of
handling, sends a confirmation email. The webhook redelivers. How many
emails?"**
- *Model:* with naive handling, N emails — the handler is idempotent in
  *state* (transition guard no-ops the redelivery) only if the email hangs
  off the *transition*, not the handler invocation. Correct shape: the
  guarded transition PENDING→SUCCESS fires exactly one domain event
  ("became-success"), and the email sender consumes that with its own
  identity (emailId = txnId+type) and the provider's dedup if any. Even
  then: the email API call itself can time out ⇒ unknown outcome ⇒ possible
  duplicate email — accept it (emails are retry-tolerant) and say so:
  matching the idempotency *effort* to the effect's *stakes* is the mature
  close (duplicate email: shrug; duplicate debit: never).
- *Trap:* "the state machine makes it idempotent" without noticing the
  email rides the invocation, not the transition — the exact bug this
  question exists to catch.

---

## Self-test

1. Define idempotency precisely, distinguish it from determinism, and give
   the naturally-idempotent vs needs-machinery write taxonomy.
2. Why is idempotency non-negotiable? Name four duplicate factories in your
   own platform.
3. The idempotency-key pattern: all five mechanics (scope, reservation,
   state machine, replay, payload conflict).
4. The crash between reservation and completion: what state remains, and
   what are the two legitimate recovery paths?
5. Why is payload hashing the wrong identity? Both failure directions.
6. Delivery-dedup vs business-dedup: define, and locate the line in your
   rewards design.
7. State the exactly-once sentence (scope-precise), and where the boundary
   sits in a Kafka/Flink pipeline.
8. The freshness-horizon bug: construct it and give the structural fix.
9. Idempotency vs fencing: what does each make safe, and which artifact of
   yours is both?
10. Map your platform's four idempotency shapes with one mechanism each.
11. Why must events fire off state *transitions* rather than handler
    *invocations*? Which probe does this answer?
12. "Effectively-once" — write the equation and name which side of it each
    of your layers implements.

<details>
<summary><b>Answers</b></summary>

1. N applications ≡ 1 application, measured on system state. Determinism is
   same-output-for-same-input — orthogonal (an idempotent set-status may
   return different responses as state moves). Naturally idempotent:
   absolute writes — set/PUT/upsert/delete. Needs machinery: relative
   writes — increment/append/create/send.
2. Because reliability mechanisms manufacture duplicates as their normal
   operation: mobile-client retry storms, Pulsar nack/timeout redelivery,
   Storm tuple replay on worker death, recon/DLQ re-drives (also: failover
   re-execution, backfills).
3. (1) Key = client-minted per logical intent, identity = (scope, key).
   (2) Atomic reservation: unique insert/CAS of IN_PROGRESS — losers never
   execute concurrently. (3) Key record is a state machine with a lease:
   IN_PROGRESS→SUCCEEDED(resp)|FAILED. (4) Completed-key duplicates get the
   stored response verbatim. (5) Same key + different payload ⇒ 422/409,
   never silent choice.
4. IN_PROGRESS with expired lease; work's real progress unknown. Paths:
   (a) interrogate the effect by business identity (was the txn created?)
   then complete-or-execute accordingly; (b) if the identity was propagated
   into the downstream effector, re-execute blindly — the downstream dedup
   collapses it.
5. Same-hash-different-intent: two deliberate identical payments — second
   silently swallowed (lost legitimate money movement). Different-hash-
   same-intent: retry with a mutated incidental field (timestamp) — true
   duplicate passes. Identity encodes intent; only the intent-holder or the
   domain can mint it.
6. Delivery-dedup: collapse repeated deliveries of one event (rewards
   natural keys + marker). Business-dedup: whether two *distinct* events
   should stack (offers + gamification rewards on one txn — allowed, by
   business rule). The rewards keys deliberately dedupe per-channel only;
   cross-channel stacking is upstream business logic.
7. "Exactly-once state updates inside a transactional scope;
   effectively-once external effects via identity; end-to-end exactly-once
   side effects is a contradiction (Two Generals)." Boundary: the Kafka
   transaction commits offsets+state+produced-records atomically; any HTTP
   call/email/debit inside processing escapes the transaction and replays.
8. Dedup TTL (15 min) shorter than a replay channel's horizon (5-day queue
   retention, DLQ/recon re-drives) ⇒ late redelivery executes twice. Fix
   structurally: long-horizon channels must land on permanent business
   identity (the entity row + state-machine guards), reserving TTL'd
   memory for short-horizon storms.
9. Idempotency: the same actor's repeats are safe. Fencing: a stale actor's
   (zombie's) writes are safe — rejected by epoch. The rewards version
   column is both: CAS makes concurrent/duplicate applies fail harmlessly
   AND fences a paused consumer holding a stale version.
10. Dedup memory: gateway UPI-request-ID tokens in Aerospike (atomic
    reservation, TTL). Structural: rewards natural keys + is_aggregated
    marker + CAS + re-derivation. State machine: txn/mandate/webhook
    transition guards (no-op replays, reject regressions). Backstop: recon
    force-query — idempotent convergence to authority.
11. Invocations repeat (redelivery); transitions commit once (guarded).
    Effects hung on invocations fire N times; effects emitted by the
    committed transition fire once per real state change. Probe P5 (the
    duplicate confirmation email).
12. At-least-once delivery + idempotent processing = effectively-once
    outcome. Delivery side (the "at-least-once"): Pulsar redelivery, Storm
    replay, client retries. Idempotent-processing side: gateway dedup, txn/
    PSP/NPCI identity, state-machine guards, CAS+markers+re-derivation,
    recon convergence.

</details>
