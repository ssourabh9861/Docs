# gRPC vs REST (and GraphQL) — Choosing the Protocol

The "which RPC style" question, which interviewers use to check whether you
choose protocols by fit or by fashion. The honest frame: REST and gRPC solve
overlapping problems with different defaults, and the right answer is almost
always "REST at the edge, gRPC between services" — but you must be able to
say *why* mechanically, and know the cases that invert it.

---

## 1. Plain definitions

- **REST/JSON over HTTP:** resources + verbs + human-readable JSON over
  HTTP/1.1 or 2 (`01-rest-fundamentals.md`). Ubiquitous, browser-native,
  debuggable with curl, schema-optional (OpenAPI by convention).
- **gRPC:** contract-first RPC — you define services and messages in
  **protobuf** (`.proto`), codegen typed client+server stubs in every
  language, transported as binary protobuf over **HTTP/2**. Method calls,
  not resource manipulation; strong schema, compact wire format, native
  streaming.
- **GraphQL** (the third option interviewers add): a query language where
  the *client* specifies exactly the fields it wants across a typed
  graph, resolved server-side — one endpoint, client-shaped responses.
  Solves over/under-fetching for rich clients; a different axis than
  REST-vs-gRPC (it's about *response shaping*, not transport).

The organizing insight: these differ on **schema strictness, wire
efficiency, streaming, and audience** — pick by which of those the
boundary actually needs, not by which is "modern."

---

## 2. The comparison that matters (mechanism by mechanism)

| Axis | REST/JSON | gRPC |
|---|---|---|
| Wire format | JSON (text, verbose, self-describing) | protobuf (binary, compact — varint, no field names on wire; ~30–60% smaller, faster serde) |
| Schema | optional (OpenAPI by convention) | mandatory `.proto`; codegen'd types; compile-time-checked contracts + backward/forward compat rules built into field numbering |
| Transport | HTTP/1.1 or 2 | HTTP/2 always (multiplexing, header compression, no HOL-blocking at the HTTP layer — `13-networking/`) |
| Streaming | request/response (SSE/chunked as bolt-ons) | native: server-, client-, and bi-directional streaming first-class |
| Browser | native | needs grpc-web + a proxy (browsers don't expose HTTP/2 framing) — the decisive edge-vs-internal factor |
| Debuggability | curl, logs, any tool | needs grpcurl/reflection; binary on the wire is opaque without the schema |
| Latency/throughput | fine | lower latency + higher throughput at scale (binary serde + HTTP/2 multiplexing + persistent connections) |

The verdict this table produces: **gRPC's advantages (compact binary,
mandatory schema, streaming, multiplexed HTTP/2) are internal-service
advantages** — high call volume, polyglot services, contract discipline
across teams; **REST's advantages (browser-native, debuggable,
ubiquitous, schema-optional) are edge advantages** — public/partner APIs,
browser clients, low-friction integration. Hence the default:
**REST/JSON at the edge, gRPC service-to-service** — with a gateway
translating (`06-gateway-patterns.md`).

---

## 3. Senior-level depth

- **Protobuf's schema evolution IS the reason for gRPC internally** —
  not the speed. Field-numbered, additive-compatible schemas let dozens
  of services deploy independently with compile-time contract checking
  (the exact discipline your CDC pipeline uses for its protobuf
  envelopes, `04-messaging-streaming/07` §3.2 — you already run this).
  "gRPC is faster" is the L4 reason; "gRPC gives enforced,
  independently-deployable contracts across a polyglot fleet" is the L5
  reason. At Google specifically, this is the internal default (Stubby
  → gRPC lineage) — worth knowing in a Google interview.
- **Error models differ and it matters for your resilience layer:** gRPC
  status codes (a fixed set: OK, DEADLINE_EXCEEDED, UNAVAILABLE,
  RESOURCE_EXHAUSTED…) map cleanly to retry/circuit-breaker logic and
  carry **deadlines natively** (gRPC deadline propagation — the
  timeout-budget mechanism from `05-resilience/01` §2.3 that REST lacks
  built-in). If you value deadline propagation (you should — it's the
  fix for timeout inversion), gRPC gives it for free; REST needs
  convention.
- **Streaming unlocks designs REST does awkwardly:** server-streaming
  (a feed of updates on one connection), bi-di (chat, real-time sync —
  `07-system-design/05`); over REST these become WebSockets/SSE/long-poll
  bolt-ons. If the boundary is inherently streaming, gRPC is the fit.
- **GraphQL's real trade:** it solves mobile over/under-fetching (one
  round trip, client-shaped) at the cost of server-side complexity
  (resolver N+1 problems, query-cost analysis to prevent abusive
  queries, caching that HTTP gives REST for free). Right for
  aggregation-heavy client-facing APIs (a mobile home screen pulling 8
  resources); wrong for service-to-service (gRPC) or simple CRUD (REST).
  Naming *when it's wrong* is the calibrated take.
- **L4/L5/L6:** L4 "gRPC is faster, use it internally." L5: chooses per
  the four axes, cites protobuf schema-evolution as the internal driver,
  knows gRPC's native deadlines/status-codes/streaming and grpc-web's
  browser limitation, places GraphQL on its own axis. L6: sets the
  org's boundary policy (edge protocol, internal protocol, gateway
  translation, schema-registry governance) and the migration story.

