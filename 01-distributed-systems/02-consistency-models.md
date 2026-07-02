# Consistency Models

The word "consistency" means at least three different things in this industry, and
interviewers deliberately probe whether you keep them separate. This doc builds the
spectrum from strongest to weakest, shows what each costs, and pins down where your
systems sit.

---

## 1. Plain definition

A **consistency model** is a contract between a data system and its clients about
**what values reads are allowed to return, given the history of writes**. Nothing
more mystical than that. Strong models behave like the single computer you learned
to program on; weak models admit that data lives in many places that hear about
writes at different times, and let reads reflect that.

Analogy: a shared family calendar. *Strong* consistency: the instant Mom adds an
event, everyone who looks sees it — as if there's one physical calendar on the
kitchen wall. *Eventual* consistency: everyone has their own copy synced
occasionally — Dad may briefly see an outdated week, but stop making changes and
all copies converge.

Three industry meanings you must keep separate (this exact disambiguation is a
classic screening question):
1. **Consistency in distributed systems / CAP** = (usually) **linearizability** —
   a recency guarantee about reads and writes on a single object across replicas.
2. **Consistency in ACID** = the database moves between states that satisfy your
   declared invariants (constraints, foreign keys) — about *integrity*, not
   replicas. Largely the application's responsibility, aided by the DB.
3. **Consistency in "consistent hashing"** = unrelated; a partitioning technique.

---

## 2. The spectrum, top to bottom (how each works, what each costs)

### Linearizability (single-object "strong consistency")

**Contract:** every operation appears to take effect atomically at some instant
between its start and end, and that global order respects real time — once ANY
client reads the new value, no client may subsequently read the old one. The
system behaves as one copy.

**How it's implemented:** funnel all writes (and linearizable reads) through a
single leader per object/partition (HBase: one region server owns a row → row
operations are linearizable); or quorum protocols *with care* (see the trap in
§5-P2); or consensus (Raft/Paxos log). 

**Cost:** coordination on every operation → latency ≥ round-trip to the
leader/quorum (intra-DC ~0.5–2 ms; cross-region tens-to-hundreds of ms), and by
CAP, unavailability for the minority side during partitions. Linearizability is
the expensive thing you buy only where single-copy behavior is load-bearing:
locks, leader election, account balances, CAS.

### Sequential consistency

Everyone sees all operations in the *same* order, and each client's own ops appear
in its program order — but that order need not match real time (a client may see a
"prefix of history" that's slightly behind). Weaker than linearizable: drop the
real-time recency requirement. Mostly a vocabulary point in interviews; ZooKeeper
reads are roughly this (writes linearizable, reads may be slightly stale unless
you `sync`).

### Causal consistency

**Contract:** writes that are causally related (A could have influenced B — B was
issued after reading A, or by the same client after A) are seen in that order by
everyone; **concurrent** writes may be seen in different orders. This is the
strongest model achievable while staying available during partitions
**(a known theoretical result — the "real-time" part of linearizability is what
CAP forbids, causality survives)**. Implemented with version vectors / dependency
tracking. Fixes the classic anomaly: seeing a reply before the message it answers.

### Session guarantees (client-centric) — the practical middle ground

Per-client promises, cheap to implement (sticky routing, client-carried versions):
- **Read-your-writes:** after I write, my own reads see it. (The anomaly it kills:
  user edits profile, refreshes, edit "disappears" because the read hit a lagging
  replica.)
- **Monotonic reads:** once I've seen a value, I never see an older one (no
  time-travel between refreshes).
- **Monotonic writes / writes-follow-reads:** my writes apply in order; my writes
  are ordered after the reads that motivated them.

These are the guarantees most product bugs are actually about. Saying "we don't
need linearizability here, we need read-your-writes, which we can get with session
stickiness" is a strong L5 move in design interviews.

### Eventual consistency

