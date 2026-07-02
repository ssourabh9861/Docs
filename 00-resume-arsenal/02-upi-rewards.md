# UPI Rewards — Resume Arsenal

Resume section under attack:

> **UPI Rewards — Earn/Burn & Real-Time Aggregation**
> - Optimized the rewards home-screen read path with a checkpoint-based pre-computed aggregation, converting O(all-rows) on-read scans into O(rows-since-checkpoint) incremental updates and cutting read latency from [X] ms to [X] ms at [X] QPS.
> - Engineered idempotent reward processing under at-least-once delivery using a per-row aggregation marker, preventing double-counting across two independent async event channels (offers and gamification).
> - Applied CAS-based optimistic concurrency control on a version column to serialize concurrent per-user reward updates without distributed locks, preserving correctness while sustaining throughput under contention.
> - Architected a pluggable earn/burn system (strategy + factory) supporting multiple reward sources and multi-gateway cashback disbursement across two payout rails, enabling new channels to be added with no changes to the core flow.

This is your **strongest technical-depth surface**: it touches storage engines,
delivery semantics, concurrency control, and design patterns in one story. It is also
where an interviewer can most easily expose fake depth, because every mechanism here
has a well-known "wrong easy answer". Learn the wrong answers too.

---

## 0. Primer — concepts you must explain from zero

- **The product:** users earn cashback (real money to their bank) and Supercoins
  (loyalty points) for UPI activity, from two independent upstream systems — an
  Offers engine and a Gamification/Challenges engine. The UPI home screen shows a
  lifetime-earnings summary. "Burn" is spending Supercoins via a partner platform.
- **HBase data model in one paragraph:** HBase is a sorted key-value store. Rows are
  ordered byte-wise by row key; a "table" is billions of rows split into contiguous
  key ranges (regions) spread over servers. Reads by exact key are fast point-gets;
  a **scan** reads a contiguous key range in order. There are no secondary indexes
  and no joins — *your row-key design is your only index*. Your reward rows are keyed
  `accountId:...` so all of one user's rewards are contiguous → a per-user scan is a
  short range scan, not a table scan.
- **At-least-once delivery:** the messaging system (Pulsar, "Varadhi" internally)
  guarantees every event is delivered *at least* once — meaning retries can deliver
  the same event 2, 3, N times (consumer crashed after processing but before ack;
  redelivery on nack; timeout redelivery). Any handler that isn't **idempotent**
  (same input applied N times = applied once) will corrupt data. This is the single
  most important sentence in this file.
- **CAS (compare-and-swap):** an atomic conditional write — "set X to new-value only
  if X currently equals expected-value". In HBase: `checkAndPut` (atomic within a
  row). Using a version counter: read row (version=7) → compute new state → write
  with condition version==7, new version=8. If another writer got there first
  (version is now 8), your write fails and you retry from a fresh read. This is
  **optimistic concurrency control**: no locks held; conflicts detected at write time.
- **Checkpoint:** a saved marker meaning "everything up to here is already folded
  into the running total", so recomputation only covers what came after the marker.

---

## Bullet 1 — Checkpoint-based pre-computed aggregation

### The problem, honestly stated

