# 13 — Networking

**Status: ✅ Complete.** Five documents on the five-part contract, each
ending in a hidden-answer self-test. This is "assumed fluency" territory —
nobody schedules a TCP round, but design rounds grade these answers
silently, and your gateway/timeout/connection-pool work gives every doc a
production anchor.

## Reading order

| # | Document | One-line takeaway |
|---|----------|-------------------|
| 1 | [TCP](01-tcp.md) | Handshake + slow-start + TIME_WAIT = the three-currency cost that justifies connection pools; rwnd as backpressure's original credit system |
| 2 | [TLS](02-tls.md) | 1.3 = 1-RTT + mandatory forward secrecy; 0-RTT's replay gate is your idempotency lens; channel-vs-message auth is why HMAC survives TLS |
| 3 | [HTTP/1→2→3](03-http1-http2-http3.md) | One story: HOL blocking chased down the stack — including the h2-worse-than-h1-on-loss inversion and the why-UDP ossification argument |
| 4 | [DNS & anycast](04-dns-and-anycast.md) | TTLs are advisory (the failover tail), the JVM double-cache gotcha, anycast as per-packet failover vs GeoDNS's cached lag |
| 5 | [Load balancing](05-load-balancing.md) | L4 vs L7 by unit-of-balancing, P2C's herd resistance, draining with the GOAWAY wrinkle, and the gRPC/h2 trap with three fixes |

## The five sentences to walk into any interview with

1. "A fresh connection costs three currencies — handshake RTTs, slow-start
   ramp, and TIME_WAIT churn — and pools amortize all three plus TLS."
2. "TLS authenticates the channel; HMAC authenticates the message — they
   terminate differently, identify differently, and money wants both."
3. "HTTP's history is head-of-line blocking chased down the stack — and on
   lossy networks h2 can be worse than h1, which is exactly what QUIC's
   per-stream recovery fixes."
4. "DNS TTLs are advisory: flip a record and most traffic moves in minutes
   with an hours-long tail — fast failover lives at anycast and load
   balancers, and the JVM caches resolutions twice anyway."
5. "The balancer must balance the protocol's unit of work — multiplexing
   moved it from connection to request, which is why gRPC behind an L4
   balancer pins to one backend."

## Self-test discipline

Cold self-tests ≥3 days after reading; misses go to the spaced-repetition
deck (`15-mock-interviews/` when written).
