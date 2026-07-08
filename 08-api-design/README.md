# 08 — API Design

**Status: ✅ Complete.** Six documents on the five-part contract, each ending
in a hidden-answer self-test. A heavy resume surface: you operate a
production API gateway with HMAC webhooks and edge dedup, so most of this
directory is lived, not learned.

## Reading order

| # | Document | One-line takeaway |
|---|----------|-------------------|
| 1 | [REST fundamentals](01-rest-fundamentals.md) | Contract design: action modeling, the 4xx/5xx boundary as a retry contract, problem+json errors — the verb table IS the idempotency taxonomy |
| 2 | [Versioning & pagination](02-versioning-pagination.md) | Versioning as last-resort (additive evolution first + a deprecation machine); keyset over offset, cursor-design rules |
| 3 | [Idempotency keys](03-idempotency-keys.md) | The API-contract view of your dedup work: atomic reservation, crash reconciliation, key propagation end-to-end |
| 4 | [Webhooks](04-webhooks.md) | The four adversaries and four defenses; raw-body HMAC + timestamp + constant-time; verify→ack→async→reconcile — your callback-race fix generalized |
| 5 | [gRPC vs REST](05-grpc-vs-rest.md) | Four-axis choice; protobuf schema-evolution (not speed) as the internal driver; REST-edge/gRPC-internal; GraphQL's separate axis |
| 6 | [Gateway patterns](06-gateway-patterns.md) | Cross-cutting-at-the-boundary; thin-vs-fat discipline; BFF; north-south gateway vs east-west mesh — Hogwarts as the case study |

## The five sentences to walk into any interview with

1. "The verb table is the idempotency taxonomy: PUT/DELETE are absolute so
   they're naturally idempotent; POST is relative, so it needs a key."
2. "The 4xx/5xx boundary is a retry contract — misclassifying a business
   rejection as a 500 trips circuit breakers platform-wide."
3. "Versioning is the fallback for failed compatible evolution — design to
   never need it; the hard part is the deprecation machine, not the
   routing."
4. "A webhook is an event over untrusted, unreliable HTTP to a party who
   might process it twice — sign the raw bytes, ack fast then process
   async, and always back it with a pull/reconcile path."
5. "Cross-cutting policy at the gateway, business decisions in services —
   a gateway that accretes business logic becomes the distributed
   monolith's chokepoint."

## Self-test discipline

Cold self-tests ≥3 days after reading; misses go to the spaced-repetition
deck (`15-mock-interviews/` when written).