The home screen needs lifetime totals per user (per reward type × source). Naive
option A: on every screen load, scan all the user's reward rows and sum. Cost grows
with user lifetime (a heavy UPI user accumulates thousands of rows), and the home
screen is one of the hottest read paths — you'd be doing an O(user's-entire-history)
range scan at [X] QPS. Naive option B: keep a running counter, increment on each
event. Fast reads — but **increments are not idempotent**, and delivery is
at-least-once, so option B silently over-counts money. (This is why "just use a
counter" is the trap; see attack A2.)

### The design (what you actually built)

Two tables per user: the raw reward rows (`rewards`, one row per reward, keyed
`accountId:<source-specific suffix with timestamp>`) and a pre-computed summary
(`aggregated_rewards`, one row per user, holding a breakup map: rewardType ×
disbursementMode → {totalAmount, txnCount, **scanCheckpoint**}).

On each reward event (consumed from Pulsar):
1. Persist the raw reward row (idempotent: source-specific natural key — see Bullet 2).
2. Update the aggregate **incrementally**: fold the new reward into the total.
3. The **checkpoint** per bucket records the row key up to which the total is
   authoritative. Because row keys embed timestamps, "rows since checkpoint" is a
   contiguous, short range scan. The checkpoint only *rotates forward* when it's
   older than a configurable window (~10 days), at which point a bounded scan from
   old checkpoint → new checkpoint re-derives the delta from raw rows.
4. Recovery/initialization: if the aggregate row is missing (new user, or corruption),
   fall back to a full scan of raw rows to rebuild — the raw table is the source of
   truth, the aggregate is a **derived view**, rebuildable at any time.

The read path is now a single point-get of the aggregate row: O(1) instead of
O(history). **Fill the real numbers: before [X] ms → after [X] ms at [X] QPS —
these placeholders gut the bullet.**

### Why the checkpoint exists at all (the subtle part — this is the L5 marker)

If you can increment the total on every event, why keep a checkpoint? Because
increments are only safe when you're *certain* the event is new (fresh, never folded
in). Under retries, late events, and partial failures, certainty degrades. The
checkpoint gives you a **repair primitive**: any time there's doubt (retry with
`is_aggregated=false`, event older than checkpoint, initialization), you don't trust
the running total blindly — you re-derive the ambiguous span **from the raw rows by
scanning**, which is idempotent by construction (a scan of ground truth gives the
same answer no matter how many times you run it). The design's five documented cases
are all combinations of {event before/after checkpoint} × {fresh vs retry}:
increments for the fast certain path, scans for every uncertain path. One sentence
for interviews: *"increment when certain, re-scan ground truth when uncertain, and
the checkpoint bounds how much ground truth 'uncertain' ever has to touch."*

### 30–60 s spoken answer

> "The rewards home screen needed lifetime totals on one of our hottest read paths.
> Scanning a user's full reward history per view was O(their lifetime) at [X] QPS,
> and the tempting fix — a running counter — is wrong under at-least-once delivery,
> because increments aren't idempotent and you can't un-count a redelivered event.
> So I kept raw reward rows as ground truth and maintained a derived aggregate row
> per user with a per-bucket checkpoint: the row key up to which the total is
> authoritative. Fresh events fold in incrementally; any uncertain case — retries,
> events landing behind the checkpoint, recovery — re-derives the ambiguous span by
> scanning raw rows, which is idempotent by construction, and the checkpoint bounds
> that scan to days, not lifetime. Reads became a single point-get, [X] ms → [X] ms,
> and the aggregate is rebuildable from ground truth at any time."

### Attack tree

**A1. "Why not compute on read and cache it?"**
- *Model answer:* a cache converts the cost problem into an invalidation problem:
  every reward event must invalidate or update the cache, and a miss storm (cold
  cache, mass eviction) puts the full O(history) scan back on the hot path exactly
  when traffic is highest. Write-time aggregation moves the work to the low-QPS side
  (reward events per user ≪ home-screen views per user), makes read cost flat and
  predictable, and — unlike a cache — the aggregate is durable and versioned, so it
  participates in the idempotency/CAS story. When on-read + cache *is* right: read
  patterns too diverse to precompute, or write rate ≥ read rate.
- *Trap answer:* "caching is basically the same thing." Materialized view ≠ cache:
  one is updated transactionally-ish with writes and rebuildable from source; the
  other is best-effort with staleness and stampede pathologies.

**A2. "Why not just HBase's atomic Increment? It's built for counters."** ← the
signature trap of this whole story
- *Model answer:* `Increment` is atomic but **not idempotent** — atomicity protects
  against concurrent writers, idempotency protects against the *same* write applied
  twice. Under at-least-once delivery the failure mode is a consumer that crashed
  after incrementing but before acking: redelivery re-increments and the user's
  lifetime cashback is silently wrong — with money, that's an incident, not a bug.
  You can't dedupe an increment after the fact because it carries no identity. The
  CAS-on-version + marker design makes each event's contribution identifiable and
  each apply conditional, so replays are no-ops.
- *Trap answer:* "Increment is atomic so it's safe." Confusing atomic with
  idempotent under redelivery fails you instantly with anyone who has run
  event-driven money systems.

**A3. "Your checkpoint rotates by scanning 'rows since checkpoint' while new rewards
keep arriving. Does the scan race with concurrent writes?"**
- *Model answer:* the scan runs up to a *fixed target key* (the new checkpoint
  boundary, timestamp-derived), not "to the end", so rows landing beyond the target
  aren't the scan's problem — they fold in via the normal incremental path. Rows
  landing *inside* the scanned range concurrently are handled by the write-side
  protocol: the whole read-compute-write cycle commits via CAS on the aggregate's
  version, so if anything else touched the aggregate meanwhile, the CAS fails and
  the operation retries from fresh state. The invariant is "aggregate row transitions
  are serialized by CAS", not "the world stands still during scans".
