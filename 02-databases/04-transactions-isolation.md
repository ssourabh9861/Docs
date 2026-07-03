# Transactions and Isolation Levels

The most theory-dense database topic, and one where interviewers have a
standard ladder: define ACID → name the anomalies → match them to isolation
levels → explain MVCC → then the boss question, write skew. Your platform adds
a twist worth owning: you mostly work *without* multi-row transactions, which
means you can explain both what the machinery does and what living without it
costs.

---

## 1. Plain definitions

A **transaction** is a group of reads and writes that the database promises to
treat as one unit: all of it happens, or none of it, and (to a configurable
degree) as if no one else was touching the data meanwhile.

**ACID, precisely** (each letter is a separate promise — sloppy definitions
here are an instant screen):

- **Atomicity:** all-or-nothing *under failure* — a crash mid-transaction
  rolls back the partial work. Nothing to do with concurrency; it's about
  abort/crash cleanup (undo logs). "Abortability" is the better mental name.
- **Consistency:** the transaction moves the DB between states satisfying
  your invariants (constraints + application logic). Famously the odd one
  out: mostly the *application's* promise, aided by constraints
  (`01-distributed-systems/02-consistency-models.md` for the CAP-C
  disambiguation).
- **Isolation:** concurrent transactions don't corrupt each other — the
  configurable dial this whole doc is about. Full isolation =
  **serializability**: the outcome equals *some* serial one-at-a-time
  execution.
- **Durability:** committed = survives crashes (WAL/fsync/replication —
  `01-storage-engines.md`, `02-pulsar-vs-kafka.md` fsync postures).

Why isolation is a dial and not a constant: full serializability costs
concurrency (locking) or aborts (optimistic validation); most engines default
weaker and let you pay per-transaction.

---

## 2. The anomalies and the levels (the canonical ladder)

### 2.1 The anomalies — know each as a story

| Anomaly | Story (one line) |
|---|---|
| **Dirty write** | I overwrite data another uncommitted txn wrote — even Read Uncommitted forbids this |
| **Dirty read** | I read data from a txn that later aborts — I acted on data that never existed |
| **Non-repeatable read** | I read a row twice in one txn and get different values (someone committed between my reads) |
| **Phantom** | I run the same *predicate* query twice and new rows appear (someone inserted matching rows) |
| **Lost update** | Two read-modify-writes interleave; the second write silently erases the first (both read v7, both write) |
| **Write skew** | Two txns each read an overlapping set, make a decision, and write to *different* rows — each individually fine, jointly violating an invariant (the boss anomaly — §3) |

### 2.2 The levels — defined by what they forbid

