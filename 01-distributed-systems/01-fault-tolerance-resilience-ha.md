# Fault Tolerance vs Resilience vs High Availability

Three terms that get used interchangeably by L4 candidates and precisely by L5
candidates. Interviewers use them as a calibration probe in the first five minutes:
if you blur them, everything you say afterward gets discounted.

---

## 1. Plain definitions (zero prior knowledge)

Start with the causal chain every formal treatment uses:

- A **fault** is a defect or malfunction in a component: a dying disk, a bug, a
  flaky NIC, a misconfigured timeout. Faults are *normal* — at scale, something is
  always faulty.
- An **error** is the incorrect internal state a fault produces: the corrupted
  block, the wrong variable value, the dropped packet.
- A **failure** is when the system stops delivering its promised service to its
  users: the API returns 500s, the payment doesn't complete.

The whole discipline is about breaking the chain: faults will happen; the goal is
that they don't become failures.

- **Fault tolerance** is the property of continuing to operate *correctly* despite
  component faults. Analogy: a plane with four engines that flies fine on three.
  The fault is *masked* — the user never sees it. Mechanism: redundancy plus
  automatic detection and failover/masking.
- **High availability (HA)** is a *measurement*, not a mechanism: the fraction of
  time the system is up and serving, usually expressed in "nines". HA is the
  outcome you buy with fault tolerance (and with fast recovery, and with careful
  change management). A system can be fault-tolerant to disk failures and still
  have poor availability because deploys break it weekly.
- **Resilience** is broader than both: the ability to *absorb, degrade gracefully
  under, and recover from* stress — including stresses that aren't component
  faults at all (traffic spikes, slow dependencies, bad data, operator error).
  Fault tolerance masks; resilience *bends without breaking*. A circuit breaker
  that greys out a BNPL option when a partner slows down is not masking a fault —
  the feature is visibly gone — it is resilience: controlled degradation that
  protects the rest of the system.

One-line separations you can say verbatim:
- *Fault tolerance:* "the user never notices the fault."
- *HA:* "the percentage of time users are served — the scoreboard."
- *Resilience:* "when we can't fully serve, we degrade deliberately and recover
  quickly — including under stresses redundancy can't fix."

---

## 2. How it works in practice

### Availability math (memorize this cold — it's asked directly)

Availability = MTBF / (MTBF + MTTR), where MTBF = mean time between failures,
MTTR = mean time to recovery. Two levers: fail less often, or recover faster.
At scale, **MTTR is usually the cheaper lever** — you cannot stop nodes dying,
but you can cut detection + failover from minutes to seconds.

| Nines | Downtime/year | Downtime/month | What it takes (rule of thumb) |
|---|---|---|---|
| 99% | 3.65 days | 7.3 h | Single node, manual recovery |
| 99.9% | 8.76 h | 43.8 min | Redundancy + on-call + monitoring |
| 99.99% | 52.6 min | 4.4 min | Automated failover; humans too slow |
| 99.999% | 5.26 min | 26 s | Multi-region, no single change hits all; very expensive |

Composition rules (asked constantly in estimation form):
- **Serial** (A depends on B): availability multiplies. Two 99.9% components in
  series ≈ 99.8%. Ten in series ≈ 99.0%. This is why microservice sprawl silently
  destroys availability — every synchronous hop is a serial term.
- **Parallel** (either of two redundant replicas serves): unavailability
  multiplies. Two independent 99% replicas ≈ 1 − (0.01)² = 99.99% — *if failures
  are independent*, which is the assumption interviewers want you to attack (see
  §3).

### Redundancy patterns

- **Active-passive:** one node serves, a standby waits (warm = running with
  replicated state, cold = must boot). Failover = detect + promote + redirect.
  Costs: standby capacity idle; failover is a *transition* with its own failure
  modes (see split-brain below).
- **Active-active:** all nodes serve simultaneously behind load balancing; a
  failure just shrinks capacity. No promotion step, but requires the workload to
  be shareable (stateless, or state replicated/partitioned).
- **N+1 / N+2:** provision N units of needed capacity plus spares — the standard
  way to express redundancy for pools (also for Kubernetes node pools, Storm
  workers, DB replicas).

### Failure modes taxonomy (use these words precisely)

- **Crash-stop:** node halts and never returns. The easy case.
- **Crash-recovery:** node halts and comes back with (some) state — the realistic
  case; requires recovery protocols (WAL replay, rejoin, fencing).
