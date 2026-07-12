# Load Balancing — L4 vs L7, Algorithms, Health, Draining

The directory's capstone: load balancers are where TCP mechanics, HTTP
generations, health detection, and deployment operations all meet — and
every system-design diagram contains at least one "LB" box the interviewer
can open. This doc makes every layer of that box yours, including the
gRPC/h2 trap previewed in `03-http1-http2-http3.md`.

---

## 1. Plain definition

A load balancer distributes incoming work across N replicas so capacity
adds up and failures subtract gracefully. The definitional split is **what
the LB understands**:

- **L4 (transport):** sees IPs, ports, and connections — balances
  **connections/flows** without reading payloads. Forwarding via NAT,
  IP tunneling, or DSR (direct server return — responses bypass the LB;
  worth one name-drop for asymmetric-bandwidth workloads). Blazing fast
  (millions of connections, often kernel/hardware path), protocol-blind.
- **L7 (application):** **terminates** the connection, parses HTTP,
  and balances **requests** — enabling path/header routing
  (`/payments → payment-svc`), per-request decisions across pooled
  backend connections, retries, TLS termination, and observability.
  Costs: full proxy work per request (more CPU, more latency —
  ~fraction-of-a-ms to ms), and it holds connection state.

The standard production shape is **layered**: DNS/GeoDNS (coarse global,
`04-dns-and-anycast.md`) → anycast/L4 tier (fast, DDoS-absorbing front
door) → L7 tier (routing, retries, TLS) → services — each layer balancing
at the granularity it can see. Naming the layering, not choosing a side,
is the L5 move.

## 2. Algorithms (and the one that wins)

- **Round-robin / weighted RR:** rotate (with capacity weights). Fine
  when requests and backends are uniform; blind to actual load.
- **Least-connections / least-request:** send to the backend with the
  fewest in-flight — adapts to slow backends automatically (a slow
  replica accumulates connections and stops receiving). The catch at
  scale: with *many distributed LB instances*, each sees only its own
  slice — "least" is computed on partial information, and herds form.
- **Power of two choices (P2C):** pick two backends at random, send to
  the less-loaded — near-optimal load spread with O(1) state and, the
  key property, **herd-resistant with distributed balancers** (random
  pairing decorrelates their choices). The modern default in Envoy-class
  proxies; knowing P2C and *why it beats global least-connections in
  distributed settings* is a reliable senior marker.
- **Consistent hashing / affinity:** route by key (session, user,
  cache-locality — `01-distributed-systems/04` §2.1) when statefulness
  or cache hit-rates demand it; bounded-load variants cap the hot-spot
  cost. Affinity is a *feature with a price* (hot keys, drain
  complexity) — take it only when something downstream is stateful.

## 3. Health, deploys, and the operational half

