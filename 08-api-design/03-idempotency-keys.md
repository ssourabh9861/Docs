# Idempotency Keys — The API Contract Version

The mechanism lives in `05-resilience/07-idempotency.md`; this doc is the
*API contract* view — how you expose idempotency to callers, what the header
promises, the crash semantics of the key store, and the design decisions
that turn "we support idempotency keys" into a defensible interface. This is
your single strongest API-design surface: your gateway dedup is exactly this
pattern in production.

---

## 1. Plain definition

An **idempotency key** is a caller-supplied unique token (per logical
intent) that the server uses to guarantee an operation *takes effect at most
once*, no matter how many times the request arrives. The header
(`Idempotency-Key: <uuid>`) turns a non-idempotent operation (POST — create
a payment, `01-rest-fundamentals.md` §1) into a **safely retryable** one:
the client can retry on any ambiguous outcome (timeout, 5xx, dropped
connection — the unknown cell, `14-distributed-transactions/01`) without
fear of duplicate effects.

Why the *caller* supplies it, not the server: only the caller knows what
"the same intent" means. Two identical-looking requests might be one intent
retried (dedupe) or two deliberate identical actions (₹100 to Mom, twice on
purpose — `05-resilience/07` §2.2's payload-hash trap). The key *is* the
statement of intent — the server can't infer it, which is why "hash the
body" is the wrong answer and "client mints a key per intent" is the right
one.

The contract the header makes, stated precisely (this is what you'd write in
your API docs): *"Retry a request with the same Idempotency-Key and the same
parameters, and you will get the same result as the first — the operation
executes once. Reuse a key with different parameters and you get a 4xx.
Keys are honored for N hours."* Every clause of that sentence is a design
decision below.

---

## 2. The mechanics as a contract (§1's clauses, unpacked)

### 2.1 The atomic reservation (the part that's actually hard)

Naive "check if key seen, else execute" has a race: two concurrent
retries both find the key absent, both execute
(`05-resilience/07` §2.1). The contract-grade implementation:

1. **Reserve atomically:** insert `(scope, key) → IN_PROGRESS` under a
   uniqueness constraint (or `SETNX`/`checkAndPut` — your Aerospike
   generation-CAS does this natively). Exactly one caller wins the
   insert and proceeds; losers see the existing record.
2. **The loser's behavior is a contract choice:** return 409 `RetryLater`
   (simplest — the client re-polls), OR block-and-wait for the winner's
   result (nicer UX, but ties up a connection and needs a wait timeout).
   State which you chose; Stripe returns a 409-style "a request with this
   key is in progress."
3. **On completion, store the outcome:** `IN_PROGRESS →
   SUCCEEDED(response) | FAILED(error)`, persisting the full response
   (status + body) so replays are byte-identical.
4. **Replay = return the stored response**, indistinguishable from the
   original. The client cannot tell whether it hit the real execution or
   a replay — which is the whole point.

### 2.2 The crash case (where interviewers live)

Server reserves `IN_PROGRESS`, executes, crashes before writing the
outcome. The retry arrives and finds `IN_PROGRESS` — for how long? Two
failure modes to avoid: **hang forever** (no lease → the key is
permanently stuck, every retry gets 409) and **blind re-execute** (assume
the crash meant nothing happened → double effect if the work actually
committed). The contract-grade answer:
- **Lease the reservation** (IN_PROGRESS has a TTL); after expiry, a
  retry may proceed — but *not blindly*: it must reconcile ("did the
  work actually happen?") by querying the downstream effect by the same
  identity, OR the downstream itself is keyed by the propagated key so
  re-execution collapses (`14-.../04` inbox pattern).
- **Propagate the key downstream** so idempotency is end-to-end, not
  just at the edge — your layered identity chain
  (`00-resume-arsenal/03` B1): gateway key → txn identity → PSP/NPCI
  reference. The API-level key is layer one of a chain.

### 2.3 Key store design

- **Scope:** `(endpoint or resource-type, key)` — a key is unique per
  operation type, so the same UUID on `/payments` and `/refunds` doesn't
  collide. Some APIs scope per-account too (defense against cross-tenant
  key guessing).
- **Retention = the retry horizon** (Stripe: 24h). The mismatch bug:
  key TTL shorter than the longest replay channel (a job that retries
  for 3 days against a 24h key store = a re-execution —
  `05-resilience/07` §3's freshness-horizon bug). Match the store's
  horizon to the *longest* channel that can replay, or push long-horizon
  dedup down to permanent business identity.
- **Storage fit:** a KV store with TTL + atomic conditional writes —
  literally your Aerospike dedup tier (`02-databases/06`): sub-ms,
  TTL-native, generation-CAS for the reservation. Say it.

---

## 3. Senior-level depth

- **Same-key-different-body is a 422, loudly.** Storing a fingerprint of
  the request params alongside the key lets you detect a client bug
  (reusing a key for a different intent) and reject it — silently
  honoring either body corrupts intent. This is a contract *safety*
  feature, and forgetting it is the subtle gap interviewers probe.
- **What idempotency keys do NOT give you:** they dedupe *deliveries of
  one intent*, not *distinct intents about the same entity*. "One
  payment per order" is a different constraint (order-level uniqueness),
  not an idempotency-key job — the delivery-dedup vs business-dedup line
  (`05-resilience/07` §2.2). Conflating them is the double-charge
  runbook's root confusion (`07-system-design/01` probes).
- **Idempotency keys vs conditional requests (ETag/If-Match):** keys make
  *creates* safe to retry (POST); conditional requests make *updates*
  safe against lost-update (PUT/PATCH with If-Match on an ETag/version —
  the OCC pattern, `02-databases/04`, at the HTTP layer). Different tools
  for different verbs; a strong answer names both and their verb
  affinity.
- **The response-replay subtlety:** a replayed response must not
  re-trigger side effects *in the caller* — if your "response" includes
  a webhook-fire or an event-emit, those belong to the state
  *transition*, not the response path (`05-resilience/07` P5's
  duplicate-email trap).
- **L4/L5/L6:** L4 "we accept an Idempotency-Key header." L5: atomic
  reservation with IN_PROGRESS leases, crash reconciliation, param-
  fingerprint 422, retention = retry horizon, key propagation
  end-to-end, and the keys-vs-conditional-requests distinction. L6:
  idempotency as a platform contract — every mutating internal API
  declares its key and horizon; the paved-road library enforces the
  reservation protocol so no team hand-rolls the race.

## 4. Resume connection + spoken answer

Your gateway dedup (UPI request ID in Aerospike, short TTL) IS the
idempotency-key pattern at the edge — the reservation is the
insert-if-absent token, the horizon is the client retry window, and the
downstream propagation is the txn→PSP→NPCI identity chain. The one honest
note: your keys are often *client-request-IDs from the app* rather than a
public `Idempotency-Key` header (internal contract vs public API) — say
that distinction; it shows you know the difference between an internal
dedup token and a published idempotency contract.

**30–60 s spoken answer** ("how do you make a POST safely retryable?"):

> "Idempotency keys — caller-supplied, one per logical intent, because
> only the caller knows what 'the same request' means; hashing the body
> is wrong in both directions — two deliberate identical payments look
> the same, and a retry with an added trace field looks different. The
> header's contract is: same key plus same params gives the same result
> and executes once; same key, different params is a 422; keys honored
> for the retry horizon. The implementation that actually earns that
> contract is an atomic reservation — insert the key as in-progress under
> a uniqueness constraint so exactly one concurrent retry wins and the
> losers get a 409 or wait; on completion store the full response so
> replays are byte-identical. The case that separates people who've run
> this is the crash between reserve and complete: the reservation is
> leased so it can't hang forever, and on retry after the lease you
> reconcile against the downstream effect rather than blindly
> re-executing — which is why the key propagates end to end, so
> idempotency is layered, not just at the edge. That's exactly our
> gateway: the UPI request ID reserved in Aerospike with a TTL, then
> carried through to the PSP and NPCI so a retry storm collapses to one
> debit at every layer."

## Self-test

1. Why must the caller supply the key? Give both failure directions of
   inferring it from the body.
2. State the four-clause contract the header makes.
3. Why is "check-then-execute" wrong, and what's the atomic fix?
4. The two behaviors for the losing concurrent request — trade-offs.
5. The crash-between-reserve-and-complete case: the two anti-patterns
   and the correct resolution.
6. Why propagate the key downstream? What does it make idempotency into?
7. Same-key-different-body: the response and why it's a safety feature.
8. Idempotency keys vs conditional requests (If-Match): verb affinity
   of each.
9. The retention-horizon bug: construct it.
10. Map your gateway dedup onto every element of the contract.

<details>
<summary><b>Answers</b></summary>

1. Only the caller knows intent. Body-as-identity fails both ways:
   two genuinely distinct identical intents (₹100 twice on purpose)
   hash the same → second silently dropped; one intent retried with a
   mutated incidental field (timestamp/trace) hashes differently →
   true duplicate passes through.
2. Same key + same params → same result, executed once; same key +
   different params → 4xx (422); keys honored for a stated horizon
   (retention); replays are indistinguishable from the original
   response.
3. Two concurrent retries both find the key absent and both execute
   (check-then-act race). Fix: atomic reservation — insert
   (scope,key)=IN_PROGRESS under a uniqueness constraint / SETNX /
   generation-CAS; exactly one insert wins, losers observe the
   existing record.
4. Return 409/RetryLater (simple, client re-polls — no held resources)
   vs block-and-wait for the winner's stored result (better UX, but
   holds a connection and needs a wait-timeout + fallback). State
   which; both are valid contracts.
5. Anti-patterns: hang forever (no lease → key permanently stuck,
   every retry 409) and blind re-execute (assume nothing happened →
   double effect if work committed). Correct: lease IN_PROGRESS with
   a TTL; after expiry, reconcile by querying the downstream effect by
   the same identity (or rely on downstream keyed by the propagated
   key so re-execution collapses).
6. So idempotency is end-to-end, not edge-only: the edge key becomes a
   layered identity chain (gateway → service txn ID → PSP/NPCI
   reference), and a retry that slips past one layer is caught at the
   next. It turns idempotency from a single wall into defense in
   depth.
7. 422 (reject). It's a safety feature because it catches a client bug
   — reusing a key for a different intent — that would otherwise
   silently honor one of two conflicting bodies and corrupt the
   caller's intent; requires storing a param fingerprint with the key.
8. Idempotency keys: creates (POST — server-assigned identity, no
   prior version to condition on). Conditional requests (If-Match on
   ETag/version): updates (PUT/PATCH — guard against lost update via
   OCC at the HTTP layer). Creates get keys; updates get conditions.
9. Key store TTL (say 24h) shorter than the longest channel that can
   replay the request (a batch/job retrying for 3 days, a DLQ
   re-drive): the late retry finds the key expired, the reservation
   is gone, and the operation executes a second time. Fix: match
   retention to the longest replay horizon or anchor long-horizon
   dedup on permanent business identity.
10. Caller key = the UPI request ID from the app (internal contract).
    Atomic reservation = insert-if-absent token in Aerospike
    (generation-CAS). Retention = short TTL matched to the client
    retry window. Response replay = returns the recorded outcome.
    Downstream propagation = txn ID → PSP → NPCI identity chain.
    (Honest note: it's an internal dedup token, not a published
    Idempotency-Key header — same pattern, different contract
    surface.)

</details>
