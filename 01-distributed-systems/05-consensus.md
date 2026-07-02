# Consensus

You don't build consensus systems at Flipkart — you stand on them (ZooKeeper under
HBase and Storm, metadata quorums under Pulsar/BookKeeper, etcd under Kubernetes).
Interviewers know that's true of almost everyone; what they test is whether you
understand the thing you're standing on: why it exists, how Raft works mechanically,
and what happens to YOUR systems when the quorum wobbles.

---

## 1. Plain definition

**Consensus** = getting a group of machines to agree on a value (or a sequence of
values — a log) such that the decision is **final**, even though machines crash and
messages get lost or delayed. Formal requirements: *agreement* (no two nodes decide
differently), *validity* (the decision was actually proposed by someone), *termination*
(nodes eventually decide).

Why it's hard, in one story: two generals coordinating an attack by messenger can
never be *certain* the other agrees, because any confirmation can be lost — and the
confirmation of the confirmation, forever. Distributed nodes are generals; the
network is the unreliable messenger.

Why you need it at all: any time the system must have **exactly one** of something —
one leader, one holder of a lock, one committed order of writes, one owner of a
partition — someone must arbitrate, and that arbiter must itself survive failures.
Consensus is how a *group* becomes a reliable arbiter with no single point of failure.

The theoretical wall (know its name): **FLP impossibility** — in a fully
asynchronous system (no timing assumptions), no deterministic protocol can
guarantee consensus if even one process may crash, because "slow" and "dead" are
indistinguishable. Practical systems escape by adding timing assumptions
(**partial synchrony**: timeouts that are *eventually* right) — guaranteeing
safety *always* and liveness *when the network behaves*. That sentence — "safety
always, liveness eventually" — is the design creed of every real consensus system.

---

## 2. How it works in practice

### 2.1 Quorum arithmetic (the foundation — memorize)

With **2f+1** nodes you tolerate **f** crash failures: decisions require a
majority (f+1), and any two majorities intersect in ≥1 node — the intersection is
what carries information between decisions and prevents two conflicting decisions.
So: 3 nodes tolerate 1 down; 5 tolerate 2. Even counts add cost without tolerance
(4 nodes still tolerate only 1 — majority is 3), which is why quorums are odd.
Byzantine (arbitrary/malicious) failures need **3f+1** — irrelevant inside a
trusted DC, relevant across trust boundaries.

### 2.2 Raft mechanics (the one to know cold — designed to be explainable)

State machine replication: agree on a **log** of commands; every node applies the
same log in order → identical state everywhere.

