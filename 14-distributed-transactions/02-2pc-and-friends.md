# Two-Phase Commit and Friends

The protocol everyone learns, few run, and interviewers love — because it has
crisp mechanics, a famous failure mode, and a great "so why does Spanner get
away with it?" twist. You've never operated XA (say so); this doc makes you
mechanism-fluent anyway, which is what's actually scored.

---

## 1. Plain definition

**Two-phase commit (2PC)** makes N independent resource managers
(participants) agree to commit or abort a transaction **unanimously**, via a
**coordinator**:

- **Phase 1 — prepare (voting):** coordinator asks every participant
  "can you commit?" Each participant does the work, **durably persists a
  prepared/in-doubt record** (it must survive its own crash still able to go
  either way), **holds its locks**, and votes YES or NO. A YES is a binding
  promise: "I will commit if told to, even if I crash and recover first."
- **Phase 2 — decision:** all YES → coordinator durably logs COMMIT (the
  actual commit point of the whole transaction), then tells everyone to
  commit; any NO/timeout → logs ABORT, tells everyone to roll back.
  Participants ack; coordinator forgets.

Analogy: a wedding officiant. "Do you?" — "I do" (prepared: bound, cannot
walk away, waiting on the officiant) — "I now pronounce" (the decision). The
famous pathology is exactly the analogy's horror version: the officiant
faints after the "I do"s — both parties are bound, neither married nor free,
and *nobody else can legally decide*.

---

## 2. Mechanics and the failure analysis (where the question lives)

### 2.1 Crash matrix (walk it in this order)

- **Participant crashes before voting:** coordinator times out → ABORT
  everywhere. Cheap.
- **Participant crashes after voting YES:** on recovery it finds the
  prepared record and **asks the coordinator** for the verdict. Fine —
  as long as the coordinator lives.
- **Coordinator crashes before logging the decision:** participants who
  voted YES are **in doubt** — they cannot commit (maybe someone voted NO)
  and cannot abort (maybe everyone voted YES and the decision was COMMIT).
  They **block**: locks held, rows frozen, until the coordinator recovers
  and replays its log. This is **the blocking problem** — 2PC's defining
  flaw: a single node's failure freezes unrelated participants
  indefinitely.
- **Coordinator crashes after logging, before notifying:** recovery replays
  the decision log and re-sends; participants idempotently apply. Only
  latency lost.

