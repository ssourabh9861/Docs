# DNS and Anycast

DNS is the system everyone depends on, nobody thinks about, and every
design-round global architecture quietly assumes. Interviewers reach for it
three ways: mechanics ("what happens when you type a URL"), judgment
("design failover with DNS — what breaks?"), and the JVM gotcha that has
paged half the Java engineers alive. Anycast rides along because it's how
DNS itself — and every CDN — actually scales.

---

## 1. DNS: plain definition

DNS maps names to addresses via a **distributed, delegated, aggressively
cached hierarchy**. Resolution walks the delegation chain: your resolver
(OS/ISP/corporate — the **recursive resolver**) asks a **root** server
("who owns `.com`?"), then the TLD server ("who owns `flipkart.com`?"),
then the domain's **authoritative** server ("what's
`api.flipkart.com`?") — and **caches every answer** for its **TTL**. In
practice almost every query is a cache hit at some layer; the full walk
happens rarely.

Record types you should rattle off: **A/AAAA** (name → IPv4/IPv6),
**CNAME** (name → name alias — chases to another lookup; can't live at a
zone apex), **NS** (delegation), **MX** (mail), **TXT** (verification,
SPF), **SRV** (service + port — service-discovery flavored). Negative
answers (NXDOMAIN) are cached too (negative caching — with its own TTL),
which is why a typo'd record "stays broken" after you fix it.

**The one design lever DNS gives you is the TTL, and it's a lie-prone
one:** low TTL (30–60 s) = agility (repoint quickly for failover/
migration) at the cost of query volume and latency; high TTL (hours) =
cache efficiency and resilience-to-DNS-outage, at the cost of being
unable to move quickly. The senior caveat: **TTLs are advisory** —
resolvers and applications disobey (some ISP resolvers clamp/extend;
apps pin). Any failover design built on "we'll flip DNS and traffic
moves in 60 seconds" must state the honest tail: *most* traffic moves in
minutes; a long tail follows for hours. DNS failover is a blunt
instrument; use it for coarse disaster routing, not fast failover —
fast failover lives at load balancers and anycast.

## 2. The JVM gotcha (yours to own)

Java's `InetAddress` historically cached successful DNS lookups
**forever by default when a security manager was present**, and JVM/
distribution defaults vary (`networkaddress.cache.ttl`; commonly 30 s
without a security manager, `-1` = forever with one) — plus HTTP client
connection pools hold connections to *already-resolved* IPs anyway. Net
effect: **you repointed DNS and your Java service kept talking to the
old IP** — through failovers, migrations, and incident mitigations. The
fixes: set `networkaddress.cache.ttl` explicitly (~30–60 s), and
remember pooled connections must also be cycled (DNS re-resolution only
affects *new* connections — the pool is a second cache). **[VERIFY your
platform's JVM DNS TTL settings — this is a fair question about your own
services, and "I'd have to check" is survivable only once.]**

## 3. DNS as load balancing — and its bluntness

