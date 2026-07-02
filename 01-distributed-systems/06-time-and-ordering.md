# Time and Ordering

"What happened first?" sounds like a trivial question. In a distributed system it
is *the* question — and physical clocks answer it wrong often enough to lose data.
This doc: why clocks lie, how systems order events without trusting them (Lamport,
vector clocks), how Google made clocks trustworthy enough to trust (TrueTime), and
where timestamps hide in YOUR row keys and CDC pipeline.

---

## 1. Plain definition

Machines have clocks; clocks drift; networks delay messages by variable amounts.
So two facts that are obvious on one machine stop being available across machines:

1. **A global "now" does not exist.** Two servers' clocks differ by an unknown,
   changing amount. Any design that compares timestamps *from different machines*
   as if they were from one machine has an accuracy bug whose size equals the
   clock skew.
2. **Order must be defined, not observed.** Since you can't trust "at what time",
   distributed systems fall back to **happens-before** (Lamport's causality
   relation): event A happens-before B if (a) same process, A earlier; (b) A is
   the send of a message and B its receipt; or (c) transitivity. If neither
   A→B nor B→A, they are **concurrent** — and "concurrent" doesn't mean
   "simultaneous", it means *the system cannot know the order, because no
   information flowed between them*.

Analogy: two branch offices stamping paper forms with their own wall clocks, then
merging files at headquarters. If office A's clock runs 3 minutes fast, HQ's
"sorted by time" file interleaves wrongly — and if HQ resolves duplicate forms by
"keep the latest stamp", office B's *newer* work gets shredded because its clock
was slow. That shredding is exactly what last-writer-wins does in databases.

---

## 2. How it works in practice

### 2.1 Physical clocks and their failure modes (numbers you must know)

- **Quartz drift:** ~10–100 ppm; 50 ppm ≈ **4.3 seconds/day** if never corrected.
  Temperature swings change the rate.
- **NTP:** disciplines the clock over the network. Realistic accuracy: **~0.5–10 ms
  on a LAN, tens of ms over WAN/internet, and unbounded when paths are asymmetric
  or the daemon is broken** (estimates). NTP corrects by *slewing* (gradual) or
  **stepping** — a step means wall-clock time can **jump backward**. Any code
  measuring durations with wall-clock time is wrong; use the monotonic clock
  (`System.nanoTime()` in Java) — it never goes backward. This exact
  wall-vs-monotonic point is a favorite quick probe.
- **Leap seconds:** UTC occasionally inserts a 61st second; naive handling has
  crashed real systems. Standard practice now is **smearing** (spreading the
  second over hours). You just need the word.
