# HTTP/1.1 → HTTP/2 → HTTP/3 — One Problem, Three Generations

The whole arc is a single story told three times: **head-of-line blocking,
chased down the stack.** HTTP/1.1 had it at the application layer; HTTP/2
fixed that and exposed it at the TCP layer; HTTP/3 rebuilt the transport to
kill it there. Tell it as that story and you'll outperform candidates who
memorized feature lists — and your users (mobile UPI clients on Indian
cellular networks) are precisely the population HTTP/3 was built for.

---

## 1. HTTP/1.1 — the application-layer bottleneck

One request occupies one connection at a time: send request, wait for the
complete response, then the next (keep-alive reuses the connection but
serializes on it; pipelining was specified but broken in practice —
responses had to return in order, one slow response blocked all, proxies
mangled it, browsers disabled it). **HOL blocking, layer 7:** request B
waits behind slow response A for no reason but the protocol.

The workarounds became web folklore: browsers opened **6 parallel
connections per origin**; sites did domain sharding (assets across
subdomains to get 6 more), spriting, inlining, concatenation — all of it
infrastructure fighting the protocol. Also: headers sent as uncompressed
text, re-sent in full per request (cookies × every asset).

## 2. HTTP/2 — multiplexing, and the problem moves down a layer

One TCP connection carries many concurrent **streams**; requests and
responses are broken into binary **frames**, interleaved, and reassembled
per stream — request B no longer waits for response A. Plus **HPACK**
header compression (indexed tables — repeated headers cost bytes, not
kilobytes), stream prioritization (messy in practice), and server push
(deprecated/removed in practice — knowing it's dead is the currency
signal). The 6-connection arms race and the sharding hacks became
obsolete overnight.

**But:** all those streams ride ONE TCP byte stream, and TCP promises
ordered delivery of the whole stream — so **one lost packet stalls every
stream** until retransmission repairs the byte sequence
(`01-tcp.md` §3). HOL blocking didn't die; it moved to layer 4. The
brutal consequence: **on lossy networks, HTTP/2 can be *worse* than
HTTP/1.1** — h1's six connections meant a loss stalled one-sixth of the
traffic; h2's single connection stalls everything. This inversion is the
single best fact in the topic; deliver it with the mechanism.

Where h2 unambiguously wins regardless: clean networks (data centers —
which is why gRPC is h2, `08-api-design/05`), header-heavy APIs, and
many-small-requests workloads.

## 3. HTTP/3 — QUIC rebuilds the transport

**QUIC** is a new transport running over **UDP**, with HTTP/3 as its HTTP
mapping. What it fixes, feature by mechanism:

- **Per-stream loss recovery:** streams are independent at the
  *transport* layer — a lost packet stalls only the stream(s) whose data
  it carried; other streams keep delivering. HOL blocking finally dies
  at the layer it lived.
- **Merged handshake:** QUIC integrates TLS 1.3 — transport + crypto
  setup in **1 RTT** (0-RTT for resumption, same replay caveat as
  `02-tls.md` §3), vs TCP+TLS's 2–3 RTTs cold.
- **Connection migration:** connections are identified by a
  **connection ID**, not the (IP, port) 4-tuple — a phone hopping from
  WiFi to cellular *keeps its connections* instead of resetting
  everything (TCP connections die with the IP). For mobile users this
  is the headline feature.
- **Why UDP:** not for speed — for **deployability**. Middleboxes
  (NATs, firewalls, "TCP accelerators") ossified TCP: they parse and
  "fix" TCP headers, so changing TCP on the real internet is
  impossible; kernel TCP stacks also evolve at OS-upgrade speed. UDP
  passes through middleboxes untouched, and QUIC encrypts its own
  transport headers so middleboxes *can't* ossify it, while living in
  userspace so it iterates at software speed. "UDP is the tunnel under
  the ossified internet" — that's the answer to "why UDP?", and it's a
  systems-evolution insight, not a networking detail.
- Costs (say them): UDP path CPU (less kernel/NIC offload maturity,
  improving), some networks throttle/block UDP (h3 always falls back to
  h2 — negotiated via `Alt-Svc`), and userspace stacks vary in quality.

## 4. Senior-level depth

