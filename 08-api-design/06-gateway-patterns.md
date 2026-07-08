# API Gateway Patterns

The capstone of the API-design directory — and a doc where you have an
unusual advantage: you *built and own* a production API gateway (Hogwarts),
so "design an API gateway" isn't a hypothetical, it's your résumé. This doc
frames the gateway's responsibilities, the BFF pattern, and the failure
modes, mapping each onto what you actually run.

---

## 1. Plain definition

An **API gateway** is the single entry point that sits between external
clients and your internal services, handling the concerns that *every*
request needs so individual services don't each re-implement them:
authentication, rate limiting, routing, protocol translation, request
validation, and observability. It's the **policy enforcement point** at the
trust boundary — the place where "untrusted outside" becomes "trusted
inside."

The organizing principle (say it first): **cross-cutting concerns belong at
the boundary, business logic belongs in services.** A gateway that grows
business logic becomes a distributed monolith's chokepoint; a gateway that
enforces only cross-cutting policy stays a thin, scalable, stateless tier.
The line between "cross-cutting" and "business" is the entire design
judgment — and your Hogwarts processors/executors sit right on it.

Analogy: the security desk + concierge of an office building. It checks IDs
(authN), enforces the visitor cap (rate limit), directs you to the right
floor (routing), and logs who entered (observability) — but it does not do
your actual job for you. A security desk that started doing tenants' work
would be both a bottleneck and a liability.

---

## 2. The responsibilities (each is a service you'd otherwise duplicate)

1. **Authentication / token termination:** validate the caller's identity
   once at the edge (bearer/session/mTLS), pass a trusted internal
   identity downstream — services trust the gateway's assertion instead
   of re-authenticating. Your two-tier auth (internal AuthN for app flows,
   Kevlar for web) is exactly this, plus partner-callback auth (HMAC) as
   a distinct edge.
2. **Rate limiting / quotas / load shedding:** the natural enforcement
   point (`05-resilience/05`, `07-system-design/02`) — reject abusive or
   over-quota traffic before it costs any downstream work.
3. **Routing:** map external paths to internal services (and versions,
   DCs — your HeliosRedirect DC-routing filter); the gateway knows the
   topology so clients don't.
4. **Protocol translation:** REST/JSON edge ↔ gRPC/internal
   (`05-grpc-vs-rest.md`); terminate TLS; adapt content types.
5. **Request validation & sanitization:** reject malformed requests at
   the door (schema validation) — cheap rejection, and a security layer
   (injection, oversized payloads).
6. **Observability:** the one place every request passes — inject trace
   IDs, emit RED metrics, structured access logs (your
   `HogwartsRequestFilter` establishing trace + Hystrix context is
   precisely this).
7. **Response aggregation / transformation:** compose or reshape
   downstream responses (bleeds into BFF — §3).
8. **Security hardening:** dedup (your Aerospike request-ID dedup —
   idempotency at the edge), device validation, PII masking in logs,
   HMAC webhook verification — your gateway does all of these, and they
   are textbook edge concerns.

The design discipline: each of these is a concern you'd otherwise
copy-paste into every service (and get subtly wrong in each). The gateway
is the DRY-ness boundary for cross-cutting policy — and your
processor→executor architecture (thin resources, single-responsibility
executors, no business logic in resources) is the internal expression of
keeping it thin.

## 3. BFF — Backend for Frontend

Different clients need different response shapes: a mobile app wants a
compact, aggregated home-screen payload; a web client wants something
else; a partner wants raw resources. **One gateway serializing for all of
them accretes client-specific logic** — the BFF pattern splits it: a
per-client-type gateway/adaptation layer (your UPI Front / MAPI layer)
owns *that client's* aggregation and shaping, calling the same downstream
services. Wins: each frontend's needs evolve independently; downstream
services stay client-agnostic. Cost: N BFFs to maintain (mitigated by
shared libraries) and the risk of business logic leaking into a BFF (keep
it *shaping*, not *deciding*). This is the aggregation trade GraphQL also
addresses (`05-grpc-vs-rest.md` §3) — BFF is the "bespoke per client"
answer, GraphQL the "generic query" answer; know both.