Round-robin A records (multiple IPs, rotated) and **GeoDNS** (answer
varies by resolver location) are the crudest LB tier
(`05-load-balancing.md`'s global layer). Why blunt: granularity is the
*resolver*, not the client (one ISP resolver = millions of users get
the same answer); caching defeats rebalancing on any fast timescale; no
health awareness unless the DNS provider health-checks and pulls
records (with the TTL tail above). Correct role: **coarse geographic/
disaster steering above real load balancers** — GSLB — never the
per-request balancing tier.

## 4. Anycast: plain definition and why it works

**Anycast** = announcing the **same IP prefix from many locations** via
BGP; internet routing delivers each packet to the "nearest" (in routing
terms) site. One IP, N locations, zero client logic. This is how the
root DNS servers, public resolvers (8.8.8.8, 1.1.1.1), and CDN edges
scale and absorb DDoS (attack traffic is *diffused* across all sites
instead of concentrating).

- **Perfect for DNS/UDP:** single-packet request/response — if routing
  shifts mid-"conversation," there is no conversation to break.
- **Workable for TCP/CDN with a caveat:** a route change (BGP flap)
  mid-connection sends your packets to a *different* site that has no
  state for your connection → reset. In practice routes are stable
  enough for short-to-medium connections, and big CDNs run anycast TCP
  at planetary scale successfully; long-lived connections are the
  risk case. The refined pattern: **anycast to the front door, then
  hand off** — anycast IP gets you to the nearest edge, which redirects/
  tunnels to stable unicast for session-heavy work.
- Contrast with GeoDNS: anycast decides per-*packet* in the network
  layer (fast failover: withdraw the BGP announcement and traffic
  reroutes in seconds, no TTL tail); GeoDNS decides per-*resolution*
  with caching lag. The two compose: GeoDNS + anycast edges is the
  standard global front door.

## 5. Senior-level depth

- **DNS is the universal correlated dependency** — it's on the
  `01-distributed-systems/01` §3 list of "what takes out redundant
  replicas together" for a reason: one bad zone push, one expired
  domain, one DNS-provider outage takes out everything at once,
  including your ability to fail over (the 2016 Dyn outage; several
  since). Mitigations: multi-provider DNS (two authoritative
  providers), long-ish TTLs on stable records (survive provider
  blips on caches), and runbooks that don't require working DNS.
- **Service discovery inside the platform:** Kubernetes DNS (CoreDNS)
  resolves services; but client-side caches + connection pools mean
  DNS-based discovery is eventually-consistent routing —
  `01-distributed-systems/04` §2.3's staleness-tolerant protocol
  applies (resolve → act → on-failure re-resolve/retry). For
  fast-moving endpoints, push-based discovery (xDS/mesh) supersedes
  polling DNS — the same poll-vs-push evolution as everything else.
- **What-happens-when-you-type-a-URL, the checklist** (own the whole
  stack now): browser/OS cache → recursive resolver (cache or full
  walk: root → TLD → authoritative) → A/AAAA answer cached at every
  hop per TTL → TCP handshake (`01-tcp.md`) → TLS 1.3 (`02-tls.md`)
  → HTTP/2 or 3 (`03-...md`) → your gateway (`08-api-design/06`).
  One narrative, five docs — deliver any slice at any depth.
- **L4/L5/L6:** L4 knows the resolution chain and TTLs. L5: TTLs as
  advisory with the failover tail, the JVM cache + connection-pool
  double-cache, GeoDNS's resolver-granularity bluntness, anycast
  mechanics with the TCP caveat, DNS as correlated failure. L6:
  global traffic architecture (GeoDNS + anycast edges + GSLB +
  regional LBs as one layered system), multi-provider DNS posture,
  and discovery-system strategy (DNS vs xDS).

## 6. Resume connection + spoken answer

Your platform's cross-DC story (Hyderabad/Chennai) does its routing at
the application layer (the gateway's DC-redirect filter) rather than
DNS — which is a *defensible design choice you should present as one*:
app-layer redirect gives per-request control, health-awareness, and no
TTL tail, at the cost of the request reaching you first. Plus the JVM
DNS TTL question is about your own services — verify it.

**30–60 s spoken answer** ("how would you fail over traffic between
regions?"):

> "Layered, because each layer has a different speed and granularity.
> DNS is the coarse tier: GeoDNS steers users to the right region, but
> its granularity is the resolver, not the client, and TTLs are
> advisory — flip a record and most traffic moves in minutes with a
> long tail of hours, so DNS is for disaster-scale steering, never fast
> failover. Fast failover lives below: anycast front doors reroute in
> seconds by withdrawing a BGP announcement — per-packet, no cache
> tail — and load balancers with health checks handle per-request
> decisions. Our platform actually does its cross-DC routing at the
> application layer — a gateway redirect filter — which trades an extra
> hop for per-request control and health-awareness with zero TTL tail.
> And the two operational facts I always flag: DNS is the universal
> correlated dependency — one bad zone push or provider outage takes
> out everything including your failover path, so multi-provider DNS
> and runbooks that don't need DNS; and in Java specifically, the JVM
> caches resolutions — historically forever under a security manager —
> and connection pools hold resolved IPs anyway, so 'we flipped DNS'
> does nothing to a Java fleet until you've set the cache TTL and
> cycled the pools. Two caches, both of which disobey you."

## Self-test

1. Walk the resolution chain, naming who caches what.
2. Five record types with one clause each; why can't a CNAME live at
   a zone apex (concept, not RFC-cite)?
3. The TTL trade, and the honest failover-tail caveat.
4. The JVM double-cache gotcha: both caches and both fixes.
5. Why is DNS-based load balancing blunt? Three reasons and its
   correct role.
6. Anycast: mechanism, why it's perfect for DNS, the TCP caveat, and
   the front-door pattern.
7. Anycast vs GeoDNS failover speed: why the difference?
8. Why is DNS the "universal correlated dependency"? Two real
   mitigations.
9. Negative caching: what it is and the operational surprise it
   causes.
10. DNS as service discovery: what consistency model is it really,
    and what supersedes it?
11. Defend your platform's app-layer DC routing against "just use
    GeoDNS."
12. Deliver the type-a-URL checklist in one breath.

<details>
<summary><b>Answers</b></summary>

1. Browser/OS cache → recursive resolver (ISP/corporate — the big
   cache) → if miss: root ("who owns .com") → TLD ("who owns
   domain.com") → authoritative server (the actual record). Every
   layer caches the answer for its TTL; roots/TLDs effectively
   always served from cache.
2. A/AAAA: name→IPv4/IPv6. CNAME: alias to another name (adds a
   resolution hop). NS: delegation to authoritative servers. TXT:
   free-text verification/policy (SPF, domain ownership). SRV:
   service+port records. CNAME-at-apex: the apex must carry NS/SOA
   records, and CNAME by definition says "this name has no other
   records — go look over there" — the two requirements contradict.
3. Low TTL: fast repointing (failover/migration agility) at the cost
   of query volume, latency, and dependence on DNS being up. High
   TTL: cache efficiency and resilience to DNS blips, but you can't
   move traffic quickly. Caveat: TTLs are advisory — resolvers clamp/
   extend, apps pin — so a "60-second failover" moves most traffic in
   minutes with an hours-long tail; plan for the tail.
4. Cache 1: JVM InetAddress cache (networkaddress.cache.ttl —
   historically forever with a security manager; varies by default).
   Cache 2: connection pools hold connections to already-resolved
   IPs — re-resolution affects only new connections. Fixes: set the
   JVM TTL explicitly (~30–60 s) AND cycle/max-lifetime pooled
   connections so re-resolution actually takes effect.
5. Granularity = resolver, not client (one ISP resolver's answer
   serves millions); caching defeats rebalancing on fast timescales
   (the TTL tail); health-blindness (record pulls propagate slowly
   even with provider health checks). Correct role: coarse
   geographic/disaster steering (GSLB tier) above real load
   balancers.
6. Announce the same IP prefix via BGP from many sites; routing
   delivers packets to the nearest. DNS/UDP: single-packet
   exchanges — a mid-"conversation" route shift breaks nothing. TCP
   caveat: a BGP flap mid-connection lands packets at a site with no
   connection state → reset; risk grows with connection lifetime.
   Pattern: anycast the front door, hand long sessions off to stable
   unicast behind it.
7. Anycast failover = withdraw the BGP announcement — routing
   reconverges in seconds and it's per-packet: no caches involved.
   GeoDNS failover = change answers that are cached across millions
   of resolvers per TTL (which is advisory) — minutes-to-hours tail.
   Network-layer decisions beat cached-resolution decisions on
   speed.
8. Every "redundant" replica shares the same names: one bad zone
   push, expired domain, or DNS-provider outage breaks all of them
   simultaneously — including the failover path itself (Dyn 2016).
   Mitigations: dual authoritative providers (zone served from two
   independent networks); TTLs long enough to ride out provider
   blips on caches; incident runbooks that work without DNS
   (IP-based access, pre-distributed configs).
9. Caching of NXDOMAIN/no-answer responses for a negative TTL.
   Surprise: you create the missing record, but resolvers keep
   serving "doesn't exist" until the negative TTL expires — "I fixed
   it but it's still broken," the inverse of normal cache staleness.
10. Eventually-consistent routing: resolve → cache → act → on
    failure, re-resolve and retry — the same staleness-tolerant
    protocol as partition-map routing. Superseded for fast-moving
    endpoints by push-based discovery (mesh/xDS control planes
    pushing endpoint sets), the standard poll→push evolution.
11. GeoDNS steers at resolver granularity with a TTL tail and no
    per-request health awareness; the app-layer redirect decides
    per request, sees real health/affinity (which DC owns this
    user/session), and moves traffic instantly — at the cost of the
    request first reaching a gateway. For payment traffic where
    correctness of DC affinity matters and volumes are modest
    relative to CDN-scale, per-request control wins; GeoDNS remains
    the coarse outer tier.
12. Browser/OS DNS cache → recursive resolver (walk if miss) → cached
    A/AAAA per TTL → TCP 3-way handshake → TLS 1.3 (1 RTT, or 0-RTT
    resumed) → HTTP/2 or 3 request → CDN/edge → gateway (auth, rate
    limit, route) → service. Each arrow expandable to its own doc's
    depth.

</details>
