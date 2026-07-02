# CAP and PACELC

CAP is the most-cited and most-misstated result in distributed systems. Interviewers
use it as a shibboleth: state it sloppily and you're L4-at-best; state it precisely,
attack its common misuse, and extend to PACELC and you've banked an easy senior
signal. This doc gets the statement exactly right, catalogs the misstatements that
fail candidates, and applies it — carefully — to your stack.

---

## 1. Plain definition

**The theorem (precise form):** in a distributed, replicated system, when a
**network partition** occurs (nodes can't talk to each other), each operation must
choose between:
- **Consistency (C)** — here meaning **linearizability**: the system behaves like
  a single copy; reads reflect the latest acknowledged write (see
  `02-consistency-models.md`), and
- **Availability (A)** — in the theorem's strict sense: **every** request to
  **every non-failed node** receives a (non-error, eventual) response.

You cannot have both *during the partition*: a node cut off from the rest either
answers from possibly-stale local state (available, not linearizable) or refuses/
blocks until it can coordinate (consistent, not available). **P is not a choice** —
partitions are a fact of networks (switch dies, misconfigured firewall, GC-paused
node is effectively partitioned). The real decision is: *when* P happens, do you
degrade C or A?

Analogy: two bank branches lose their phone line. A customer walks into each and
withdraws from the same account. Either both branches serve them using their local
ledger copy (available — and the account may go negative: inconsistent), or the
branches refuse withdrawals until the line returns (consistent — and customers are
turned away: unavailable). No cleverness escapes this; it's forced by the missing
phone line.

---

## 2. How to state it, and the misstatements that fail candidates

**Say this:** "CAP says that *during a network partition* you must choose, per
operation, between linearizable behavior and serving every request — and since
partitions aren't optional, the design decision is which one degrades."

The misstatement catalog (each one is a real interview failure mode):

1. **"Pick 2 of 3."** Wrong: P isn't pickable. "CA systems" in the 2-of-3 sense
   are single-node systems or systems that stop entirely during partitions
   (which is… choosing C over A). The triangle diagram is marketing, not math.
2. **"Cassandra is AP, HBase is CP" as a system-wide, permanent label.** Wrong
   twice: the choice is **per-operation and configurable** (Cassandra with
   QUORUM/LWT behaves CP-ish for those ops; some systems mix), and outside
   partitions the theorem says *nothing* — labeling whole databases is a
   category error, famously criticized ("please stop calling databases CP or
   AP"). Use the labels only as shorthand for *default posture during
   partitions*, and say that's what you're doing.
3. **"Availability" = uptime/nines.** The theorem's A is a specific formal
   property (every non-failed node answers). A CP system can have five nines of
   *operational* availability; an "AP" system can be down from a bad deploy.
   Keep CAP-A and SLA-availability separate or an interviewer will separate
   them for you.
4. **"Consistency" = ACID-C.** Covered in `02-consistency-models.md` — CAP-C is
   linearizability; ACID-C is integrity constraints.
5. **"CAP forbids consistency at scale."** The theorem only bites during
   partitions and only for linearizability. Plenty of planet-scale systems are
   CP (Spanner, ZooKeeper, etcd) — they accept minority-side unavailability
   during partitions, which is rarer and cheaper than the slogan implies.

**What CP and AP actually look like during a partition:**
- **CP:** majority side keeps serving linearizably; minority side refuses
  writes (and linearizable reads) — errors/timeouts for clients stranded there.
  ZooKeeper, etcd, HBase (regions on the wrong side of a partition go dark
  until reassigned to the majority side).
- **AP:** both sides keep serving from local state; divergence accumulates;
  reconciliation (vector clocks/siblings, LWW, CRDTs, or app-level repair) runs
  at heal time. Dynamo lineage, Cassandra defaults, Aerospike's AP mode.

---

## 3. Senior-level depth: PACELC and the real trade-space

**PACELC (Abadi):** *if Partition, trade Availability vs Consistency; Else
(healthy network), trade Latency vs Consistency.* The "ELC" half is the daily
one: linearizability costs coordination (leader/quorum round-trips —
~0.5–2 ms intra-DC, 30–150+ ms cross-region) on *every* operation, partition or
not. Systems classify as e.g.:

| System | P: A or C | Else: L or C | Notes |
|---|---|---|---|
| Dynamo/Cassandra (defaults) | PA | EL | Tunable per-op toward C |
| HBase / Bigtable | PC | EC | Single-writer rows; row-scope only |
| Spanner | PC | EC | Pays commit-wait + quorum latency for external consistency |
| MongoDB (majority writes) | PC-ish | EC | Configurable write/read concerns |
| Aerospike | AP mode: PA/EL; SC mode: PC/EC | | Per-namespace choice **[verify yours]** |
| MySQL async replica reads | (not a partition story) | EL | Lag-for-latency on reads |

Why PACELC matters more than CAP in interviews: partitions are rare; **latency
is every request**. When you justify "we read a possibly-stale local view", the
honest reason is usually ELC (save the coordination round-trip / partner call),
not partition tolerance. Citing PACELC for that is precise; citing CAP is
sloppy.

**Second senior refinement — granularity:** the C/A choice is made **per
operation, per data item, per direction of error**, not per system. A payment
platform is not "CP"; its *balance-gating writes* are CP-flavored while its
*history reads, caches, analytics* are AP/EL-flavored. The design skill is the
decomposition. (This is the shape of the trap question P1 below.)

**Third — the error-direction lens (yours):** when choosing A (serve stale),
ask *which way* errors point. Stale read that under-offers credit: safe. Stale
read that double-spends: unsafe. AP is acceptable exactly where the error
direction is benign or repair is cheap (idempotent recon). This lens converts
CAP hand-waving into engineering.

**L4 vs L5 vs L6:** L4 recites "pick 2". L5 states the precise theorem, rejects
system-wide labels, uses PACELC for latency honesty, and decomposes per
operation with error direction. L6 designs the *reconciliation economy* — make
divergence cheap to detect and repair (immutable events, recon, CRDTs), so more
of the system can afford A/EL without correctness debt.

---

## 4. Resume connection

- **HBase core = PC/EC, and you built ON that:** during partitions/failures,
  regions on the minority side go unavailable until reassigned (fenced,
  majority-side) — you chose refusal over divergence for transaction/mandate/
  reward state. Your CAS discipline exists *because* the store gives
  row-linearizability; you'd have to redesign it entirely on an AP store.
- **Aerospike device/dedup caches = availability-leaning by role** (verify the
  namespace mode): a briefly-stale or unavailable dedup check has layered
  backstops (PSP/NPCI identity dedup), so the platform tolerates AP behavior
  there — error direction + downstream layers make it safe.
- **Eligibility short-circuit = a PACELC ELC decision, not a CAP decision:**
  the network isn't partitioned; you serve a local view to avoid a partner
  round-trip on the hot path (latency over freshness), with under-offering as
  the benign error direction and callbacks/recon as repair. Naming it as ELC —
  not "CAP" — is exactly the precision interviewers reward.
- **Grey-out under partner failure = choosing C-flavored refusal for credit
  issuance:** when you can't verify headroom, you don't offer the product —
  refusing service (unavailability of the feature) rather than risking wrong
  money. Per-operation decomposition, in the flesh.
- **The recon system is your "reconciliation economy":** divergence between
  your state and partner/NPCI truth is *expected* and *cheap to repair*
  (force-query, idempotent convergence) — which is what licenses the AP/EL
  choices elsewhere.

**30–60 s spoken answer** ("is your system CP or AP?"):

> "Neither — that label doesn't survive contact with a real platform; the
> choice is per operation. Our money state sits on a CP substrate: HBase rows
> are single-writer and linearizable, and during failures the affected key
> ranges go unavailable rather than diverge — for transaction state we want
> refusal, not conflicting versions. Around that core we deliberately relax:
> device and dedup caches lean toward availability because their errors are
> caught by deeper idempotency layers; checkout eligibility reads a local view
> of partner state — which is really a PACELC latency-versus-consistency call,
> not a partition call: we save a partner round-trip on the hot path, the
> stale-read error direction is merely under-offering credit, and callbacks
> plus reconciliation repair the divergence. And when we genuinely can't
> verify money-relevant state — partner down — we choose consistency-flavored
> refusal: grey out the credit option. The pattern: strong where errors are
> irreversible, available where errors are benign and repair is cheap."

---

## 5. What the interviewer will push on

**P1. "Is your payment system CP or AP?"** (the trap is the question itself)
- *Model:* the §4 spoken answer — reject the premise politely, decompose per
  operation with error directions, name the ELC cases as ELC. 
- *Trap:* answering "CP" (or "AP") in one word and defending the label. The
  question is scored on whether you notice it's ill-posed.

**P2. "Give me a system that's genuinely CA."**
- *Model:* within the theorem's frame: a non-distributed system (single node —
  no partitions possible among replicas that don't exist), or a system on a
  network assumed partition-free (same rack, redundant fabric) — which is an
  *assumption*, not a guarantee; when the assumption breaks, the system reveals
  its true C-or-A default. Practical honest example: a single-primary DB with
  no replicas is "CA" until you add the second node. The expected conclusion:
  distributed + partition-prone ⇒ CA is not on the menu; asking for CA is
  asking "what happens when your assumption fails?"
- *Trap:* naming a replicated production system as CA (a classic — some
  vendors marketed exactly this; repeating it is a fail).

**P3. "During a partition, your CP store makes the minority side unavailable.
Your SLA says 99.99%. Reconcile."**
- *Model:* three moves. (1) Partitions that isolate a *minority of replicas*
  are rare and brief; CP unavailability is scoped to affected ranges/clients,
  not the world — quantify expected contribution to the error budget.
  (2) Architecture shrinks exposure: clients/routing fail over to the majority
  side (multi-DC routing — your DC-redirect layer), so only clients *trapped*
  with the minority see errors. (3) The async/queue design converts
  unavailability into deferred processing for writes that tolerate it —
  payments queue rather than fail. If the residual still breaks the SLA, the
  SLA is wrong for a CP money path — negotiate the SLO per operation class,
  which is an L6-flavored close.
- *Trap:* "we'd switch to AP during partitions to protect the SLA" — for money
  state, that's trading an availability blip for correctness incidents;
  interviewers set this trap to see if the SLA pressure makes you abandon
  correctness.

**P4. "Where in your stack do you pay latency for consistency with no partition
in sight — and where did you refuse to pay it?"** (PACELC fluency check)
- *Model:* pay: every HBase row write goes through the owning region server
  (+WAL fsync to HDFS quorum) — single-copy semantics at millisecond cost;
  Pulsar produce waits for bookie ack-quorum — durability over latency.
  Refused: eligibility short-circuit (local view over partner round-trip);
  follower-ish/cached reads for display surfaces; CDC-fed analytics (lag over
  load). Each refusal named with its error direction and repair path.
- *Trap:* not having an example on either side — it means you've never traced
  where your own coordination costs live.

**P5. "Your AP-leaning dedup cache diverges during a partition: node A saw
request-ID X, node B didn't. Client retry lands on B. Walk the consequence
chain."**
- *Model:* B misses the dedup hit → second transaction attempt proceeds past
  the gateway → caught (or not) by the next identity layer: txn creation
  keyed by the same UPI request identity / PSP + NPCI dedup on transaction
  identity → collapses to one money movement; worst case, two INITIATED rows
  where one dies as duplicate downstream — recon cleans residue. Conclusion:
  the gateway dedup is an *optimization tier* of a layered idempotency design,
  which is precisely why AP behavior is tolerable there — and if it were the
  ONLY dedup layer, AP would be the wrong mode. This chains `03-core` D2,
  failure detection P4, and CAP into one answer — exactly the cross-topic
  synthesis L5 interviews reward.
- *Trap:* "the cache is replicated so this can't happen" — during partitions
  that's exactly what stops being true; denial of divergence in an AP tier is
  a fail.

---

## Self-test

1. State CAP precisely: the three terms' formal meanings and what the theorem
   actually forbids.
2. Why is "pick 2 of 3" wrong? What is the real decision?
3. Catalog three more misstatements and the correction for each.
4. What does a CP system's partition behavior look like operationally? An AP
   system's? One production example each.
5. State PACELC and explain why the ELC half dominates day-to-day design.
6. Classify: Cassandra defaults, HBase, Spanner, your Aerospike namespaces —
   in PACELC terms, with the caveat that makes the labels honest.
7. Why is "is your system CP or AP" ill-posed, and what's the correct shape of
   answer?
8. Define the error-direction lens and apply it to two AP-leaning choices in
   your platform.
9. Your eligibility short-circuit: CAP decision or PACELC decision? Defend the
   classification.
10. During partition, minority-side HBase regions go dark. What limits the
    user-visible damage in your platform? (Three mechanisms.)
11. What "licenses" a system to choose A/EL widely, per the L6 framing?
12. Construct the strongest argument FOR switching a money path to AP during
    partitions — then dismantle it.

<details>
<summary><b>Answers</b></summary>

1. C = linearizability (single-copy behavior, real-time recency). A = every
   request to every non-failed node eventually gets a non-error response.
   P = the network may lose/delay messages between node groups. Forbidden:
   all three simultaneously — during a partition, an isolated node must
   either answer from local (possibly stale) state (sacrificing C) or
   refuse/block (sacrificing A).
2. P is not selectable — partitions happen to you (switch failures, config
   errors, long pauses acting as partitions). The real decision is the
   degradation policy *when* P occurs: which of C or A gives way, and for
   which operations.
3. (a) "A = uptime": theorem-A is per-non-failed-node responsiveness, not
   SLA nines — a CP system can have superb uptime. (b) "C = ACID-C":
   CAP-C is linearizability; ACID-C is integrity constraints. (c) "Databases
   are permanently CP or AP": the posture is per-operation and configurable
   (QUORUM/LWT vs ONE; SC vs AP namespaces); labels are shorthand for
   *default partition posture* only. (Also acceptable: "CAP forbids
   consistency at scale" — it only constrains partition intervals.)
4. CP: majority side serves; minority side errors/blocks; affected ranges
   dark until reassignment — ZooKeeper/etcd/HBase. AP: both sides serve and
   diverge; heal-time reconciliation (siblings, LWW, CRDTs) — Dynamo/
   Cassandra defaults/Aerospike-AP.
5. If Partition: trade A vs C; Else: trade Latency vs C. ELC dominates
   because partitions are rare but the coordination cost of linearizability
   (leader/quorum RTTs, cross-region 30–150 ms) is paid on *every* operation
   — most real "we serve stale data" decisions are latency decisions, not
   partition decisions.
6. Cassandra defaults PA/EL (tunable toward C per-op via QUORUM/LWT). HBase
   PC/EC (row scope). Spanner PC/EC (pays quorum + commit-wait). Aerospike:
   per-namespace — AP mode PA/EL, SC mode PC/EC [verify which yours run].
   Caveat: these are default-posture shorthands, per-operation in practice.
7. Because the C/A choice is made per operation/data-item/error-direction,
   not per system. Correct shape: decompose — strong substrate for
   irreversible money state, availability-leaning tiers where errors are
   benign and repaired, latency-motivated staleness named as ELC.
8. Ask which way a stale/duplicate error points and what repairs it.
   Dedup cache: divergence risks a duplicate *attempt*, caught by deeper
   identity layers + recon — benign direction, cheap repair ⇒ AP acceptable.
   Eligibility local view: staleness under-offers credit (no money moves) —
   benign ⇒ acceptable; the reverse direction (over-offering) is caught at
   the authoritative balance check.
9. PACELC/ELC. There is no partition; the network is healthy. The choice is
   skipping a partner round-trip on the hot path (latency) at the price of a
   bounded-stale local view (consistency), with benign error direction and
   callback/recon repair. Calling it CAP would misattribute the motive.
10. (1) Multi-DC routing/failover moves clients to healthy capacity;
    (2) the async queue converts write unavailability into deferred
    processing — payments queue rather than fail; (3) scoped blast radius:
    only affected key ranges/rows dark, plus recon converges any stranded
    states afterward. (Breakers/fallbacks degrade features rather than
    cascade.)
11. A cheap reconciliation economy: divergence that is *detectable* (recon,
    versioned events, immutable ground truth) and *repairable idempotently*
    at low cost. When repair is cheap and errors are direction-safe,
    availability and latency can be bought aggressively.
12. For: partitions strand paying users; queued/refused payments are lost
    revenue and support load; serve-local-and-reconcile keeps commerce
    flowing, and card networks historically did offline authorization with
    later settlement — divergence-with-repair is a proven model. Dismantle:
    offline-auth works because the *product* bounds exposure (floor limits,
    risk pricing) — i.e., it's not raw AP, it's AP with a designed error
    budget and a settlement/dispute machinery priced into the business. Raw
    AP on account-balance-gated debits creates unbounded double-spend
    exposure with repair costs (clawbacks, disputes, trust) far exceeding
    the availability gain; if the business wants offline-style continuance,
    it must be designed as a bounded-risk product feature, not flipped as a
    database mode.

</details>
