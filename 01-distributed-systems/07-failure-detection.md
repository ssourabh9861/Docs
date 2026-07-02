# Failure Detection

Every failover, every rebalance, every circuit breaker, every recon sweep begins
with the same guess: "I think that thing is dead/broken." This doc is about why it
is always a guess, how systems make the guess well, and what must be true so that
guessing *wrong* is survivable. For a payments engineer this topic has a special
edge: **"timeout ≠ failure" is the most expensive lesson in the industry**, and
your DLQ force-query design is literally built on it.

---

## 1. Plain definition

A **failure detector** is the component that decides whether another component
(node, process, dependency) is faulty. The fundamental problem: in an asynchronous
network you **cannot distinguish a dead node from a slow node from a broken
network path** — all three look identical from outside: silence. (This is the same
root fact as FLP in `05-consensus.md`.)

Analogy: a friend hasn't replied to your message for an hour. Dead phone? Bad
signal? Ignoring you? Busy? You cannot know from the silence alone. Whatever you
do next — resend, call someone else, show up — you are *acting on a guess*, and a
good protocol is one where acting on the wrong guess doesn't cause a disaster
(you don't sell their belongings because they missed one text).

So every real detector is a **trade-off dial** between:
- **Detection latency** (how fast you notice real failures — drives MTTR), and
- **Accuracy** (how rarely you accuse a live node — false positives trigger
  failovers, rebalances, retry storms: *self-inflicted outages*).

Theory gives this dial names (completeness/accuracy classes of Chandra–Toueg);
practice gives it a knob: **the timeout**.

---

## 2. How it works in practice

### 2.1 Heartbeats + timeouts (the workhorse)

Node sends "I'm alive" every Δ; monitor declares death after missing k·Δ.
Typical values: heartbeat 100 ms–2 s; declare-dead 1–10 s for infra components;
ZooKeeper-style session timeouts for stateful ownership often 10–90 s (HBase
region servers historically defaulted to double-digit seconds precisely to
survive GC pauses **[VERIFY your platform's setting]**). Push vs pull
(pings) is a minor variant; the real content is the constants.

**How you pick the timeout — say it as a formula, not a vibe:** declare-dead
threshold > (max expected pause sources) = network jitter p99.9 + GC pause p99.9
+ scheduling stalls, with margin — because every source of *silence without
death* is a false-positive generator. This is why JVM systems with 10-second GC
tails can't run 3-second session timeouts, and why moving to low-pause collectors
(ZGC: sub-ms) *changes your failure-detection math*, not just your latency chart.
Cross-connecting GC to failure detection is a reliable senior signal.

### 2.2 Phi-accrual (adaptive suspicion)

Fixed timeouts are wrong twice a day: too tight at peak (false positives during
load), too loose at night (slow detection). **Phi-accrual** (Cassandra, Akka)
keeps a sliding window of actual heartbeat inter-arrival times, models their
distribution, and outputs a *continuous suspicion level* φ ≈ −log₁₀(P(this
silence is normal)). φ=1 ⇒ ~10% chance you're wrong to suspect; φ=8 ⇒ ~10⁻⁸.
Consumers pick thresholds per action: cheap actions (stop routing new requests)
at low φ, expensive/dangerous actions (reassign ownership) at high φ. Two ideas
worth stating explicitly: (1) the detector **adapts** to current network
behavior; (2) it returns a **probability, not a verdict** — letting different
consequences demand different confidence. That second idea is the sophisticated
one.

### 2.3 Gossip-based membership (SWIM-style)

At cluster scale, all-to-all heartbeats cost O(N²). SWIM-style protocols
(Serf/Consul, Cassandra's membership): each node pings a few random peers per
round; on missing ack, asks others to **ping the suspect indirectly** (routing
around a bad link between accuser and accused — killing a whole class of false
positives); suspicion is disseminated piggybacked on gossip, and the suspect gets
a grace period to *refute* ("I'm alive!") before the verdict spreads. Detection
in O(log N)-ish dissemination time with constant per-node load. The interview
takeaways: indirect probing (second opinions) and refutation windows.

### 2.4 Leases + fencing (making wrong guesses safe)

Detection tells you *when to act*; **leases and fencing decide who may act**.
A lease = time-bounded ownership that must be renewed; ownership transfers only
after lease expiry. But the deposed owner may be alive (GC pause, partition) and
still writing — so the resource must reject stale owners via **fencing tokens**
(monotonic epochs: Raft terms, ZK zxids, HBase region/WAL sequence fencing,
Aerospike generations). The division of labor, quotable: *"detectors and leases
bound when a takeover may happen; fencing makes a mistaken takeover harmless."*
Without fencing, every failure detector is a split-brain generator with a delay
knob.

### 2.5 Health checking in load balancers / Kubernetes

- **Liveness probe:** "is this process beyond saving?" — failure = restart it.
  Keep it dumb (deadlock detection), because a too-clever liveness probe turns a
  dependency brownout into a restart storm.
- **Readiness probe:** "should traffic route here right now?" — failure = remove
  from endpoints, no restart. Warmup, backpressure, dependency checks belong
  here.
- Classic outage pattern you should be able to narrate: liveness probe checks a
  downstream dependency → dependency blips → kubelet restarts *every* pod →
  cold caches + connection churn → the blip becomes an outage. Probes are
  failure detectors; mis-scoped consequences are the failure.

### 2.6 Application-level detectors: circuit breakers ARE failure detectors

A circuit breaker is a failure detector over a *dependency*, where the signal is
real request outcomes (errors, timeouts) instead of heartbeats, and the verdict
is "stop calling" instead of "reassign ownership". Same dial: window size and
thresholds trade detection speed vs false trips; half-open = the refutation
probe. Framing Hystrix this way in an interview unifies your resume with the
theory — do it.

---

## 3. Senior-level depth

- **Gray failure and differential observability.** The nastiest failures are
  *partial*: node serves heartbeats fine but fails real work (disk limping, one
  NIC queue dropping, thread pool deadlocked). The detector says healthy; users
  say broken — a **differential observability** gap. Countermeasures: probe the
  *work*, not the process (synthetic end-to-end checks); **outlier detection** —
  compare replicas' latency/error against each other and eject the outlier
  (Envoy does this natively); score health per-capability rather than binary.
- **Detection is cheap; consequences are expensive.** The mature design layers
  responses by confidence and blast radius: (low confidence) shed new traffic →
  (medium) drain + probe → (high) reassign ownership/restart — mirroring
  phi-accrual's per-action thresholds. Systems that jump straight to the
  expensive consequence on the cheap signal are the ones that cascade.
- **Failure detectors under mass events:** a switch dies and 50 nodes go silent
  together. Naive per-node reactions = rebalance/failover storm (the cure
  becomes the outage — cascading recovery load). Mature systems rate-limit
  verdicts (HDFS/etcd-style "too many nodes failing, stop trusting myself",
  quarantine thresholds, human gates for mass reassignment).
- **Timeout ≠ failure — the payments edition.** A timed-out request is in an
  *unknown* state: maybe never arrived, maybe executed and the reply died. For
  reads, retry freely. For non-idempotent effects (a debit!), retrying on
  timeout is how double payments happen; the only safe follow-ups are
  idempotent retry (same identity) or **query the authority** for what actually
  happened. Your platform's DLQ force-query is this principle institutionalized.
- **L4 vs L5 vs L6:** L4: "heartbeats and timeouts; Kubernetes probes." L5:
  picks constants from pause/jitter distributions, separates
  detection-from-consequence, insists on fencing, and can explain phi/SWIM
  mechanics plus gray failure. L6: designs the *system's response envelope* —
  confidence-tiered consequences, storm brakes, differential observability as a
  first-class monitoring strategy.

---

## 4. Resume connection

- **Hystrix breakers = your dependency failure detectors.** Rolling-window
  error/timeout rates as the signal, open-circuit as the verdict, half-open as
  the refutation probe, per-command scoping as per-capability health. You
  tuned detection (thresholds/windows) against consequence (grey-out) — tell
  it in this vocabulary.
- **DLQ force-query = "timeout ≠ failure" institutionalized.** After retries
  exhaust, the system refuses to guess and interrogates the authority (NPCI via
  PSP). This is textbook-correct handling of unknown-outcome effects; very few
  candidates can point at a system they built that encodes it.
- **Recon sweeps = a failure detector over *data states*:** "transaction
  non-terminal for > T" is a timeout applied to state, with the consequence
  being a query, not a retry — same safe pattern.
- **You live downstream of infra detectors:** ZK sessions declaring region
  servers dead (with WAL fencing making mistakes safe — the reason your
  single-writer rows stay single-writer through failovers); Storm restarting
  silent workers (tuple-timeout as per-message failure detection); Kubernetes
  probes on your services **[VERIFY what your liveness/readiness probes
  actually check — "what do your probes do?" is a fair question and "I don't
  know" is a bad answer for a service owner]**.
- **Honest gap:** you haven't built gossip/phi-accrual detectors; your
  ownership is at the dependency- and data-state layer. Say so if pressed.

**30–60 s spoken answer** ("how do you detect failures?"):

> "I split it into detection and consequence, because the detector is always
> guessing — silence can't distinguish dead from slow from partitioned. At the
> dependency layer our detectors are circuit breakers: rolling windows of real
> request outcomes, with the cheap consequence first — stop calling, degrade
> the feature — and half-open probes as refutation. At the data layer we run a
> detector over *state*: any transaction non-terminal past a threshold is
> 'suspected', and the consequence is deliberately not a retry — a timed-out
> debit is in an unknown state, and retrying is how you pay twice — but a
> force-query to NPCI, the authority, converging our record to the truth.
> And beneath us, the infra detectors that reassign ownership — ZooKeeper
> sessions over HBase region servers — are paired with fencing, which is the
> part I care about most: the detector bounds when a takeover happens; fencing
> makes a wrong takeover harmless."

---

## 5. What the interviewer will push on

**P1. "How do you distinguish a slow node from a dead one?"** (deliberately a
trick)
- *Model:* you can't — that's the theorem-level fact (async networks make them
  observationally identical; FLP's root). So the engineering question is
  different: choose a timeout from the tail of legitimate silence (jitter + GC
  + stalls, p99.9 + margin), act on the guess, and make wrong guesses safe —
  cheap consequences at low confidence, fencing before dangerous ones. Bonus:
  mention indirect probing (SWIM) to rule out "the path between us is the
  problem", and adaptive thresholds (phi) to track current conditions.
- *Trap:* offering a mechanism that "solves" it ("just ping harder / check a
  side channel") — every channel is the same silence problem; not knowing this
  is a fundamentals red flag.

**P2. "Your timeout is 3 s. A GC pause hits 5 s. Narrate the incident."**
- *Model:* node goes silent 5 s → declared dead at 3 s → consequence fires
  (ownership reassigned / traffic shifted / failover) → node *returns* at 5 s,
  believing it's healthy and owning what it owned → split-brain unless fenced
  (its writes carry a stale epoch and are rejected; ZK-session/WAL fencing in
  the HBase case) → meanwhile the reassignment itself caused cache cold-starts
  and a latency blip; if this GC tail is *common*, you flap. Fixes: raise
  threshold above pause p99.9, fix the pause (collector choice — ZGC sub-ms
  changes this math), tier the consequences, and always fence. Show you know
  the *return* of the node is the dangerous half.
- *Trap:* ending the story at "it gets declared dead" — the incident is what
  happens when it comes back.

**P3. "Design the health check for your payment gateway pods."**
- *Model:* liveness = process-internal only (event loop responsive; deadlock
  canary) — never dependency checks, so a downstream brownout can't trigger
  restart storms. Readiness = can I serve *now*: warmed connection pools,
  config loaded, and (carefully) degradation-aware — but if ALL pods would
  fail readiness on a shared dependency outage, you've built "remove entire
  fleet from LB" — so shared-dependency readiness needs brakes (serve-degraded
  instead of unready). Add synthetic end-to-end probes *as monitoring* (gray-
  failure coverage) rather than as kubelet probes. Distinguishing
  probe-consequences (restart vs de-route vs alert) is the entire answer.
- *Trap:* one probe that pings `/health` which checks the database — the
  restart-storm special.

**P4. "A send-money call times out. The client retries. Enumerate every layer
that makes this safe, and what breaks if each is missing."**
- *Model:* (this is your gateway/dedup/PSP story as a failure-detection
  question) client retry carries the same request identity → gateway dedup
  (Aerospike token) collapses it — missing: N transactions per tap. If the
  timeout was deeper (our PSP call), Storm replay/DLQ applies: replayed call
  keyed by same txn identity → PSP/NPCI-level dedup returns current state
  rather than re-debiting — missing: double debit. If outcome remains unknown
  after retries: force-query the authority — missing: stuck transactions and
  eventual support tickets. Close: "at every layer, retry-the-question or
  retry-with-identity; never blind re-execution."
- *Trap:* treating "timeout" as "failed, safe to redo" anywhere in the chain.

**P5. "Why does Cassandra bother with phi-accrual instead of a timeout?"**
- *Model:* WAN/multi-DC gossip inter-arrival variance is huge and time-varying;
  a fixed timeout is either trigger-happy at congestion or sluggish at night.
  Phi models the *observed* distribution and emits suspicion as a probability,
  so (a) thresholds self-adapt to current conditions, (b) different actions
  can require different confidence. It's the difference between "did we miss
  3 pings" and "how improbable is this silence, given recent behavior".
- *Trap:* "it's more accurate" without either mechanism (distribution modeling)
  or the per-action-confidence insight.

---

## Self-test

1. Why is failure detection necessarily a guess? Name the two costs the
   timeout dial trades.
2. Give the timeout-selection formula and three sources of
   silence-without-death it must cover.
3. What does phi-accrual output, and what are its two advantages over fixed
   timeouts?
4. SWIM: what do indirect probes and refutation windows each protect against?
5. State the lease/fencing division of labor in one sentence, and name three
   fencing tokens hiding in your stack.
6. Liveness vs readiness probes: consequence of each, and the classic
   mis-scoping outage.
7. Define gray failure via "differential observability" and give two
   countermeasures.
8. Map a Hystrix circuit breaker onto failure-detector vocabulary (signal,
   verdict, refutation, scope).
9. "Timeout ≠ failure": what is the state of a timed-out request, and what are
   the only two safe follow-ups for a non-idempotent effect?
10. Where in your platform is a failure detector applied to *data states*
    rather than processes? What is its consequence and why that one?
11. A rack switch dies; 40 nodes go silent at once. What does a naive detector
    ecosystem do, and what brakes do mature systems add?
12. Your GC tail drops from 5 s (G1 worst case) to <1 ms (ZGC). Which
    *reliability* parameters can you now retune, and why?

<details>
<summary><b>Answers</b></summary>

1. Silence is observationally identical across dead node, slow node, and
   broken path (asynchronous network — no bound on delay). Dial trades
   detection latency (MTTR) against false-positive rate (self-inflicted
   failovers/rebalances/retry storms).
2. Threshold > p99.9 of legitimate silence + margin: network jitter/congestion
   tails, GC pauses, OS/VM scheduling stalls (also: VM migration, disk stalls
   blocking heartbeat threads).
3. A continuous suspicion value φ ≈ −log₁₀(probability the silence is normal),
   computed from the observed inter-arrival distribution. Advantages:
   thresholds adapt to current network behavior; consumers set different φ
   thresholds for different-severity consequences (probability, not verdict).
4. Indirect probes: false accusations caused by a bad link between accuser and
   suspect (others can still reach it). Refutation window: false verdicts from
   transient silence — the suspect can announce liveness before suspicion
   becomes final; also bounds gossip-spread mistakes.
5. Leases bound *when* ownership may transfer; fencing tokens make a
   *mistaken* transfer harmless by letting the resource reject stale owners.
   In-stack tokens: Raft/ZAB terms & ZK zxids, HBase region/WAL sequence
   fencing across reassignment, Aerospike per-record generation counters (and
   your rewards version column as an application-level epoch).
6. Liveness failure ⇒ restart the container (scope: process-internal health
   only). Readiness failure ⇒ remove from service endpoints, no restart
   (scope: can-serve-now). Mis-scoping outage: liveness probing a downstream
   dependency — a dependency blip restarts the whole fleet, cold caches turn
   blip into outage.
7. A component that looks healthy to the detector but broken to users — the
   observation channels differ (heartbeats fine, work failing). Counter:
   probe real work (synthetic end-to-end transactions) and peer-relative
   outlier ejection (compare replicas against each other, evict the outlier).
8. Signal: rolling window of real call outcomes (errors, timeouts) — work,
   not heartbeats. Verdict: open circuit = "suspected dead, stop calling."
   Refutation: half-open trial request. Scope: per-command/per-capability —
   a form of differential, capability-level health.
9. Unknown — it may have never arrived, been executed with the reply lost, or
   still be executing. Safe follow-ups: retry with the same idempotency
   identity (so execution collapses to once), or query the authority for the
   actual outcome. Blind re-execution is the double-debit path.
10. Recon/stuck-transaction detection: "non-terminal for > T" is a timeout on
    a state machine. Consequence: force-query NPCI (ask, don't redo) —
    because the pending action is a money movement whose prior attempts have
    unknown outcomes; interrogation converges safely, re-execution risks
    double payment.
11. Naive: 40 simultaneous death verdicts → mass reassignment/failover →
    replication/recovery traffic storm + cold caches → cascading overload
    (cure becomes outage). Brakes: verdict rate-limiting, "mass failure ⇒
    suspect myself/the network" heuristics, quarantine thresholds
    (stop auto-reassigning past N%), human gates for bulk actions, and
    fencing throughout so any wrong verdicts stay harmless.
12. Session/heartbeat timeouts and declare-dead thresholds can tighten by an
    order of magnitude (the GC tail was the binding constraint in the
    silence-tail formula), cutting detection latency and MTTR without raising
    false positives — failure-detection math, not just latency percentiles,
    is downstream of collector choice.

</details>
