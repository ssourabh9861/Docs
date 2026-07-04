# Worked Design 4: URL Shortener

The "hello world" of system design — which is exactly why it's dangerous:
interviewers use it to grade *calibration* (can you keep a simple system
simple?) and then twist it (analytics, expiry, custom aliases, abuse). The
L5 failure mode here is over-engineering; the L5 win is a boring, correct
core with sharp answers to the twists.

**Prompt:** "Design bit.ly."

---

## 1. Requirements & scope (0–5)

Functional: (1) shorten: long URL → short code; (2) redirect: code → long
URL (the product); (3) custom aliases; (4) expiry (optional); (5) click
analytics (ask how deep — counts vs full events; it changes the design's
second half). Out of scope: link previews, QR, auth beyond API keys.

Non-functional: **read-dominated to a degree that shapes everything** —
100:1 to 1000:1 redirect:shorten; redirect latency is the product
(<50 ms budget); redirects must survive write-path outages (read/write
availability decoupled); codes are permanent-ish (link rot = product
death); wrong redirect is the catastrophic error direction (serving stale
is fine; serving *someone else's* URL is not — collision correctness).

## 2. Estimation (5–9)

Assume 100 M new URLs/month ≈ 40/s writes (trivial); reads at 100:1 ≈
4 k/s avg, 15 k/s peak — cache-shaped. Storage: 100 M/mo × ~500 B × 5 y
≈ 3 TB — one modest KV/relational footprint; **which means**: this is a
latency/caching problem, not a storage problem — say it and earn the
calibration point. Code space: base62, length 7 → 62⁷ ≈ 3.5×10¹² —
thousands of years of headroom at this rate (do this math aloud; it
decides generation strategy).

## 3. API (9–14)

```
POST /urls  {long_url, custom_alias?, expiry?}  (API-key auth, rate-limited)
  → 201 {code, short_url}     409 if alias taken
GET /{code} → 302 Location: <long_url>          404/410 if missing/expired
```
**The 301 vs 302 question (always asked):** 301 (permanent) lets browsers/
CDNs cache the redirect — great latency, but you lose per-click analytics
and the ability to update/expire; 302/307 keeps every click on your
servers. Default 302 because analytics is usually the business model;
offer 301 for analytics-exempt links. Knowing *why* — not just which — is
the point.

## 4. Data model & code generation (14–24)

`urls`: code (PK) → long_url, owner, created, expiry, flags. KV-shaped
(point get by code — the only hot query); any store works at this size;
add index/table by owner for management pages.

**Code generation — the design's one real decision. Three options:**
1. **Hash the URL** (MD5 → first 7 base62 chars): same URL → same code
   (dedup for free) but collisions need probe-and-retry loops, and
   two users shortening one URL share analytics — usually wrong.
2. **Random codes:** collision probability manageable at 62⁷ space but
   nonzero → insert-if-absent retry loop (birthday math: ~10⁹ codes in
   3.5×10¹² space ⇒ per-insert collision ~0.03% — fine with one retry).
3. **Counter + base62 encode** (chosen): a global sequence, encoded —
  collision-*free* by construction, trivial. Two sub-problems:
  (a) the counter is a single point/hot spot ⇒ **batch allocation**
  (each app server leases a range of 10 k IDs from a coordinator/DB row;
  in-memory increments thereafter — the token-batch pattern from the
  rate limiter, reused); (b) sequential codes are *enumerable* (scrapers
  walk your namespace, and code length betrays volume) ⇒ bijective
  scramble/permutation of the counter (or accept it — ask if privacy
  matters; flagging enumeration unprompted is a security point —
  `09-security` when written).
Custom aliases: same table, uniqueness via insert-if-absent (the atomic
reservation shape yet again).

## 5. Read path (the product) + analytics (24–39)

**Read path:** CDN/edge → LB → redirect service → cache (Redis/Aerospike,
cache-aside, TTL hours + jitter) → store on miss. Hit ratio should be
~99%+ (Zipf: popular links dominate — `03-caching/04` miss-ratio
thinking); negative caching for 404s (enumeration + typo storms —
`03-caching/01` §2.3); hot-key story ready for viral links
(L1 per-pod + key replication — `03-caching/03` §3; a viral link is THE
hot-key case study). Redirect service is stateless → trivial horizontal
scale; read path depends only on cache+store availability, not the write
path.

**Analytics (the twist that doubles the design):** never synchronous —
redirect emits a click event (code, ts, coarse geo/UA) to a bus,
fire-and-forget with local buffering; counting is a streaming aggregation
(per-code counters, minute buckets) — at-most-once acceptable (say it:
analytics loss ≠ money loss; the error-direction lens applied) or
at-least-once + idempotent buckets if the business bills on clicks (then
it's the ad-click aggregator problem — `08-ad-click-aggregator.md`, and
say THAT: recognizing when a twist upgrades the problem into a different
canonical design is a strong signal).

## 6. Operations (39–45)

Page on: redirect p99 + cache hit ratio, 404/negative rates (enumeration
attack signal), store replication lag (a fresh code 404ing on a lagging
replica — read-your-writes for the *creator*: pin post-create reads or
accept seconds of propagation, stated). 10×: still boring — CDN more,
shard the KV by code when single-store limits approach.

---

## Probes & traps

- **"Why not hash-based dedup — same URL, same code?"** — analytics
  attribution breaks (two campaigns, one code), per-user expiry/custom
  semantics break, and collisions still need handling; dedup, if wanted,
  is a lookup by (owner, url_hash), not identity-by-hash. Trap: hash
  enthusiasm without the attribution consequence.
- **"Your counter service dies."** — batch leases mean app servers keep
  issuing from in-memory ranges for minutes; new-lease requests fail →
  *writes* degrade, redirects unaffected (the decoupling you claimed in
  requirements — point back at it); counter durability via the DB row's
  own transactionality. The question tests whether your SPOF has a
  blast-radius story.
- **"Viral link: 500 k redirects/min for one code."** — the hot-key
  ladder verbatim: it's ONE key — L1 per-pod caches (seconds TTL; the
  value is immutable, so staleness is zero-risk — say it), CDN-cache the
  302 with short max-age, key replication if the distributed tier still
  feels it. Immutability makes this the *easy* hot-key case — noticing
  that is the senior touch.