- **Omission:** messages dropped (network loss, full queues).
- **Timing/performance:** node responds, but too slowly — the **gray failure**
  family: limping disks, 99%-packet-loss NICs, GC-thrashing JVMs. Often *worse*
  than crash-stop because detectors don't trip and load balancers keep routing to
  the sick node.
- **Byzantine:** node behaves arbitrarily/maliciously (sends conflicting
  information). Almost never designed-for inside a trusted datacenter (cost:
  3f+1 replicas and heavy protocols); relevant in blockchains and cross-org
  boundaries. Saying "we assume non-Byzantine, crash-recovery" is the correct
  scoping sentence in design interviews.

### What breaking looks like in production

- Fault tolerance failing: failover that doesn't fire (detector too conservative),
  or fires into a **split-brain** — two nodes both believe they're primary and
  both accept writes; symptom: divergent data, duplicate IDs, recon mismatches.
  Pager: replication-lag alarms, dual-primary alerts.
- HA failing: SLO dashboard burning error budget; symptom is usually not "server
  down" but elevated 5xx/latency during *changes* — deploys, config pushes,
  certificate expiry. Industry folklore worth quoting: the majority of large
  outages are triggered by a change, not by hardware **(estimate/folklore — but
  Google's SRE book reports ~70% of outages involve a config or binary change)**.
- Resilience failing: **cascading failure** — a slow dependency causes thread
  exhaustion upstream, which causes timeouts further upstream, which causes
  retries that triple the load (**retry storm**), which pins the system in a
  **metastable state**: even after the trigger heals, the system stays down
  because the retry load alone exceeds capacity. Recovery requires shedding load,
  not just fixing the trigger. If you can narrate this loop unprompted, you sound
  like someone who has been paged.

---

## 3. Senior-level depth (the L4/L5/L6 line)

**L4 answer:** "We add redundancy and failover to get high availability."

**L5 additions — the four things that actually separate the levels:**

1. **Correlated failure destroys redundancy math.** Parallel-composition math
   assumes independence; real replicas share deploy pipelines, config, TLS certs,
   library versions, power, and top-of-rack switches. Two replicas that receive
   the same bad config push are one replica. Design consequence: staggered
   rollouts, canaries, config-as-change-management, AZ/region isolation, and
   *diversity* where it's cheap. When you claim 99.99% via redundancy, an L5
   interviewer will ask "what still takes out both?" — have the list ready
   (deploys, config, certs, shared dependencies, DNS, the load balancer itself).
2. **Blast radius as a design axis.** Beyond "will it fail": "how much fails
   together?" Cell-based architecture, per-tenant pools, bulkheads — the goal is
   that any single fault domain caps the damage at X% of users. Your Hystrix
   pools are miniature blast-radius engineering.
3. **Failover is a mode transition, and mode transitions are where systems die.**
   Untested failover is fiction ("schrödinger's standby"). Split-brain prevention
   needs an arbiter (quorum, fencing tokens, STONITH). L5 sentence: "I trust
   failover in proportion to how often it's exercised — game days or it doesn't
   count."
4. **Degradation is a product decision made in advance.** Resilience means
   someone already decided what to shed first: which features grey out, which
   traffic gets rejected, what "read-only mode" means. If the first time you
   think about degraded mode is during the incident, you don't have one.

**L6 flavor** (know it exists): setting the availability *target* itself from
business math — error budgets, cost-per-nine curves, and deciding some systems
should target *less* availability to move faster. "More nines" is not free and
not always right; each nine roughly multiplies infrastructure and process cost
**(estimate)**.

Precise neighboring-term distinctions interviewers test:
- **Reliability vs availability:** reliability = probability of *correct,
  continuous* operation over an interval (no failure at all); availability =
  fraction of time operational. A system that blips 1 s every minute is 98.3%
  available but terribly *unreliable* for a 10-minute batch job.
- **Fault tolerance vs disaster recovery:** FT handles component faults in-line;
  DR handles losing an entire site — measured by **RTO** (how fast you're back)
  and **RPO** (how much data you may lose). Async cross-DC replication ⇒ nonzero
  RPO. Know yours.
- **Durability vs availability:** durability = data survives (11 nines in S3
  marketing terms); availability = data is *reachable now*. You can be durable
  and unavailable (region down) — and for payments, durability + recoverability
  beats availability when forced to choose.

---

## 4. Resume connection (your systems)

- **Multi-DC (Hyderabad + Chennai), stateless services on Kubernetes:**
  active-active for stateless tiers; your DC-redirect filter at the gateway is
  request routing across sites. Know (verify!) what your cross-DC data story is —
  Aerospike XDR / HBase replication direction — because "what's your RPO if
  Chennai burns down?" is a fair question the moment you mention two DCs.
- **Hystrix bulkheads + grey-out of SuperPay:** textbook *resilience*
  (degradation), not fault tolerance — the feature visibly disappears so the
  platform survives. Use the vocabulary precisely; it's a free depth signal.
- **DLQ + force-query recon:** MTTR engineering for *data* — stuck transactions
  are failures whose recovery you automated. Frame it that way: "we cut MTTR for
  stuck payment states from human-hours to an automated bounded window."
- **Pulsar as buffer:** absorbs traffic/latency stress — resilience against
  overload and partner slowness, orthogonal to node-level fault tolerance.
- **Honest gap to admit if probed:** you did not design the multi-DC replication
  or the failover orchestration (platform teams did). Your fault-tolerance
  ownership is at the service/dependency layer (bulkheads, retries, recon), not
  the site layer.

**30–60 s spoken answer** ("how do you think about availability in your systems?"):

> "I separate the scoreboard from the mechanisms. The scoreboard is availability —
> our payment path is measured in nines and every synchronous hop is a serial
> term, which is exactly why we made execution asynchronous: the user-facing API's
> availability stops multiplying with NPCI's. The mechanisms are layered: fault
> tolerance where we can mask — multi-DC active-active stateless tiers, replicated
> stores; resilience where we can't — bulkheads and circuit breakers so a sick
> partner degrades one feature instead of cascading, with the degraded behavior
> decided in advance, like greying out BNPL on partner timeouts. And because MTTR
> is the cheaper lever than MTBF, we automated recovery for our ugliest failure
> class: transactions stuck non-terminal get force-reconciled against NPCI in a
> bounded window instead of waiting for a human."

---

## 5. What the interviewer will push on

**P1. "Your service is 99.95%. It synchronously calls a dependency that's 99.9%.
What's your availability, and what are your options?"**
- *Model:* serial composition: ≈ 0.9995 × 0.999 ≈ 99.85% — you can never be more
  available than a hard synchronous dependency. Options, in order of strength:
  remove the dependency from the critical path (async, queue, precompute); cache
  its answers (with staleness budget); degrade without it (fallback/default —
  works only if the product tolerates it); or make it redundant (only if truly
  independent). Then the L5 close: "which one is right depends on whether the
  dependency's answer is *required for correctness* or *for enrichment* — a fraud
  check and a recommendation call get different treatments."
- *Trap:* answering "99.9%" (taking the min — wrong math), or jumping to "add a
  cache" without asking what staleness does to correctness.

**P2. "Active-active or active-passive for a payment ledger, and why?"**
- *Model:* for the *ledger writes*, what matters is single-writer semantics per
  account/row — either active-passive (one primary) or active-active with
  partitioned ownership (each partition has one home). True multi-master on the
  same rows invites write conflicts, and conflict resolution on money (LWW!) is
  how you lose writes. So: active-active at the *service* tier, single-writer at
  the *data* tier per partition, synchronous or semi-sync replication to bound
  RPO, and fenced failover. State RPO/RTO as the driving requirements.
- *Trap:* "active-active because more availability." On stateful money paths,
  availability gained through dual-writers is paid back as reconciliation
  incidents.

**P3. "Tell me about a failure mode redundancy makes WORSE."**
- *Model:* several: (1) split-brain — two primaries each accepting writes;
  (2) retry amplification — redundant clients all retrying a struggling backend
  triples load; (3) failover flapping — aggressive detectors bounce leadership,
  each transition dropping requests; (4) cost/complexity — the failover machinery
  itself is code that fails (many outages are caused by the HA system). The
  meta-answer: redundancy adds *coordination*, and coordination is a new fault
  domain.
- *Trap:* blank stare, or "redundancy can't make things worse."

**P4. "What's a gray failure? Give a concrete example and why it's harder than a
crash."**
- *Model:* a component that is unhealthy but not dead — passing health checks
  while failing real work. Example: a node with a degrading disk serving reads at
  100× latency, or a JVM in GC-thrash serving 1 request in 5. Harder because
  detectors are binary and conservative: the node stays in rotation, and with
  N nodes, a single limping node poisons ~1/N of ALL requests (random routing) —
  users see intermittent, unreproducible slowness. Fixes: outlier detection
  (compare replicas against each other, not against a static threshold), load
  balancers that eject slow endpoints, health checks that probe *real work*.
- *Trap:* defining it as "partial outage" without the detection asymmetry — the
  entire point is that your machinery says healthy while users say broken.

---

## Self-test

1. Define fault → error → failure and place "a Storm worker JVM OOMs" in the
   chain from the paying user's perspective.
2. Fault tolerance, HA, resilience: one sentence each, no overlap.
3. Compute: two 99.9% services in series; then two 99% replicas in parallel.
   State the assumption the parallel number hides.
4. Why is MTTR usually the cheaper lever than MTBF? Give one MTTR investment
   from your own systems.
5. Name five things that take out "redundant" replicas together.
6. What is a metastable failure, and why doesn't fixing the trigger fix the
   outage?
7. Crash-stop vs crash-recovery vs gray failure — one production example each.
8. RTO vs RPO; what makes RPO nonzero in a two-DC async-replicated setup?
9. Reliability vs availability: construct a system that's highly available but
   unreliable for long-running work.
10. Why is failover "a transition with its own failure modes"? Name two such
    modes and one practice that mitigates them.
11. Your interviewer says "just make it five nines." Give the L6 pushback in two
    sentences.
12. Which of your resume systems is resilience (not fault tolerance), and why is
    the distinction correct?

<details>
<summary><b>Answers</b></summary>

1. The OOM bug/misconfig is the fault; the dead worker and its unprocessed tuples
   are the error state; user-visible failure occurs only if payments stop
   resolving — here Storm replays the tuples on another worker, so the fault is
   masked and (briefly delayed) no failure occurs. That masking IS fault
   tolerance.
2. FT: the system keeps operating correctly despite component faults (user never
   notices). HA: the measured fraction of time the system serves (the outcome).
   Resilience: the system absorbs stress, degrades deliberately, and recovers —
   covering stresses beyond component faults.
3. Series: 0.999² ≈ 99.8%. Parallel: 1−0.01² = 99.99%. Hidden assumption:
   failure independence — shared deploys/config/certs/network violate it and
   collapse the math.
4. You can't prevent components from failing (MTBF has physical/organizational
   ceilings), but detection + automated recovery time is engineering you control.
   Example: DLQ force-query recon — automated recovery of stuck transaction
   states, replacing human investigation.
5. Bad deploy/rollout, config push, expired certificate, shared dependency (DNS,
   auth service, load balancer), shared infrastructure (rack/power/AZ), same
   poison input hitting all replicas.
6. A state where the system remains overloaded after the trigger is gone because
   feedback loops (retries, queue backlogs, cold caches) sustain load above
   capacity. You must break the loop — shed load, disable retries, drain queues —
   not just heal the trigger.
7. Crash-stop: node power loss, never returns. Crash-recovery: JVM restart
   rejoining with WAL replay — needs fencing so its stale writes are rejected.
   Gray: limping disk serving at 100× latency while passing health checks.
8. RTO: time until service restored. RPO: max acceptable data loss window. Async
   replication means the surviving DC may lack the last seconds/minutes of acked
   writes — that lag is your RPO.
9. A service that drops all connections for 1 s every minute: 98%+ available,
   but any job needing 10 continuous minutes never completes — reliability over
   the interval ≈ 0.
10. Failover requires detection, promotion, and redirection — each can misfire:
    split-brain (two primaries) and flapping (repeated promotion under a
    borderline detector); also promoting a lagging replica loses acked writes.
    Mitigation: quorum-based arbitration + fencing, and regularly *exercised*
    failover (game days).
11. Each added nine multiplies cost and slows change (freezes, process), and past
    the dependency floor it's unreachable anyway — the SLO should come from what
    users/business actually need, spending the error budget on velocity.
12. The Hystrix + grey-out behavior: the fault (slow partner) is not masked — the
    feature visibly degrades — but the platform survives and recovers. Deliberate
    degradation under stress is resilience by definition.

</details>