- **Health checking = failure detection** (`01-distributed-systems/07`
  applies wholesale): **active** checks (probe an endpoint every N s —
  cheap, but binary and probe-path-only) + **passive/outlier detection**
  (watch real request outcomes; eject a backend whose error rate/latency
  is an outlier vs its peers — catches the gray failures active probes
  miss; `05-resilience/02` §2.4's mesh breaker). Production wants both:
  active for is-it-alive, passive for is-it-actually-working. And the
  liveness-vs-readiness scoping (a check that queries a shared
  dependency de-routes the whole fleet on a dependency blip —
  `01-distributed-systems/07` P3's restart-storm, LB edition).
- **Connection draining (graceful deregistration):** on deploy/scale-in,
  stop sending *new* work to a backend, let in-flight requests finish
  (bounded by a drain timeout), then remove. Without it, every deploy is
  a burst of user-visible resets. The h2/persistent-connection wrinkle:
  long-lived connections must be actively closed politely (GOAWAY frames
  in h2) or they drain forever. Kubernetes ties this to readiness +
  preStop hooks — the "why do we see 502s during deploys" incident is a
  draining-misconfiguration story ~every time.
- **Slow start / warm-up:** a freshly added (or just-recovered) backend
  gets ramped traffic, not full share — cold caches, cold JIT, cold
  connection pools (`05-resilience/02` §3's reclose stampede; same
  medicine at the LB).

## 4. Senior-level depth

- **The gRPC/h2 trap, in full** (promised in `03-...md`): h2 multiplexes
  everything over one long-lived connection; an L4 balancer places
  *connections*, so that one connection — and ALL its requests — pins to
  one backend. Scale from 3 pods to 30 and the old pods stay loaded
  while new ones idle. Kubernetes ClusterIP/kube-proxy is L4, hence the
  famous gRPC-on-k8s uneven-load incident. Fixes: (1) L7 proxy/mesh
  (Envoy) balancing per-*request* across backend connection pools;
  (2) client-side load balancing (client resolves all endpoints —
  headless service — and spreads requests itself, xDS-fed);
  (3) crude: `MAX_CONNECTION_AGE` forcing periodic reconnects. The
  general lesson to state: **multiplexing changed the unit of work, so
  the balancer must balance the new unit** — protocol evolution breaks
  infrastructure assumptions.
- **The LB is a stateful SPOF wearing a redundancy costume:** L7 LBs
  hold connection state, so *their* failover isn't free (connections
  reset); L4 tiers use consistent hashing on flows + ECMP so any LB
  instance can die without remapping much (Google's Maglev — flow-
  consistent hashing at line rate — is the canonical name-drop). And
  the LB tier itself needs capacity planning: it sees *all* traffic;
  its saturation is everyone's outage.
- **Retries at the LB are a two-edged sword:** an L7 proxy retrying
  idempotent requests against another backend masks single-replica
  blips beautifully — and amplifies overload horribly (the retry-storm
  math of `05-resilience/04` now executed by infrastructure). Envoy's
  answer: retry *budgets* at the proxy layer. Every retry rule from the
  resilience directory applies to LB config verbatim — say that
  connection out loud.
- **L4/L5/L6:** L4-the-level: names round-robin and health checks.
  L5: the L4/L7 split by unit-of-balancing, P2C's distributed-herd
  argument, active+passive health, draining with the h2 GOAWAY
  wrinkle, slow-start, and the gRPC trap with its three fixes. L6: the
  layered global architecture (GeoDNS → anycast/L4 → L7 → mesh) as one
  system, LB-tier capacity as first-class, and org policy on where
  retries/timeouts/breakers live (client vs mesh vs LB — exactly-once
  ownership of each concern).

## 5. Resume connection + spoken answer

Your services live behind Flipkart's LB tiers with the gateway doing
app-layer DC routing above them; your deploys depend on draining
(k8s readiness + preStop — **[VERIFY your services' drain
configuration; "why don't your deploys drop payments?" is a fair and
excellent question you should own]**); and your gray-failure/outlier
instincts (`01-distributed-systems/07`) are exactly what passive health
checking automates.

**30–60 s spoken answer** ("how does load balancing actually work in
your architecture?"):

> "As layers, each balancing the unit it can see. Coarse and global:
> GeoDNS steering regions. Fast front door: L4 — balancing connections
> at line rate, protocol-blind, DDoS-absorbing. Then L7 — terminating
> connections and balancing individual requests, which is where routing,
> TLS, retries, and real algorithms live. The algorithm story worth
> knowing: least-connections adapts to slow backends but herds when many
> distributed balancers each act on partial views; power-of-two-choices
> — pick two at random, send to the less loaded — is near-optimal with
> O(1) state and stays herd-resistant, which is why it's the modern
> default. Health is two channels: active probes for is-it-alive, and
> passive outlier detection on real request outcomes for the gray
> failures probes miss — a limping replica gets ejected by comparison
> against its peers. Deploys depend on draining: stop new work, let
> in-flight finish, and for HTTP/2 actively send GOAWAY or long-lived
> connections never drain — every mysterious 502-during-deploy story is
> a draining misconfiguration. And the trap I always flag: gRPC's
> single multiplexed connection defeats L4 balancing entirely — the
> connection pins to one backend and Kubernetes' kube-proxy is L4, so
> gRPC needs per-request L7 or client-side balancing. Multiplexing
> changed the unit of work; the balancer has to balance the new unit."

## Self-test

1. L4 vs L7: what each sees, what each balances, and each one's cost.
2. The standard layered shape, and why layering beats choosing.
3. Least-connections' distributed-herd problem, and how P2C solves it
   with O(1) state.
4. When is affinity/consistent-hashing justified, and what price does
   it carry?
5. Active vs passive health checks: what each catches, and why
   production needs both.
6. Connection draining: the mechanism, the h2 wrinkle, and the classic
   incident it explains.
7. Why do fresh backends need slow-start? Connect it to a resilience
   pattern.
8. The gRPC/h2 trap: mechanism, why Kubernetes hits it, three fixes.
9. Why is an L7 LB's own failover not free, and what does the L4 tier
   do about its own?
10. LB-level retries: the gift and the danger, and Envoy's answer.
11. State the "unit of balancing" lesson in one sentence.
12. Answer "why don't your deploys drop payments?" for your own
    services.

<details>
<summary><b>Answers</b></summary>

1. L4: sees IPs/ports/flows, balances connections, forwards without
   reading payloads (NAT/tunnel/DSR) — line-rate fast, protocol-blind,
   no content routing. L7: terminates and parses HTTP, balances
   requests — content routing, TLS termination, retries,
   per-request placement — at the cost of full-proxy CPU/latency and
   held connection state.
2. GeoDNS (coarse geographic steering, TTL-lagged) → anycast/L4 front
   door (fast, DDoS-diffusing, connection-level) → L7 tier (request
   routing, TLS, retries) → services/mesh. Each layer balances at the
   granularity visible to it; no single layer can do all jobs (DNS
   can't see requests; L7 can't absorb line-rate floods as cheaply).
3. Many LB instances each track only their own in-flight counts;
   "least loaded" computed on partial views sends simultaneous bursts
   to the same apparently-idle backend (herding). P2C: sample two
   random backends, pick the less loaded — randomization decorrelates
   the balancers' choices while still exploiting load information;
   near-optimal spread, constant state.
4. When something downstream is stateful or cache-local: sessions
   that aren't externalized, per-key caches whose hit rate collapses
   under random routing, sticky protocols. Price: hot keys
   concentrate (skew), draining/failover must migrate or lose
   affinity state, and the balancer inherits partition-rebalancing
   problems (bounded-load variants cap the worst of it).
5. Active: periodic synthetic probes — catches dead/unreachable
   backends cheaply, but is binary, probe-path-only, and blind to
   "serves probes, fails real work." Passive/outlier: judge real
   request outcomes, eject statistical outliers vs peers — catches
   gray failures/limping replicas. Both: active for liveness floor,
   passive for actual-work health.
6. Deregister from new traffic → allow in-flight to complete within a
   drain timeout → shut down. h2/persistent connections don't end on
   their own — the backend must send GOAWAY (and pools must honor
   max-connection-age) or "draining" waits on connections that never
   close. The 502s-during-every-deploy incident is draining
   missing/misconfigured (k8s: readiness-off + preStop delay +
   graceful shutdown).
7. New/recovered backends have cold caches, cold JIT, empty
   connection pools — full traffic share instantly means high latency
   /errors, which passive health then ejects: flapping. Ramp traffic
   over a warm-up window. Same mechanism as the circuit-breaker
   reclose stampede (`05-resilience/02` §3) — cold capacity must be
   warmed gradually everywhere.
8. h2/gRPC multiplexes all requests over one long-lived connection;
   L4 places connections, so everything pins to one backend —
   scale-out adds idle pods. Kubernetes ClusterIP/kube-proxy operates
   at L4, hence the canonical incident. Fixes: L7 proxy/mesh
   balancing per-request (Envoy); client-side LB over headless-
   service endpoints (xDS-fed); MAX_CONNECTION_AGE forcing periodic
   re-connects (crude).
9. L7 termination means the LB holds live connection state — its
   death resets those connections (clients must reconnect/retry).
   L4 tiers protect themselves with flow-consistent hashing + ECMP
   (Maglev-style): any instance's death leaves most flows mapping to
   the same backends via the consistent hash, so the tier degrades
   smoothly.
10. Gift: proxy-level retry of idempotent requests against a
    different backend erases single-replica blips without client
    changes. Danger: infrastructure-executed retry amplification —
    overload multiplied by policy at the layer seeing all traffic.
    Envoy's answer: retry budgets (retries capped as a fraction of
    active requests) — the fleet-level governor from
    `05-resilience/04` §2.4, implemented in the proxy.
11. The balancer must balance the protocol's actual unit of work —
    when multiplexing moved the unit from connection to request
    (h1→h2), balancing had to move up a layer with it or silently
    stop working.
12. Deploys drain: readiness gate flips first so the LB/k8s service
    stops sending new requests; preStop hook + graceful-shutdown
    window lets in-flight payment requests complete (bounded by the
    drain timeout, sized above request p99); persistent connections
    are closed politely (GOAWAY / connection max-age); and the async
    architecture bounds the blast radius anyway — a request that
    does fail at the edge retries idempotently, and accepted
    payments are already durable in the queue, so a pod's death
    never strands money [verify your actual preStop/termination
    grace settings].

</details>