- **Roles & terms:** one leader per **term** (a monotonically increasing epoch
  number — Raft's fencing token). Followers passively replicate; candidates run
  elections.
- **Election:** followers expect leader heartbeats (typical: heartbeat every
  50–150 ms, election timeout randomized ~150–300 ms; etcd defaults 100 ms /
  1000 ms **(ballparks)**). Timeout → become candidate, increment term, request
  votes. Majority of votes → leader. **Randomized timeouts** break split-vote
  ties. One vote per node per term prevents two leaders in one term.
- **Log replication:** leader appends client commands to its log, ships
  `AppendEntries` to followers; an entry is **committed** once stored on a
  majority. The leader tells followers the commit index; everyone applies
  committed entries in order.
- **The two safety jewels** (this is what interviewers probe):
  1. **Election restriction:** a candidate must have a log at least as
     up-to-date as each voter's, or the vote is refused. Since a committed entry
     lives on a majority, and winning needs a majority, every possible winner's
     log contains every committed entry → **committed entries can never be
     lost**.
  2. **Log matching + term checks:** followers reject `AppendEntries` whose
     preceding entry doesn't match; stale leaders (older term) are rejected
     everywhere — the term number *is* the fencing that makes zombie leaders
     harmless.
- **Client-visible subtlety:** a leader that acked "committed" to a client is
  telling the truth forever; a leader that *crashed before* commit leaves the
  entry's fate ambiguous (may survive via the new leader, may vanish) — which is
  why clients need idempotent retries even against a consensus-backed store.

**Paxos** in one paragraph (for the name-drop, not the exam): single-decree Paxos
is a two-phase protocol — *prepare/promise* (a proposer claims a ballot number;
acceptors promise to ignore older ballots and report any value already accepted)
then *accept/accepted* (the proposer must propose the highest already-accepted
value it heard, or its own if none). Multi-Paxos amortizes phase 1 into a stable
leader — at which point it's operationally Raft-shaped. Raft's contribution was
packaging (explicit leader, terms, log rules) that humans can implement correctly.

### 2.3 Where it sits in YOUR infrastructure

- **ZooKeeper (ZAB protocol — a Raft sibling):** under **HBase** (master
  election, region-server liveness via ephemeral sessions, cluster metadata/
  `hbase:meta` bootstrap) and **Storm** (Nimbus HA election, worker heartbeats,
  topology state) **[VERIFY your Storm version's ZK usage — heartbeats may go
  via Pacemaker]**; also under **BookKeeper/Pulsar** (ledger metadata, broker
  ownership) **[newer Pulsar can use alternative metadata stores — verify what
  Flipkart runs]**.
- **etcd (Raft):** Kubernetes' brain — every kubectl apply, every controller
  decision flows through Raft consensus.
- The pattern: consensus is kept **small and off the data path** — a 3/5-node
  quorum holds *coordination state* (who leads, who owns what, where things
  are), while data flows through systems that only *consult* it. This
  architecture sentence is worth saying verbatim in interviews.

### 2.4 What breaking looks like in production

- **Quorum loss** (2 of 3 down, or partitioned): the coordination plane freezes —
  no elections, no ownership changes, no config writes. Data planes typically
  *coast* on cached state: HBase keeps serving reads/writes on already-assigned
  regions but can't reassign a failed server's regions (those rows go dark);
  Kubernetes keeps running pods but can't schedule/heal. Symptom: "everything
  works except recovery."
- **Leader flapping:** network jitter or GC pauses > election timeout →
  repeated elections; each transition stalls writes for the election duration
  (hundreds of ms). Pager: leader-changes-per-hour metric.
- **Slow follower / disk stalls:** commit latency = median follower's fsync;
  one slow disk in the quorum drags every write (consensus commits are
  fsync-bound — ~ms on SSD/NVMe).
- **ZK session expiry storms:** long GC pause on a client (e.g., a region
  server) expires its ephemeral session → the cluster believes it died →
  ownership migrates → it wakes and must be fenced. This exact scenario is why
  "GC tuning" and "session timeouts" appear in the same HBase runbooks.

---

## 3. Senior-level depth

- **Consensus ≈ atomic broadcast ≈ replicated log.** They're equivalent problems:
  agreeing on each log slot = agreeing on message order. That's why "Raft" ships
  inside so many products as "the replicated log".
- **Reads are not free:** a leader might be deposed and not know it, so serving
  reads from leader memory can return stale/unlinearizable data. Correct options:
  read-index / lease-based reads (leader confirms leadership before serving —
  leases require bounded clock drift; note the clock dependency), or pipe reads
  through the log (expensive). ZooKeeper by default serves follower reads that
  can be stale — clients needing freshness call `sync` first. "Consensus-backed
  ≠ every read linearizable" is a reliable depth marker.
- **Membership changes are their own protocol** (joint consensus / one-at-a-time
  changes): naively swapping the node set can create two disjoint majorities.
  You don't need the details — you need to know it's a *dangerous, protocol-
  governed* operation, which is why "just add two more ZK nodes quickly during
  the incident" is a trap answer.
- **Why not consensus for everything?** Cost: every write = 1 RTT to majority +
  fsync (intra-DC ~1–5 ms floor); throughput bounded by the leader; cross-region
  quorums put 30–150 ms on every write (Spanner pays it, with TrueTime
  minimizing the *read* cost). So: coordination state in consensus, bulk data in
  partitioned/replicated stores that *reference* it. Systems that put all data
  through consensus (etcd) cap out at modest sizes (~8 GB advised) and write
  rates (~10–50k small writes/s **(ballpark)**).
- **The lock-service framing (Chubby/ZooKeeper insight):** most applications
  don't want "consensus" — they want locks, leader election, name→address
  mappings, watches. Offering consensus as a *service* with a filesystem-like
  API (ZK znodes: ephemeral = liveness-bound, sequential = fair queueing;
  watches = change notification) let one hardened quorum serve a whole company.
  Recognize every ZK recipe as sugar over the same primitive: ephemeral
  sequential znodes → leader election AND fair locks.
- **Fencing beats mutual exclusion claims:** a ZK lock holder paused by GC still
  *believes* it holds the lock after expiry. Correctness requires the protected
  resource to check an epoch/fencing token (the lock's zxid/sequence), rejecting
  stale holders. "The lock service can't reach into a zombie's brain; the
  resource must check the token" — say it like that.
- **L4 vs L5 vs L6:** L4: "ZooKeeper does leader election; Raft has elections
  and logs." L5: quorum math, the two Raft safety rules, read subtleties,
  fencing, and the blast-radius analysis of quorum loss on their own stack.
  L6: system-of-systems judgment — what belongs in the consensus tier vs
  outside, cell-level isolation of coordination planes, and when to accept
  weaker coordination (leases, gossip) for scale.

---

## 4. Resume connection

Honest positioning (per the no-fabrication rule): **you consume consensus; you
didn't build it.** The strong move is precision about the consumption:

- HBase's single-writer-per-row guarantee — the foundation of your CAS/OCC
  design — is *manufactured* by coordination: region ownership assigned via
  master + ZK liveness. Your row-level linearizability is downstream of a
  quorum. When asked "why do you trust checkAndPut?", the full-stack answer
  descends: row → one region server → ownership via ZK sessions + fencing (WAL
  lease recovery) → ZAB quorum.
- Storm's ability to replay your tuples through worker death, and Pulsar
  subscriptions surviving broker failover, both hang off the same coordination
  tier.
- Kubernetes deployments you own are etcd/Raft consumers.
- **Blast-radius answer you must own:** "what if ZK loses quorum?" → HBase
  region assignment freezes; existing assignments keep serving **[VERIFY
  behavior on your internal Yak platform]**; a region-server death during the
  outage means its key ranges are unavailable until quorum returns; your
  payment writes to affected ranges fail → Hystrix/fallbacks at the service
  layer → Pulsar-buffered work queues and waits (the async architecture is
  *also* a consensus-outage shock absorber — connect those dots out loud).

**30–60 s spoken answer** ("do you use consensus anywhere?"):

> "Everywhere — by standing on it, not by building it, and I think knowing the
> difference matters. Our HBase row-level guarantees, which our CAS-based
> concurrency control depends on, come from single-writer region ownership —
> and that ownership is manufactured by ZooKeeper's quorum: ephemeral sessions
> for liveness, master election, fenced reassignment. Storm's replay guarantees
> and Pulsar's broker failover hang off the same coordination tier, and our
> Kubernetes control plane is Raft in etcd. The architectural pattern I take
> from it: keep consensus small and off the data path — a three-to-five node
> quorum owns who-leads and who-owns-what, everything else consults it and
> coasts on cached state when it's unavailable. Which is also our blast-radius
> story: if ZooKeeper loses quorum, assignments freeze but existing ones serve;
> what stops is recovery — and our async, queue-buffered execution path absorbs
> exactly that kind of stall."

---

## 5. What the interviewer will push on

**P1. "Why an odd number of nodes? Why does 4 buy nothing over 3?"**
- *Model:* tolerance = ⌈N/2⌉−1 wait— precisely: majority = ⌊N/2⌋+1, tolerance =
  N − majority. N=3 → majority 2, tolerate 1. N=4 → majority 3, tolerate 1: same
  tolerance, plus one more node that must fsync/vote (slower commits, bigger
  co-failure surface). Even counts also raise tie/split-vote likelihood in
  elections. Add nodes in pairs of usefulness: 3→5 (tolerate 2), 5→7.
- *Trap:* "more nodes = more reliable." For quorums, more nodes = more
  tolerance *only at odd steps*, and always = slower writes.

**P2. "Can Raft lose a committed entry? Walk me through why not."**
- *Model:* committed ⇒ on a majority M₁. Any future leader must win a majority
  M₂ of votes; M₁∩M₂ ≠ ∅, so some voter holds the entry; the election
  restriction makes that voter refuse any candidate whose log lacks it
  (less up-to-date). Therefore every electable leader carries the entry. Then
  the contrast that shows real understanding: an entry the OLD leader accepted
  but had NOT committed (minority-replicated) *can* legally vanish — which is
  exactly why "acked to client" is tied to commit, and why client retries must
  be idempotent.
- *Trap:* hand-waving "the log replicates so it's safe" without the
  majority-intersection + election-restriction argument — that argument IS the
  answer.

**P3. "You hold a ZooKeeper lock and your JVM pauses for 40 s of GC. Session
expires, someone else takes the lock, you wake up and keep writing. Who saves
you?"**
- *Model:* not ZooKeeper — it can't reach into the zombie's process. The
  *resource* saves you, if and only if writes carry a fencing token (the lock's
  monotonically increasing sequence/zxid) and the resource rejects tokens older
  than the highest seen. Without resource-side checking, distributed locks are
  advisory. Bonus: this is the same mechanism as Raft terms and HBase WAL
  fencing — one idea, three costumes; naming that pattern is L5+.
- *Trap:* "tune session timeouts above max GC pause" — that trades correctness
  risk for detection latency and still fails on network partitions; timeouts
  reduce probability, tokens remove the failure mode.

**P4. "ZooKeeper loses quorum for 10 minutes. What actually breaks in YOUR
platform, in order?"**
- *Model:* (structure from §4) T0: coordination writes freeze — no HBase region
  reassignment/splits, no Storm rebalance/leader changes, Pulsar
  ownership/metadata changes stall. Data path coasts: already-assigned regions
  serve; running topologies keep processing; existing broker ownerships serve.
  The damage compounds with *co-occurring* failures: any region server or
  broker dying in the window strands its shard until quorum returns. Our
  mitigations: service-layer breakers + fallbacks, queue buffering (payments
  wait rather than fail), recon sweeping afterward. Close with the meta-point:
  quorum loss converts a fault-*tolerant* system into a fault-*fragile* one —
  you're driving without a spare.
- *Trap:* either "everything goes down" or "nothing happens" — both reveal you
  never thought it through; the real answer is the two-phase shape (coast, then
  fragility).

**P5. "Why not just use a database row with `SELECT ... FOR UPDATE` as your
distributed lock instead of ZooKeeper?"**
- *Model:* you can — until you ask who keeps the *database* single and alive
  (its own failover = the same consensus problem, one layer down), how lock
  liveness is tied to holder liveness (ZK ephemeral sessions vs DB connection/
  lease timeouts — doable but hand-rolled), and fencing (you must implement
  token columns yourself). For modest needs, a DB lock with lease + token
  columns is honestly fine (and simpler ops); ZK/etcd earn their keep at high
  lock churn, watch/notification needs, and when you'd rather consume a
  hardened recipe than hand-roll lease semantics. Both-sides answers like this
  score; dogma doesn't.
- *Trap:* "a DB can't do that" (it can) or "ZK is always overkill" (watches,
  ephemerals, and ordering recipes are real value).

---

## Self-test

1. State the three formal requirements of consensus, and which one FLP says you
   can't guarantee deterministically in a fully asynchronous system.
2. "Safety always, liveness eventually" — what does each half mean concretely
   for Raft?
3. Quorum math: tolerance for N = 3, 4, 5, 7. Why are quorums odd?
4. Explain Raft's election restriction and construct the argument that no
   committed entry is ever lost.
5. What's a term in Raft, and what non-Raft mechanisms in your stack play the
   same role? (Name two.)
6. Why can serving reads from a Raft leader's memory violate linearizability,
   and what are the two standard fixes?
7. Uncommitted-but-acked-to-follower entries: what can happen to them, and what
   does that imply for clients?
8. Why keep consensus "small and off the data path"? Give the latency and
   throughput numbers that force it.
9. ZK ephemeral + sequential znodes: which two recipes do they power, and via
   what property each?
10. Your JVM's 40 s GC pause vs a ZK lock: the failure sequence and the only
    real fix.
11. ZooKeeper quorum down 10 minutes: the two-phase impact story for HBase +
    Storm + Pulsar, and your platform's shock absorber.
12. Why is changing quorum membership dangerous, and what's the safe approach
    called?

<details>
<summary><b>Answers</b></summary>

1. Agreement (no two nodes decide differently), validity (decided value was
   proposed), termination (every correct node eventually decides). FLP:
   termination (liveness) cannot be deterministically guaranteed with even one
   possible crash in a fully asynchronous model.
2. Safety always: at no point — regardless of partitions, delays, crashes — do
   two nodes commit conflicting entries or elect two leaders in one term; the
   log never forks. Liveness eventually: elections and commits complete once
   timing stabilizes (timeouts stop firing spuriously); during bad networks
   progress may stall but never corrupt.
3. Tolerance = N − (⌊N/2⌋+1): 3→1, 4→1, 5→2, 7→3. Odd because the even step
   adds a voter/fsync without adding tolerance and worsens split votes.
4. A voter refuses candidates whose log is less up-to-date than its own
   (compared by last term, then length). Committed entry ⇒ on majority M₁; any
   election winner needs majority M₂; M₁∩M₂≠∅ ⇒ some voter has the entry and
   only votes for candidates that also have it ⇒ every possible leader's log
   contains it.
5. A monotonically increasing epoch identifying a leadership era; stale-era
   messages are rejected — a fencing token. Same role: ZK zxid/session-based
   fencing (e.g., HBase WAL lease recovery/epochs on reassignment), Aerospike
   generation counters (per-record CAS epoch), your rewards version column
   (per-row epoch). (Any two.)
6. The leader may have been deposed without knowing (partition) and serve
   stale state. Fixes: read-index (confirm still-leader with a majority
   heartbeat before serving) or leader leases (time-bounded leadership,
   requires bounded clock drift); alternatively route reads through the log.
7. If not yet on a majority when the leader dies, a new leader without them
   may legally overwrite them — they vanish; if the entry *had* reached a
   majority it survives. Since a client timeout can't distinguish these,
   clients must retry idempotently (dedup keys), even against consensus
   stores.
8. Every consensus write costs one majority RTT + fsync (~1–5 ms intra-DC
   floor; 30–150 ms cross-region) and serializes through one leader
   (~10–50k small writes/s ballpark; etcd advises ~8 GB data). Bulk data at
   payment volumes would be throttled by orders of magnitude — so the quorum
   holds coordination state only, data planes consult and cache it.
9. Leader election (ephemeral: znode vanishes when holder's session dies →
   liveness-bound leadership; lowest sequential wins → deterministic, herd-
   free succession) and fair distributed locks/queues (sequential: strict
   FIFO order; each waiter watches its predecessor).
10. Session expires during the pause → lock granted to another holder → zombie
    wakes still believing it holds the lock → writes proceed → corruption
    unless the *resource* checks a fencing token (monotonic lock sequence) and
    rejects the stale holder. Timeout tuning only shifts probabilities;
    resource-side token checking removes the mode.
11. Phase 1 (coast): data paths serve on cached/held state — assigned regions
    serve, topologies process, owned topics serve; coordination writes freeze
    (no reassignment, no rebalance, no ownership moves). Phase 2 (fragility):
    any component death in the window strands its shard (regions dark, tuples
    unprocessed for that worker) until quorum returns. Shock absorber: async
    queue-buffered execution — payments queue and wait instead of failing —
    plus breakers/fallbacks and post-recovery recon.
12. Naive set swaps can momentarily allow two disjoint majorities (old-config
    majority and new-config majority) → split-brain at the membership level.
    Safe approaches: joint consensus (transitional config requiring majorities
    of BOTH sets) or strictly one-node-at-a-time changes.

</details>
