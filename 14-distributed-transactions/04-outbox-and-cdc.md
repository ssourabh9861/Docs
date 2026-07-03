# The Transactional Outbox (and CDC as Its Engine)

The most-used pattern in this directory by volume: every saga step, every
"save and notify," every event-driven integration hits the same primitive —
**change my state and announce it, atomically**. The CDC doc
(`04-messaging-streaming/07-cdc.md`) covered capture mechanics; this doc owns
the pattern side: outbox variants, the inbox (its consumer-side twin),
ordering and cleanup engineering, the HBase adaptation for your platform, and
event sourcing as the radical cousin.

---

## 1. Plain definition

**The problem (dual-write), one more time precisely:** a service must
(a) commit a state change to its database and (b) publish a message about it.
Two systems, no shared transaction → four outcomes, two of them poison:
state-without-event (downstream never learns — silent divergence) and
event-without-state (downstream learns a lie — publish-then-crash-then-
rollback). Every "we'll just publish after commit, it's usually fine" is a
divergence generator with a low but *nonzero and unmonitored* rate — the
worst kind.

**The outbox pattern:** inside the SAME local transaction as the state
change, insert a row into an `outbox` table (event id, aggregate id, type,
payload, created_at). The database's ordinary atomicity now covers
state+event: both or neither, forever. A separate **publisher** moves outbox
rows to the message bus afterward — asynchronously, retried, at-least-once.

Analogy: instead of making a phone call after signing a contract (you might
get hit by a bus between pen and phone), you write the announcement into the
contract's own envelope as you sign. The mailroom (publisher) empties
envelopes on its own schedule — mail can be slow or duplicated, but there is
never a signed contract without its announcement, or an announcement without
its contract.

---

## 2. How it works in practice

### 2.1 The publisher: polling vs log-tailing

- **Polling publisher:** a loop `SELECT ... WHERE published = false ORDER BY
  id LIMIT n` → publish → mark published. Simple, portable; costs: poll
  latency/load trade, careful concurrency (`FOR UPDATE SKIP LOCKED` for
  multiple publishers), and the mark-published write is itself a second
  write (crash between publish and mark ⇒ republish ⇒ at-least-once —
  fine, expected).