## 4. Senior-level depth

- **The gateway is a SPOF and a scaling chokepoint — design accordingly:**
  it's on the critical path of *every* request, so it must be stateless
  (any instance serves any request — the statelessness dividend,
  `01-rest-fundamentals.md` §4), horizontally scaled, and bulkheaded
  internally (your per-partner Hystrix pools live at/near the gateway so
  one slow downstream can't exhaust the shared request tier —
  `05-resilience/03`). A gateway that holds state or lacks isolation
  turns every downstream hiccup into a total outage.
- **Thin gateway vs fat gateway (the central judgment):** the failure
  mode is the gateway accreting business logic until it's a monolith
  everyone must deploy through — coupling teams, serializing releases,
  becoming the thing microservices were meant to avoid. The discipline:
  cross-cutting policy at the gateway, business decisions in services;
  your processor/executor split (orchestration in processors, one
  downstream call per executor, zero business logic in resources) is
  exactly this discipline made structural — cite it as the pattern, not
  just the code.
- **Service mesh vs API gateway (the modern distinction interviewers
  probe):** a gateway handles *north-south* traffic (external ↔ internal,
  the trust boundary); a service mesh (Envoy/Istio sidecars) handles
  *east-west* (internal service-to-service: mTLS, retries, breakers,
  observability between services). They're complementary, not
  competing — the mesh pushes cross-cutting concerns *between* services
  down into sidecars, the gateway owns the *edge*. Knowing this split
  (and that adaptive concurrency limits / breakers increasingly live in
  the mesh — `05-resilience/02` §2.4) is current-architecture fluency.
- **L4/L5/L6:** L4 "the gateway does auth and routing." L5: the full
  responsibility list as cross-cutting-DRY, the thin-vs-fat discipline,
  BFF for client divergence, statelessness + bulkheading for SPOF
  survival, north-south-vs-east-west mesh distinction. L6: the platform
  view — gateway/mesh as org infrastructure, policy-as-config, the
  governance that keeps business logic out, and edge-security posture.

## 5. Resume connection + spoken answer

You don't design this hypothetically — you operate Hogwarts: two-tier
auth + HMAC callback auth, Aerospike dedup + device validation, rate
limiting, DC-routing, PII masking, trace/Hystrix-context establishment,
and a processor→executor architecture that *structurally* keeps business
logic out of the edge. The UPI Front/MAPI layer is your BFF. Frame it as:
"I own a payment API gateway, and its architecture is the thin-gateway
discipline enforced in code."

**30–60 s spoken answer** ("design/describe an API gateway"):

> "A gateway is the policy enforcement point at the trust boundary —
> where untrusted outside becomes trusted inside — and it exists so every
> service doesn't re-implement the cross-cutting concerns: authentication
> and token termination, rate limiting and shedding, routing and protocol
> translation, request validation, and observability. The governing
> discipline is that cross-cutting policy lives at the gateway and
> business decisions live in services — a gateway that accretes business
> logic becomes the distributed monolith's chokepoint. I actually operate
> one: our UPI gateway does two-tier auth for app-versus-web plus HMAC for
> partner callbacks, request dedup and device validation against
> Aerospike at the edge, rate limiting, data-center routing, PII masking,
> and trace-context establishment — and it stays thin by architecture: a
> processor orchestrates single-responsibility executors that each make
> one downstream call, with zero business logic in the resource layer.
> Because it's on every request's critical path, it's stateless and
> horizontally scaled, with per-partner bulkheads so one slow downstream
> can't exhaust the shared tier. For divergent clients we run a
> backend-for-frontend layer that shapes responses per client type
> without pushing that logic downstream. And the modern complement is the
> service mesh: the gateway owns north-south edge traffic, the mesh owns
> east-west service-to-service concerns like mTLS and inter-service
> breakers."

## Self-test

1. State the gateway's organizing principle and the judgment line it
   implies.