## 4. Resume connection + spoken answer

Your platform is REST/JSON at the gateway edge (Jersey/JAX-RS —
partner-facing, browser/app clients) with protobuf already in your veins
(CDC envelopes, and internal service contracts **[VERIFY whether your
inter-service calls are gRPC or REST/JSON — Flipkart internal RPC may be a
house framework; know which]**). The strong, honest framing: "we use
protobuf where schema evolution across teams matters — our CDC pipeline —
and REST/JSON at the partner/app edge where debuggability and ubiquity
matter; that split is exactly the gRPC-internal/REST-edge principle."

**30–60 s spoken answer** ("gRPC or REST?"):

> "Almost always REST at the edge, gRPC between services — and the reason
> isn't speed, though gRPC is faster. It's four axes. Schema: gRPC's
> mandatory protobuf gives compile-time-checked, additively-evolvable
> contracts across a polyglot fleet, so dozens of services deploy
> independently without breaking each other — that's the real internal
> win, and it's the same discipline our CDC pipeline already runs on
> protobuf envelopes. Transport: gRPC is HTTP/2 always, multiplexed,
> with native deadlines — deadline propagation is the built-in fix for
> timeout inversion that REST makes you hand-roll — and native streaming
> for feeds and bidirectional flows. But at the edge, REST wins on the
> axes that matter there: browser-native — gRPC needs grpc-web and a
> proxy — debuggable with curl, and ubiquitous for partners. So the
> boundary decides: partner and app-facing surfaces are REST/JSON;
> high-volume polyglot service-to-service is gRPC; a gateway translates
> between them. GraphQL is a different axis entirely — it solves mobile
> over-fetching by letting the client shape the response, at the cost of
> resolver complexity and query-cost governance; right for
> aggregation-heavy client screens, wrong for service-to-service or
> simple CRUD."

## Self-test

1. The four axes that decide REST vs gRPC.
2. Why is protobuf schema evolution the *real* internal driver, not
   speed?
3. What does gRPC give natively that REST needs convention for, and why
   does it matter to your resilience layer? (Two things.)
4. Why can't browsers speak gRPC directly, and what bridges it?
5. State the default split and the component that makes it work.
6. GraphQL's axis, its real cost, and when it's the wrong choice.
7. How does gRPC's error model help retry/breaker logic?
8. When does the default invert — name two cases for gRPC at the edge
   or REST internally.
9. Wire-format concretely: why is protobuf smaller and faster to parse?
10. Connect the split to two things your platform already does.

<details>
<summary><b>Answers</b></summary>

1. Wire efficiency (binary protobuf vs text JSON), schema strictness
   (mandatory codegen'd contracts vs optional), streaming (native
   vs bolt-on), and audience/debuggability (browser-native + curl vs
   binary + tooling). Pick by which the boundary needs.
2. Speed is a nice-to-have; the durable internal problem is dozens of
   polyglot services evolving contracts without breaking each other.
   Protobuf's field-numbering + additive-compat rules give
   compile-time-checked, independently-deployable contracts — the
   coordination win dwarfs the byte savings.
3. Native deadlines (deadline propagation — the fix for timeout
   inversion, passing remaining budget downstream) and a fixed status-
   code set that maps cleanly to retry/circuit-breaker decisions.
   Both are things REST makes you hand-roll by convention, and both
   directly feed the resilience layer's retry/timeout/breaker logic.
4. Browsers don't expose HTTP/2 framing (trailers, flow control) that
   gRPC needs; grpc-web + a translating proxy bridges browser ↔ gRPC.
   This browser limitation is the decisive reason gRPC stays internal
   and REST faces the edge.
5. REST/JSON at the edge, gRPC service-to-service; an API gateway
   translates protocols (and offloads auth/rate-limiting) between the
   two worlds.
6. Response-shaping axis (client specifies fields; one round trip;
   solves over/under-fetch). Cost: resolver complexity (N+1 fetches),
   query-cost analysis to block abusive queries, and losing HTTP's
   free caching. Wrong for service-to-service (gRPC) and simple CRUD
   (REST's caching/simplicity win).
7. A fixed, semantically-precise status set (UNAVAILABLE,
   DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED, etc.) lets clients branch
   deterministically — retry UNAVAILABLE, don't retry
   INVALID_ARGUMENT, back off on RESOURCE_EXHAUSTED — instead of
   parsing ad-hoc HTTP+body conventions; cleaner input to breakers
   and retry taxonomies.
8. gRPC at the edge: when clients are all your own controlled
   non-browser apps (mobile SDKs can speak gRPC) and you want the
   schema/streaming benefits publicly. REST internally: simple
   low-volume internal CRUD where the schema/perf gains don't justify
   the tooling, or when broad ecosystem tool compatibility matters
   more than efficiency.
9. Protobuf encodes fields by numeric tag with varint/length-delimited
   encoding and omits field names and structural punctuation from the
   wire; parsing is generated code walking known offsets rather than
   tokenizing text and matching string keys — smaller bytes, less CPU.
10. (a) CDC pipeline uses protobuf envelopes with versioned schema
    evolution — the exact gRPC-internal discipline. (b) Gateway is
    REST/JSON (Jersey) at the partner/app edge — the REST-edge side of
    the split; internal service calls sit behind it [verify whether
    they're gRPC or a house RPC framework].

</details>
