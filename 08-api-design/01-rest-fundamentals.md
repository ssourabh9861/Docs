# REST Fundamentals — Resources, Status Codes, Errors

API design is where your architecture meets other people's code — and unlike
internal design, mistakes here are *contracts*: shipped, depended-upon, and
nearly impossible to retract. You own a production API surface (gateway
endpoints, partner callbacks, internal service APIs), so this doc frames REST
not as vocabulary but as the contract-design discipline interviewers probe.

---

## 1. Plain definition

**REST** (Representational State Transfer) is an architectural style, not a
protocol: model your system as **resources** (nouns with identity —
`/payments/123`), manipulate them through a **uniform interface** (HTTP
verbs with fixed semantics), keep interactions **stateless** (every request
carries what's needed; no server-side conversation memory), and let
responses declare their **cacheability**. The payoff of the constraints:
any client, proxy, cache, or tool that understands HTTP understands your
API's mechanics — you inherit 30 years of infrastructure for free.

The verb contract (the part that's actually load-bearing):

| Verb | Semantics | Idempotent? | Safe? |
|---|---|---|---|
| GET | read | yes | yes (no side effects — caches/retries assume this) |
| PUT | replace at known identity | **yes** (absolute write) | no |
| DELETE | remove | yes (gone is gone) | no |
| POST | create / do (server assigns identity) | **no** — the problem child | no |
| PATCH | partial update | not inherently | no |

Notice this table is your idempotency taxonomy
(`05-resilience/07-idempotency.md` §1) wearing HTTP clothes: PUT is the
absolute write, POST is the relative one — which is exactly why POST needs
idempotency keys (`03-idempotency-keys.md`) and the others mostly don't.
Making that connection unprompted is the senior move of this whole doc.

**Richardson maturity model** (know it, spend one minute on it): L0 (one
URL, RPC-over-POST) → L1 (resources) → L2 (resources + verbs + status
codes — **where the industry actually lives**) → L3 (HATEOAS: responses
carry hypermedia links driving client state). The honest L3 assessment
interviewers respect: almost nobody ships HATEOAS because clients are
compiled against known workflows anyway; its one mainstream descendant is
"next/prev links in pagination" (`02-versioning-pagination.md`). Claiming
your API "is L3" is a red flag, not a flex.

---

## 2. Resource modeling (where designs are won)

- **Nouns, hierarchically, shallow:** `/users/{id}/payments` — but stop
  nesting at ~2 levels; deep paths (`/users/x/orders/y/items/z/refunds`)
  encode ownership that query params express better
  (`/refunds?order_id=y`).
- **The actions-that-aren't-CRUD problem** (the classic probe: "how do you
  model *cancel payment* RESTfully?"). Three honest options:
  (1) **state transition as sub-resource creation**: `POST
  /payments/{id}/refunds`, `POST /payments/{id}/cancellations` — the
  action becomes a noun with identity, history, and idempotency-key
  attachment (this is why it's the payments-industry default, and it's
  your platform's shape: a refund IS a new object —
  `07-system-design/01` §6.2); (2) state field on the resource:
  `PATCH {status: CANCELLED}` — fine for simple machines, loses the
  action's own metadata/audit; (3) frank RPC endpoint — acceptable at L5
  *if said out loud* ("this is an action, I'm modeling it as one") rather
  than contorted. The trap is pretending option 3 is option 1 by naming
  a URL `/doCancel`.
- **Collection design:** filtering/sorting via query params with
  documented semantics; every collection paginated from day one
  (retrofitting pagination is a breaking change — `02-...md`).
- **IDs are opaque strings** in the contract (never "integers" — you'll
  want prefixed/ULID IDs later; `pay_8f3k...` Stripe-style prefixes make
  IDs self-describing in logs — a small choice that pays forever).

## 3. Status codes and error design (the operational contract)

Status codes are not decoration — they're **machine-readable routing for
failure handling**: retry logic, circuit breakers, monitoring, and caches
all branch on them (`05-resilience/04` §2.1's retryability table and
`05-resilience/02` §3's what-counts-as-failure are *consumers of your
status-code discipline* — design the API knowing who reads the codes).

The ones that carry weight:
- **2xx:** 200 (result enclosed), **201** (+Location — created), **202**
  (accepted, outcome pending — the async workhorse: your payment API's
  correct answer, `07-system-design/01` §3), 204 (done, no body).
- **4xx — the caller must change something; never blind-retry:** 400
  (malformed), 401 (who are you) vs 403 (you, specifically, may not),
  404 (also the *authorization-safe* answer for "exists but you can't
  know that" — say this; it's a security-aware detail), **409** (state
  conflict — concurrent modification, duplicate-key disputes), 422
  (well-formed but semantically invalid — validation's home), **429**
  (+Retry-After, `05-resilience/05`).
- **5xx — the caller did nothing wrong; retry policies engage:** 500
  (unhandled), **503** (+Retry-After — deliberate shedding; make your
  load-shedder return this, not 500: the distinction drives client
  behavior), 504 (downstream timeout — outcome unknown! consumers must
  treat as ambiguous, which is why your API must be idempotent-keyed).
- **The 4xx/5xx boundary is a contract about blame and retry** — and
  misclassification has systemic cost: business rejections returned as
  500s trip circuit breakers and page on-calls for user typos
  (the breaker-taxonomy bug from `05-resilience/02` P2, seen from the
  producer side).

**Error bodies:** structured, machine-first — RFC 7807/9457
(`application/problem+json`) or equivalent house format:
```json
{"type":"insufficient_balance", "title":"...", "status":422,
 "detail":"human-readable", "instance":"/payments/pay_123",
 "trace_id":"...", "retryable":false}
```
Rules: a stable machine `type`/code (clients branch on it — never on
message text), human detail separate (and never leaking internals —
stack traces in error bodies are a security finding), trace ID always
(the support-ticket bridge), and — payments flavor — your config-driven
response-code resolver is exactly the machinery that keeps partner codes
mapped to stable public codes (`00-resume-arsenal/01` — cite it).

---

## 4. Senior-level depth

- **Contract-first thinking:** the API is designed as a document
  (OpenAPI), reviewed like an interface, tested for compatibility in
  CI — the schema-registry discipline (`04-messaging-streaming/07` §3.2)
  applied to synchronous surfaces. Additive evolution rules identical.
- **Statelessness is a scaling decision wearing a style badge:** no
  server session ⇒ any replica serves any request ⇒ LB freedom, trivial
  horizontal scale, no session replication — the property your stateless
  gateway tiers exploit. Where state sneaks back (sticky sessions,
  server-side cursors), name the cost being paid.
- **Design for the failure modes of YOUR consumers:** mobile clients
  retry on timeout (⇒ idempotency keys), partners poll aggressively
  (⇒ ETags/304, rate limits with headers), internal services propagate
  deadlines (⇒ honor and document timeout behavior). An API's quality is
  measured under its consumers' worst behavior.
- **L4/L5/L6:** L4 knows verbs and status codes. L5 models actions
  honestly, designs the 4xx/5xx boundary as a retry contract, ships
  problem+json with stable codes, and connects idempotency semantics to
  verb choice. L6 governs: API review boards, compatibility gates in CI,
  org-wide error taxonomies, deprecation policy as product policy.

## 5. Resume connection + spoken answer

Your gateway surface is the case study: `POST
/gateway/v1/checkout/superpay/eligibility/check` and the callback
endpoints are action-modeling decisions; your response-code resolver is
error-taxonomy machinery; your 202-shaped async payment flow is the
status-code discipline embodied.

**30–60 s spoken answer** ("how do you design a good REST API?"):

> "As a contract whose primary readers are machines under failure. Resources
> as nouns, but actions modeled honestly — a refund is a POST creating a
> refund object with its own identity and idempotency key, not a verb
> bolted onto a URL, because actions with identity get history, audit, and
> retry-safety for free. Status codes are the retry contract: 4xx means
> the caller must change something and must not blind-retry, 5xx means
> retry policies may engage, 202 means accepted-not-done — and
> misclassifying a business rejection as a 500 trips circuit breakers
> platform-wide, so the boundary is an operational decision, not
> aesthetics. Errors are structured problem-details: a stable machine code
> clients branch on, human detail they don't, and a trace ID bridging to
> support. And the discipline underneath: every effectful endpoint is
> either naturally idempotent by verb semantics — PUT and DELETE are
> absolute — or carries an idempotency key, because my consumers are
> mobile clients on flaky networks and partners with retry storms, and an
> API's quality is measured under its consumers' worst behavior."

## Self-test

1. Map the five verbs to the idempotency taxonomy; which verb is "the
   problem child" and what fixes it?
2. The Richardson levels, where industry lives, and the honest L3
   answer.
3. Model "cancel a payment" three ways; which does the payments industry
   pick and why?
4. Why is the 4xx/5xx boundary an operational contract? Name two systems
   that branch on it.
5. 401 vs 403 vs authorization-safe 404 — one line each.
6. When is 202 correct, and what must accompany it?
7. Design the error body: five fields and the rule for each.
8. Why must load shedding return 503+Retry-After rather than 500?
9. What does statelessness actually buy, mechanically?
10. Why are opaque, prefixed IDs a contract decision?

<details>
<summary><b>Answers</b></summary>

1. GET safe+idempotent (caches/retries assume it); PUT idempotent
   (absolute write — replace at identity); DELETE idempotent (gone is
   gone); PATCH not inherently (relative unless conditional); POST
   neither — server-assigned identity means repeats create duplicates.
   Fix: client-supplied Idempotency-Key making POST effectively-once.
2. L0 RPC-over-one-URL; L1 resources; L2 resources+verbs+status codes —
   where ~everyone lives; L3 HATEOAS. Honest answer: L3 is rare because
   clients are compiled against known workflows; its surviving
   descendant is hypermedia pagination links. Claiming full L3 signals
   fashion over judgment.
3. (1) Sub-resource creation: POST /payments/{id}/cancellations — the
   action gets identity, history, idempotency-key attachment;
   (2) PATCH status field — simple, loses action metadata/audit;
   (3) frank RPC endpoint — acceptable if declared. Payments picks (1):
   money actions need audit trails, retry identity, and their own
   state machines (a refund/cancellation can itself fail, pend,
   dispute).
4. It encodes blame (caller vs server) and retryability. Consumers:
   client retry policies (4xx never blind-retried, 5xx/timeout
   retried per taxonomy) and circuit breakers (4xx excluded from
   failure counts — misclassified business errors trip breakers and
   amputate features). Also monitoring/alerting and cache behavior.
5. 401: unauthenticated — identity missing/invalid; retry after
   authenticating. 403: authenticated but forbidden — retrying won't
   help. 404-for-authorization: when revealing existence is itself a
   leak (other users' resource IDs), return 404 so attackers can't
   enumerate what exists.
6. When the request is durably accepted but the outcome is genuinely
   pending (async execution — payments, long jobs). Must accompany:
   a resource/status URL (or ID) to poll, ideally push notification of
   completion, and documented terminal states — acceptance ≠ outcome,
   stated in the contract.
7. Stable machine code/type (clients branch on it — versioned like an
   enum, never message text); human-readable detail (for developers,
   never leaking internals); HTTP status echoed (proxies mangle);
   instance/resource reference (which thing failed); trace/correlation
   ID (the support bridge). Optional but valuable: retryable flag and
   Retry-After alignment.
8. 503+Retry-After declares "deliberate, transient, come back at T" —
   clients back off in a coordinated, shaped way and breakers can
   distinguish shed from broken. A 500 says "server bug": pages fire,
   retry policies may hammer immediately, and the shedding you did to
   survive reads as an outage you caused.
9. No per-client server memory ⇒ any replica serves any request ⇒ load
   balancers need no affinity, scale-out is linear, failover is free
   (no session loss), and deploys don't drain sessions. State that
   sneaks back (stickiness, server-side cursors) re-couples requests
   to instances and must be paid for knowingly.
10. Declaring IDs opaque strings preserves freedom to change generation
    (int → ULID → prefixed) without breaking parsers that assumed
    integers; prefixes (pay_, ref_) make IDs self-identifying in logs,
    support tickets, and cross-system traces — tiny cost at design
    time, permanent forensic dividend.

</details>