2. List six cross-cutting responsibilities and why each belongs at the
   boundary.
3. Fat vs thin gateway: the failure mode and the structural discipline
   that prevents it.
4. Why must the gateway be stateless and bulkheaded? What does each
   prevent?
5. The BFF pattern: the problem, the split, the cost, and the "keep it
   shaping not deciding" rule.
6. BFF vs GraphQL: same problem, two answers — characterize each.
7. Gateway (north-south) vs service mesh (east-west): the division of
   labor.
8. Map six things your Hogwarts gateway does onto the responsibility
   list.
9. How does your processor→executor architecture embody the
   thin-gateway discipline?
10. Why is protocol translation a gateway job, and what does it enable
    architecturally?

<details>
<summary><b>Answers</b></summary>

1. Cross-cutting concerns at the boundary, business logic in services.
   The judgment line: distinguishing cross-cutting policy (auth, rate
   limiting, routing, observability — belongs at the edge) from
   business decisions (belong in services) — misplacing business logic
   into the gateway creates a chokepoint monolith.
2. AuthN/token termination (authenticate once, services trust the
   assertion); rate limiting/shedding (reject before downstream cost);
   routing (topology knowledge kept out of clients); protocol
   translation (REST edge ↔ gRPC internal); request validation (cheap
   + secure rejection at the door); observability (one place every
   request passes → trace IDs, RED metrics). Each is otherwise
   copy-pasted into every service and gotten subtly wrong.
3. Fat gateway accretes business logic until every team deploys through
   it — coupling, serialized releases, a distributed monolith's
   bottleneck. Discipline: keep only cross-cutting policy at the edge;
   structurally, thin resources + orchestrating processors + single-
   downstream-call executors with no business logic in resources.
4. Stateless: on every request's critical path, so any instance must
   serve any request for horizontal scale and free failover — state
   would re-couple requests to instances and make the SPOF fatal.
   Bulkheaded: per-downstream isolation (thread pools/breakers) so one
   slow/failing downstream consumes only its compartment, not the
   shared request tier — prevents a single hiccup becoming a total
   edge outage.
5. Problem: divergent client needs (mobile compact/aggregated vs web
   vs partner raw) accrete client-specific logic in one gateway. Split:
   a per-client-type BFF owns that client's aggregation/shaping over
   shared downstream services. Cost: N BFFs (shared libs mitigate) +
   leakage risk. Rule: a BFF shapes responses, it doesn't make business
   decisions — decisions stay in services.
6. Client-response-shaping. BFF: bespoke per-client-type layer (server
   owns the shape per client). GraphQL: generic query language (client
   declares the shape at request time, one endpoint). BFF trades N
   layers for simplicity per client; GraphQL trades resolver/query-cost
   complexity for one flexible endpoint.
7. Gateway = north-south: the external↔internal trust boundary (edge
   auth, rate limiting, routing, protocol translation). Service mesh =
   east-west: service-to-service concerns via sidecars (mTLS,
   inter-service retries/breakers, observability). Complementary — the
   mesh distributes internal cross-cutting concerns, the gateway owns
   the edge.
8. Two-tier auth + HMAC callback auth (authN/token termination);
   Aerospike request-ID dedup (edge idempotency) + device validation
   (security hardening); rate limiting (shedding/quotas); HeliosRedirect
   DC-routing (routing); PII masking + request filters (validation/
   observability/security); HogwartsRequestFilter trace + Hystrix
   context (observability).
9. Resources only validate and adapt DTOs (no business logic);
   processors orchestrate; each executor makes exactly one downstream
   call. That structure prevents business logic from accumulating at
   the edge — the thin-gateway discipline enforced by architecture, not
   just intention, so the gateway stays a policy tier.
10. It lets the edge speak the clients' friendly protocol (REST/JSON,
    browser-native, debuggable) while internal services speak the
    efficient/strict one (gRPC/protobuf) — decoupling client ergonomics
    from internal efficiency, so each side optimizes independently
    (the edge-REST/internal-gRPC split, made operational by the
    gateway).

</details>
