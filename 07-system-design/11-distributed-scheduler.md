# Worked Design 11: Distributed Scheduler

"Design distributed cron": fire jobs at times (one-offs and recurring),
at scale, across failures — a deceptively small prompt that is secretly a
tour of ownership, leases, fencing, and effectively-once firing. For you
it's friendly territory: the firing problem is the delivery-semantics
problem, the due-time index is a row-key design, and Pulsar's
`deliverAfter` is the buy-option you already operate.

**Prompt:** "Design a scheduler service: teams register jobs (run-at-T,
or cron expressions); you fire them reliably."

---

## 1. Requirements & scope (0–5)

Functional: schedule one-off (`run_at`) and recurring (cron) jobs;
fire = deliver a trigger (publish an event / call a webhook — the
scheduler *triggers*, workers *execute*: say this split immediately, it
halves the problem); cancel/update; visibility (next-run, history).
Out of scope: the execution fleet itself, DAG/workflow dependencies
(that's Airflow/Temporal territory — one sentence, park it).

Non-functional — the contract questions that shape everything:
- **Firing precision:** seconds-class (assume ±5–30 s), not
  milliseconds — say it and save yourself real-time-systems pain.
- **Delivery semantics:** *at-least-once firing + idempotent handlers*
  (the standing equation — a missed fire is worse than a duplicate
  fire for almost all jobs; the rare exactly-once-critical job carries
  an idempotency key anyway).
- **Misfire policy per job** (scheduler down at T): fire-immediately-
  on-recovery vs skip vs fire-all-missed — a per-job *business*
  declaration, not a global engineering choice (the aging-rules
  instinct).
- Scale: 100 M scheduled jobs, 10 k fires/s peak.

## 2. Estimation (5–9)

10 k fires/s sustained — bus-trivial; storage 100 M jobs × ~1 KB =
100 GB — small; **which means** (the calibration point): this is a
*correctness* problem, not a throughput problem — the design effort
goes to ownership and firing semantics, not sharding heroics. One
number that DOES bite: cron synchronization — human schedules cluster
at :00 (`0 * * * *` is everyone's favorite) ⇒ top-of-hour fire spikes
of 10–100× baseline. **Which means:** the fire pipeline is sized for
the :00 spike, and jitter is offered (see §4.3).

## 3. Architecture (9–24)

```
API (register/cancel; validates cron; computes next_fire_time)
  → JOBS store: job_id → {schedule, payload/target, policy, state}
  → DUE INDEX: key (shard, next_fire_bucket, job_id) — time-bucketed,
    range-scannable (the row-key discipline: time last within a
    sharded prefix — never global-time-first, or the index is one
    hot region; 01-distributed-systems/04 P1 verbatim)
  → SCHEDULER WORKERS: each OWNS a set of shards (lease-based);
    polls its shards' due buckets (every ~1 s): claim due jobs →
    publish trigger to BUS (outbox-shaped) → compute + write next
    fire (for cron) → mark fired
  → BUS → subscriber teams' workers execute (their idempotency,
    their retries, their DLQ — the split pays here).
```

**The core mechanism — ownership + lease + fencing (the deep-dive
magnet):** shards assigned to scheduler workers via leases
(ZK/etcd-style or a lease table with fencing tokens —
`01-distributed-systems/05` P3, `07` §2.4). A worker fires only while
holding a valid lease; every fire it emits carries the lease
epoch/token. GC-paused zombie worker wakes and fires stale triggers →
downstream/bus-side epoch check rejects them — **fencing is what makes
"exactly one scheduler owns this shard" survivable when it's briefly
false.** Without it, the design double-fires under precisely the
failures that motivated distribution.

**Firing = the dual-write again:** "publish trigger + update
next_fire/mark-fired" must not split. Outbox shape: write the fire
record + state update in one transaction, publish from the
record/CDC tail (`14-.../04`); crash between = unpublished fire record
retried by the sweeper — at-least-once, never lost, never
half-recorded.

## 4. Deep dives (24–39)

### 4.1 Effectively-once firing (walk the failure cases)

Worker crashes after claiming, before publishing → lease expires → new
owner rescans the bucket, finds due-unfired → fires (late by lease TTL —
inside the precision contract). Crashes after publish, before
mark-fired → re-fire on rescan → duplicate → downstream idempotency
(trigger carries (job_id, scheduled_fire_time) as its natural
idempotency key — one fire per logical tick, dedupe-able forever).
The full grid — every crash point lands on "late" or "duplicate,"
never "lost" or "corrupt" — is the answer's skeleton
(the crash-matrix habit from outbox/idempotency docs).

### 4.2 Cron semantics

next_fire computed *at fire time* for the *next* tick (not
materialized years ahead — schedules change); DST/timezone handled by
computing in the job's declared zone (the classic 2:30-AM-doesn't-
exist question: define policy — skip or shift, per cron standard);
**misfire policy** applied on recovery: catch-up storms bounded by
policy (a job with fire-all-missed and 3 h of downtime = 180 fires —
which is why skip/fire-once is the default and fire-all is opt-in
with rate caps).

### 4.3 The :00 thundering herd

Offer/default schedule jitter (`0 * * * *` → per-job stable hash
offset ±few min where the owner permits); internally: the due index
absorbs (buckets are just fuller), the bus absorbs (backlog age —
your absorption pattern), and the fire pipeline rate-limits per
downstream target (a scheduler that fires 50 k webhooks at :00 into
one team's service is a DDoS with a calendar — per-target pacing is
the neighborly requirement, `05-resilience/05` client-side limiting).

### 4.4 Build vs buy (the honest fork)

Delayed one-offs at modest scale: **Pulsar `deliverAfter` /
delayed-delivery IS a scheduler** for the fire-and-forget class — you
operate this today; say it, and note its limits (no cron, no
visibility/cancel-by-query at scale, retention-bounded horizons) —
which is exactly what the jobs-store + due-index adds. Workflow
engines (Temporal) when jobs become DAGs with state. The fork shows
judgment: the design above is for when scheduling is the *product*.

## 5. Operations (39–45)

Page on: fire lag (scheduled vs actual — THE SLI, per shard),
due-bucket scan health, lease churn (flapping ownership), unfired-due
age (the sweep's own recon), per-target rejection rates (pacing
working). 10×: shards scale linearly; the :00 spike scales with
tenants — jitter adoption becomes a platform campaign, not a config.

---

## Probes & traps

- **"Two schedulers fire the same job — walk me through how, then
  stop it."** — the GC-pause zombie: lease expires mid-pause, new
  owner fires, zombie wakes and fires stale. Stop: fencing epoch on
  every fire, checked at the bus/downstream (reject stale epochs) +
  idempotency key (job_id, tick) as the belt. Trap: "leases prevent
  it" — leases *bound* it; fencing + idempotency *survive* it
  (the P3 lesson verbatim).
- **"Why poll the due index instead of setting in-memory timers for
  every job?"** — 100 M timers = 100 M points of volatile state
  (crash = silent loss of the schedule's liveness); the durable
  due-index + 1 s polling is a *sweep*, restart-safe by construction,
  and 1 s granularity meets the contract. Timers for the next-few-
  seconds head as an optimization, index as truth. (Durable-intent
  over in-memory-state — your async-payments argument, re-run.)
- **"Job takes longer than its interval (cron every minute, runs
  90 s)."** — overlap policy per job: allow / skip-if-running /
  queue — requires execution-state feedback (or a per-job semantic
  lock the trigger checks); default skip-if-running. The scheduler
  fires ticks; *concurrency* of execution is a declared policy, not
  an accident.
- **"Exactly-once execution — the team insists."** — the standing
  scope answer: exactly-once *firing* is achievable-ish inside the
  scheduler's transactional scope, but execution crosses to their
  workers over a bus — at-least-once + their idempotency (the key is
  free: (job_id, tick)). Offer the honest contract; refuse the
  impossible one (`04-messaging-streaming/04` §3.3).

## Self-test

1. The trigger/execute split and two problems it removes from the
   scheduler.
2. Design the due-index key; why is global-time-first wrong?
3. The lease + fencing mechanism: what leases give, what only
   fencing gives.
4. Why is firing a dual-write, and what's the outbox-shaped fix?
5. Walk the crash grid: claim→publish→mark, all three gaps.
6. The natural idempotency key for a fire, and why it's "free."
7. Misfire policy: the three options and why it's per-job business
   policy.
8. The :00 problem: cause, two absorptions, one prevention, one
   courtesy.
9. Timers vs durable sweep: the argument.
10. When do you NOT build this? Two buy-options and their limits.

<details>
<summary><b>Answers</b></summary>

1. Scheduler emits triggers; owning teams execute. Removes: execution
   resource management (their fleet, their scaling) and execution
   semantics (their retries/timeouts/DLQs) — the scheduler's contract
   shrinks to "at-least-once trigger, on time," which is buildable.
2. (shard_prefix, time_bucket, job_id): sharded prefix spreads load
   across partitions/owners; time-bucketed suffix makes "what's due"
   a short range scan per shard. Global-time-first = all writers and
   all pollers on one hot region (the timestamp-first anti-pattern).
3. Leases: bounded-time exclusive ownership with automatic failover
   (liveness — someone always picks up the shard). Only fencing
   (epoch tokens checked downstream) makes the *violation window*
   safe — the zombie's stale fires are rejected rather than
   double-executed. Leases bound "when"; fencing makes "wrong"
   harmless.
4. Fire = publish trigger AND record fired/next_fire — two systems;
   crash between = duplicate-forever (published, unrecorded) or
   silent-miss (recorded, unpublished... if ordered badly). Fix:
   write fire-record + state in one transaction, publish from the
   record (outbox/CDC tail); sweeper retries unpublished records.
5. Crash after claim, before publish: lease expires → rescan finds
   due-unfired → late fire (bounded by lease TTL). After publish,
   before mark: rescan re-fires → duplicate → downstream dedup by
   (job_id, tick). After mark: clean. Every gap → late or duplicate;
   never lost, never half-recorded.
6. (job_id, scheduled_tick_time): one logical fire per tick per job —
   stable across retries, re-fires, and zombie duplicates; free
   because the scheduler already computes the tick — it just rides
   the trigger payload.
7. Fire-immediately-on-recovery (default for "run soon-ish" jobs);
   skip (idempotent periodic jobs where the next tick supersedes —
   reports, syncs); fire-all-missed (rare: per-tick semantics
   matter — billing cycles; rate-capped). Business policy because
   only the job owner knows whether a missed tick's work is
   superseded, required, or dangerous in bulk.
8. Humans schedule at round times → 10–100× fire spikes at :00.
   Absorb: due-index buckets (fuller, same scan) + bus backlog
   (age-monitored). Prevent: default/offered per-job stable jitter.
   Courtesy: per-downstream-target pacing so the spike doesn't DDoS
   one team's webhook endpoint.
9. In-memory timers are volatile state: crash/restart silently
   drops liveness for every armed timer, and 100 M armed timers is
   its own resource problem. A durable due index + periodic sweep is
   restart-safe by construction (the sweep re-derives dueness from
   truth), meets seconds-class precision, and needs timers only as a
   head-of-queue optimization. Durable intent over process memory —
   the async-payment-path argument.
10. Delayed one-off triggers at modest scale: broker-native delayed
    delivery (Pulsar deliverAfter) — limits: no cron, weak
    visibility/cancellation, retention-bounded delay horizon.
    Stateful workflows/DAGs with retries and human steps:
    Temporal-class engines — limits: operational weight, a
    programming model to adopt. Build only when scheduling itself
    is the product at platform scale.

</details>