- *Trap answer:* "HBase scans are consistent snapshots so it's fine." An HBase scan
  over a range is not a point-in-time snapshot of the table as it advances; leaning
  on that is factually shaky and misses that CAS is what actually closes the race.

**A4. "10-day checkpoint window — why 10? What's the trade-off curve?"**
- *Model answer:* the window trades **scan length on uncertain paths** (longer window
  = more rows to re-derive on retry/repair) against **checkpoint-rotation write cost**
  (shorter window = more frequent rotations, each a scan + fatter write). Sizing
  input: rewards-per-user-per-day distribution — 10 days ≈ tens of rows for a heavy
  user **[VERIFY with your real distribution]**, keeping repair scans in the
  single-digit-ms range while rotating rarely. Mark it config-driven (it is), so the
  knob is tunable without deploys — say that; ops-awareness is L5 signal.
- *Trap answer:* "10 seemed safe." Numbers exist on a trade-off curve; know the axes
  even if the point was judgment.

---

## Bullet 2 — Idempotency under at-least-once, across two channels

### The design

Two upstream channels with different schemas and different natural keys:
- **Offers:** reward row keyed `accountId:E:<rewardType>:<txnId>:<offerId>` — the
  natural idempotency key is (txnId, offerId): the same offer on the same transaction
  is the same reward, no matter how many times the event arrives.
- **Gamification:** keyed `accountId:TX<timestamp>` with per-row matching on `taskId`
  — same idea, different identity.

Plus the **`is_aggregated` per-row marker**, which is the cross-table idempotency
device. The event processing is a two-phase write with no transaction spanning the
two tables (HBase has no cross-row/cross-table transactions):

1. Write raw reward row (`is_aggregated=false`) — idempotent via natural key.
2. Fold into aggregate row (CAS-protected).
3. Flip `is_aggregated=true` on the raw row.

Crash matrix — this is what the marker buys:
| Crash point | State on redelivery | Recovery action |
|---|---|---|
| After 1 | row exists, marker false | re-run aggregation **by re-derivation (scan), not blind increment** — the original attempt may or may not have partially landed; scanning ground truth is safe either way |
| After 2 | row exists, marker false, aggregate updated | same re-derivation path — recomputes the correct value; no double-count because derivation reads rows, not "adds again" |
| After 3 | marker true | skip entirely — no-op |

The marker converts "did my previous attempt finish?" from unknowable to a single
column read. It is a **saga-style completion flag / poor-man's outbox** for a store
without multi-row transactions — say that phrase; it connects your work to the
pattern vocabulary interviewers expect (full treatment in `14-distributed-transactions/`).

### 30–45 s spoken answer

> "Reward events arrived at-least-once from two independent channels with different
> schemas, and the processing wrote two tables — the raw reward row and the derived
> aggregate — with no cross-table transaction available in HBase. I made each write
> independently idempotent: raw rows use natural keys — transaction-plus-offer for
> offers, task ID for gamification — so replays collide onto the same row; and an
> `is_aggregated` marker on the row records whether phase two completed. On
> redelivery: marker true → no-op; marker false → we don't blindly re-apply, we
> re-derive the affected span from raw rows, because a scan of ground truth is
> idempotent even when we can't know how far the crashed attempt got. Double-counting
> across both channels went to zero by construction."

### Attack tree