- **PTP / GPS-disciplined clocks:** µs-level sync on supporting hardware —
  what trading systems and cloud "precision clocks" use (AWS/GCP now expose
  ~µs–ms bounded clocks on some instance types **(2026 state — [VERIFY current
  offerings before citing specifics)**).
- **The killer edge case:** VM pauses/migrations and GC pauses stop *your
  process* while both clocks keep running — between two adjacent lines of code,
  minutes may pass. Every lease/timeout argument must survive this (see
  `05-consensus.md` P3 and `07-failure-detection.md`).

### 2.2 Last-writer-wins: where physical timestamps lose data

Cassandra-style LWW resolves concurrent writes to one cell by timestamp. Two
failure modes: (1) **concurrent-write shredding** — two clients write
"simultaneously" (causally concurrent); one is silently discarded — even with
perfect clocks, because LWW converts "no defined order" into "pretend there was
one"; (2) **skew burial** — a node with a fast clock writes at T+80 ms of skew;
for the next 80 ms, every *genuinely later* write from other nodes is stamped
"older" and loses; an acked write silently vanishes. Numbers: NTP skews of
10–100 ms vs. write intervals of ms ⇒ this is not theoretical.

### 2.3 Lamport clocks (order without physics)

Each process keeps a counter: increment on local event; attach to messages; on
receive, `counter = max(local, received) + 1`. Guarantee: **A→B ⇒ L(A) < L(B)**.
NOT the converse — L(A) < L(B) tells you nothing (maybe causal, maybe
concurrent). Add process-ID tiebreak → a **total order** consistent with
causality: enough to make every replica apply operations in the same order
(state-machine replication's cheap cousin), not enough to *detect* concurrency.

### 2.4 Vector clocks (detecting concurrency)

Each process keeps a vector of counters, one slot per process; increment own
slot; merge (element-wise max) on receive. Compare: V(A) ≤ V(B) element-wise ⇒
A→B; incomparable ⇒ **concurrent — provably**, and that's the feature: a store
can now *know* two versions conflict (siblings) instead of guessing (Dynamo/Riak
lineage). Costs: O(processes) metadata per key, pruning complexity, and the
application must merge siblings — which is why many systems retreated to LWW
(choosing silent loss over merge complexity — a trade you should be able to
argue both ways).

### 2.5 TrueTime and Spanner (making clocks honest about uncertainty)

Google's move: don't pretend clocks are exact — **expose the error bound**.
TrueTime returns an interval [earliest, latest] guaranteed to contain real now
(GPS + atomic clocks per DC keep the bound small: ~1–7 ms). Spanner assigns
transaction timestamps and then **commit-waits**: holds the commit until
`latest < now.earliest`, i.e., until the timestamp is unambiguously in the past
everywhere. Result: timestamp order = real-time order ⇒ **external consistency
(strict serializability) across the planet**, bought with a few ms of added
commit latency. The insight to quote: *"Spanner doesn't have better clocks so
much as clocks that know how wrong they might be — and it waits out the
uncertainty."* Without TrueTime hardware, the same idea degrades to **HLC
(hybrid logical clocks)** — physical time + logical counter, causality-safe
timestamps that stay close to wall time (CockroachDB, YugabyteDB) but can't give
external consistency without waiting out much larger uncertainty.

---

## 3. Senior-level depth

- **Ordering is a per-scope decision.** Global total order is a luxury
  (consensus or TrueTime — pay latency); per-key order is cheap (single writer
  per key/partition); causal order is the middle. The L5 reflex: "what scope of
  ordering does this feature actually need?" Most need per-key only — which is
  why partitioned single-writer systems (your HBase rows, Kafka partitions)
  dominate.
- **Idempotency + commutativity beat ordering.** If operations can be applied in
  any order with the same result (CRDTs, sets, max-registers) or safely
  reapplied (idempotent upserts guarded by versions), you can stop paying for
  order entirely. Your rewards design is exactly this posture: CAS-on-version +
  re-derivation-from-ground-truth makes event *arrival order irrelevant* — say
  that sentence; it reframes your project as an ordering-avoidance design.
- **Timestamps as identifiers vs as order:** using time in a row key for
  *uniqueness and locality* (your `TX<yyMMddHHmmssSSS>` suffixes) is fine even
  with skew — you only need "roughly time-sorted, unique-enough" (plus tiebreak
  by txnId). Using cross-machine time for *conflict resolution or money order*
  is where it becomes wrong. Distinguishing those two uses is a senior marker.
- **Interviewer's favorite hybrid: Snowflake-style IDs** — 41 bits of ms
  timestamp + worker ID + sequence: k-ordered, unique, no coordination. Failure
  mode: clock stepping backward ⇒ duplicate/regressing IDs ⇒ generators must
  detect and stall (or refuse). Know this; ID-generation questions are a staple.
- **L4 vs L5 vs L6:** L4 knows "clocks drift, use NTP, Lamport exists." L5
  attaches each mechanism to the anomaly it kills, knows the numbers (drift
  ppm, NTP ms, TrueTime ms), and audits their own system's timestamp
  dependencies unprompted. L6 designs the ordering *out*: immutable events,
  commutative merges, per-key ownership, uncertainty-aware APIs.

---

## 4. Resume connection

Audit of where time hides in your systems (do this audit aloud in interviews —
it's rare and impressive):

- **Reward row keys embed producer timestamps** (`accountId:TX<ts>`). Used for:
  uniqueness, per-user locality, checkpoint range scans. Skew risk: two events
  for one user from different producers could be keyed slightly out of true
  order — but your checkpoint algorithm's correctness never depends on key
  order matching real order: uncertain paths re-derive by scanning ground
  truth, and the marker/CAS layer is order-free. Verdict: time as
  *identifier/locality*, not as *truth* — the safe use. **[VERIFY: what breaks
  the tie if one user gets two same-ms events? If the answer is "row
  collision", know the mitigating field.]**
- **CDC/analytics upserts resolve by modTime/version** — LWW at the analytics
  edge. Safe *because* per-row mutations originate from one region server
  (single writer per row ⇒ its clock is at least monotone-ish per key), and
  the entities carry versions. If rows could hop writers rapidly (region
  moves), modTime comparisons inherit skew — the honest caveat.
- **Recon and stuck-transaction detection are timeout/age-based** — "non-
  terminal for > T" uses wall-clock age; steps/skew here only shift detection
  windows (liveness), never correctness (the force-query asks the source of
  truth). Timeouts-for-liveness + authority-for-truth is the right division.
- **Your OCC version column is the anti-clock:** you serialize per-user updates
  with a logical per-row epoch instead of trusting timestamps — the
  textbook-correct move. Claim it in those words.
- **Honest gap:** you haven't run TrueTime/HLC systems; don't bluff Spanner
  operational detail — know the mechanism, attribute the experience correctly.

**30–60 s spoken answer** ("how do you handle time/ordering?"):

> "By being deliberate about what we use time *for*. In row keys, timestamps are
> identifiers and locality — they make a user's rewards contiguous and
> checkpoint scans cheap — but no correctness decision compares timestamps
> across machines. Ordering and conflict decisions use logical mechanisms
> instead: per-row single-writer ownership in HBase gives per-key order for
> free, and our aggregation serializes through a version column with
> compare-and-swap — a per-row logical clock — so event arrival order is
> irrelevant; uncertain cases re-derive from ground truth rather than trusting
> any stamp. Where we do use wall-clock time — stuck-transaction detection,
> checkpoint rotation windows — it's for liveness, where skew shifts a
> detection window by milliseconds but can't corrupt state, because the repair
> action asks the source of truth rather than believing the clock."

---

## 5. What the interviewer will push on

**P1. "Two app servers write the same key to a LWW store 30 ms apart; server
clocks are 80 ms skewed. Walk me through what happens and how you'd fix it."**
- *Model:* the genuinely-later write carries the *smaller* timestamp (its
  clock is slow), so the store keeps the older data and silently discards an
  acknowledged newer write — no error, no conflict surfaced; discovered by
  users or recon. Fixes by scope: route each key's writes through one owner
  (per-key single writer — order restored by structure); make writes
  conditional (CAS on version — conflict surfaces as a retry instead of a
  loss); vector clocks + sibling merge (detect, let app resolve); or bounded-
  uncertainty timestamps (HLC/TrueTime) if you must keep timestamp resolution.
  Ranked for money: single-writer or CAS; never raw LWW.
- *Trap:* "sync the clocks better." NTP tightens, never bounds; the design must
  be correct at *some* skew, because skew is unbounded in failure modes.

**P2. "Lamport vs vector clocks in one minute — and why did Dynamo need vectors
while Kafka needs neither?"**
- *Model:* Lamport: single counter, guarantees A→B ⇒ L(A)<L(B); gives a total
  order consistent with causality but cannot distinguish concurrent from
  ordered. Vector: per-process counters; comparability = causality,
  incomparability = provable concurrency — detection, at O(N) metadata.
  Dynamo accepts concurrent writes on many replicas and must *detect*
  conflicts to surface siblings ⇒ vectors. Kafka forces all writes of a key
  through one partition leader ⇒ order is manufactured structurally; no
  detection needed. The meta-answer: you buy clock machinery only where your
  write topology permits concurrency.
- *Trap:* "vector clocks are just better Lamport clocks" — they solve a
  different problem (detection vs ordering), and the metadata cost is why
  systems avoid them when structure can do the job.

**P3. "Explain commit-wait. Why does Spanner *deliberately slow down* commits,
and what exactly does it buy?"**
- *Model:* Spanner stamps a transaction with a TrueTime value, then holds the
  release of locks/visibility until the uncertainty interval has passed
  (~1–7 ms), guaranteeing the stamp is in the past for every observer. That
  makes timestamp order equal real-time order ⇒ external consistency: any
  transaction that starts after yours commits sees it, planet-wide, without a
  global lock manager — and lock-free snapshot reads at a timestamp become
  trivially correct. The buy: strict serializability at the cost of ms-level
  added write latency; the enabler: hardware that *bounds* clock error rather
  than merely reducing it.
- *Trap:* "Spanner has atomic clocks so its time is exact" — the whole design
  is about *known inexactness*; missing that misses the idea.

**P4. "Your reward events carry producer timestamps. Consumer sees event T2 <
checkpoint < T1 arrive after T1 was aggregated. Does anything break?"**
- *Model:* no — and be able to say *why* structurally: the checkpoint algorithm
  treats "event at/behind checkpoint" as one of its explicit uncertain cases
  and re-derives from raw rows (scans ground truth) rather than incrementing;
  the marker prevents double-fold; CAS serializes the aggregate transition. So
  a late/reordered event costs a repair scan, not correctness. This question
  is your own system — answering it with the five-case table from the rewards
  arsenal is a mic-drop.
- *Trap:* "events can't arrive out of order, Pulsar preserves order" — two
  producers + shared subscriptions + redeliveries void that instantly (see
  `00-resume-arsenal/02-upi-rewards.md`).

**P5. "Design a globally unique, roughly time-sortable ID generator. What breaks
it?"**
- *Model:* Snowflake shape: 41-bit ms timestamp + 10-bit worker ID + 12-bit
  per-ms sequence (4096/ms/worker); no coordination at generation; worker IDs
  assigned via ZK/config. Breaks: clock step backward (duplicate/regressing
  IDs — detect and stall or reject until clock catches up; NTP slew-only
  config), sequence overflow in a hot ms (spin to next ms), worker-ID reuse
  during redeploys (lease them). Mention k-ordering caveat: sortable to ~ms,
  not causally meaningful across workers.
- *Trap:* "UUIDv4" (unique but unsortable — index locality suffers; though
  UUIDv7 — time-ordered — is the modern compromise and worth naming), or
  ignoring backward clock steps.

---

## Self-test

1. Define happens-before, including all three clauses, and define "concurrent"
   precisely.
2. Numbers: quartz drift per day at 50 ppm; NTP accuracy LAN vs WAN; TrueTime
   bound. Which clock do you use for measuring durations in Java and why?
3. Give the two distinct ways LWW loses data (one needs no skew at all).
4. Lamport clock update rules, the guarantee, and the guarantee's converse
   failure.
5. Vector clocks: comparison rule, what incomparability proves, and the two
   costs that push systems back to LWW.
6. What does commit-wait wait FOR, and what property emerges?
7. Why is time-in-row-keys safe in your design while time-in-conflict-
   resolution isn't? Name the distinction.
8. Your OCC version column — explain it as a clock. What kind, what scope?
9. When is wall-clock time legitimately fine in a distributed system? Give the
   liveness/truth division with your recon as the example.
10. Snowflake IDs: the three failure modes and their mitigations.
11. Why does Kafka "need neither" Lamport nor vector clocks for per-key order?
    What is the general principle?
12. An interviewer says "we'll just timestamp everything at the gateway to get
    global order." Give the two-step rebuttal and one design that achieves what
    they actually want.

<details>
<summary><b>Answers</b></summary>

1. A→B iff: same process and A precedes B; or A = send(m), B = receive(m); or
   transitively via some C. Concurrent: neither A→B nor B→A — no chain of
   information flow connects them; the order is not merely unknown but
   undefined.
2. 50 ppm ≈ 4.3 s/day. NTP: ~0.5–10 ms LAN, tens of ms WAN, unbounded under
   asymmetry/failure. TrueTime: ~1–7 ms interval. Durations: monotonic clock
   (System.nanoTime) — wall clock (currentTimeMillis) can step backward/jump
   under NTP, breaking elapsed-time math.
3. (a) Concurrent-write shredding: two causally concurrent writes; LWW keeps
   one, silently discards the other — happens with perfect clocks, it's the
   policy. (b) Skew burial: a fast-clocked node's write out-stamps genuinely
   later writes from slow-clocked nodes for the duration of the skew; acked
   writes vanish.
4. Increment local counter each event; attach counter on send; on receive set
   to max(local, received)+1. Guarantee: A→B ⇒ L(A)<L(B). Converse fails:
   L(A)<L(B) permits either causal order or concurrency — Lamport cannot
   distinguish.
5. V(A) ≤ V(B) in every slot (with strict < somewhere) ⇒ A→B; mutually
   incomparable ⇒ provably concurrent. Costs: O(processes) metadata per
   key/version (plus pruning of dead actors), and the application must
   implement sibling merge logic. Those two costs are why Dynamo-heirs
   defaulted back to LWW.
6. Until TrueTime guarantees the assigned commit timestamp is strictly in the
   past for every node's clock (uncertainty interval elapsed). Emerges:
   timestamp order = real-time order ⇒ external consistency (strict
   serializability) and correct lock-free snapshot reads at any timestamp.
7. Keys use time as identifier + locality (unique-enough, roughly sorted;
   correctness never compares stamps across machines — uncertain paths rescan
   ground truth). Conflict resolution would use time as *authority over
   order*, importing skew into correctness. Distinction: time-as-label vs
   time-as-truth.
8. A logical clock (epoch/counter) scoped to one row: it ticks on every
   committed transition and defines the row's total order of states.
   Per-row scope is exactly the granularity the design needs — global order
   is never consulted.
9. For liveness decisions where the follow-up action consults authority:
   stuck-transaction detection ("non-terminal > T" triggers force-query to
   NPCI — a wrong clock shifts *when* we ask, never *what's true*), checkpoint
   rotation windows, timeouts. Never for correctness decisions (who wins,
   what's newest).
10. Backward clock step → duplicate/regressing IDs: detect last-issued
    timestamp, stall/refuse until clock passes it; run NTP slew-only.
    Per-ms sequence overflow → busy-wait to next ms. Worker-ID collision on
    redeploy → lease IDs via ZK/etcd or strongly-owned config.
11. All writes for a key pass through one partition leader, which assigns the
    order structurally — a single writer needs no clock to know its own
    sequence. Principle: manufacture order by ownership/topology where
    possible; buy clock machinery only where the write topology admits true
    concurrency.
12. (a) The gateway is multiple machines — their clocks skew, so "gateway
    timestamps" are the same cross-machine comparison problem relocated;
    (b) even one gateway node's stamps order *arrival*, not user intent or
    causality, and retries/queues reorder beyond it. What they actually want —
    a total order for downstream replay — is achieved by a sequenced log:
    publish through a partitioned log where each partition's leader assigns
    offsets (per-key total order), or a consensus log for global order, or
    HLC stamps if approximate causal order suffices.

</details>
