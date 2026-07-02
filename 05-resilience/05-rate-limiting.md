# Rate Limiting

"Design a rate limiter" is a top-5 system design question, and "we rate limit
sensitive endpoints" is on your resume — so this topic gets attacked from both
directions: algorithm mechanics and gateway-operator judgment. This doc covers
the four core algorithms with their exact failure modes, the distributed problem,
and the decisions (what to key on, what to return, where to enforce) that
algorithms don't answer.

---

## 1. Plain definition

A **rate limiter** bounds how many operations a caller (user, device, API key,
tenant, IP — or everyone combined) may perform per unit time, rejecting or
delaying the excess. Three distinct jobs, often conflated — name which one
you're doing, because they tune differently:

1. **Protection:** keep aggregate demand under your (or a partner's) capacity —
   the resilience job; limits derive from measured capacity.
2. **Abuse control:** brute force, scraping, enumeration — the security job;
   limits derive from "no legitimate human does this" (5 MPIN attempts/minute,
   not 5,000).
3. **Fairness/economics:** quotas per tenant/plan so one consumer can't starve
   others — the product job; limits derive from contracts.

Analogy: a nightclub. Capacity limit = fire code (protection). Bouncer turning
away someone trying 20 fake IDs = abuse control. VIP list with guaranteed entry
= fairness/quota. Same door, three different policies.

Rate limiting vs its neighbors (precision here is cheap L5 signal): **load
shedding** decides by *current system health* (drop because we're drowning);
rate limiting decides by *predeclared policy* (drop because you exceeded your
allowance) — shedding is reactive, limiting is contractual. A **quota** is a
rate limit over a long window (per day/month), usually for economics. A
**concurrency limit/bulkhead** caps simultaneous in-flight work, not arrival
rate — orthogonal and complementary.

---

## 2. The algorithms (mechanics + the exact failure mode of each)

### 2.1 Token bucket (the default; know it perfectly)

A bucket holds up to **B** tokens, refilled at **r** tokens/sec. Each request
takes a token; empty bucket ⇒ reject (or wait). Implementation is O(1) with two
numbers — no timer needed: store `(tokens, last_refill_ts)`; on arrival,
`tokens = min(B, tokens + (now − last_ts) × r)`, then decrement if ≥ 1.
- **Semantics:** sustained rate r with bursts up to B — matches real traffic
  (humans and apps are bursty); B is the *burst budget*, r the *long-run
  contract*.
- **Failure/gotcha:** B is instantaneous exposure — a burst of B hits your
  backend in one moment; setting B without knowing what the backend absorbs
  per-instant defeats the protection job. Also: cost-weighted requests (a
  heavy search costs 10 tokens) are a natural extension — mention it.

### 2.2 Leaky bucket (as queue)

Requests enter a fixed-size queue drained at constant rate r; full queue ⇒
reject. Output is perfectly smooth (r, no bursts) — it *shapes* traffic rather
than just policing it.
- **Use:** when the protected thing needs constant-rate input (a fragile
  partner API, a mainframe).
- **Failure:** the queue adds latency (position k waits k/r) and under
  sustained excess it's always full — you've added delay to every request and
  still reject. For user-facing paths, policing (token bucket) usually beats
  shaping. (Note: "leaky bucket as meter" is mathematically equivalent to a
  token bucket — don't get dragged into the pedantry; state the queue version
  and move on.)

### 2.3 Fixed window counter

Counter per key per window (`user123:12:05` → count); reject above N;
window resets on the minute.
- **Wins:** trivially cheap and shardable; one INCR with TTL.
- **The boundary failure (know the number):** N requests at 12:04:59 + N at
  12:05:01 = **2N in ~2 seconds** — double the intended rate through the
  window seam. Fine for coarse quotas; wrong for tight protection.

### 2.4 Sliding window log

Store a timestamp per request per key; on arrival, evict entries older than
the window, count the rest, compare to N.
- **Wins:** exact — no boundary artifact.
- **Failure:** memory O(N) per key (a 10k/min limit = up to 10k timestamps per
  key) and O(log/evict) work per request; at gateway scale this is real money.
  Use when precision matters and limits are small (login attempts).

### 2.5 Sliding window counter (the practical compromise)

Keep counts for current and previous fixed windows; estimate:
`rate ≈ curr + prev × overlap_fraction`. E.g., 40% into the current minute:
`curr + 0.6 × prev`. Assumes the previous window's traffic was uniform —
approximation error is bounded and small in practice; memory is two integers.
This is what most production gateways actually run. (GCRA — the
"virtual-scheduling" formulation used by some proxies — achieves similar
smoothness with one timestamp; name-drop only.)

---

## 3. Senior-level depth

### The distributed problem (where design interviews actually go)

Your gateway runs N pods; a "100 rps per user" limit enforced independently
per pod = up to 100·N fleet-wide (LB spreads a user across pods). Options,
with the trade each makes:

1. **Per-instance ÷ N:** give each pod 100/N. Zero coordination; fails with
   uneven load balancing (sticky users, hot pods) — both false rejects and
   overshoot. Acceptable for coarse protection limits, wrong for precise
   quotas.
2. **Centralized counters** (Redis/Aerospike): atomic INCR-with-TTL or a Lua/
   server-side token-bucket script per key. Precise; costs a network hop
   (~0.5–1 ms intra-DC) per decision and creates a hot dependency — which
   itself needs a **fail-open vs fail-closed policy** (see below) and
   hot-key care (the global limit's key is itself a hot key; shard it).
3. **Local cache + async sync:** decide locally against a cached allowance,
   reconcile with the central store asynchronously (or pre-allocate token
   *batches* per pod — "borrow 10 tokens at a time"). Bounded overshoot
   (≤ batch × pods), sub-ms decisions. This is the production sweet spot;
   describing it unprompted is the L5 move.
4. **Sticky routing by key:** hash user → pod; enforce locally, exactly.
   Precise and cheap until a pod dies or scales (rebalancing churn), and it
   fights your load balancer's job.

**Fail-open or fail-closed when the limiter's store blips?** Same reasoning
pattern as your dedup cache (arsenal D2): protection limits on payment paths
fail-open (availability of payments > precision of limits, and deeper layers
still protect); abuse limits on auth endpoints lean fail-closed or
degraded-strict (an MPIN brute-forcer is exactly who benefits from your
outage). Per-limit-class policy, stated in config, not improvised mid-incident.

### Decisions the algorithm doesn't make

- **Key choice:** user ID (fair, needs auth), device (pre-auth abuse), IP
  (cheap, brutal — NATs/CGNAT make one IP = thousands of users; mobile
  carriers especially), API key/tenant (B2B), endpoint-global (capacity
  backstop). Real systems **layer**: per-user AND per-IP AND global ceiling.
- **Response contract:** 429 + `Retry-After` (+ `X-RateLimit-Remaining/Reset`
  for B2B). A limiter without Retry-After creates the retry storms it exists
  to prevent — coordinate with `04-retries.md`.
- **Enforcement point:** edge/gateway (cheapest, before work is done — your
  model), per-service (protects specific backends), client-side
  self-throttling (politeness for partners you call — you *are* the client to
  SM/NPCI; partner rate agreements make this real for you **[VERIFY whether
  you self-throttle toward partners or rely on bulkhead saturation]**).
- **Limit lifecycle:** shadow mode first (log would-be rejections, size the
  false-positive rate), then enforce; alert on sustained rejection-rate
  changes (a spike means attack or client bug — both actionable).

### L4 vs L5 vs L6

- **L4:** names token bucket and 429.
- **L5:** all four algorithms with exact failure modes; the distributed
  options with trades; layered keys; fail-open policy per limit class;
  Retry-After as storm prevention; shadow rollout.
- **L6:** limits as a platform product — declarative policy, cost-weighted
  tokens, adaptive limits derived from live capacity signals (auto-tuning the
  protection job), per-tenant SLO isolation, and economic design (quotas
  that shape customer behavior).

---

## 4. Resume connection

- **Gateway rate limiting on sensitive endpoints:** your deployment is the
  *abuse-control* and *protection* jobs at the edge. Be ready with specifics:
  which endpoints (MPIN attempts, balance checks, eligibility), keyed on what
  (user/device/IP?), which algorithm your framework used, and what the
  rejection returned **[VERIFY all four — "we rate limit" without these
  details reads as decoration; even "fixed-window counters in Aerospike keyed
  per-user" is a fine, defensible answer if true]**.
- **The eligibility short-circuit is demand *elimination*, complementing
  limiting:** you removed ~[X]% of partner calls structurally (no active
  mandate ⇒ no call) — cheaper than policing them. Pattern sentence: "before
  rate-limiting demand, delete the demand that shouldn't exist."
- **Partner-side reality:** NPCI/PSP/SM meter *you*; your Hystrix pools
  effectively cap outbound concurrency (a concurrency limit, not a rate
  limit — know the difference and that both bound partner load).
- **Aerospike as the natural centralized-counter store** for your
  architecture (sub-ms, already on the payment path, TTL-native) — if asked
  to design a distributed limiter "for your platform", build it on the
  local-batch + Aerospike-reconcile pattern and you're designing at home.

**30–60 s spoken answer** ("tell me about your rate limiting"):

> "At the gateway we run limits for two different jobs, tuned differently.
> Abuse control on authentication-adjacent endpoints — MPIN attempts, device
> flows — where limits come from 'no legitimate user does this' and lean
> strict; and protection limits on expensive fan-out endpoints like balance
> and eligibility checks, where limits derive from downstream and partner
> capacity. Enforcement is at the edge, before any work is done, keyed in
> layers — per-user with an endpoint-global ceiling — and rejections carry
> Retry-After, because a limiter that doesn't tell clients when to come back
> just manufactures the retry storm it was built to prevent. The complement
> that did the most for partner load, though, wasn't a limiter: the
> eligibility pipeline short-circuits on a local mandate check, which
> structurally deleted the majority of partner calls instead of policing
> them — cheapest request is the one that never happens. And for the
> distributed question — N gateway pods sharing one user's limit — the
> pattern I'd defend is local token batches reconciled against a central
> Aerospike counter: sub-millisecond decisions, overshoot bounded by batch
> size times pods, no hot dependency on the request path."

---

## 5. What the interviewer will push on

**P1. "Design a distributed rate limiter: 10k gateway pods, per-user limits,
sub-ms budget."** (the classic — expect it verbatim)
- *Model:* requirements first (precision vs latency vs availability — you
  can't max all three). Then the ladder from §3: reject per-instance-÷-N
  (uneven LB), reject pure-central (1 ms hop × every request + hot
  dependency), land on **token batches**: pods claim batches of tokens per
  hot key from a central store (Redis/Aerospike, sharded counters for hot
  keys), decide locally, return unused tokens on idle; overshoot ≤
  batch×pods, tunable; store outage → fail-open with local fallback limits,
  per limit class. Cover: key cardinality/memory (TTL everything), clock
  skew (windows computed from store time or tokens-not-timestamps), the
  429/Retry-After contract, and shadow-mode rollout. Sketch the token-bucket
  state (two numbers) to show O(1).
- *Trap:* jumping to "Redis INCR" without the per-request latency/hot-key/
  outage analysis — the question is 20% algorithm, 80% distribution trades.

**P2. "Token bucket vs leaky bucket vs sliding window — pick for: (a) public
API monetized quotas, (b) calls to a fragile partner that dies above 50 rps,
(c) login attempts."**
- *Model:* (a) token bucket — bursty clients are legitimate; B = product
  decision; long-window quota layered on top; expose remaining/reset headers.
  (b) leaky bucket / shaper (or client-side token bucket with B≈1..small) —
  the partner needs *smooth* input; policing alone still lets B-sized bursts
  through; add outbound concurrency cap. (c) sliding window log — small N
  (5–10/min) makes exact memory trivial, and boundary artifacts matter for
  security (2N through a seam is a real brute-force gift); layered per-user
  + per-IP + per-device.
- *Trap:* one-algorithm-fits-all, or missing that (c)'s tiny N flips the
  memory argument that rules the log out elsewhere.

**P3. "Your limiter's Redis is down. What happens to payments?"**
- *Model:* per-class policy, decided in advance: protection limits fail-open
  (serve; deeper layers — bulkheads, shedding, partner caps — still bound
  damage; log for later), abuse limits fail-strict-degraded (local
  conservative fallback limits per pod — e.g., MPIN capped per-instance at a
  small number — because auth brute-force is exactly what shouldn't get a
  free window). Alert loudly either way; limiter-store health is a
  first-class SLI. Cite the parallel to your dedup fail-open reasoning —
  layered defenses license availability-leaning choices.
- *Trap:* one answer for all limits; or fail-closed-everything (a cache blip
  becomes a payment outage — you built the platform specifically to avoid
  that shape).

**P4. "Fixed window: show me the exact worst case, then fix it for two
integers of memory."**
- *Model:* limit N/min: N requests in the last instant of window W₁ + N in
  the first instant of W₂ ⇒ 2N within ε seconds; intended max over any
  60-second span was N. Fix: sliding window counter — keep curr and prev
  counts; effective = curr + prev × (1 − elapsed_fraction); reject if ≥ N.
  State the assumption (prev window ~uniform) and the bound (error small,
  worst when prev traffic was one burst — still ≤ 2× only in pathological
  cases vs guaranteed seam artifact before).
- *Trap:* fixing it with the log (right answer, wrong constraint — the
  question said two integers).

**P5. "Should you rate limit *retries*?"** (sleeper question tying the doc to
`04-retries.md`)
- *Model:* yes — twice. As the *server*: retried traffic during your own
  brownout is exactly what admission control should shed first, and your 429s
  must carry Retry-After so you shape the storm rather than reflect it. As
  the *client*: retry budgets ARE a rate limiter on your own retries (tokens
  earned by successes) — same primitive, aimed inward. Bonus: distinguish
  limiting new-vs-retried work at admission (retry-marker headers /
  attempt counts) — degraded systems should prefer *fresh* work at the
  margin because retried work has already failed once and may be abandoned.
- *Trap:* treating retries as sacred traffic that must always pass — that's
  the metastable loop's food.

---

## Self-test

1. Name the three jobs of rate limiting and how each derives its limit
   numbers.
2. Rate limiting vs load shedding vs quota vs concurrency limit — one line
   each.
3. Token bucket: state, refill math (lazy, no timers), and the semantics of
   B and r.
4. Fixed window's boundary failure with the 2N construction; the two-integer
   fix and its assumption.
5. Sliding window log: when is it right despite O(N) memory? Why exactly
   there?
6. The four distributed enforcement options with one trade each; which is
   the production sweet spot and its overshoot bound?
7. Fail-open vs fail-closed for limiter-store outage: give the per-class
   policy and the reasoning parallel from your own platform.
8. Why is Retry-After part of the limiter's core contract, not a nicety?
9. What should you key on for: pre-auth device flows, B2B APIs, a global
   capacity backstop? Why do real systems layer keys?
10. What did your eligibility short-circuit do that a rate limiter can't?
    State the pattern sentence.
11. Design constraint check: leaky-bucket-as-queue adds what cost to every
    request, and when is that acceptable?
12. How do rate limiters and retry budgets relate? Same primitive aimed
    where?

<details>
<summary><b>Answers</b></summary>

1. Protection (limits from measured system/partner capacity), abuse control
   (limits from "no legitimate actor behaves this way" — human-scale
   numbers), fairness/economics (limits from contracts/plans/tenancy).
2. Shedding: reactive, drops by current health. Limiting: contractual, drops
   by predeclared allowance. Quota: a limit over long windows for economics.
   Concurrency limit: caps in-flight simultaneous work, not arrival rate.
3. State: (tokens, last_ts). On arrival: tokens = min(B, tokens +
   (now−last_ts)·r); if tokens ≥ cost, subtract and admit, else reject. r =
   sustained long-run rate; B = burst budget = max instantaneous exposure.
4. N at 12:04:59.9 + N at 12:05:00.1 — both windows individually legal ⇒ 2N
   in ~0.2 s across the seam. Fix: sliding window counter — effective =
   curr + prev·(1−elapsed_fraction), reject at ≥N; assumes previous window's
   arrivals were roughly uniform.
5. Small-N security limits (login/MPIN: 5–10 per window): memory is trivial
   at that N, and exactness matters because seam artifacts double an
   attacker's budget — precision is the point, cost is negligible.
6. Per-instance ÷N (free; breaks under uneven LB). Central per-request
   (precise; +~1 ms hop, hot dependency, hot keys). Local batches +
   central reconcile (sweet spot; overshoot ≤ batch_size × pods; sub-ms).
   Sticky-by-key (exact and cheap; rebalancing churn, fights the LB).
7. Protection limits: fail-open — payments availability outranks limit
   precision, and bulkheads/shedding/partner caps still bound damage. Abuse
   limits: fail-strict/degraded — conservative local per-pod fallbacks,
   because brute-forcers are the beneficiaries of an open window. Parallel:
   gateway dedup fail-open is licensed by layered idempotency; limits
   fail-open are licensed by layered capacity protection.
8. Rejections without back-off guidance produce immediate synchronized
   retries — the limiter manufactures a retry storm and then fights it.
   Retry-After turns rejection into traffic *shaping*; it's the server's
   half of the retry contract.
9. Pre-auth: device fingerprint + IP (no user identity yet; IP alone is
   brutal under CGNAT). B2B: API key/tenant (the contract entity). Backstop:
   endpoint-global. Layering because each key catches what others miss:
   per-user fairness + per-IP abuse + global capacity ceiling.
10. Structurally deleted ~the majority of partner calls (no active mandate ⇒
    no call) rather than policing them — demand elimination beats demand
    management. "Before rate-limiting demand, delete the demand that
    shouldn't exist."
11. Queue wait: position k waits k/r — added latency to every admitted
    request, and under sustained excess the queue sits full (max latency AND
    rejections). Acceptable when the protected system genuinely requires
    smooth constant-rate input (fragile partner, batch-rate contract) and
    the traffic is elastic/asynchronous rather than user-facing.
12. Same primitive (token bucket), aimed differently: a rate limiter meters
    inbound demand against policy; a retry budget meters your *own outbound
    retries* against observed success (tokens earned by successes) —
    self-limiting to break amplification loops.

</details>