**B1. "Two channels could emit rewards for the same underlying transaction. Does
your idempotency catch cross-channel duplicates?"**
- *Model honest answer:* no — and by design. The keys are per-channel because an
  offers reward and a gamification reward for the same txn are *different business
  rewards* (user legitimately earns both). Idempotency de-duplicates *deliveries of
  the same event*, not *distinct events about the same transaction* — that
  distinction is business-rule territory (the upstream engines own "can these
  stack"). Drawing that line crisply is the L5 answer.
- *Trap answer:* claiming your marker catches cross-channel dups (it doesn't, and
  the follow-up will corner you), or admitting the gap as if it were a bug.

**B2. "Why a marker column instead of processing each user's events on a single
consumer/partition so there are no races or replays to worry about?"**
- *Model answer:* key-partitioned single-writer serializes *concurrency* but does
  nothing about *redelivery* — the same consumer can still receive the same event
  twice after a crash-before-ack, so idempotency is required regardless. Also
  key-ordered exclusive consumption constrains scaling (hot users pin to one
  consumer) and Varadhi's shared-subscription semantics didn't guarantee it.
  Idempotent handlers + CAS give correctness under ANY delivery topology — that's a
  strictly stronger property than "correct if the infra keeps its ordering promise".
- *Trap answer:* "partitioning would have made it exactly-once." Partitioning never
  produces exactly-once processing; saying so reveals delivery-semantics confusion
  (see `04-messaging-streaming/04-delivery-semantics.md`).

**B3. "Phase 2 succeeded, phase 3 (marker flip) failed, and the redelivery re-derives.
Prove re-derivation can't double-count."**
- *Model answer:* re-derivation *reads* the raw rows in the ambiguous span and
  *replaces* the aggregate's value for that span (write-with-CAS), rather than adding
  a delta on top. Replacement from ground truth is idempotent: f(rows) is a pure
  function; running it twice writes the same value twice. Double-counting only exists
  in delta-application designs.
- *Trap answer:* mumbling "we re-add it but check first". If your recovery is
  re-*addition*, the interviewer constructs the double-count in ten seconds.

---

## Bullet 3 — CAS-based optimistic concurrency control

### The design and the honest "why"

Multiple Pulsar consumer instances can process different reward events *for the same
user* concurrently → both read aggregate (version 7) → both compute → both write.
Without control, last-writer-wins destroys the first event's contribution (lost
update). Options:

- **Pessimistic lock (row lock / external lock service):** hold a lock across
  read-compute-write. Costs: lock-service dependency (or HBase row locks held across
  RPCs — not how HBase wants to be used), lock-holder crash = stuck lock until
  timeout, head-of-line blocking, and worst-case throughput set by lock hold time.
- **Distributed lock (ZK/Redis):** all of the above plus a new infra dependency and
  fencing-token complexity to be actually correct. Overkill for single-row conflicts.
- **CAS / OCC (chosen):** write `checkAndPut(row, version==7, newState, version=8)`.
  Conflict → write fails → nack → redelivery re-reads fresh state and recomputes.
  No locks held, no new infra, crash-safe by default (nothing to leak). Cost: wasted
  work under contention — at conflict rate p, expected attempts ≈ 1/(1−p).