Escape hatches practice added, each ugly: **heuristic decisions**
(a blocked participant unilaterally commits/aborts to free locks —
trading blocking for possible *divergence*, the thing the protocol existed
to prevent; XA's `HEURISTIC_MIXED` is the error code of despair), operator
intervention, and cooperative termination (ask other participants — helps
only if someone saw the decision).

### 2.2 The cost ledger (why the industry walked away)

- **Latency:** 2 sequential round-trips + ≥2 durable fsyncs (participant
  prepare, coordinator decision) on EVERY transaction — intra-DC that's
  ~5–15 ms added floor **(estimate)**; and the slowest participant sets
  the pace for all.
- **Locks held across the full protocol** — including both network round
  trips and any coordinator slowness: throughput on contended data
  collapses (lock hold time ×= protocol latency).
- **Availability multiplication:** the transaction needs coordinator AND
  every participant up — N systems in series
  (`01-fault-tolerance-...md` math), and the blocking mode converts one
  failure into held-lock contagion.
- **Capability demand:** every participant must implement durable
  prepared state + recovery + the in-doubt protocol. Databases and queue
  brokers can (XA drivers); **HTTP business APIs cannot and will not** —
  the trust-boundary point from `01-the-problem.md`.
- **Operational reality:** XA (the standard API: transaction manager +
  XAResources) shipped in JavaEE app servers for decades and is
  remembered mainly for in-doubt transactions paged at 3 AM. "Have you
  run XA?" — the honest, correct answer: "no, deliberately; here's why
  it lost."

### 2.3 3PC — the textbook footnote

Adds a **pre-commit** phase between vote and commit so participants can
infer the decision among themselves if the coordinator dies (non-blocking
under *crash-stop + synchronous network*). Broken in the real world:
under **network partitions** both sides can infer *different* decisions —
divergence, worse than blocking. Verdict to deliver: "3PC trades blocking
for split-brain under partition, so nobody runs it; the actual fix is
making the *coordinator itself* highly available — which is Spanner's
move."

---

## 3. Senior-level depth: where 2PC survives (and why those places work)

The pattern uniting all survivors: **2PC is fine when the coordinator
can't die (replicated) or the scope is one trusted infrastructure with
real prepared-state support.**

1. **Inside single databases:** MySQL runs an internal 2PC between InnoDB
   redo and the binlog on every committed write
   (`02-databases/07-mysql-innodb-internals.md` §2.4) — two logs, one
   machine, recovery reconciles. 2PC as an *implementation detail*, not a
   distributed protocol.
2. **Spanner — the exam answer:** cross-shard transactions run 2PC where
   coordinator AND participants are each **Paxos groups**, not machines.
   The blocking analysis dissolves: the "coordinator crash" case requires
   a majority of a replica group to fail — and even then another replica
   is elected and *replays the replicated decision log*. Locks are still
   held across the protocol (Spanner pays the latency openly — plus
   commit-wait, `01-distributed-systems/06-time-and-ordering.md`), but
   the indefinite-blocking mode is engineered away. One sentence:
   **"Spanner didn't fix 2PC's protocol; it fixed the coordinator's
   mortality."**
3. **Kafka transactions:** the transaction coordinator (a broker module,
   replicated via the log) runs a 2PC-shaped protocol over partitions —
   same recipe: replicated coordinator, closed trusted scope
   (`04-messaging-streaming/04-delivery-semantics.md` §3.1).
4. **Percolator (name-drop):** Google's pre-Spanner model — 2PC where
   the *client* coordinates and the prepared state lives in Bigtable
   cells (lock columns), recovery by other readers cleaning up stale
   locks. Ancestor of TiDB's transaction model. One paragraph of
   awareness suffices.

- **L4/L5/L6:** L4 recites the two phases. L5 walks the crash matrix to
  the blocking case unprompted, itemizes the cost ledger, dismisses 3PC
  with the partition argument, and explains the replicated-coordinator
  insight. L6 makes placement calls: 2PC inside infrastructure it
  controls (or buys, via Spanner-class systems) vs sagas/outbox across
  everything else — and can say what would change their mind.

---

## 4. Resume connection

- **Honest position:** "I've never run XA — deliberately; my platform's
  cross-system flows are all trust-boundary-crossing, where 2PC is
  structurally impossible. But I run 2PC daily without operating it:
  MySQL's binlog commit is one, Kafka-style transactional messaging is
  one, and I can explain why Spanner's version doesn't block."
- **Your platform as the counterfactual:** if you'd insisted on
  2PC-shaped guarantees with super.money/Juspay/NPCI, the product
  wouldn't exist — partner APIs offer operations + callbacks + status
  queries, and the correct machinery (sagas + identity + recon) is what
  you built instead. That's not a workaround; it's the architecture the
  boundary demands.
- **The prepared-state idea DOES appear in your world**, wearing business
  clothes: SBMD's **block (lien)** is a durable reservation held pending
  a later decision (debits or release) — reserve/capture is 2PC's
  phase-1 made into a *product feature* with a business-level timeout
  and compensation instead of a protocol. That reframe —
  "payments turned prepare into a product" — is a genuinely impressive
  interview moment (developed fully in
  `06-payment-consistency-patterns.md`).

**30–60 s spoken answer** ("explain 2PC and why you don't use it"):

> "Two-phase commit gets unanimous commit-or-abort: prepare — every
> participant durably records an in-doubt state, holds its locks, and
> makes a binding promise; then the coordinator logs the decision, which
> is the real commit point, and broadcasts it. The defining flaw is the
> blocking case: coordinator dies after the votes and before the
> decision — every YES-voter is frozen, unable to commit or abort,
> holding locks until the coordinator returns. Add the cost ledger — two
> round trips and multiple fsyncs per transaction, locks held across all
> of it, availability multiplied across every participant, and the
> requirement that participants implement durable prepared state, which
> partner HTTP APIs never do — and you get why cross-boundary 2PC is
> extinct. Where it survives, one recipe: make the coordinator immortal
> and the scope trusted — MySQL's internal redo-binlog commit, Kafka's
> replicated transaction coordinator, and Spanner, which runs 2PC where
> coordinator and participants are Paxos groups, so the blocking case
> requires a majority failure and even then a new replica replays the
> replicated decision. Spanner didn't fix the protocol; it fixed the
> coordinator's mortality. My platform crosses trust boundaries — NPCI
> doesn't join anyone's transaction — so we run the other family: sagas
> with pending states, identity, and reconciliation. Though I'd note
> SBMD's lien is prepare-phase thinking turned into a product feature:
> a durable reservation with a business-level decision to follow."

---

## 5. What the interviewer will push on

**P1. "Coordinator crashes at the worst moment. Walk me through every
participant's exact state and options."**
- *Model:* the §2.1 matrix, focused on post-vote-pre-decision: each
  YES-voter holds a durable prepared record + locks; it cannot commit
  (another vote may have been NO), cannot abort (decision may have been
  COMMIT — and another participant may have already *received* that
  commit, so unilateral abort = divergence). Options: wait (blocking —
  correct, unbounded), cooperative termination (ask peers — resolves
  only if someone saw the decision), heuristic decision (frees locks,
  risks divergence + HEURISTIC_MIXED cleanup). Then the fix taxonomy:
  replicated coordinator (Spanner/Kafka) or don't-play (sagas).
- *Trap:* "participants just time out and abort" — the divergence
  scenario (peer already committed) is precisely what that breaks;
  this is THE screening detail.

**P2. "Why exactly can't you run 2PC with super.money or NPCI? Be
concrete."**
- *Model:* three concrete absences: (1) no prepare endpoint — their API
  is `create-mandate`/`execute`, not `prepare/commit/abort` with durable
  in-doubt semantics; (2) no lock-holding on external command — no
  institution freezes its ledger rows awaiting a merchant's coordinator,
  and their availability/liability model forbids it; (3) no shared
  recovery protocol — coordinator logs and their recovery can't
  reconcile across organizations. What they offer instead defines the
  achievable pattern: operations with identity + callbacks + status
  queries ⇒ saga steps + convergence. Close with the API-design rule
  from `01-the-problem.md` P2.
- *Trap:* only saying "they're external" — the three mechanical absences
  are the content; and don't claim it's impossible *in principle*
  (banks DO run pairwise settlement protocols — just not vendor-driven
  2PC).

**P3. "Spanner uses 2PC. You just said 2PC blocks. Reconcile."**
- *Model:* the blocking analysis assumes a mortal coordinator whose
  private decision log vanishes with it. Spanner's coordinator is a
  Paxos group: the decision is committed to a *replicated* log before
  broadcast, so coordinator-node death → leader failover → replay; the
  in-doubt window is a leader election (~seconds), not an outage.
  Remaining honest costs: locks still held for protocol duration +
  commit-wait; cross-shard txns still slower than single-group ones
  (why schema/interleaving design in Spanner tries to keep transactions
  single-group — the consistency-boundary idea again). Bonus: same
  recipe in Kafka's transaction coordinator.
- *Trap:* "Spanner uses TrueTime instead of 2PC" — TrueTime solves
  *ordering/reads* (commit-wait, external consistency), not atomic
  commit; conflating the two mechanisms is a known mid-level tell.

**P4. "When WOULD you choose 2PC/XA today? Give a real case."**
- *Model:* legitimate cases: (a) within one trusted infrastructure where
  both resources genuinely support it and the invariant can't tolerate
  intermediate states — e.g., consuming from a JMS broker and writing a
  database atomically in a legacy stack (XA's classic use), when
  outbox-style redesign isn't affordable; (b) buying it productized —
  Spanner-class stores where the vendor made the coordinator immortal;
  (c) closed-scope infrastructure protocols you build (Kafka-style).
  Decision variables: trusted scope, real prepared-state support,
  latency budget tolerant of the protocol, and intermediate states
  genuinely unacceptable (rarer than assumed — pending states are
  usually fine). Then the modern default: "for app-level flows I reach
  for outbox + idempotent consumers first; it covers the majority of
  'we need XA' requests at a fraction of the coupling."
- *Trap:* "never" — dogma reads as inexperience; the closed-scope cases
  are real and naming them is the point.

---

## Self-test

1. Walk both phases naming every durable write, and identify the single
   instant the transaction truly commits.
2. What binding promise does a YES vote make, and what must the
   participant do to be able to keep it through a crash?
3. Reproduce the crash matrix; which cell blocks, and why exactly can't
   a blocked participant abort?
4. What is a heuristic decision, what does it trade, and what error
   condition does it create?
5. Itemize the 2PC cost ledger (four entries) with the latency ballpark.
6. Why is 3PC not the answer? One sentence on what it fixes, one on what
   breaks it.
7. State the one-recipe pattern behind every surviving 2PC deployment,
   with three examples.
8. "Spanner didn't fix the protocol; it fixed the coordinator's
   mortality" — unpack the sentence mechanically.
9. Three concrete API/organizational absences that make partner-side 2PC
   impossible.
10. Where does prepare-phase *thinking* appear in your platform as a
    product feature? Complete the mapping.
11. MySQL commits every write via 2PC — with whom, and what breaks
    without it?
12. Give the "when would you use XA today" answer in three cases + the
    modern default.

<details>
<summary><b>Answers</b></summary>

1. Prepare: each participant does the work, durably writes a prepared
   record (fsync #1 per participant), holds locks, votes. Decision:
   coordinator durably logs COMMIT/ABORT (fsync #2 — **this log write
   is the commit instant of the global transaction**), broadcasts;
   participants apply, ack, durably finalize; coordinator forgets.
2. "I will commit if instructed, regardless of what happens to me
   in-between." It must persist enough state (redo + the prepared
   marker) to recover *still in-doubt* — able to either commit or roll
   back on command — while continuing to hold the transaction's locks.
3. Participant-pre-vote crash → abort. Participant-post-vote crash →
   recover, ask coordinator. Coordinator-pre-decision-log crash →
   YES-voters block: can't commit (someone may have voted NO), can't
   abort (the decision may have been COMMIT and some peer may already
   have applied it — unilateral abort would diverge from that peer).
   Coordinator-post-log crash → recovery replays and re-broadcasts.
4. A blocked participant unilaterally commits or aborts to release
   locks/resources. Trades indefinite blocking for possible divergence
   from the eventual/actual decision — creating heuristic-mixed
   outcomes (XA HEURISTIC_MIXED): the exact inconsistency the protocol
   existed to prevent, now requiring manual reconciliation.
5. Latency: 2 sequential RTTs + ≥2 fsyncs per transaction (~5–15 ms
   added intra-DC, slowest participant paces all). Locks held across
   the whole protocol (contention throughput collapse). Availability:
   coordinator AND all N participants in series, with failure →
   lock contagion. Capability: durable prepared state + recovery
   protocol demanded of every participant (HTTP business APIs: never).
6. 3PC inserts a pre-commit round so surviving participants can infer
   the decision without the coordinator — non-blocking under crash-stop
   with a synchronous network. Under partition, the two sides can infer
   opposite decisions — divergence — so it trades blocking for
   split-brain and is not deployed.
7. Make the coordinator effectively immortal (replicate its decision
   log) and keep the scope inside one trusted infrastructure with real
   prepared-state support. Examples: MySQL internal redo↔binlog commit
   (one machine, recovery reconciles), Kafka's replicated transaction
   coordinator, Spanner's Paxos-group coordinator and participants.
   (Percolator: client-coordinated with cleanup-by-readers — same
   family.)
8. The blocking case is "decision log lost with the coordinator."
   Spanner commits the decision into a Paxos-replicated log: any
   replica-group leader failure elects a successor that replays the
   decision — in-doubt shrinks from unbounded to one leader election.
   The protocol's phases, lock-holding, and latency remain; the
   mortality assumption is what changed.
9. No prepare/commit/abort surface (business operations only); no
   external-command lock-holding (institutions won't freeze ledger
   state for a foreign coordinator — liability and availability);
   no cross-organization recovery protocol (their crash recovery and
   your coordinator log can't reconcile). Offered instead: identity-
   keyed operations, callbacks, status queries → sagas + recon.
10. SBMD's lien/block: a durable reservation (funds held, spendable by
    no one) awaiting a later decision (debits execute or block
    released) — prepare-phase semantics with business-level timeout
    and compensation (release) instead of protocol messages; the
    reserve/capture pattern generalized in
    `06-payment-consistency-patterns.md`.
11. Between InnoDB's redo log and the server-layer binlog: prepare in
    engine → write binlog → commit in engine; recovery resolves
    prepared transactions by binlog presence. Without it, a crash
    between the two logs leaves primary and replicas/CDC permanently
    disagreeing about what committed
    (`02-databases/07-mysql-innodb-internals.md` P4).
12. (a) Legacy broker+DB atomic consume-write where redesign to outbox
    isn't affordable; (b) bought productized (Spanner-class) where the
    vendor made the coordinator immortal; (c) closed-scope protocols
    you build inside your own infrastructure. Default otherwise:
    outbox/CDC + idempotent consumers — covers most "we need XA" asks
    with less coupling.

</details>
