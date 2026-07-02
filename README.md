# SDE-3 (Google L5) Interview Prep — Knowledge Repository

**Candidate:** Sourabh Kumar — SDE-2, Flipkart UPI/Payments → targeting SDE-3 / Google L5
**Built:** July 2026. All numbers are 2026 ballparks unless marked otherwise.

This repo is a complete, self-contained preparation system for Google L5 interviews:
system design, coding, Java/backend depth, and behavioral/leadership — plus a full
"resume arsenal" that prepares every line of your resume to survive hostile follow-ups.

---

## The bar this repo is written to

Every document here is written against one test:

> *If a Google L5 interviewer read this and then interviewed the candidate,
> would the candidate survive the **third** follow-up question?*

L4 answers name the pattern. L5 answers explain the mechanism, the failure modes,
the alternatives that were rejected and why, and the numbers. Every document
distinguishes L4 vs L5 (and L6 where meaningful) explicitly.

---

## How to use this repo

1. **Start with `00-resume-arsenal/`.** It is complete and it is the highest-leverage
   directory in the repo: at L5, 60–90 seconds of every interview segment starts from
   your resume, and the fastest way to fail is a resume story that collapses under
   probing. It also contains a blunt gap analysis — read `06-gap-analysis.md` first
   and fix the `[X]` placeholders in your resume **this week** (details inside).
2. Work through directories in the order of the roadmap below. Each concept doc follows
   a fixed five-part contract: plain definition → how it works in practice →
   senior-level depth → connection to YOUR systems (with a 30–60 s spoken answer) →
   what the interviewer will push on (probes + model answers + trap answers).
3. Every document ends with a **self-test** (10+ questions, recall → adversarial),
   answers hidden at the bottom. Do the self-test cold, days after first reading.
4. Track state in `PROGRESS.md`. Say "next" (or name a directory) to have the next
   directory written in full.

---

## Study roadmap (recommended order & weighting)

| Phase | Directories | Why this order |
|-------|------------|----------------|
| 1. Foundation | `00-resume-arsenal`, `01-distributed-systems`, `05-resilience` | Your resume is the anchor of every round; distributed systems + resilience are the vocabulary of everything else and map directly to what you built. |
| 2. Data layer | `02-databases`, `03-caching`, `04-messaging-streaming`, `14-distributed-transactions` | You own HBase/Aerospike/MySQL/Pulsar/Storm systems — interviewers WILL drill here because your resume invites it. |
| 3. Design synthesis | `07-system-design`, `08-api-design`, `13-networking`, `10-infra-observability` | System design is the round that decides L5 vs L4 at Google. Do it after the primitives, not before. |
| 4. Coding | `11-coding-dsa` (run in parallel with everything, daily) | Two coding rounds still gate the hire decision. Daily practice from week 1 — do not backload this. |
| 5. Depth & polish | `06-concurrency-java`, `09-security`, `12-behavioral-leadership` | Java depth backs up your "Java 17 stack" claim; behavioral is where L5 leadership signal is scored. |
| 6. Final review | `99-cheat-sheets`, `15-mock-interviews` | One-pagers + mock scripts + estimation drills for the last 2 weeks. |

**A blunt note on priorities** (you asked for candor): your prompt weights system
design and backend depth heavily — correct for L5 — but Google's loop is typically
2 coding + 1 design + 1 behavioral ("Googleyness & Leadership") + sometimes a second
design/domain round. Candidates with your profile most often fail on **coding pace under
communication pressure**, not on design. `11-coding-dsa` is listed 11th in your skeleton;
treat it as a *daily parallel track from day 1*, not a phase. The repo keeps your ordering
but the roadmap above corrects the emphasis.

---

## Repository map

