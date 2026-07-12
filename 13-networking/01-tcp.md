# TCP — Handshakes, Flow Control, and Why Your Connection Pools Exist

Networking is "assumed fluency" at Google: nobody schedules a TCP round, but
design rounds casually ask "why is the first request slow?" or "what happens
at 50 k connections/s?" and grade the answer silently. This doc grounds the
TCP facts your other directories already lean on — the timeout stack's
lowest layer, backpressure's original credit system, and the mechanical
reason connection pools are worth their complexity.

---

## 1. Plain definition

TCP turns an unreliable packet network (IP: packets may be lost, duplicated,
reordered, corrupted) into a **reliable, ordered byte stream** between two
endpoints. The machinery: every byte is numbered (**sequence numbers**);
the receiver acknowledges what it has (**ACKs**); the sender retransmits
what isn't acknowledged in time; the receiver reassembles in order. You
write bytes in one end and read the same bytes, in order, out the other —
or the connection fails. That's the whole contract.

Analogy: sending a book page-by-page through unreliable mail. Pages are
numbered; the recipient confirms receipt page ranges; you resend anything
unconfirmed; they shelve pages in order and never hand the reader page 12
before page 11 arrives — even if pages 13–20 are sitting there waiting.
(That last clause is head-of-line blocking, and it becomes the villain of
`03-http1-http2-http3.md`.)

**The three-way handshake:** SYN → SYN-ACK → ACK. Purpose: both sides
agree on initial sequence numbers and confirm bidirectional reachability
before data flows. Cost: **one full RTT before the first byte of data** —
intra-DC ~0.5 ms (ignorable), cross-region 50–150 ms (very much not), and
TLS stacks more RTTs on top (`02-tls.md`). This RTT tax, paid per
connection, is reason #1 connection pools exist.

---

## 2. How it works in practice (the four mechanisms that matter)

### 2.1 Flow control — the receive window (backpressure's original form)

The receiver advertises how much buffer space it has (**rwnd**) in every
ACK; the sender may have at most that many unacknowledged bytes in flight.
Receiver slows → buffer fills → window shrinks → sender stalls at window
zero. This is **credit-based flow control** — the pattern
`04-messaging-streaming/08-backpressure.md` §2.2 traced from TCP up
through gRPC and Pulsar permits. It protects the *receiver*; it knows
nothing about the network in between — that's congestion control's job.

### 2.2 Congestion control — probing the network's capacity

The sender also maintains a **congestion window (cwnd)** — its estimate of
what the *network path* can absorb; effective window = min(rwnd, cwnd).
- **Slow start:** cwnd begins small (~10 segments ≈ 14 KB modern default)
  and doubles per RTT until loss or threshold — so **a new connection
  can't use the pipe's full bandwidth for several RTTs**. Reason #2 for
  connection pools: a *warm* connection carries a grown cwnd; a cold one
  restarts the probe.
- **Steady state:** classic loss-based AIMD (additive increase,
  multiplicative decrease — grow linearly, halve on loss; CUBIC is the
  Linux default refinement) vs **BBR** (model-based: estimate bottleneck
  bandwidth × RTT directly, don't wait for loss — better on lossy/long
  paths; know both names and the philosophical split: loss-as-signal vs
  model-the-pipe).
- **BDP:** bandwidth × RTT = bytes that must be in flight to fill the
  pipe (1 Gbps × 100 ms = ~12.5 MB) — why long-fat networks need big
  windows, and why default buffers throttle cross-continent transfers.

### 2.3 The latency gotchas (interview favorites because they page people)

- **Nagle's algorithm × delayed ACK:** Nagle batches small writes (wait
  for outstanding data to be ACKed before sending another small segment);
  delayed ACK holds ACKs ~40 ms hoping to piggyback. Together on a
  request-response protocol: your small write waits for an ACK the other
  side is deliberately delaying — **the classic mysterious 40 ms**. Fix:
  `TCP_NODELAY` (every serious RPC/HTTP client sets it; knowing *why* is
  the point).