- **CDC/log-tailing publisher (the production-grade default):** Debezium-
  class connector tails the DB log, filtered to the outbox table, and
  relays rows to the bus (Debezium has a first-class "outbox event
  router"). No polling load, low latency (~ms–s), ordering inherited from
  the log. This is where the two docs meet: **CDC is the delivery engine;
  outbox is the contract designer** — raw CDC ships storage-shaped rows;
  outbox rows ARE the business events, written by the domain code, so
  consumers get a stable contract (the two-layer end-state from the CDC
  doc, achieved in one move).

### 2.2 Delivery semantics and the consumer's half: the inbox

End-to-end you get **at-least-once**: publisher crashes republish; the bus
redelivers (`04-messaging-streaming/04-delivery-semantics.md`). The
consumer-side twin pattern completes it — the **inbox**: consumers record
processed event IDs in a `processed_events` table **in the same local
transaction as their own state change**. Redelivered event → id already in
inbox → skip. Symmetry worth saying aloud: *outbox makes send atomic with
my write; inbox makes receive atomic with yours* — together they produce
effectively-once processing across two databases and a bus, with no
distributed transaction anywhere. (The inbox is the durable, transactional
version of the dedup-memory shape from `05-resilience/07-idempotency.md`.)

### 2.3 Ordering, cleanup, and the operational details

- **Ordering:** publish with the aggregate ID as the partition/routing key
  → per-aggregate order preserved (the only order that usually matters —
  `04-messaging-streaming/05-ordering.md`); cross-aggregate order is
  neither promised nor needed. Polling publishers must preserve insertion
  order per aggregate (ORDER BY id + single publisher per key range or
  SKIP LOCKED batches with care).
- **Cleanup:** the outbox grows forever unless pruned — delete-after-
  publish (keeps table tiny; loses replayability) vs retain-N-days (bus
  retention + outbox retention = two replay windows; pick deliberately)
  vs archive. A bloated outbox slowly poisons the host DB (the table is
  co-tenant with your business data — its I/O is your I/O).
- **Schema:** payload as the *event contract* (versioned, additive-
  evolution rules — the CDC doc's discipline applies verbatim);
  event id = the idempotency identity downstream; aggregate id for
  routing; type for dispatch.
- **Monitoring:** unpublished-row age (publisher health), publish lag,
  inbox rejection rate (duplicate pressure), outbox table size. The
  "unpublished age" alert is the whole pattern's liveness SLI.

### 2.4 The variants (know the family)

- **Listen-to-yourself:** publish first to the bus, consume your own event
  to update your own DB. Removes the outbox table; costs read-your-writes
  (your own state lags your own action) — niche, name it only.
- **Raw-CDC-as-events:** skip the outbox; consumers tail the entity
  table's changes. Zero producer effort, storage-coupled contract —
  right for data replication (your FDP pipeline), wrong for cross-team
  business APIs (the CDC doc's P5 synthesis).
- **Event sourcing (the radical cousin, one honest paragraph):** don't
  store state + emit events — store ONLY events; state is a fold (replay
  or snapshot+replay) and the event log IS the outbox (nothing to sync,
  dual-write dissolves by construction). Real costs: querying needs
  projections (CQRS almost mandatory), schema evolution over immutable
  history is hard, and the paradigm reshapes everything it touches.
  Where it fits: domains that are *naturally* ledgers — accounting,
  ledgers, audit-heavy money movement. Payments hook: **double-entry
  bookkeeping is event sourcing, four centuries early** — append-only
  entries, balances as folds. Your platform's append-only history
  tables + derived aggregates are event-sourcing-shaped without the
  label; the rewards raw-rows→aggregate design literally is
  events→projection.

---

## 3. Senior-level depth

- **The outbox is the saga's spinal cord.** Every orchestrator "record
  step + emit command" and every choreography "commit + emit event" is a
  dual-write; sagas built on naked publishes silently halt or double-fire
  steps. In review: any saga proposal without an outbox-shaped handoff
  gets the question "what happens if you crash between the commit and
  the publish?" — the answer is always "outbox" or "we have a bug."
- **Latency shape:** state commit is synchronous; announcement is
  asynchronous (poll interval or CDC lag — ms to seconds). Consumers of
  the *event* lag the *state* slightly; anything needing read-your-write
  reads the DB, not the stream. Declare the lag SLI; don't let product
  discover it.
- **One outbox per service (per database), not per company:** the pattern's
  scope is the local transaction. A shared "event store service" that
  other services call over HTTP re-creates the dual-write it was meant to
  kill — spot this anti-pattern in designs.
- **When NOT to bother:** if downstream can tolerate loss (best-effort
  telemetry), or the "event" is derivable by recon cheaply and lag-
  tolerantly, a monitored best-effort publish + recon sweep is a
  legitimate budget option — name the divergence rate you'll tolerate
  and who repairs it. Engineering maturity includes knowing when the
  full pattern isn't warranted.
- **L4/L5/L6:** L4 knows "outbox table + relay fixes dual-writes." L5
  adds the inbox twin, CDC-vs-polling publishers, per-aggregate ordering,
  cleanup/retention design, the saga dependency, and the event-sourcing
  boundary. L6 sets platform policy: outbox as paved-road library,
  event-contract governance, and the call on where event sourcing is
  worth its paradigm tax.

---

## 4. Resume connection

- **Your platform's near-outbox, stated precisely:** the execution path
  is write-txn-row *then* publish — a dual-write with a known gap,
  **covered by recon** (stuck-by-birth transactions get swept — the
  "when not to bother" clause, consciously applied). The upgrade path
  you can whiteboard: an event column/row written in the same HBase
  **single-row atomic** mutation as the state change, published by the
  SEP/CDC tail you already operate — outbox with zero new infrastructure
  classes (the CDC doc's self-test 12; the design nuance is that HBase's
  transaction scope is the row, so the outbox entry must live in the
  same row — an event CF/qualifier — or accept the gap).
- **Your FDP pipeline is raw-CDC-as-events** — correctly chosen for its
  consumers (data replication, analytics), with versioned entities as
  the contract layer.
- **Your rewards architecture is event-sourcing-shaped:** append-only
  reward rows (events) + derived aggregate (projection) + rebuild-from-
  ground-truth (replay). Say "events and projections" and the design
  reads as deliberate paradigm, not ad hoc cleverness.
- **The inbox pattern is your dedup discipline made transactional** —
  gateway tokens are the TTL'd version; a `processed_events`-style
  transactional inbox is the durable version you'd cite for
  business-event consumers.

**30–60 s spoken answer** ("how do you atomically update state and
publish an event?"):

> "That's the dual-write problem, and the answer is the outbox: write the
> event into an outbox table inside the same local transaction as the
> state change — the database's own atomicity now covers both — then a
> publisher relays outbox rows to the bus asynchronously. Production-
> grade, the publisher is CDC tailing the database log rather than
> polling, which also gets you the best of both layers: CDC as the
> reliable delivery engine, outbox rows as the stable business-event
> contract. End-to-end you get at-least-once, so the consumer side has a
> twin — the inbox: record processed event IDs in the same transaction
> as the consumer's state change, and redeliveries no-op. Outbox makes
> send atomic with my write, inbox makes receive atomic with yours —
> effectively-once across two databases and a bus with no distributed
> transaction anywhere. In my platform the interesting adaptation is
> that HBase's transaction scope is the single row — so the outbox entry
> has to ride the same row mutation as the state change, published by
> the SEP replication tail we already run for CDC; today our execution
> path is write-then-publish with recon consciously covering the gap,
> and that outbox upgrade is the one I'd make with zero new
> infrastructure. And our rewards design is the radical cousin already:
> append-only events with a derived projection, rebuildable by replay —
> double-entry bookkeeping discovered event sourcing four centuries
> before we did."

---

## 5. What the interviewer will push on

**P1. "Walk me through every failure point of the outbox pipeline and why
none of them lose or fabricate events."**
- *Model:* crash before commit → neither state nor event (atomic — fine).
  Crash after commit, before publish → event sits in outbox; publisher
  retries forever (unpublished-age alert if stuck) — delayed, never
  lost. Publisher publishes then crashes before marking → republish →
  duplicate → consumer inbox no-ops. Bus redelivers → same. Consumer
  processes then crashes before committing inbox+state → redelivery →
  reprocess (its transaction never committed — no double effect).
  Consumer commits then crashes before ack → redelivery → inbox hit →
  skip. Every path: delayed or duplicated, never lost or fabricated —
  and duplicates die at the inbox. Deliver it as the crash-walk; it's
  the whole pattern in ninety seconds.
- *Trap:* missing the publish-before-mark duplicate (claiming
  exactly-once publishing) or putting the inbox check outside the
  consumer's transaction (check-then-act race — the idempotency-doc
  reservation bug again).

**P2. "Why not just publish the event first, then write the DB if the
publish succeeded?"**
- *Model:* inverts the poison: publish succeeds, DB write fails/rolls
  back → the world received an announcement of a state that never
  existed — consumers acted on a lie, and *there's nothing to repair
  from* (no committed source of truth says otherwise). State-first at
  least leaves truth in the DB for recon to re-announce; event-first
  fabricates. Also breaks read-your-writes (listen-to-yourself's cost).
  The asymmetry — "delayed truth is repairable; announced fiction is
  not" — is the quotable core.
- *Trap:* treating the two orders as symmetric risks. They aren't;
  the asymmetry argument is what's being fished for.

**P3. "Your outbox is in HBase, which has no multi-row transactions.
Design it."**
- *Model:* the transaction scope is the row → the outbox entry must live
  IN the row being changed: an `evt` column family / qualifier written
  in the same atomic row mutation as the state change (single-row
  atomicity covers state+event). Publisher: the SEP/replication tail
  filtered to the event qualifier (exactly the existing CDC pipeline
  pointed at a new column) → Pulsar. Event id = txnId+seq for inbox
  dedup; cleanup via TTL on the event CF (compaction reclaims —
  `02-databases/05-hbase-internals.md`). Limits to volunteer: events
  about *cross-row* operations can't be atomic with all of them — put
  the outbox entry on the row that owns the saga state (the entity
  whose transition IS the event), and let the saga structure handle
  the rest. This is a genuinely strong answer because it's YOUR stack —
  deliver it as a design you've already thought through.
- *Trap:* proposing a separate outbox *table* in HBase (separate row =
  separate atomicity = the dual-write returns wearing an outbox
  costume).

**P4. "Event sourcing: when would you actually adopt it, and what would
you refuse to event-source?"**
- *Model:* adopt where the domain IS a ledger: append-only facts,
  audit/replay as first-class requirements, state as derivation —
  accounting, balances, payment history (and note your rewards design
  already lives there). Refuse for CRUD-shaped, query-heavy,
  relationship-rich domains (catalogs, profiles): you'd pay projections
  (CQRS), eventual-consistency UX, and immutable-history schema
  evolution for zero domain fit. Middle path most shops take: ledgers
  event-sourced, everything else state-stored with outbox events.
  Close with the bookkeeping line — it lands.
- *Trap:* all-in evangelism or blanket dismissal; the domain-fit
  criterion (naturally-a-ledger) is the answer.

**P5. "The outbox publisher is down for 4 hours. Trace the blast radius
and the recovery."**
- *Model:* state writes continue unharmed (the pattern's whole point —
  producers never block on the publisher); outbox rows accumulate
  (table growth — watch host-DB impact); every downstream consumer's
  view goes stale (lag SLI fires — unpublished-age alert is the
  primary pager); saga steps riding these events stall (sweepers/
  timeouts surface stuck sagas — the `03-sagas.md` P5 machinery).
  Recovery: publisher resumes → drains in order (per-aggregate order
  preserved) → consumers catch up idempotently; throttle the drain so
  the thundering backlog doesn't brown out consumers
  (`04-messaging-streaming/08-backpressure.md`); recon validates
  nothing aged out of bus/inbox retention windows. Punchline: compare
  with dual-write under the same outage — silent permanent divergence
  vs visible, recoverable lag. The pattern converts catastrophe into
  latency.
- *Trap:* "events are lost after 4 hours" (nothing is lost — that's
  the point) or ignoring the drain-throttling and saga-stall
  second-order effects.

---

## Self-test

1. State the dual-write problem's two poison outcomes and why "publish
   after commit, usually fine" is the worst variant.
2. The outbox mechanism in one sentence, and what provides the
   atomicity.
3. Polling vs CDC publishers: two costs of each; which is production
   default and why.
4. The inbox pattern: mechanism, what it must share a transaction with,
   and the symmetry sentence.
5. Walk the full crash matrix (six points) and the guarantee that
   survives all of them.
6. Why is event-first strictly worse than state-first? The asymmetry
   argument.
7. Ordering: what's preserved, by what mechanism, and what's
   deliberately not promised.
8. Outbox cleanup: the trade-space and the operational risk of
   ignoring it.
9. Design the HBase outbox: where the entry lives, who publishes,
   and the cross-row limit.
10. Event sourcing: the adoption criterion, two real costs, and your
    platform's already-event-sourced corner.
11. Why do sagas structurally require outbox-shaped handoffs?
12. Publisher down 4 hours: blast radius in four items and the
    dual-write comparison.

<details>
<summary><b>Answers</b></summary>

1. State-without-event (committed change never announced — downstream
   silently diverges) and event-without-state (announcement of a
   rolled-back change — downstream acts on fiction). "Usually fine"
   is worst because the failure rate is low enough to escape testing
   and unmonitored enough to accumulate silently — divergence with no
   detection story.
2. Insert the event into an outbox table within the same local
   transaction as the state change; a separate publisher relays it to
   the bus with retries. Atomicity provider: the ordinary single-
   database transaction (or single-row atomicity in wide-column
   stores).
3. Polling: + poll latency/load trade, concurrency care (SKIP LOCKED),
   and a second mark-published write; simple and portable. CDC:
   + connector operations and log-coupling; near-real-time, no poll
   load, ordering from the log. CDC is the production default —
   latency and load win, and Debezium-class outbox routing is
   commodity.
4. Consumers record each processed event ID in a processed_events
   table in the SAME transaction as their state change; redeliveries
   find the ID and no-op. "Outbox makes send atomic with my write;
   inbox makes receive atomic with yours" — effectively-once across
   two DBs and a bus.
5. Pre-commit crash: nothing anywhere. Post-commit/pre-publish: event
   waits in outbox — delayed, alertable, never lost.
   Publish-then-crash-pre-mark: republish → duplicate → inbox no-op.
   Bus redelivery: same. Consumer crash pre-commit: reprocess (its
   txn never landed). Consumer crash post-commit/pre-ack: redelivery
   → inbox hit → skip. Guarantee: every event delivered at least
   once and *effected* exactly once; delay and duplication possible,
   loss and fabrication impossible.
6. State-first failures leave committed truth in the DB — recon can
   detect and re-announce (repairable delay). Event-first failures
   broadcast a state that never existed — consumers acted, and no
   source of truth exists to repair *from*. Delayed truth is
   repairable; announced fiction is not.
7. Per-aggregate order, by routing/partitioning on aggregate ID (and
   insertion-ordered relay per key). Cross-aggregate global order:
   not promised, not needed — the `05-ordering.md` scoping.
8. Delete-after-publish (tiny table, no replay) vs retain-N-days
   (second replay window, deliberate) vs archive. Ignoring it: the
   outbox is co-tenant with business data — unbounded growth degrades
   the host DB's I/O, backups, and (polling) publisher scans.
9. In the changed entity's own row — an event qualifier/CF written in
   the same atomic row mutation (row = transaction scope). Publisher:
   the existing SEP/CDC tail filtered to the event qualifier →
   Pulsar. Cleanup: TTL on the event CF. Limit: an event spanning
   multiple rows can only be atomic with ONE of them — put it on the
   saga-owning row; cross-row consistency remains saga+recon
   territory.
10. Adopt when the domain is naturally a ledger (append-only facts,
    audit/replay first-class, state = fold): accounting, balances.
    Costs: projections/CQRS for queries, schema evolution over
    immutable history. Platform corner: rewards — append-only reward
    rows (events) + derived aggregate (projection) + full-scan
    rebuild (replay).
11. Every step transition is "commit my state + emit the next
    command/event" — a dual-write; a naked publish crashing between
    the two silently stalls the saga or double-fires the next step.
    Outbox-shaped handoff (+ inbox/idempotent consumers) is what
    makes step handoff effectively-once, which saga correctness
    quietly assumes.
12. (1) Producers unaffected — state writes continue; (2) outbox
    accumulates — table growth on the host DB; (3) all downstream
    views stale — lag/unpublished-age SLIs fire; (4) event-driven
    saga steps stall — sweepers surface them; recovery = ordered,
    throttled drain + idempotent catch-up + retention check.
    Dual-write under the same outage: a fraction of events silently
    never sent, permanent divergence, discovered by recon or
    customers — the outbox converted catastrophe into latency.

</details>