| Directory | Contents | Status |
|-----------|----------|--------|
| `00-resume-arsenal/` | Every resume bullet → STAR story, 30–60 s spoken answers, attack trees with model + trap answers, cross-project attacks, gap analysis | ✅ Complete |
| `01-distributed-systems/` | Fault tolerance vs resilience vs HA, consistency models, replication, partitioning, consensus (Paxos/Raft), time & ordering, failure detection, CAP/PACELC | Stub |
| `02-databases/` | B-tree vs LSM storage engines, SQL/NoSQL taxonomy, indexing, transactions & isolation levels, HBase internals, Aerospike internals, MySQL/InnoDB internals, when-to-pick-what | Stub |
| `03-caching/` | Cache patterns, invalidation, stampedes, consistency with source of truth, your Aerospike usage | Stub |
| `04-messaging-streaming/` | Queues vs logs, Pulsar vs Kafka (deep), Storm (and why the world moved to Flink), delivery semantics, ordering, DLQs, CDC, backpressure, exactly-once myths | Stub |
| `05-resilience/` | Circuit breakers (count/time/sliding-window/adaptive), bulkheads, timeouts, retries + jitter, rate-limiting algorithms, load shedding, graceful degradation, idempotency | Stub |
| `06-concurrency-java/` | Threads, Java Memory Model, locks vs CAS, executors, virtual threads (Loom), JVM internals, GC deep-dive (G1/ZGC/Shenandoah 2026 state), deadlock patterns | Stub |
| `07-system-design/` | Google-calibrated method + 12+ full worked designs at L5 depth (payment system, rate limiter, notification system, URL shortener, chat, feed, distributed cache, ad-click aggregator, S3-like store, + top-K/typeahead, distributed scheduler, proximity/geo) | Stub |
| `08-api-design/` | REST maturity, versioning, pagination, idempotency keys, webhooks (you built HMAC webhooks — deep dive), gRPC vs REST, gateway patterns | Stub |
| `09-security/` | AuthN vs AuthZ, OAuth2/OIDC, HMAC, TLS 1.3, PCI-DSS scoping (your PCI-isolation story needs this), secrets management, OWASP top vulnerabilities | Stub |
| `10-infra-observability/` | Kubernetes fundamentals, deployments/autoscaling, metrics/logs/traces, SLI/SLO/error budgets, capacity planning | Stub |
| `11-coding-dsa/` | What Google L5 coding rounds actually test, pattern index, complexity analysis, L4-vs-L5 signal differences, communication protocol | Stub |
| `12-behavioral-leadership/` | Googleyness, L5 leadership signals, conflict, influence without authority, STAR bank built from YOUR resume | Stub |
| `13-networking/` | **Added.** TCP/TLS handshakes, HTTP/1.1 vs HTTP/2 vs HTTP/3-QUIC, DNS, L4/L7 load balancing — Google design rounds assume this fluency and payment-gateway owners get asked connection-pool/timeout questions constantly. | Stub |
| `14-distributed-transactions/` | **Added.** 2PC, sagas, outbox, TCC, reconciliation — you own money movement across services; "how do you keep two systems' money state consistent" is the single most likely deep-dive you will face. | Stub |
| `15-mock-interviews/` | **Added.** Full mock-interview scripts (design + behavioral), estimation drills, spaced-repetition question deck — knowledge ≠ performance; these convert the former into the latter. | Stub |
| `99-cheat-sheets/` | 2026 latency/throughput numbers, one-page-per-topic final review sheets | Stub |

**Justified additions (one line each, as promised):**
- `13-networking/` — Google design interviews assume TCP/TLS/HTTP2/QUIC fluency; your gateway/timeout work makes it a guaranteed probe surface.
- `14-distributed-transactions/` — a payments SDE-3 who can't whiteboard sagas/outbox/reconciliation fails the domain round; this is your most predictable deep-dive.
- `15-mock-interviews/` — retrieval practice and interview choreography are what turn this repo's knowledge into interview performance.

---

## Progress checklist

See `PROGRESS.md` for the live tracker. Current state: skeleton + resume arsenal done;
next recommended: `01-distributed-systems` (say "next").

---

## Ground rules baked into every document

- Zero assumed knowledge: every concept starts from a plain-language definition.
- No hand-waving: every "X is faster/safer" claim carries its mechanism.
- Numbers or it didn't happen: 2026 ballparks, estimates marked as estimates.
- Facts I'm not certain of are marked **`[VERIFY]`** — check them, don't recite them.
- Google calibration called out wherever Google differs from generic advice.
- L4 vs L5 (vs L6) distinctions wherever they exist.
- Your real systems (SuperPay Later, PayIn3, UPI Rewards, core UPI platform) over
  generic examples — and where a concept honestly does NOT map to your experience,
  the doc says so instead of fabricating.
