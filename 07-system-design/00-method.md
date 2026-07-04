# The Method — System Design at Google L5

Every worked design in this directory follows the framework in this doc. Read
it first, then read it again after three designs — it will mean more.

---

## 1. What the round actually measures (Google calibration)

A Google system-design interview is scored on roughly five axes — and note
what's NOT on the list (memorized architectures):

1. **Problem exploration:** did you turn an ambiguous prompt into a scoped,
   prioritized problem — asking the questions whose answers *change the
   design*? Google's rubric weights this heavily and generic prep
   underweights it. "Design WhatsApp" is deliberately underspecified; the
   scoping IS the test.
2. **Quantitative reasoning:** estimation that *drives decisions* — not
   ritual math. A QPS number nobody uses is theater; "40 k writes/s means
   a single primary is out, so we shard by X" is the point.
3. **Solution architecture:** a coherent design where each component earns
   its place, with alternatives named and trades stated.
4. **Technical depth:** at least two areas taken down to mechanisms —
   where your ten completed directories live.
5. **Communication & collaboration:** driving the session, thinking aloud,
   *using* interviewer hints (a hint ignored is scored; a hint absorbed
   and built on is scored higher than not needing it).

**The L4/L5 line in one sentence:** L4 produces a correct design when
steered; **L5 drives** — scopes unprompted, proposes the agenda, chooses
deep-dive targets, names failure modes before being asked, and treats the
interviewer as a colleague to negotiate trade-offs with, not an examiner
to satisfy. L6 additionally reframes the problem ("the real constraint
here is the partner's rate limit, so let me design around demand-shaping")
and drives cross-system/organizational concerns (migration, team
boundaries, cost).

---

## 2. The 45-minute choreography

| Minutes | Phase | Output |
|---|---|---|
| 0–5 | **Requirements & scope** | Functional list (prioritized, cut ruthlessly), non-functional targets (scale, latency, consistency, availability), explicit out-of-scope list |
| 5–9 | **Estimation** | QPS (read/write split, peak multiplier), storage (item size × count × growth), bandwidth if relevant — each number attached to a decision |
| 9–14 | **API + data model** | 3–6 core endpoints with idempotency/pagination noted; the 2–3 core entities with keys/partitioning |
| 14–24 | **High-level design** | The block diagram, narrated write path then read path, with the 2–3 key decisions argued (sync/async, fan-out choice, storage family) |
| 24–39 | **Deep dives (×2)** | Interviewer-chosen or self-proposed; mechanisms, failure modes, numbers |
| 39–45 | **Operations & wrap** | Failure modes, monitoring/SLOs, bottlenecks + evolution path, honest open questions |

Flex rules: if the interviewer redirects, follow immediately — their agenda
outranks yours. Propose the deep-dive menu yourself at minute ~24 ("I can go
deep on the ordering guarantees, the hot-key problem, or the failure/recovery
story — which is most useful?"): it demonstrates you know where the hard
parts are even before exploring them.

## 3. Phase playbooks

### 3.1 Requirements (the five questions that always pay)

1. **Who calls it and how often?** (users/devices/services; DAU → QPS)
2. **What are the top-3 operations?** (design for these; everything else is
   a footnote)
3. **Read:write ratio and access skew?** (drives caching, fan-out, storage)
4. **What staleness/inconsistency is tolerable, per operation?** (the
   per-operation consistency decomposition — your standing move)
5. **What's the cost of being wrong vs being down?** (error direction —
   your other standing move; it decides fail-open/closed, AP/CP leanings)
Then say the out-of-scope list out loud ("I'll treat auth, billing, and
GDPR as out of scope unless you want them") — cutting scope is senior;
having scope cut for you is not.

### 3.2 Estimation (the arithmetic kit — drill until instant)

- **Time:** 86,400 s/day ≈ 10⁵ (use 10⁵ for mental math); 2.6 M s/month.
- **QPS from DAU:** DAU × actions/user/day ÷ 10⁵. 100 M DAU × 10 actions
  = 10⁹/day ≈ 10 k QPS average; **peak = 2–5× average** (say which you
  assume).
- **Storage:** items/day × bytes × retention. 10⁹ msgs/day × 1 KB × 5 y
  ≈ 10⁹ × 10³ × 2×10³ days ≈ 2 PB (then × replication ×3).
- **The four numbers that anchor everything (2026):** RAM read ~100 ns;
  NVMe read ~100 µs; intra-DC RTT ~0.5 ms; cross-region ~50–150 ms.
  Single MySQL primary ~5–20 k write TPS; wide-column cluster
  ~100 k–1 M+ writes/s; one cache node ~100 k+ ops/s
  (`02-databases/08-when-to-pick-what.md` anchors).
- **Rule:** every estimate ends with "…which means [design consequence]."
  If there's no consequence, skip the estimate.

### 3.3 High-level design (narration discipline)

Draw little, narrate much: **write path first** (where correctness lives),
then read path (where scale lives). For each component: why it exists,
what family it is (the taxonomy from `02-databases/02-...md`), and the
one-line trade ("queue here decouples X from Y's tail latency, at the
cost of visible pending states"). Name the alternative you rejected for
the 2–3 load-bearing choices — rejected-alternatives are the single
highest-density L5 signal per sentence.

### 3.4 Deep dives (where the repo pays off)

The recurring deep-dive menu across all 12 designs — each mapped to the
directory that armed you:

| Deep dive | Your ammunition |
|---|---|
| Exactly-once / dedup / retries | `05-resilience/07-idempotency.md`, `04-messaging/04-delivery-semantics.md` |
| Ordering | `04-messaging-streaming/05-ordering.md` |
| Hot keys / celebrities / skew | `01-distributed-systems/04-partitioning.md`, `03-caching/03-...md` |
| Fan-out write vs read | `06-news-feed.md` + partitioning |
| Consistency choices | `01-distributed-systems/02-.../08-...md` (per-op decomposition, error direction) |
| Failure/recovery | `01-distributed-systems/07-failure-detection.md`, `05-resilience/*` |
| Cross-service atomicity | `14-distributed-transactions/*` |
| Storage engine fit | `02-databases/01-.../08-...md` |
| Overload behavior | `05-resilience/06-load-shedding-degradation.md`, `04-messaging/08-backpressure.md` |

### 3.5 Operations wrap (the 5 minutes most candidates skip)

Three sentences minimum: the top failure mode and its blast radius; the
three metrics/SLOs you'd page on; the first bottleneck at 10× and the
evolution path. This is disproportionately scored because it separates
"designed on paper" from "has operated systems" — your natural home turf.

---

## 4. The failure modes that sink candidates (anti-checklist)

1. **Boxes before scope** — drawing Kafka at minute 2. 
2. **Ritual estimation** — numbers computed, never consulted again.
3. **Breadth-only** — a complete diagram with no component understood
   below its name; dies at the first "how exactly does that work?"
4. **Ignoring hints** — the interviewer says "interesting, what about
   ordering?" and you return to your agenda. Hints ARE the rubric.
5. **One-store-fits-all / brand-first** — "I'd use Cassandra" before the
   access patterns exist (`02-databases/08` P1's audible-procedure fix).
6. **No failure story** — a design that only works. "What breaks first,
   and what does the user see?" should be answered before it's asked.
7. **Silence** — thinking without narrating. Practice the phrase "let me
   think out loud about the trade here…"
8. **Fighting the premise** — the interviewer's constraints are the game;
   note real-world objections in one sentence, then play.

---

## 5. Resume connection + spoken answer

Your edge in design rounds is that your depth areas are *operational*:
every deep-dive row in §3.4 maps to systems you run. Exploit it by
steering deep dives toward payments-adjacent territory when offered a
choice ("I can go deepest on the idempotency/recovery story — it's my
day job"), and by importing your standing moves — per-operation
consistency decomposition, error-direction analysis, "eventually right,
never silently wrong," queue-depth backpressure, recon as the floor —
which apply to *every* design in this directory and instantly
distinguish your answers.

**30–60 s spoken answer** ("how do you approach system design?"):

> "A fixed choreography with all the flexibility inside it. First five
> minutes: scope — the questions whose answers change the design: who
> calls it, the top three operations, read-write ratio and skew, what
> staleness each operation tolerates, and whether being wrong is worse
> than being down — that last one decides half the architecture. Then
> estimation, but only numbers that drive decisions: forty thousand
> writes a second means the single primary is out, so it earns its
> thirty seconds. API and data model — keys and partitioning are the
> real content. High-level design narrated write-path-first, because
> correctness lives on the write path and scale on the read path, with
> the rejected alternative named for each load-bearing choice. Then I
> propose the deep-dive menu myself — ordering, hot keys, failure
> recovery — and go to mechanisms wherever the interviewer points. Last
> five minutes are operations: what breaks first, what pages, what the
> 10× bottleneck is — because a design that only works isn't a design.
> And throughout, two lenses from my day job: consistency chosen per
> operation, not per system; and the error direction — a stale read
> that under-offers is a different animal from one that double-spends."

---

## Self-test

1. Name the five Google scoring axes and the one thing NOT scored.
2. State the L4/L5 line in one sentence and give three concrete
   "driving" behaviors.
3. Reproduce the 45-minute choreography with phase outputs.
4. The five scoping questions that always pay, and why saying the
   out-of-scope list aloud matters.
5. Compute: 200 M DAU, 20 reads + 2 writes per user per day, peak 3× —
   read QPS, write QPS at peak, and one design consequence of each.
6. The four anchor latencies and three storage-system throughput
   anchors.
7. What makes an estimate "ritual," and the rule that prevents it?
8. Why narrate write path before read path?
9. Why are rejected alternatives the highest-density L5 signal?
10. List six of the eight sinking failure modes.
11. What belongs in the operations wrap, and why is it
    disproportionately scored?
12. Your two standing lenses and how each shows up in any design.

<details>
<summary><b>Answers</b></summary>

1. Problem exploration, quantitative reasoning, solution architecture,
   technical depth, communication/collaboration. Not scored: reciting a
   memorized reference architecture (it's often negatively scored when
   it substitutes for reasoning).
2. L4 produces a correct design when steered; L5 drives. Behaviors:
   proposing the agenda and deep-dive menu; cutting scope explicitly;
   naming failure modes and trade-offs before being asked (also:
   absorbing hints and building on them visibly).
3. 0–5 requirements/scope (prioritized functional + non-functional +
   out-of-scope); 5–9 estimation (decision-attached numbers); 9–14
   API + data model (endpoints with idempotency/pagination; entities
   with keys); 14–24 high-level (write then read path, trades argued);
   24–39 two deep dives (mechanisms + numbers); 39–45 operations
   (failures, SLOs, 10× bottleneck).
4. Who calls and how often; top-3 operations; read:write + skew;
   staleness tolerance per operation; cost of wrong vs down. The
   out-of-scope list shows you cut scope deliberately — senior
   behavior — and prevents late-round "but what about auth" derails.
5. Reads: 200 M × 20 = 4×10⁹/day ≈ 40 k avg → 120 k peak QPS ⇒ needs
   caching/replicas — no single store serves it. Writes: 4×10⁸/day ≈
   4 k avg → 12 k peak ⇒ at the ceiling of one relational primary —
   shard now or choose wide-column; also justifies async paths for
   burst absorption.
6. RAM ~100 ns; NVMe ~100 µs; intra-DC RTT ~0.5 ms; cross-region
   50–150 ms. MySQL primary ~5–20 k write TPS; wide-column cluster
   100 k–1 M+ writes/s; cache node ~100 k+ ops/s.
7. Ritual = computed then never consulted. Rule: every estimate ends
   "…which means [consequence]" — no consequence, no estimate.
8. Correctness machinery (idempotency, ordering, transactions,
   durability) lives on the write path — get it right and the read
   path is "just" scale (caches, replicas, fan-out), which is easier
   to retrofit than correctness.
9. One sentence proves three things at once: you saw the option space,
   you evaluated it, and you can articulate the trade — versus a
   correct-but-unjustified choice which proves only luck or
   memorization.
10. Boxes before scope; ritual estimation; breadth-only diagrams;
    ignoring hints; brand-first storage picks; no failure story;
    silent thinking; fighting the premise.
11. Top failure mode + blast radius; the 3 paging metrics/SLOs; first
    bottleneck at 10× + evolution path. Disproportionate because it
    cleanly separates paper designers from operators — few candidates
    volunteer it, and it's the daily reality of the level being hired
    for.
12. Per-operation consistency decomposition (each operation gets the
    cheapest model that kills its anomaly — shows up as mixed
    CP/AP/staleness choices within one design) and error-direction
    analysis (which way does a stale/duplicate/failed result point;
    decides fail-open vs fail-closed, what may be cached, where
    strong consistency is actually needed).

</details>