| Level | Forbids | Mechanism (typical) | Still allows |
|---|---|---|---|
| Read Uncommitted | dirty writes | write locks | dirty reads |
| **Read Committed** (Postgres/Oracle default) | + dirty reads | read from committed snapshot per *statement* | non-repeatable reads, phantoms, lost updates, write skew |
| **Repeatable Read / Snapshot Isolation** (MySQL default; Postgres RR = SI) | + non-repeatable reads (whole-txn snapshot); InnoDB also blocks phantoms via next-key locks (for locking reads) | MVCC snapshot at txn start | **write skew** (SI's signature hole); lost updates prevented in Postgres-SI (first-committer-wins), *not* by plain MVCC reads in MySQL (needs FOR UPDATE) |
| **Serializable** | everything — equivalent to some serial order | 2PL (locking), or SSI (Postgres — optimistic, aborts on dangerous patterns) | nothing (but: aborts/retries, throughput cost) |

Two engine-truths worth stating exactly:
- **MySQL InnoDB default = REPEATABLE READ**, implemented as MVCC snapshot
  reads + **next-key locks** (row + gap) on locking reads/writes — which is
  why InnoDB RR blocks phantoms for `SELECT ... FOR UPDATE` but plain
  SELECTs are snapshot reads that can still participate in write skew.
- **Postgres default = READ COMMITTED**; its REPEATABLE READ is true
  Snapshot Isolation; its SERIALIZABLE is **SSI** (serializable snapshot
  isolation — optimistic, detects dangerous rw-antidependency cycles and
  aborts one txn; ~10–30% overhead **(workload-dependent estimate)**, far
  cheaper than 2PL for read-heavy loads).

### 2.3 MVCC mechanics (the "how" behind RC/RR)

**Multi-Version Concurrency Control:** writers create new row *versions*
instead of overwriting; readers read the newest version visible to their
snapshot (txn-ID watermarks). Result: **readers never block writers, writers
never block readers** — the property that made MVCC universal. Plumbing:
InnoDB keeps old versions reconstructable via **undo logs** (and purges when
no snapshot needs them — long-running transactions bloat undo/history:
the "long transaction held the database hostage" incident); Postgres keeps
versions in-heap (vacuum reclaims — bloat is its version of the same tax).
Writers still conflict with writers: row locks on update (and InnoDB's gap/
next-key locks for phantom protection — also the source of its famous
deadlocks on adjacent inserts).

### 2.4 Locking vocabulary (enough to be dangerous)

Two-phase locking (2PL): acquire as you go, release at commit — serializable
by construction, deadlock-prone (engines detect cycles and abort a victim;
retry logic is mandatory app code). Shared vs exclusive; intention locks
(table-level declarations); `SELECT ... FOR UPDATE` = "read with an
exclusive claim" — the standard lost-update fix; InnoDB gap locks: lock the
*space between* index entries so no phantom can be inserted — and the classic
deadlock generator under concurrent inserts to nearby keys.

---

## 3. Senior-level depth

### 3.1 Write skew — the anomaly that survives Snapshot Isolation

The canonical story (Kleppmann's on-call doctors): invariant — ≥1 doctor on
call. Alice and Bob both check "how many on call?" → both see 2 → both go off
call (each updates *their own* row). Both commit fine under SI — no row was
written by both. Invariant broken. Structure: **read a predicate → decide →
write somewhere the other's read didn't cover.** Other instances: booking the
last seat via "count bookings then insert", unique-username via
"check-then-insert", spending against a balance computed from a *sum* of
rows. Fixes, in preference order: (1) make the invariant a *materialized
row* and touch it (a row per shift; decrement a seats-remaining counter —
turns skew into a direct write conflict); (2) `SELECT ... FOR UPDATE` the
rows your decision depends on (lock the predicate's witnesses); (3) run
SERIALIZABLE (SSI aborts one); (4) unique constraints where the invariant is
uniqueness. The L5 marker is recognizing skew's shape in a novel scenario
and reaching for materialize-the-invariant first.

### 3.2 Living without transactions (your platform's reality)

HBase gives single-row atomicity, `checkAndPut`, `Increment` — the row is
the transaction. Multi-row/multi-table invariants get *application
machinery*: idempotency markers as completion flags (poor-man's saga —
`00-resume-arsenal/02-upi-rewards.md`), CAS-on-version as optimistic
concurrency control (which IS SI's first-committer-wins, hand-rolled at row
scope), deliberate write ordering for crash-consistency (your mandate
update sequence), and recon as the outer serializer. The two-way fluency —
"here's what the engine would have done; here's what we built instead" —
is your differentiator in this topic. Distributed-transaction machinery
(sagas, outbox, 2PC) continues in `14-distributed-transactions/`.

### 3.3 Practical judgment

- **Defaults are a decision someone forgot to make:** Postgres RC vs MySQL
  RR behave differently under identical code (e.g., re-read semantics,
  lost-update behavior); porting apps between them without an isolation
  audit is a classic bug source.
- **Choose per-transaction, not per-database:** money-moving read-modify-
  writes get FOR UPDATE or serializable; bulk reads get RC/snapshot;
  reporting gets a replica. Isolation is a *cost knob per operation* —
  the same per-operation decomposition logic as CAP/PACELC.
- **Retries are part of the contract:** serializable (SSI) and OCC abort
  by design; deadlock victims abort by design. Transaction code without a
  retry loop (idempotent! — `05-resilience/07-idempotency.md`) is
  incomplete at any isolation level above RC.
- **L4/L5/L6:** L4 recites ACID and "we use transactions." L5 walks the
  anomaly→level ladder with mechanisms (MVCC, next-key locks, SSI),
  explains write skew with a fix hierarchy, and knows engine defaults
  differ. L6 treats isolation as a portfolio: per-transaction-class
  policies, hot-row contention design (materialized invariants,
  sharded counters), and the org rule that every txn has a retry story.

---

## 4. Resume connection

- **Your CAS-on-version is first-committer-wins OCC** — the same principle
  as Postgres-SI's lost-update prevention, built by hand at row scope:
  "reads never block, conflicts surface at write time, losers retry from
  fresh state." Say it with the engine vocabulary and the topic is yours.
- **Your `is_aggregated` marker + two-phase write is atomicity replacement:**
  what a transaction's undo log would give you (all-or-nothing across the
  two tables), replaced by completion flags + idempotent re-derivation +
  recon. The crash matrix in the rewards arsenal is literally a hand-built
  recovery protocol.
- **Your mandate-update write ordering is crash-consistency design** — the
  discipline WAL + atomic commit would provide, done manually: order writes
  so any prefix is detectable/recoverable.
- **Lost update in your world:** two consumers read aggregate v7 → both
  compute → CAS makes the second fail instead of silently winning — you've
  *prevented* the anomaly the textbook warns about; name it "lost update"
  in interviews.
- **[VERIFY] what MySQL holds in your platform and at what isolation** —
  if MySQL is on your resume, "what's InnoDB's default isolation and how
  does it prevent phantoms?" is a fair one-two punch (answer: REPEATABLE
  READ; MVCC snapshots for plain reads + next-key locks for locking
  reads).

**30–60 s spoken answer** ("what isolation levels do you actually use /
how do you handle concurrency?"):

> "Two regimes. In HBase there are no multi-row transactions, so the row is
> the transaction and everything bigger is explicit machinery: our
> concurrent aggregate updates use compare-and-swap on a version column —
> which is first-committer-wins optimistic concurrency, the same principle
> snapshot-isolation engines use to stop lost updates — losers retry from
> fresh state via queue redelivery; cross-table atomicity is replaced by
> completion markers plus idempotent re-derivation, effectively a
> hand-built recovery protocol; and reconciliation is the outer
> serializer. On the relational side, I treat isolation as a
> per-transaction cost knob: money-moving read-modify-writes lock their
> witnesses with SELECT FOR UPDATE or run serializable, bulk reads take
> read-committed snapshots, and every transaction above read-committed
> ships with an idempotent retry loop, because serializable and OCC abort
> by design. The anomaly I actively design against is write skew — the one
> snapshot isolation doesn't catch: two transactions read an invariant,
> decide, and write disjoint rows. My default fix is materializing the
> invariant into a row both must touch, so skew degrades into an ordinary
> write conflict the engine can see."

---

## 5. What the interviewer will push on

**P1. "Two requests read balance=100, both deduct 30, final balance is 70.
Name the anomaly and fix it three ways with trade-offs."**
- *Model:* **lost update** (read-modify-write interleave). Fixes:
  (1) atomic in-place operation — `UPDATE ... SET bal = bal - 30 WHERE
  bal >= 30` (condition enforces the invariant; check rows-affected) —
  cheapest, engine-serialized on the row; (2) pessimistic —
  `SELECT ... FOR UPDATE` then write — serializes early, holds locks
  across the think-time, deadlock-retry needed; (3) optimistic — version
  column CAS (`WHERE version = ?`) — no locks held, wasted work under
  contention, retry loop mandatory (your platform's choice, with the
  low-contention justification). Bonus: at scale, hot-account contention
  pushes toward sharded/materialized balance designs.
- *Trap:* "use transactions" — a plain transaction at RC (or MySQL-RR
  with plain SELECTs) does NOT fix this; the fix is the conditional
  write, the lock, or the CAS. This trap catches a huge fraction of
  candidates.

**P2. "Explain write skew, why snapshot isolation misses it, and fix the
on-call-doctors case."**
- *Model:* structure — both txns read overlapping state, decide, write
  *disjoint* rows; SI validates write-write conflicts only, and there are
  none: each txn's snapshot was consistent, each write untouched by the
  other. Misses it by design. Fixes (order of preference): materialize
  the invariant — a `shift_oncall_count` row both decrement (skew →
  direct conflict); FOR UPDATE the rows read for the decision; run
  SERIALIZABLE/SSI (one aborts on the rw-antidependency cycle);
  constraint if expressible. Deliver the general shape *before* the fix —
  recognizing skew in the wild is what's scored.
- *Trap:* calling it a lost update (no write overlaps!) or asserting
  "repeatable read prevents it" — the whole point is that it survives SI.

**P3. "MVCC: how can readers never block writers? Where do old versions
live, and what's the failure mode?"**
- *Model:* writers create new versions; each txn reads the newest version
  visible to its snapshot (txn-id visibility rules) — readers need no
  locks because their version is immutable. Old versions: InnoDB —
  reconstruct via undo log chains; Postgres — dead tuples in the heap.
  Failure mode: version retention is bounded by the *oldest active
  snapshot* — one forgotten long-running transaction (or idle-in-
  transaction connection) pins undo/history growth (InnoDB history-list
  length ballooning; Postgres bloat + vacuum starvation, and at the
  extreme, wraparound drama) — the classic "analytics query melted the
  OLTP database" incident. Monitor oldest-txn age; kill or route
  long readers to replicas.
- *Trap:* "readers read the latest committed value" — that's RC per
  statement; RR/SI reads the *snapshot's* version, older than latest.
  Precision here is exactly what's probed.

**P4. "Why isn't everything just SERIALIZABLE?"**
- *Model:* cost mechanics, not vibes: 2PL-serializable holds read locks to
  commit — concurrency collapses on contended data, deadlocks rise; SSI
  aborts on dangerous patterns — retry rates climb with contention and
  long transactions (and every abort is wasted work); either way,
  throughput on hot rows drops by multiples. And most transactions don't
  need it — their invariants are single-row or naturally conflict-
  surfacing. So: serializable where invariants span reads (skew-shaped),
  cheaper levels + targeted locks/CAS elsewhere — per-transaction
  portfolio. Close with the retry contract: adopting serializable without
  idempotent retries is adopting outages.
- *Trap:* "performance" with no mechanism — name lock-hold-to-commit and
  abort-rates or it's hand-waving; also missing that SSI ≠ 2PL (modern
  serializable is cheaper than the folklore says).

**P5. "Your HBase has no transactions. Walk me through a money-adjacent
multi-row change and convince me it's safe."**
- *Model:* pick the rewards two-table write (the crash matrix): phase
  writes ordered so any crash leaves a *detectable* state (row exists,
  marker false); recovery is idempotent re-derivation, not re-application;
  concurrent writers serialized by CAS; recon as the backstop that
  force-converges anything stranded. Frame each piece as the replaced
  engine feature: undo/atomicity → markers + re-derivation; isolation →
  CAS (first-committer-wins); durability → WAL per write (HBase gives
  this); the "transaction manager" → recon. Then the honest cost: this is
  bespoke engineering per invariant — the engine amortizes it for
  everyone, which is exactly what you're paying for when you choose
  relational.
- *Trap:* claiming HBase's row atomicity makes it "basically
  transactional" — the interviewer will immediately construct a
  cross-row crash; lead with the machinery instead.

---

## Self-test

1. Define each ACID letter precisely, and say which one is mostly the
   application's job and which one is "abortability."
2. Tell each anomaly as a one-line story: dirty read, non-repeatable
   read, phantom, lost update, write skew.
3. Reproduce the level table: what RC, RR/SI, and Serializable each
   forbid, and SI's signature hole.
4. MySQL vs Postgres: default levels, and what "repeatable read" means
   differently in each.
5. MVCC: the core mechanism, where InnoDB and Postgres keep old
   versions, and the long-transaction failure mode of each.
6. Why does `UPDATE ... SET bal = bal - 30 WHERE bal >= 30` fix the
   lost-update case when a plain transaction doesn't?
7. Write skew's structure in one sentence, plus the fix hierarchy in
   order of preference.
8. What are next-key/gap locks for, and what pathology do they cause?
9. SSI vs 2PL serializable: mechanism and cost profile of each.
10. Map four pieces of your rewards machinery to the engine features
    they replace.
11. Why must every serializable/OCC transaction ship with an idempotent
    retry loop?
12. Your CAS-on-version scheme: which textbook concurrency control is
    it, and what property does it share with Postgres SI?

<details>
<summary><b>Answers</b></summary>

1. Atomicity: all-or-nothing under abort/crash (undo) — "abortability."
   Consistency: invariants preserved across the transaction — mostly the
   application's promise, aided by constraints. Isolation: concurrent
   transactions behave as if (configurably) alone — the dial. Durability:
   committed survives crashes (WAL/fsync/replication).
2. Dirty read: I read data from a transaction that later aborted. Non-
   repeatable: same row, two reads in my txn, different values. Phantom:
   same predicate, second read finds new rows. Lost update: two
   read-modify-writes; the later write silently erases the earlier. Write
   skew: we each read the shared state, decided, and wrote different
   rows — individually fine, jointly invariant-breaking.
3. RC: no dirty reads/writes (per-statement committed snapshot); allows
   non-repeatable, phantoms, lost updates, skew. RR/SI: whole-transaction
   snapshot — no non-repeatable reads (InnoDB adds next-key locks against
   phantoms for locking reads; Postgres-SI prevents lost updates via
   first-committer-wins); allows write skew — the signature hole.
   Serializable: equivalent to a serial order — everything forbidden, paid
   in locks or aborts.
4. Postgres defaults RC; MySQL/InnoDB defaults RR. Postgres RR = true
   snapshot isolation (first-committer-wins on write conflicts). InnoDB
   RR = MVCC snapshot for plain reads + next-key locking for locking
   reads — plain-read lost updates are NOT prevented (need FOR UPDATE),
   and phantom protection applies to locking reads.
5. Writers create versions; readers see the newest version visible to
   their snapshot — no read locks. InnoDB: old versions reconstructed
   from undo logs (purged past the oldest snapshot; long txns balloon
   history-list). Postgres: dead tuples in the heap (vacuum reclaims;
   long txns cause bloat/vacuum starvation).
6. The read-decide-write race disappears because the read and the
   condition evaluate atomically inside the row's write latch — the
   engine serializes the conditional writes on the row; a plain
   transaction still performs a stale read then an unconditional write
   (RC and MySQL-RR plain reads don't lock), so both can base writes on
   the same v100.
7. Read an overlapping predicate → decide → write rows the other's
   validation never sees. Fixes: (1) materialize the invariant into a
   row all deciders must write (skew → visible conflict); (2) FOR UPDATE
   the decision's witness rows; (3) SERIALIZABLE/SSI; (4) declarative
   constraints where expressible.
8. They lock the gaps between index entries so no phantom row can be
   inserted into a range a transaction has locked — InnoDB-RR's phantom
   defense for locking reads. Pathology: concurrent inserts near the
   same key range deadlock on each other's gap locks — the classic
   InnoDB insert-deadlock, requiring retry logic.
9. 2PL: locks acquired during execution, all held to commit —
   serializable by construction; cost: blocked concurrency on hot data,
   deadlock detection/aborts. SSI: run optimistically on snapshots,
   track rw-antidependencies, abort a transaction when a dangerous cycle
   pattern appears; cost: abort/retry rates rising with contention and
   txn length (~10–30% overhead typical, read-heavy friendly).
10. Markers + idempotent re-derivation ← atomicity/undo (all-or-nothing
    across tables). CAS-on-version ← isolation's lost-update prevention
    (first-committer-wins). Deliberate write ordering ← crash-consistent
    commit ordering. Recon force-convergence ← the transaction
    manager/recovery process.
11. Both abort as a *normal* outcome (deadlock victims, SSI dangerous
    patterns, CAS conflicts) — the retry re-executes the transaction, and
    any side effects or partially observed states must collapse
    harmlessly; a non-idempotent retry turns the engine's correctness
    mechanism into a duplication engine.
12. Optimistic concurrency control with first-committer-wins validation
    on a per-row version. Shared property with Postgres SI: conflicts
    are detected at write/commit time and the loser retries from fresh
    state — readers never block, lost updates are impossible.

</details>