**Contract (and it's barely one):** if writes stop, replicas converge to the same
value, eventually. No bound on "eventually", no ordering promises meanwhile.
Always pairs with a **conflict-resolution story** — LWW (last-writer-wins:
timestamps pick a winner; silently *discards* concurrent writes — see
`06-time-and-ordering.md` for why that's dangerous), version vectors + merge, or
CRDTs (data types whose merges are mathematically conflict-free: counters, sets;
used in collaborative editing, shopping carts).

**The senior framing:** eventual consistency is not "roughly fine most of the
time" — it's "the application must be correct even when reads are stale and
writes conflict." That's a *transfer of responsibility* from the database to you.

---

## 3. Senior-level depth

### Linearizability vs serializability (the most-failed distinction in interviews)

- **Linearizability:** about *single-object* operations across *replicas*; a
  recency/ordering guarantee; no notion of multi-step transactions.
- **Serializability:** about *multi-object transactions*; the outcome equals SOME
  serial execution of the transactions — an *isolation* guarantee; says nothing
  about real-time recency (a serializable DB may legally serialize your read-only
  txn "in the past" — stale but consistent).
- **Strict serializability:** both at once — serializable AND the serial order
  respects real time. This is what Spanner sells ("external consistency").
- Memory hook: *linearizability = one copy; serializability = one at a time;
  strict serializability = one copy, one at a time.*

### Where anomalies actually bite (tie every model to its anomaly)

| Guarantee dropped | Anomaly you get | Production symptom |
|---|---|---|
| Recency (linearizability) | Stale read after acked write | "I paid but it still shows unpaid"; lock acquired by two holders |
| Cross-client order (sequential) | Two users see different interleavings | Support sees different state than user |
| Causality | Effect before cause | Reply visible before the original comment |
| Read-your-writes | Own write invisible | Edit disappears on refresh |
| Monotonic reads | Time travel | Balance flickers old/new between refreshes |
| Convergence story | Conflicting siblings / lost updates | Two shipping addresses; LWW silently drops one |

### The CAP-consistency vs ACID-consistency disambiguation, fully

ACID-C says: the *transaction* preserves declared invariants (balances non-
negative, FKs valid). It's per-database-state, enforced by constraints + your
transaction logic. CAP-C (linearizability) says: *replicas* behave like one copy
with real-time recency. You can have either without the other: a single-node
MySQL is ACID-consistent with no replication story at all; a linearizable KV
store happily lets you violate any business invariant you like across two keys.
Interviewers ask this cold ("the C in CAP and the C in ACID — same thing?").
Answer in two sentences, not a ramble.

### Tunable consistency & the R+W>N folklore

Dynamo-style stores (Cassandra, older Riak) expose per-operation quorum knobs:
N replicas, W acks to write, R contacted to read. R+W>N guarantees read-write
*overlap* — some replica in your read set has the latest write. **This overlap is
necessary but NOT sufficient for linearizability** (see P2). Aerospike offers a
genuine **strong-consistency mode** (roster-based, per-namespace) vs its default
AP mode **[VERIFY which mode your clusters run — device/dedup sets are very
likely AP; do not claim SC without checking]**.

### L4 vs L5 vs L6

- **L4:** knows strong vs eventual; picks "strong for money, eventual for likes."
- **L5:** works the *middle* of the spectrum — names the specific anomaly the
  product can't tolerate, picks the *cheapest* model that kills it, knows the
  mechanism (session stickiness vs quorum vs single-writer), and states the
  latency/availability price. Decomposes per-operation, not per-system.
- **L6:** shapes the *data model* so weaker consistency becomes safe (immutable
  events + derived views instead of mutable state; CRDTs; making operations
  commutative/idempotent so order stops mattering) — buying availability without
  giving up correctness.

---

## 4. Resume connection

Your platform is a live tour of the spectrum — use it:

- **Linearizable core:** HBase single-row ops. One region server owns a row at a
  time; reads/writes to that row are ordered by it. That per-row linearizability
  is exactly why your `checkAndPut` CAS on the rewards version column is
  trustworthy — OCC is built ON a linearizable primitive. (Also why cross-row
  guarantees are absent, which is why the marker/recon machinery exists.)
- **Deliberate staleness with a safe error direction:** the SuperPay eligibility
  short-circuit reads *your local* mandate store while the partner is the source
  of truth — a stale view, accepted because the failure direction is
  under-offering (no money risk), with callbacks + recon bounding the window.
  That is an engineered eventual-consistency decision, not an accident — say it
  that way.
- **Derived views:** the rewards aggregate is eventually consistent with the raw
  rows (bounded by event-processing lag), rebuildable from ground truth; the CDC
  analytics feed is eventually consistent with HBase (lag, never divergence).
  The home screen tolerates seconds of staleness; correctness lives in the raw
  ledger. This is the L6 pattern above — you already did it.
- **Session guarantee you should verify:** after a user pays, does their txn
  history read hit a path that's guaranteed to reflect it (read-your-writes), or
  can a lagging cache/index show the payment missing? Know the answer — it's a
  natural probe.

**30–60 s spoken answer** ("how do you decide what consistency you need?"):

> "Per operation, by anomaly. I ask: what's the worst stale read or lost update
> this operation can produce, and which is the cheapest model that rules it out?
> In our platform the money bookkeeping sits on HBase's per-row linearizability —
> one region server owns a row, which is what makes our compare-and-swap
> concurrency control sound. Around that core we chose staleness deliberately
> where the error direction is safe: checkout eligibility reads our local mandate
> view rather than the partner's ledger, because the failure mode is
> under-offering a credit option for a few seconds, not wrong money — and
> callbacks plus reconciliation bound the window. And our aggregates and analytics
> are derived views over an immutable event/row history — eventually consistent
> by design, rebuildable from ground truth, so weak consistency there costs
> correctness nothing."

---

## 5. What the interviewer will push on

**P1. "Linearizability vs serializability — and which does a payment system
need?"**
- *Model:* the two-liner from §3, then: a payment system needs both properties in
  different places — single-object recency for balance/state reads that gate
  decisions (linearizability), and multi-step isolation for debit-credit pairs
  (serializability or its practical stand-ins: single-row atomicity + sagas +
  idempotency + recon, which is what wide-column shops like ours actually do).
  Bonus: name strict serializability as the "both" and Spanner as its poster
  child.
- *Trap:* using them interchangeably, or claiming your HBase gave you
  serializable transactions (it gave you per-row atomicity; you built the rest).

**P2. "Cassandra with R=W=QUORUM: is that linearizable?"**
- *Model:* No. Overlap guarantees the read *set contains* the newest value, but:
  (a) a failed/partial write can leave the new value on a minority; a later
  QUORUM read may see it (via one replica) while an even later read misses it —
  non-monotonic history; (b) read repair happening asynchronously means two
  concurrent readers can disagree in ways that violate real-time order;
  (c) LWW timestamp resolution can bury acked writes under skewed clocks.
  Linearizable behavior needs Cassandra's LWT (Paxos) — at several× the latency.
  The one-sentence version: *"quorum overlap gives you 'someone has the truth',
  not 'everyone agrees when it took effect'."*
- *Trap:* "yes, R+W>N is linearizable" — this is one of the best-documented
  gotchas in the field (Kleppmann's DDIA walks the counterexample) and
  interviewers use it as a depth thermometer.

**P3. "Give me a case where eventual consistency loses money, and how you'd fix
it without going fully linearizable."**
- *Model:* classic: available-balance check against a stale replica → two
  concurrent redemptions both pass → overspend. Fixes short of global strong
  consistency: route *that* decision through the single-writer owner of the
  balance (per-key linearizability only), or make the operation a conditional
  write (CAS: "deduct if version/value still X") so staleness causes retry, not
  overspend; or restructure to reservation + settle (two idempotent steps). The
  pattern: *strengthen the write's condition instead of the read's freshness.*
- *Trap:* "cache less" / "read the primary" as the whole answer — you've now
  moved ALL reads to the primary for one decision; the L5 answer scopes the
  strong path to the decision that needs it.

**P4. "Your rewards home screen shows a total that's seconds stale. A user
support-escalates: 'I completed the challenge, coins missing.' Defend the
design."**
- *Model:* the aggregate is a derived view over an append-only ground truth with
  bounded lag (event-processing time, checkpoint repair as backstop); staleness
  here has no correctness cost — the reward row exists (durable) before the
  aggregate reflects it, and the view is rebuildable. Product mitigations:
  per-transaction reward detail reads the row (fresher), and the lag SLO is
  monitored. This is the right trade because the alternative — synchronous
  aggregate update on the user-facing path — couples home-screen availability to
  reward-event processing.
- *Trap:* apologizing for the design. Bounded, monitored, direction-safe
  staleness on a derived view is *correct engineering*, and defending it calmly
  is the signal.

---

## Self-test

1. Define linearizability precisely, including the real-time clause, and name
   the anomaly it forbids.
2. The C in CAP vs the C in ACID — two sentences.
3. Linearizability vs serializability vs strict serializability, one line each,
   with the memory hook.
4. Why is R+W>N not sufficient for linearizability? Sketch the counterexample
   shape.
5. Name the four session guarantees and the user-visible bug each one kills.
6. What's the strongest consistency model compatible with availability under
   partition, and what part of linearizability does it give up?
7. Why does LWW conflict resolution lose data even with perfect clocks?
8. Your HBase CAS is sound because of which consistency property, provided by
   what mechanism?
9. Give the "strengthen the write, not the read" pattern and an example from
   your own systems.
10. A read-only transaction on a serializable (not strictly serializable)
    database returns data that's 10 s stale. Legal? Why?
11. Where in your platform did you *choose* eventual consistency, and what makes
    the choice safe? (Three ingredients.)
12. Interviewer: "just make everything strongly consistent to be safe." Give the
    L5 rebuttal with a number.

<details>
<summary><b>Answers</b></summary>

1. Every operation appears to take effect atomically at a single point between
   its invocation and response, and the resulting total order is consistent with
   real time: once any client observes a write, no client may later observe its
   absence. Forbidden anomaly: stale read after an acknowledged write (and
   non-monotonic "time travel").
2. CAP-C is linearizability — replicas jointly behave like one copy with
   real-time recency. ACID-C is integrity — each transaction moves the database
   between states satisfying declared invariants; it concerns constraints, not
   replicas, and is mostly the application's job.
3. Linearizability: single-object, one-copy recency ("one copy").
   Serializability: multi-object transactions equivalent to some serial order
   ("one at a time"), no recency claim. Strict serializability: both — serial
   order also respects real time ("one copy, one at a time").
4. Overlap only ensures the newest value is *present* in the read set. A
   partially-replicated write (acked by W but visible on fewer during repair, or
   a failed write left on one replica) lets consecutive quorum reads see
   new-then-old depending on which replicas answer — violating monotonicity and
   real-time order. Fixing it requires synchronous read repair before returning
   or consensus (LWT).
5. Read-your-writes (own edit vanishes on refresh); monotonic reads (values
   flicker backward in time); monotonic writes (my second write applied before
   my first); writes-follow-reads (my reply ordered before the message I read).
6. Causal consistency (with convergence). It gives up the real-time recency of
   concurrent (causally unrelated) operations — they may be seen in different
   orders by different clients.
7. LWW picks one winner per key: two *concurrent* writes (neither saw the other)
   are both legitimate, but LWW silently discards the "earlier-stamped" one —
   data loss by resolution policy, independent of clock quality. (Skewed clocks
   make it worse: an acked "winner" can be buried by a lagging clock's write.)
8. Per-row linearizability: exactly one region server owns a row at a time and
   serializes all operations on it, so checkAndPut's compare-and-set executes
   against the one true current version.
9. Instead of demanding a perfectly fresh read before acting, make the action a
   conditional write that fails if state changed: rewards aggregation reads,
   computes, then commits with CAS-on-version — staleness produces a retry, never
   a lost update.
10. Legal. Serializability allows the transaction to be placed anywhere in the
    serial order — including "in the past". Only strict serializability adds the
    real-time recency requirement.
11. Eligibility short-circuit on the local mandate view; rewards aggregate;
    CDC-fed analytics. Safe because: (a) error direction is harmless
    (under-offer / stale display / analytics lag — never wrong money),
    (b) staleness is bounded and monitored (callback lag, recon, backlog age),
    (c) ground truth is elsewhere and views are convergent/rebuildable.
12. Strong consistency is a per-operation coordination tax — a quorum/leader
    round-trip on every read (~0.5–2 ms intra-DC, tens-to-hundreds cross-region)
    plus CAP-mandated unavailability for the minority during partitions.
    Applying that to the ~99% of operations whose anomalies are harmless buys
    nothing and costs latency, throughput, and availability; the skill is
    scoping the expensive guarantee to the reads/writes that gate irreversible
    decisions.

</details>