Why contention is low here (say this — it's the justification): conflicts require
two *simultaneous* events for the *same user*, and per-user reward event rate is
tiny (a handful/day). p is near zero; OCC's optimism is factually justified. If p
were high (hot single row, e.g., a global counter), OCC livelocks and you'd shard
the row or serialize by key instead — knowing when your own choice inverts is the
depth signal.

Retry loop hygiene (be ready): retries ride Pulsar redelivery with backoff rather
than a tight in-process spin, so conflict storms degrade gracefully instead of
CPU-burning; and every retry re-reads state, so progress is guaranteed as long as
*someone* wins each round (lock-freedom-style argument).

### 30–45 s spoken answer

> "Concurrent consumers could process two rewards for the same user at once — classic
> read-modify-write lost-update risk on the aggregate row. I used optimistic
> concurrency: a version column, and every write is an HBase checkAndPut conditional
> on the version read. Conflict → the write fails, the event is redelivered with
> backoff, and the handler recomputes from fresh state. I chose OCC over locks
> because contention is structurally near zero — a conflict needs two simultaneous
> events for the same user — so the optimistic path almost always wins in one
> attempt, with no lock service, no stuck-lock failure mode, nothing to leak on
> crash. And I'd flip this decision if the row were hot: at high conflict rates OCC
> livelocks and per-key serialization wins."

### Attack tree

**C1. "checkAndPut is atomic within a row. Your read was a separate RPC. Walk me
through why read-then-checkAndPut is still correct."**
- *Model answer:* correctness doesn't need the read and write to be atomic together —
  it needs *stale computations to never commit*. The version condition does exactly
  that: if anyone wrote between my read and my write, my expected version is stale
  and the CAS fails. The read is just an optimistic guess; the write is the
  linearization point. (This is the textbook OCC validation argument — being able to
  say "the write is the linearization point" is worth a lot.)
- *Trap answer:* "HBase locks the row for us." checkAndPut's row-level atomicity is
  the *primitive*; the protocol correctness comes from the version discipline, and
  interviewers probe whether you know which layer provides what.

**C2. "ABA problem — version says 7, but the row changed and changed back. Does your
scheme care?"**
- *Model answer:* a monotonically increasing version counter is immune to ABA by
  construction — versions never repeat, so "changed and changed back" still means
  version advanced (7→8→9), and my CAS on 7 fails. ABA bites CAS-on-*value* schemes
  (compare the balance itself), which is exactly why we CAS a dedicated version, not
  the data.
- *Trap answer:* not knowing ABA. It's a standard concurrency probe; one crisp
  paragraph and you bank the point.

**C3. "Under a backfill (your SFTP reconciliation) you replay thousands of events for
the same users. Now contention ISN'T rare. What happens?"**
- *Model answer:* conflict rate spikes → CAS failures → redeliveries with backoff;
  throughput degrades but correctness holds (each round has a winner; progress
  guaranteed). If backfill throughput mattered, the right move is to make the
  backfill single-threaded *per user* (sort/partition the replay by accountId) so
  contention returns to ~0 by construction — cheaper than changing the concurrency
  scheme for a one-off. Bonus: mention you throttle backfills to protect the live
  path's SLO.
- *Trap answer:* "backoff solves it." Backoff caps the damage; partition-by-user
  removes the cause. Name both.

---

## Bullet 4 — Pluggable earn/burn (strategy + factory), two payout rails

### The design, framed at L5 (patterns alone are an L3 answer)

Two axes of variation, each behind an interface:
- **Reward sources** (earn): `IRewardsManager` implementations per channel
  (offers vs gamification), selected by a factory on event mode. Each manager owns
  its channel's schema parsing, row-key/identity scheme, and idempotency matching.
- **Payout rails** (cashback disbursement): `ICreditHandler` implementations —
  direct bank credit vs PSP payouts — behind a `PGFactory`, so the disbursement
  processor is rail-agnostic.

The L5 framing is not "I used Strategy and Factory" (any L3 can say that). It is:
**the interfaces pin the invariants while the variants absorb the churn.** The core
flow (persist → aggregate → mark) and its correctness properties (idempotency, CAS)
are written once and cannot be broken by adding a channel; a new channel implements
identity + parsing and inherits correctness. Same for rails: routing, retry, and
status-callback handling stay fixed; a rail supplies only its API adapter. Evidence
it worked: the second rail (and later the SFTP backfill "channel") landed with zero
changes to the core flow **[verify the zero]**.

### 30–45 s spoken answer

> "Earn had two upstream channels with different schemas and identity rules, and
> cashback disbursed over two rails — direct bank credit and PSP payouts — with more
> of both expected. I isolated each axis behind an interface: reward managers own a
> channel's parsing and idempotency identity; credit handlers own a rail's API. The
> point wasn't the pattern names — it's that the core flow, where all the correctness
> lives — idempotent persist, CAS-protected aggregation, completion markers — is
> written once and closed to modification. Adding a channel or rail means
> implementing an adapter, not touching invariants. When we later onboarded [the
> second rail / SFTP backfill], the core flow changed by zero lines."

### Attack tree

**D1. "Two rails for cashback — how do you pick per payout, and what happens when a
payout fails on one rail? Do you fail over to the other?"**
- *Model answer you must verify against reality:* routing is config/business-rule
  driven (rail per program/amount/bank support). Failover between rails is NOT
  automatic-by-default for money: the two rails have different settlement identities,
  and "retry on the other rail" risks double-crediting unless the first attempt is
  provably terminal-failed — so failure handling is status-callback-driven state
  machine + retry on the SAME rail + manual/recon-gated rail switch. If you don't
  know your real behavior, find out before the interview; "I'd need to check" on
  your own money flow is a bad look.
- *Trap answer:* "we just failover" — instant double-payment follow-up.

**D2. "Strategy + factory is bread-and-butter. What's actually hard here?"**
- *Model answer:* the hard part is that the pluggable pieces carry *correctness
  obligations*, not just behavior: every channel manager must define a stable
  idempotency identity (what makes two deliveries "the same reward") and every rail
  handler must map partner status models onto our payout state machine without
  inventing terminal states. The interface is easy; specifying the contract each
  implementation must uphold — and testing new plugins against it — is the
  engineering. (If you wrote contract tests, say so; if not, don't claim it.)
- *Trap answer:* re-describing the pattern louder.

**D3. "Burn goes through a mandate on a partner platform. What's consistency between
Supercoin balance shown and balance at burn time?"**
- *Model answer:* balance is checked synchronously at eligibility, but the deduction
  executes later via mandate — so there's a window where balance changed; the
  partner (balance owner) enforces at execution, and our flow handles the
  insufficient-balance failure as a normal payment failure. Read-time check is UX;
  execution-time check is authority. Same "source of truth + direction of error"
  analysis as everywhere else in payments.

---

## Self-test (answers hidden below)

1. Why is an atomic counter increment the wrong primitive under at-least-once
   delivery? Name the exact failure sequence.
2. What is the checkpoint bounding, precisely? What gets slower as the window grows?
3. State the "increment when certain, scan when uncertain" rule and list the three
   uncertain paths in this system.
4. Give the crash matrix of the two-phase write (row → aggregate → marker): three
   crash points, resulting state, recovery action.
5. Why must recovery *re-derive/replace* rather than re-apply a delta?
6. What duplicates does the per-row marker NOT catch, and why is that correct?
7. Write out the OCC protocol on the version column, and name the linearization point.
8. Why is this system a good fit for OCC? Give the workload property and the
   condition under which you'd switch to per-key serialization.
9. Is CAS-on-version vulnerable to ABA? Why not?
10. During a mass backfill, contention spikes. Give the two-part mitigation.
11. Materialized view vs cache: three differences that matter here.
12. What contract must a new reward-channel plugin uphold beyond "parse the event"?
13. Why is automatic cross-rail failover dangerous for cashback payouts?

<details>
<summary><b>Answers</b></summary>

1. Consumer increments the counter, crashes before acking the message; broker
   redelivers; consumer increments again. The counter is now wrong forever — an
   increment carries no identity, so the duplicate cannot be detected or repaired
   after the fact. Atomicity (no torn/concurrent-lost update) was never the issue;
   idempotency (same event applied once) is.
2. It bounds the length of the raw-row range that must be re-scanned on any
   uncertain path (retry, repair, rotation). Growing the window makes those repair
   scans longer/slower; shrinking it makes rotations (scan + write) more frequent.
3. Uncertain paths: (a) redelivery with `is_aggregated=false` (crashed attempt of
   unknown progress), (b) event landing at/behind the checkpoint (late/replayed
   data), (c) missing aggregate row (initialization/corruption → full rebuild).
4. Crash after row-write: row exists, marker false → re-derive span, then mark.
   Crash after aggregate-update: same observable state (marker false) → same
   re-derivation, safe because it replaces from ground truth. Crash after marker:
   marker true → no-op skip.
5. A delta re-applied on top of an aggregate that may already contain it
   double-counts. Re-derivation computes f(raw rows) — a pure function of ground
   truth — and *replaces* the span's contribution; running it N times writes the
   same value N times.
6. Distinct business events about the same transaction from different channels
   (offer reward + gamification reward for one txn). Correct because those are
   genuinely different rewards; stacking rules are the upstream engines' business
   logic, not delivery dedup.
7. Read aggregate row incl. version v → compute new state → `checkAndPut` guarded
   on version==v writing state+version v+1 → on failure, nack for redelivery,
   re-read, recompute. The linearization point is the successful checkAndPut —
   stale computations can never commit because their guard fails.
8. Conflicts require two concurrent events for the *same user*, and per-user event
   rate is a few per day → conflict probability ~0, so expected attempts ≈ 1.
   Switch to per-key serialization (or row sharding) when conflict rate p is high
   enough that 1/(1−p) retries burn meaningful throughput — hot-row workloads.
9. No: the version is monotonically increasing and never reused, so "changed and
   changed back" still advances the version and the CAS fails. ABA afflicts
   compare-on-*value* schemes; that's precisely why a dedicated version column
   exists.
10. Backoff on redelivery caps the damage (no tight retry spin); partitioning the
    backfill by accountId (single-threaded per user) removes the contention cause.
    Plus throttle the backfill to protect live-path SLOs.
11. (a) Updated on the write path with the source (bounded staleness) vs
    invalidation-driven best effort; (b) durable and rebuildable from ground truth
    vs evictable; (c) participates in the correctness protocol (versioned, CAS'd)
    vs bypasses it. Also no cold-start stampede.
12. A stable idempotency identity (what makes two deliveries the same reward), a
    row-key scheme compatible with per-user contiguity and checkpoint scanning, and
    status semantics mapped to the flow's expectations (e.g., only SUCCESS
    disburses) — i.e., the correctness contract, ideally enforced by contract tests.
13. The first attempt may have succeeded despite looking failed (timeout ≠ failure);
    a second rail attempt then pays twice, and the two rails' settlement identities
    make cross-rail dedup hard. Failover must be gated on provable terminal failure
    of attempt one — usually via status callback or recon, not automatically.

</details>