- **"GDPR delete / link takedown with 301s in the wild."** — you can't
  un-cache a 301 from browsers; takedown-capable links must be 302 —
  which retroactively justifies the default. Policy questions have
  architectural answers; connect them.

## Self-test

1. What makes this a caching problem, not a storage problem? Two
   numbers.
2. 301 vs 302: the trade and the default's justification.
3. Base62⁷ space math and the birthday-collision estimate for random
   codes.
4. Counter+encode: its two sub-problems and each fix.
5. Why is hash-as-identity usually wrong here?
6. The read path's availability claim and what it decouples.
7. Negative caching: which two traffic classes does it absorb?
8. The viral link: why is it the easy hot-key case, and the three-rung
   response?
9. Analytics: which delivery semantics, decided by what lens — and
   when does it become a different canonical problem?
10. The creator's read-your-writes gap: cause and two resolutions.

<details>
<summary><b>Answers</b></summary>

1. Writes ~40/s and total ~3 TB over 5 y — any store shrugs; reads
   15 k/s peak at <50 ms with Zipf skew — cache/CDN territory. The
   asymmetry (100–1000:1) makes redirect latency the entire product.
2. 301 = browser/CDN-cacheable permanent redirect: best latency, but
   clicks stop reaching you (no analytics), and cached redirects
   can't be updated/expired/taken down. 302/307 keeps control and
   telemetry at the cost of always being on-path. Default 302 because
   analytics is the business model and takedown-ability is policy-
   required; offer 301 selectively.
3. 62⁷ ≈ 3.5×10¹²; at 100 M/month ≈ 1.2×10⁹/year — thousands of years
   of namespace. Random-code collision per insert with 10⁹ existing ≈
   10⁹/3.5×10¹² ≈ 0.03% — a single insert-if-absent retry handles it.
4. (a) Central counter = SPOF/hot spot ⇒ batch/range leasing (servers
   lease 10 k-ID ranges, increment in memory; the token-batch
   pattern); (b) sequential codes are enumerable and volume-revealing
   ⇒ bijective permutation/scramble of the counter before encoding
   (or explicit acceptance if privacy is a non-goal).
5. Same-URL-same-code merges distinct users'/campaigns' links: click
   attribution, custom expiry, and ownership semantics all break;
   collisions still require probe loops anyway. Dedup, if a feature,
   is an explicit (owner, url_hash) lookup — a query, not an identity
   scheme.
6. Redirects depend only on cache + read store; shortening depends on
   the counter/write path. A write-path outage (counter, primary DB)
   degrades creation while every existing link keeps redirecting —
   stated as a requirement, delivered by the architecture.
7. Enumeration/scraper traffic walking the code space (mass 404s) and
   typo/dead-link storms — without negative caching every miss hits
   the store; with it, the cache absorbs both at memory speed with
   short TTLs.
8. The value (code → URL) is immutable, so replicating it anywhere —
   per-pod L1, CDN, key copies — carries zero staleness risk: pure
   fan-out with no invalidation problem. Rungs: L1 in-process
   (seconds TTL) → CDN-cached 302 (short max-age) → key replication
   in the distributed cache.
9. At-most-once (fire-and-forget with local buffering) when analytics
   is informational — loss ≠ money, and the error direction tolerates
   undercounting. If clicks are billed (affiliate/ads), counting
   becomes revenue: at-least-once + idempotent bucketed aggregation —
   at which point it IS the ad-click aggregator design, and you say
   so.
10. Create writes the primary; the immediate redirect test may read a
    lagging replica/cache → 404 on your own fresh link. Resolutions:
    pin the creator's reads to primary briefly (session guarantee),
    or populate the cache synchronously on create (write-through for
    the new key) — cheap because creates are rare.

</details>