- **Which generation where** (the judgment table): browsers/mobile edge →
  h2 minimum, h3 where your CDN/edge supports it (mobile + lossy + long
  RTT = maximum h3 dividend); datacenter east-west → gRPC-over-h2
  (clean networks neutralize h3's core win; h2's ecosystem is mature);
  h1.1 survives in webhooks/simple internals (ubiquity — and note *your
  partners' webhook receivers* are likely h1.1).
- **The gRPC/h2 load-balancing trap** (previewing
  `05-load-balancing.md`): h2's virtue — one multiplexed long-lived
  connection — defeats L4 load balancing: the connection pins to one
  backend and ALL its multiplexed requests go there. The famous
  gRPC-on-Kubernetes uneven-load incident; fix is L7/per-request
  balancing. Multiplexing changed the *unit* of balancing — a
  generation-interaction most candidates miss.
- **Latency arithmetic to have ready:** cold page load cross-region
  (100 ms RTT): h1.1+TLS1.2 ≈ 1 (TCP) + 2 (TLS) + 1 (request) = 4 RTTs
  = 400 ms before render data; h2+TLS1.3 = 3 RTTs; h3 = 2 RTTs cold,
  **1 RTT resumed (0 for replay-safe data)**. Halving cold-start RTTs
  is the whole business case in one line.
- **L4/L5/L6:** L4 lists features per version. L5 tells the
  HOL-descent story, knows the h2-worse-than-h1-on-loss inversion, the
  why-UDP ossification argument, connection migration's mobile payoff,
  and the h2 balancing trap. L6 makes fleet calls: edge protocol
  policy, CDN h3 rollout economics, when datacenter traffic should
  care, and QUIC's userspace-CPU trade at scale.

## 5. Resume connection + spoken answer

Your client population is the h3 target demographic: UPI payments from
mobile devices on Indian cellular networks — lossy, high-RTT-variance,
WiFi↔cellular handoffs mid-session. Whether your edge serves h2 or h3
is a Flipkart-edge question **[VERIFY what the app's edge actually
negotiates — knowing your own edge protocol is a fair question]**, but
the *analysis* is yours to own: connection migration and per-stream loss
recovery map directly onto payment-flow reliability for your users. And
internally, gRPC-over-h2 is the `08-api-design/05` story.

**30–60 s spoken answer** ("h1 vs h2 vs h3?"):

> "It's one story: head-of-line blocking chased down the stack. HTTP/1.1
> serializes — one request at a time per connection — so the web fought
> the protocol with six parallel connections and domain sharding. HTTP/2
> multiplexes many streams over one connection with binary framing and
> header compression, which killed the layer-7 problem — and exposed the
> layer-4 one: all streams share one TCP byte stream, TCP promises
> ordered delivery, so one lost packet stalls every stream. Which
> produces the counterintuitive fact: on lossy networks h2 can be worse
> than h1, because h1's six connections at least isolated losses to a
> sixth of the traffic. HTTP/3 rebuilds the transport as QUIC over UDP:
> streams are independent at the transport layer so a loss stalls only
> its own stream; the TLS 1.3 handshake is merged in for one-RTT setup;
> and connections are identified by a connection ID instead of the IP
> tuple, so a phone hopping WiFi to cellular keeps its connections —
> which for our users, mobile UPI payments on Indian cellular networks,
> is exactly the target demographic. And UDP isn't about speed: it's
> deployability — middleboxes ossified TCP so it can't evolve on the
> real internet, while QUIC tunnels through as UDP and encrypts its own
> transport headers so nothing can ossify it. Internally, though, clean
> datacenter networks neutralize h3's core win — east-west stays
> gRPC-over-h2, with the one trap that multiplexed long-lived
> connections defeat L4 balancing, so gRPC needs per-request L7
> balancing."

## Self-test

1. Tell the one-story arc in three sentences.
2. Why was h1.1 pipelining a failure, and what three workarounds did
   the web adopt?
3. What exactly is an h2 stream/frame, and what did HPACK fix?
4. Construct the h2-worse-than-h1-on-loss inversion with its
   mechanism.
5. QUIC's four fixes, each with its mechanism.
6. "Why UDP?" — give the ossification answer.
7. Connection migration: what identifies a QUIC connection, and who
   benefits most?
8. The 0-RTT caveat — where did you already learn it?
9. Do the cold-connection RTT arithmetic for all three generations at
   100 ms RTT.
10. The gRPC/h2 load-balancing trap: mechanism and fix.
11. Which generation where — the three-row judgment table.
12. Name h3's three real costs.

<details>
<summary><b>Answers</b></summary>

1. HTTP/1.1 blocks at layer 7 (one request at a time per connection).
   HTTP/2 multiplexes streams over one TCP connection — fixing layer 7
   and exposing the same blocking at layer 4 (one lost packet stalls
   all streams). HTTP/3/QUIC rebuilds transport over UDP with
   independent streams, killing it at the layer it lived.
2. Pipelining required in-order responses (one slow response blocked
   all behind it), and intermediaries/proxies handled it incorrectly —
   browsers disabled it. Workarounds: 6 parallel connections per
   origin, domain sharding for more, and asset bundling
   (spriting/concatenation/inlining) to reduce request count.
3. A stream is an independent request/response exchange; frames are
   the binary chunks streams are broken into, interleaved on the
   connection, and reassembled per stream-ID. HPACK: indexed header
   tables so repeated headers (cookies, UAs) transmit as small
   references instead of full text per request.
4. h2 rides one TCP connection; TCP delivers bytes in order, so a
   single lost segment halts delivery of ALL multiplexed streams
   until retransmission. h1's six connections isolated a loss to
   ~1/6 of in-flight traffic. High loss rate ⇒ h2's stall-everything
   behavior underperforms h1's crude parallelism.
5. Per-stream loss recovery (streams independent at transport — loss
   stalls only its stream); merged QUIC+TLS1.3 handshake (1-RTT cold,
   0-RTT resumed); connection migration (connection-ID identity
   survives IP changes); anti-ossification (encrypted transport
   headers + userspace stacks iterate at software speed).
6. Changing TCP on the public internet is impossible: middleboxes
   parse and normalize TCP headers ("helpfully" rewriting what they
   don't recognize), and kernel stacks upgrade at OS speed. UDP
   passes through untouched; QUIC lives inside it, encrypts its own
   transport metadata so middleboxes can't learn to meddle, and
   iterates in userspace. UDP is the tunnel under the ossified
   internet — deployability, not speed.
7. A connection ID chosen by the endpoints, not the (src IP, src
   port, dst IP, dst port) tuple. Mobile users benefit most: WiFi↔
   cellular handoffs change the IP, which kills every TCP connection
   but leaves QUIC connections (and in-flight requests) intact.
8. 0-RTT early data is capturable and replayable by a network
   attacker — safe only for idempotent requests. Learned in
   `02-tls.md` §3 (and ultimately from `05-resilience/07`): the
   which-operations-survive-replay lens gates the feature.
9. h1.1+TLS1.2: 1 (TCP) + 2 (TLS) + 1 (req/resp) = 4 RTTs = 400 ms.
   h2+TLS1.3: 1 + 1 + 1 = 3 RTTs = 300 ms. h3: transport+TLS merged
   = 1 + 1 = 2 RTTs = 200 ms cold; resumed 1 RTT (100 ms), 0-RTT for
   replay-safe data.
10. L4 balancers distribute *connections*; h2/gRPC opens one
    long-lived multiplexed connection, so all its requests pin to one
    backend — uneven load, famously on Kubernetes (kube-proxy is
    L4). Fix: per-request L7 balancing (Envoy/mesh, or client-side
    load balancing with a resolver).
11. Public edge/browsers/mobile: h2 minimum, h3 via CDN where
    supported — max dividend on lossy/high-RTT/mobile. Datacenter
    east-west: gRPC-over-h2 — clean networks neutralize h3's win,
    h2 ecosystem mature. Legacy/partner simplicity (webhook
    receivers): h1.1 persists on ubiquity.
12. UDP-path CPU cost (weaker kernel/NIC offload maturity than TCP,
    improving); some networks throttle or block UDP (requires
    Alt-Svc negotiation + h2 fallback); userspace stack variability
    (quality/tuning differs by implementation).

</details>
