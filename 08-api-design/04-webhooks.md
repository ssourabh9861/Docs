# Webhooks — Signing, Retries, Ordering, Verification

You built and operate webhook receivers (Juspay/super.money callbacks with
HMAC verification, buffered through Pulsar) — so this is a lived surface, not
a textbook one. This doc covers both sides (sending and receiving) because
interviewers probe both, and the payments-grade concerns — signing, replay,
ordering, the callback-race — are exactly the ones you solved in production.

---

## 1. Plain definition

A **webhook** is a reverse API call: instead of the client polling you for
changes ("is the payment done yet?"), you POST to *their* HTTP endpoint when
the event happens ("payment.succeeded"). It inverts control — the integrator
provides a URL, you call it — trading polling's wasted requests and latency
for the operational burden of calling into endpoints you don't control and
can't trust.

The framing that organizes the whole topic: **a webhook is an event
delivered over untrusted, unreliable HTTP to a party who might be down,
slow, hostile-to-impersonate, or process it twice.** Every design decision
answers one of those: signing (untrusted → prove it's you), retries
(unreliable → survive their downtime), idempotency guidance (twice →
consumer safety), and the push+pull pattern (delivery isn't guaranteed →
they must be able to reconcile). If you can name those four adversaries and
the four defenses, you've framed it like someone who runs one.

---

## 2. Sending webhooks (the provider side)

### 2.1 Signing (the security core)

Sign the payload so the receiver can verify it came from you and wasn't
tampered with: **HMAC-SHA256** over the raw body (+ a timestamp) with a
per-subscriber shared secret; send the signature in a header
(`X-Signature: t=...,v1=...`). Receiver recomputes HMAC over the raw bytes
and constant-time-compares. Critical details that are the actual content:
- **Sign the raw bytes, not the parsed-then-reserialized body** — JSON
  re-serialization reorders keys and breaks the signature (the #1
  webhook-verification bug).
- **Constant-time comparison** — `==` on signatures is a timing-oracle
  (a real, exploited class); use a constant-time compare.
- **Include a timestamp in the signed payload** and reject stale ones —
  because HMAC proves integrity+authenticity but NOT freshness: a
  captured valid webhook replays forever without it (`00-resume-arsenal/03`
  D1 — your exact answer). Signature + timestamp-window + idempotent
  consumption = replay-safe.
- **Secret rotation:** support two active secrets during rotation
  (verify against either) so rotation isn't an outage — the
  operational detail that separates "added HMAC" from "operates HMAC."
- Asymmetric alternative (name it): sign with your private key, receiver
  verifies with your public key — no shared secret to leak on their
  side; heavier, used by larger platforms.

### 2.2 Delivery reliability

Their endpoint will be down — design for it: retry with exponential
backoff + jitter (`05-resilience/04`) over a long window (minutes to days —
Stripe retries up to ~3 days); a **dead-letter/disabled state** after
sustained failure (auto-disable an endpoint that 4xxs/times-out for N
hours, alert the integrator — an endpoint returning 410 forever must not
be retried forever). Delivery attempts logged and visible (a dashboard
the integrator can inspect + manually re-send) — because "did you send it?"
is the #1 support question, and the answer must be self-serve.

### 2.3 Ordering and the honest guarantee

Webhooks are **at-least-once and unordered** by default — say this
plainly; promising ordered exactly-once delivery over retried HTTP is a
lie (the same delivery-semantics truth as everywhere,
`04-messaging-streaming/04`). Retries reorder; a slow-then-retried event
arrives after its successor. So: include a sequence number / event
timestamp so the *receiver* can order (or detect gaps), and design events
to be independently processable. If strict order is truly needed, that's
a different, expensive contract (per-subscriber ordered queue with
head-of-line blocking) — usually the answer is "don't; send state, let
them reconcile."

## 3. Receiving webhooks (your production surface)

The receiver's job, in order: **verify → ack fast → process async →
reconcile.**

1. **Verify** the signature (§2.1) before trusting a single byte — an
   unverified state-changing callback endpoint is an open door to forge
   payment outcomes.
2. **Ack fast (2xx immediately), process asynchronously** — the sender
   retries if you're slow, so a synchronous heavy handler causes
   duplicate deliveries and couples your processing latency to their
   retry policy. Ack receipt, enqueue, process off the hot path. **This
   is your callback-buffering fix** (`00-resume-arsenal/01` bullet 2):
   buffer to Pulsar, process with retry-until-consistent, so a callback
   arriving before your own state is persisted doesn't corrupt state.
3. **Process idempotently** — at-least-once means duplicates; dedupe on
   the event ID, apply via state-machine transition guards so replays
   and out-of-order arrivals are no-ops/rejected
   (`05-resilience/07`). Your exact design.
4. **Reconcile** — because delivery isn't guaranteed, the receiver must
   also be able to *pull* (poll status / query the provider) for
   anything a webhook should have reported but didn't. Push for latency,
   pull for truth — the standing pattern, and the reason webhooks alone
   are never sufficient for money.

## 4. Senior-level depth

- **The push+pull duality is non-negotiable for correctness:** a webhook
  is an *optimization* of a poll, never a replacement — endpoints break,
  networks partition, retries exhaust. Any integration that relies on
  webhooks *alone* for money-critical state has an unbounded silent-loss
  window; the pull/reconcile path bounds it (your recon/force-query,
  `14-.../05`). This sentence is the single most senior thing to say
  about webhooks.
- **The callback-race is the receiver's signature problem** and you
  solved it: the provider's callback can beat your own synchronous
  persist; buffering + delayed/retried async processing + idempotent
  apply resolves it without coordinating the two paths
  (`00-resume-arsenal/01` B1 — the full attack tree).
- **Verification bugs are the common CVE class:** raw-body signing,
  constant-time compare, timestamp freshness, secret rotation — each is
  a real production incident when missed; being able to list them is
  security-aware seniority.
- **L4/L5/L6:** L4 "we POST events and sign them with HMAC." L5: raw-body
  HMAC + timestamp + constant-time + rotation on the send side;
  verify→ack-fast→async→reconcile on the receive side; at-least-once/
  unordered honesty; push+pull duality. L6: webhooks as a platform
  product — delivery dashboards, auto-disable, replay tooling,
  per-subscriber ordered options, and the org rule that webhooks are
  always backed by a queryable state API.

## 5. Resume connection + spoken answer

Everything here is your production reality: HMAC verification on Juspay/SM
callbacks, buffering through Pulsar to defeat the callback-race, idempotent
state-machine application, and recon as the pull backstop. The one thing to
add for interviews: frame your receiver as the canonical
verify→ack→async→reconcile pipeline, and name the four adversaries — it
elevates "we handle callbacks" into "I operate an untrusted-input event
pipeline."

**30–60 s spoken answer** ("how do you design webhooks?"):

> "A webhook is an event over untrusted, unreliable HTTP to a party who
> might be down, slow, spoofable, or process it twice — and each of those
> gets a defense. Untrusted: HMAC-SHA256 over the raw bytes with a
> per-subscriber secret, constant-time compared, and — the part people
> miss — a signed timestamp with a freshness window, because HMAC proves
> integrity, not freshness; a captured valid callback replays forever
> otherwise. Unreliable: retries with backoff and jitter over a long
> window, auto-disable after sustained failure, and a delivery log the
> integrator can inspect and re-send from. Processed-twice: events carry
> IDs and consumers dedupe, so at-least-once delivery — which is the
> honest guarantee, unordered — becomes effectively-once. On the
> receiving side, which is what I operate, the pipeline is
> verify-then-ack-fast-then-process-async: I acknowledge receipt
> immediately and process off the hot path, because a slow synchronous
> handler just triggers their retries and duplicate deliveries — and
> that async buffering, through Pulsar in our case, is also how we beat
> the callback race where the provider's callback arrives before our own
> state is persisted. And the non-negotiable: a webhook is an
> optimization of a poll, never a replacement — we always back it with a
> status-query and reconciliation path, because endpoints break and
> retries exhaust, and money can't have an unbounded silent-loss
> window."

## Self-test

1. Name the four "adversaries" a webhook faces and the defense for each.
2. Why sign the raw bytes, not the parsed body? What breaks otherwise?
3. HMAC proves what two properties and NOT which third? How is the
   third covered?
4. Why constant-time comparison? What's the attack class?
5. Secret rotation without an outage — the mechanism.
6. What's the honest delivery guarantee, and how does the receiver get
   ordering?
7. The receiver pipeline in four verbs, and why ack-fast matters.
8. The push+pull duality: why is a webhook never sufficient alone for
   money?
9. The callback-race: what is it, and how does async buffering solve it
   without coordinating the two paths?
10. Four webhook-verification bugs that are each a real incident.

<details>
<summary><b>Answers</b></summary>

1. Untrusted (spoofable) → HMAC signing + verification. Unreliable
   (endpoint down) → retries with backoff/jitter + auto-disable +
   delivery log. Processed-twice (duplicates) → event IDs + idempotent
   consumption. Not-guaranteed-delivery → push+pull: a status API and
   reconciliation backstop.
2. Because the receiver verifies against the exact bytes you signed;
   parsing then re-serializing JSON reorders keys, changes whitespace,
   and normalizes numbers/escapes — producing a different byte string
   whose HMAC won't match. Signing/verifying raw bytes is the only
   stable contract; it's the most common verification bug.
3. Integrity (payload untampered) and authenticity (from the
   secret-holder). NOT freshness — a captured valid message verifies
   forever. Covered by a signed timestamp with a rejection window
   (and idempotent consumption so an in-window replay is a no-op).
4. Byte-by-byte `==` returns early on the first mismatch, leaking
   timing that lets an attacker recover a valid signature one byte at
   a time (timing-oracle attack). Constant-time compare removes the
   signal.
5. Support two active secrets simultaneously: verify incoming
   signatures against either; issue the new secret, let integrators
   migrate, then retire the old. Single-secret rotation is a
   coordinated outage; dual-secret makes it seamless.
6. At-least-once and unordered. The receiver orders (or detects gaps)
   using a sequence number / event timestamp in the payload and
   processes events independently; strict ordering requires a
   separate expensive per-subscriber ordered-queue contract, usually
   avoided by sending state and letting the receiver reconcile.
7. Verify → ack-fast (2xx) → process async → reconcile. Ack-fast
   because the sender retries on slow/failed responses: a synchronous
   heavy handler causes duplicate deliveries and couples your
   processing latency to their retry timer; acknowledge receipt,
   enqueue, process off the hot path.
8. Delivery isn't guaranteed — endpoints break, networks partition,
   retry windows exhaust — so webhooks alone leave an unbounded
   silent-loss window; a pull path (status query + reconciliation)
   bounds divergence. A webhook is an optimization of a poll, not a
   replacement; money requires the poll to exist.
9. The provider's callback can arrive before your own synchronous flow
   persists the corresponding record; a naive handler updates a
   missing row and corrupts/loses state. Async buffering (ack, enqueue
   to Pulsar, process with retry-until-visible + idempotent
   state-machine apply) means the callback simply retries until the
   record exists — no synchronous coordination between the live flow
   and the callback path.
10. Verifying the reserialized body instead of raw bytes; non-constant-
    time signature comparison (timing oracle); no timestamp/freshness
    check (replay); no dual-secret rotation (rotation = outage, or
    worse, secrets never rotated). (Also: trusting the payload before
    verifying, and processing synchronously so retries duplicate.)

</details>