- **TIME_WAIT:** the side that closes first holds the socket ~60 s
  (2×MSL) to absorb stray late packets and handle lost final ACKs. At a
  high-churn client (a gateway opening/closing connections to backends at
  thousands/s), TIME_WAIT sockets pile up and **ephemeral ports exhaust**
  (~28 k usable by default per src/dst pair) — connections start failing
  with address-in-use. Fixes, in order of correctness: **keep-alive/
  connection reuse** (don't churn — reason #3 for pools), more ports/
  tuning (`tcp_tw_reuse`), more source IPs. "We ran out of ports" is a
  rite-of-passage incident; narrate it fluently.
- **SYN backlog / SYN floods:** half-open connections queue in a backlog;
  floods of spoofed SYNs exhaust it (SYN cookies as the defense) — one
  sentence of awareness, mostly a security/edge concern.

### 2.4 Timeouts at the socket layer (grounding your timeout stack)

- **Connect timeout** = bounding SYN retransmission: unconfigured, the OS
  retries SYNs with exponential backoff for **~2 minutes** — this is the
  "unset timeouts exist in your stack right now" default from
  `05-resilience/01-timeouts.md` §2.1, now with its mechanism.
- **Read timeout** = max gap between bytes arriving — enforced by your
  client library, not TCP itself (TCP will happily hold a silent
  connection open forever; keepalive probes default to starting after
  **2 hours** — useless for request SLAs, which is why application-layer
  timeouts are non-negotiable).
- **Retransmission timeouts (RTO)** adapt to measured RTT — but a dead
  peer mid-request surfaces to you only as your read timeout firing.
  TCP's reliability is *within* a live connection; liveness detection is
  yours (`01-distributed-systems/07-failure-detection.md`).

---

## 3. Senior-level depth

- **The connection-pool ledger, unified:** pools amortize (1) the
  handshake RTT (+TLS RTTs), (2) slow-start ramp (warm cwnd), and
  (3) TIME_WAIT/port churn — and cost (a) idle-connection resources on
  both ends, (b) staleness (a pooled connection to a dead/redeployed
  backend fails on first use — why pools validate/evict and why one
  retry-on-stale-connection is standard and safe: the request never
  reached the server), (c) the bulkhead interplay: pool size is a
  concurrency cap (`05-resilience/03` §2.1 — align it with your thread
  pools or create an invisible second bulkhead).
- **TCP HOL blocking, precisely** (the setup for HTTP/3): loss of one
  segment stalls delivery of everything after it *in that connection's
  byte stream* — even bytes belonging to logically independent requests
  multiplexed on it. The stream abstraction is the cause: TCP promises
  ordered bytes, so it cannot deliver segment N+1's data before N is
  repaired. Independent requests want independent streams — which is
  QUIC's founding insight.
- **What TCP does NOT give you** (say these to sound operational): no
  message boundaries (it's a byte stream — framing is the application's
  job: HTTP headers, gRPC length prefixes); no liveness detection on
  useful timescales; no fairness between connections (10 connections
  get ~10 shares — why browsers opened 6 and why that was an arms
  race); acked-at-socket ≠ processed-by-application (the send buffer
  lies — application acks are the only real acks; ties to
  delivery-semantics).
- **L4/L5/L6:** L4 knows the handshake and "TCP is reliable." L5 runs
  the four mechanisms, the three latency gotchas with fixes, grounds
  the timeout stack and connection-pool ledger mechanically, and can
  say what TCP doesn't provide. L6 tunes fleets: congestion-control
  choice per path type, kernel tuning as capacity policy, and knowing
  when the answer is "move to QUIC/h3," not more tuning.

## 4. Resume connection + spoken answer

Your platform touches all of this daily: OkHttp pools to PSP/partners
(handshake+slow-start amortization; the two-layer timeout enforcement
from `05-resilience/01` §2.1 is Hystrix-deadline over socket read-timeout);
gateway connection churn at payment QPS (TIME_WAIT territory —
**[VERIFY whether keep-alive to downstreams is tuned; a fair interview
question about your own gateway]**); and your queue-depth backpressure is
TCP's rwnd pattern at the architecture layer — one idea, two altitudes.

**30–60 s spoken answer** ("why do connection pools exist?" / "why is the
first request slow?"):

> "Because a fresh TCP connection is expensive in three separate
> currencies. First, latency: the three-way handshake costs a full RTT
> before any data, and TLS adds more — cross-region that's a hundred-plus
> milliseconds of pure setup. Second, throughput: congestion control
> starts every connection in slow start, around ten segments, doubling
> per RTT — a cold connection can't fill the pipe for several round
> trips, while a warm pooled connection carries its grown congestion
> window. Third, churn: the side that closes first holds TIME_WAIT for
> about a minute, and at gateway-scale open-close rates you exhaust
> ephemeral ports — the classic incident. So pools amortize all three,
> and they cost you staleness — a pooled connection to a redeployed
> backend fails on first use, which is why validating and one
> retry-on-stale is standard — plus the pool is itself a concurrency
> bulkhead you have to align with your thread pools. And the two facts I
> keep in view operationally: TCP's flow control is credit-based
> backpressure — the same pattern as our queue permits, just at the
> socket layer — and TCP gives you reliability within a connection but
> no liveness on useful timescales, which is why application-layer read
> timeouts are non-negotiable: the OS default is a two-hour keepalive
> and a two-minute connect retry."

## Self-test

1. What does TCP promise, over what, via what three mechanisms?
2. The handshake: messages, purpose, and cost at two RTT scales.
3. rwnd vs cwnd: who sets each, what each protects, and the effective
   window.
4. Slow start: starting size, growth, and the connection-pool
   consequence.
5. CUBIC vs BBR in one sentence each — the philosophical split.
6. The Nagle × delayed-ACK bug: mechanism, symptom, fix.
7. TIME_WAIT: why it exists, the incident it causes at scale, three
   fixes ranked.
8. Ground two entries of your timeout stack in TCP mechanics.
9. TCP head-of-line blocking: cause, consequence, and which protocol
   generation fixes it.
10. Four things TCP does NOT give you, and who provides each instead.
11. The connection-pool ledger: three amortizations, three costs.
12. Compute BDP for 1 Gbps × 100 ms and state what it implies.

<details>
<summary><b>Answers</b></summary>

1. A reliable, ordered byte stream over unreliable IP. Mechanisms:
   sequence numbers (ordering + dedup), acknowledgments + adaptive
   retransmission (reliability), and windowed transmission
   (flow/congestion control).
2. SYN → SYN-ACK → ACK: agree initial sequence numbers, confirm
   bidirectional reachability. Cost: one RTT before data — ~0.5 ms
   intra-DC (ignorable), 50–150 ms cross-region (dominant; why pools
   and connection reuse matter most across distance).
3. rwnd: set by the receiver (its buffer space), protects the
   receiver — credit-based backpressure. cwnd: maintained by the
   sender (its estimate of path capacity), protects the network.
   Sender may have min(rwnd, cwnd) unacknowledged bytes in flight.
4. ~10 segments (~14 KB), doubling per RTT until loss/threshold. A
   cold connection can't use full bandwidth for several RTTs; warm
   pooled connections carry a grown cwnd — pools amortize the ramp,
   not just the handshake.
5. CUBIC: loss-based — grow until packet loss signals congestion,
   then back off (loss as the signal). BBR: model-based — directly
   estimate bottleneck bandwidth and min RTT, pace to the model
   (don't wait for loss; better on lossy/long-fat paths).
6. Nagle holds small writes until prior data is ACKed; delayed ACK
   holds ACKs ~40 ms hoping to piggyback. Request-response traffic
   deadlocks the two heuristics: your write waits for an ACK being
   deliberately delayed — mysterious ~40 ms latency quanta. Fix:
   TCP_NODELAY (disable Nagle), standard in RPC/HTTP clients.
7. The first closer holds the socket ~2×MSL (~60 s) to absorb stray
   late segments and re-send the final ACK if lost — protecting a
   future connection reusing the tuple. At high open/close churn,
   TIME_WAIT sockets exhaust ~28 k ephemeral ports → connection
   failures. Fixes: (1) stop churning — keep-alive/pooling (correct);
   (2) kernel tuning (tcp_tw_reuse, wider port range) (mitigation);
   (3) more source IPs (capacity).
8. Connect timeout bounds SYN retransmission (unset = OS exponential
   retry ~2 minutes — the hidden default). Read timeout bounds
   inter-byte gaps at the client library because TCP itself holds
   silent connections indefinitely (keepalive starts at 2 hours) —
   application timeouts are the only liveness on SLA timescales.
9. TCP promises ordered bytes, so one lost segment blocks delivery of
   all subsequent bytes in that connection — including logically
   independent multiplexed requests (HTTP/2's weakness on lossy
   networks). Fixed by QUIC/HTTP-3: independent streams with
   per-stream loss recovery over UDP.
10. Message boundaries → application framing (HTTP, gRPC length
    prefixes). Liveness detection → application heartbeats/timeouts.
    Application-level delivery guarantee (socket-acked ≠ processed) →
    application acks/idempotency. Inter-connection fairness → nothing
    (per-connection shares; why parallel-connection arms races
    happened).
11. Amortizes: handshake RTT(s) (+TLS), slow-start ramp (warm cwnd),
    TIME_WAIT/port churn. Costs: idle resources both ends; staleness
    (validate/evict + one safe retry on stale-connection failure);
    an implicit concurrency bulkhead that must be aligned with thread
    pools or it queues invisibly.
12. 10⁹ bits/s × 0.1 s = 10⁸ bits = 12.5 MB in flight to fill the
    pipe. Implication: window/buffer sizes must reach the BDP on
    long-fat paths, or throughput caps at window/RTT regardless of
    bandwidth — default buffers silently throttle cross-continent
    transfers.

</details>
