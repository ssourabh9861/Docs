# Indexing

An index is the answer to "how does the database avoid reading everything?" —
and index design is where query performance is actually won or lost. For you
this topic has a twist that most candidates can't offer: you work in a store
with **no secondary indexes at all** (HBase), where the row key is the only
index and everything else is hand-built. That constraint taught you what
indexes really are; this doc makes that teachable.

---

## 1. Plain definition

An **index** is a redundant, ordered (or hashed) data structure maintained
alongside your data so that queries matching its order become cheap
lookups/scans instead of full scans. Book analogy, precisely applied: the
book's *content* is the table; the back-of-book index is a **sorted copy of
selected attributes** (terms) each pointing at locations (pages). Three truths
fall out immediately:

1. **Indexes are redundancy** — extra space, and every write must update
   every index (write amplification per index).
2. **Order is the magic** — sorted structures turn "find X" into O(log n)
   and "find range X..Y" into O(log n + answer size). An index helps exactly
   the queries that match its order.
3. **The index points; someone must still fetch** — unless the index itself
   contains everything the query needs (covering).

---

## 2. How it works in practice

### 2.1 Clustered vs secondary (the distinction everything else builds on)

- **Clustered index:** the table *is* stored in index order — there's no
  separate "heap"; the leaf level of the index contains the full rows.
  InnoDB: the primary key is always the clustered index. Consequences: PK
  lookups are one B-tree descent to the data itself; PK-order range scans
  are sequential reads; **PK choice = physical layout choice** (the UUID
  lesson from `01-storage-engines.md` P3).
- **Secondary index:** a separate B-tree of (indexed columns → row
  locator). InnoDB's locator is the **primary key value**, not a physical
  pointer — so every secondary lookup is *two* descents: secondary tree →
  PK → clustered tree ("back to the PK"). Consequences: fat PKs bloat
  every secondary index; secondary range scans that fetch many rows do many
  scattered clustered lookups (why the optimizer sometimes prefers a full
  scan past ~10–25% selectivity **(rule of thumb)**).
- **Postgres contrast (one line):** all indexes point into an unordered
  heap (no clustered index by default) — different trade, same taxonomy.

### 2.2 Composite indexes and the leftmost-prefix rule

Index on (a, b, c) is sorted by a, then b within a, then c within b — a phone
book sorted by (last, first, middle). Usable for: `a=`, `a=,b=`, `a=,b=,c=`,
`a=,b range`, and ordering by prefixes. NOT usable for: `b=` alone (the
phone book can't find "people named John" without scanning). **Range stops
the prefix:** in `a=, b>, c=`, the index serves a and the b-range; c becomes
a post-filter — so the column order rule is *equality columns first, then
the range/sort column* per targeted query. This one rule explains 80% of
real-world "why is my indexed query slow" tickets.

### 2.3 Covering indexes and index-only scans

If the index contains every column the query touches (INCLUDE columns / just
composite width), the engine never visits the table — an **index-only scan**:
often 5–10× on hot read paths **(workload-dependent)**. Cost: wider index =
more write amp and space. The design move: covering indexes are hand-built
materialized projections for your hottest queries — recognize them as the
relational cousin of your pre-computed aggregates.

### 2.4 What indexes cost (the write-side ledger)

Every additional index on a table: one more B-tree updated per
INSERT/DELETE (and per UPDATE touching its columns), more buffer-pool
competition, more space, slower bulk loads, and longer crash-recovery/DDL.
Ballpark: each secondary index adds a noticeable slice to write cost —
5 indexes can roughly double insert work **(estimate; engine/workload
dependent)**. Plus optimizer risk: more indexes = more plan choices = more
ways to pick badly on skewed data. The discipline: indexes are *earned* by
queries, reviewed like dependencies, and dropped when orphaned (unused-index
audits are free wins).

### 2.5 Selectivity and statistics

An index earns its keep when it *narrows* the search: `status` with 3 values
over 100M rows selects 33M — the index is nearly useless (and the optimizer
knows it from statistics/histograms). High-selectivity columns (IDs, emails)
index well; low-selectivity ones belong in composites (after an equality
prefix) or partial indexes (`WHERE status='PENDING'` — indexing only the
0.1% that's hot: Postgres partial indexes; the recon-queue pattern).
Stale statistics ⇒ bad plans ⇒ the 3 AM "query suddenly slow, nothing
changed" incident (something changed: the data distribution).

### 2.6 Beyond B-trees (one line each — name, don't lecture)

Hash indexes (equality only, O(1), no ranges); inverted indexes (search —
term→postings, `02-sql-vs-nosql-taxonomy.md`); bitmap (analytics,
low-cardinality); geospatial (R-tree/geohash/S2 — proximity queries);
vector/ANN (HNSW — similarity). Naming the right exotic index for a
requirement ("proximity ⇒ geohash/S2 cells") is a design-round point.

---

## 3. Senior-level depth: indexing without an index engine (your world)

### 3.1 HBase: the row key is the only index

No secondary indexes, no optimizer, no statistics. Point get and key-range
scan — nothing else. Therefore:

- **Key design = query planning** (`01-distributed-systems/04-partitioning.md`):
  `accountId:type:timestamp` serves "this user's rewards in time order" as a
  contiguous scan; it serves NOTHING else efficiently. Every efficient query
  must be *designed into* a key.
- **Additional access paths = hand-built index tables:** your `txn_index`
  (user/date → txnId) is a secondary index you maintain yourself. What the
  engine no longer does for you, precisely: (a) **atomicity** — engine
  secondary indexes update transactionally with the row; your index table
  write is a *separate* mutation that can fail independently ⇒ index lags
  or orphans ⇒ repaired by recon/idempotent rebuilds (posture B, again);
  (b) **maintenance on delete/TTL** — expired data leaves dangling index
  entries unless the index shares the TTL/cleanup discipline; (c) the
  optimizer — readers must *know* which index table to use.
- The one-sentence upgrade: "I've maintained secondary indexes by hand, so
  I know exactly what a relational engine is doing for me — and what it
  costs it on every write."

### 3.2 Aerospike, briefly

Primary index: in-RAM hash — O(1) per-key, no ranges (a KV bet). Secondary
indexes exist (in-RAM, per-bin) but query via scatter-gather across nodes —
used sparingly at scale **[VERIFY whether your platform uses any; likely
not on hot paths]**.

### 3.3 The maintenance-visibility spectrum (senior framing)

All "extra access paths" — engine secondary indexes, your index tables,
covering indexes, search clusters, pre-computed aggregates, caches — are the
SAME thing: **redundant derived structures trading write-time work and
consistency risk for read-time speed.** They differ only in *who maintains
them* (engine transactionally / app asynchronously / pipeline via CDC) and
*how stale they may be* (zero / bounded / TTL). Placing any proposal on that
spectrum — "this is a derived view; who maintains it and how stale can it
be?" — is an L5+ analysis that works in every design round.

- **L4/L5/L6:** L4 adds an index when a query is slow. L5 designs composites
  by the leftmost rule, prices the write-side ledger, knows
  clustered-vs-secondary mechanics, and can build access paths where no
  engine helps. L6 governs the derived-structure economy: which views
  exist, who owns their freshness SLOs, and when a query pattern justifies
  a new materialization vs a new store.

---

## 4. Resume connection

- **Your checkpoint-scan design is index thinking:** per-user contiguity +
  time-suffix ordering made "rows since checkpoint" a bounded range scan —
  you *designed the index into the key* because no engine would give you
  one.
- **Your `txn_index` tables are hand-maintained secondary indexes** with
  eventual consistency and recon repair — the honest version of what
  engines hide.
- **Your pre-computed aggregate is a covering materialization:** the home
  screen's entire query answered from one derived row — the covering-index
  idea, escalated one level.
- **The CDC-fed analytics store is the family's far end:** an
  asynchronously-maintained derived view with bounded staleness.
  You operate the *entire* maintenance-visibility spectrum; claim it as a
  spectrum.

**30–60 s spoken answer** ("how do you think about indexing?"):

> "An index is a redundant sorted structure that makes queries matching its
> order cheap — and everything follows from redundancy and order: every
> index taxes every write, and an index helps exactly the queries shaped
> like its sort. In relational systems that means composites designed by
> the leftmost-prefix rule — equalities first, range last — covering
> indexes for hot paths, and treating each index as a dependency that must
> earn its write cost. But my sharpest indexing education came from a
> store with no indexes at all: in HBase the row key is the only access
> path, so key design IS query planning — our reward keys put the user
> first and time last precisely so the aggregation's checkpoint scan is a
> short contiguous range — and every other access path is an index table
> we maintain by hand, which taught me exactly what engines do for you:
> transactional index maintenance, cleanup on delete, and an optimizer.
> Ours are asynchronous and recon-repaired instead. The general frame I
> use: indexes, materialized views, search clusters, caches, and our
> pre-computed aggregates are all the same object — a derived structure
> trading write work and staleness for read speed — and the design
> questions are always who maintains it and how stale it may be."

---

## 5. What the interviewer will push on

**P1. "Query: `WHERE user_id = ? AND status = ? AND created_at > ? ORDER BY
created_at DESC LIMIT 20`. Design the index and explain every position."**
- *Model:* composite `(user_id, status, created_at)` — equalities first
  (user_id high selectivity, status low but as equality it extends the
  prefix), range/sort column last so the index serves both the
  `created_at >` filter and the DESC order (backward scan) — the LIMIT 20
  then reads exactly 20 index entries. Add covering (INCLUDE the selected
  columns) if this is the hot path and write volume tolerates it. Explain
  the failure of alternatives: `(created_at, user_id, status)` scans all
  recent rows for all users; `(user_id, created_at, status)` makes status
  a post-filter (fine if status barely filters; wasteful if it does).
- *Trap:* three single-column indexes ("the optimizer will combine them")
  — index-merge exists but is rarely chosen and never serves the sort;
  this answer signals folklore over mechanics.

**P2. "Why is your write throughput dropping as the team adds indexes, and
what's your governance answer?"**
- *Model:* mechanics: every insert/update now maintains N+1 B-trees —
  random I/O per index, buffer-pool competition, longer transactions
  (lock hold time), slower bulk operations. Governance: indexes enter
  through review with the query they serve attached; periodic unused-index
  audits (engines expose usage stats) with scheduled drops; covering-index
  consolidation (one wide index replacing three narrow ones); and for
  write-critical tables, a budget ("this table affords 3 indexes —
  prioritize"). The senior close: index count is a *write-side SLO
  variable*, not a read-side free lunch.
- *Trap:* "indexes are cheap, add them" or "drop them all" — the ledger +
  governance shape is the answer.

**P3. "You're in HBase. Product wants 'all transactions for a merchant,
newest first.' Your keys are txnId-based. Go."**
- *Model:* no secondary indexes ⇒ build the access path. Options:
  (a) index table `merchantId:reverseTimestamp → txnId` maintained on the
  write path (extra mutation; atomicity gap ⇒ idempotent writes + recon
  repair; reverse-timestamp for newest-first scans); (b) maintain it via
  CDC (your pipeline!) — decoupled, seconds-stale, zero write-path cost —
  the right call if freshness tolerance allows **[this is literally your
  platform's pattern — say so]**; (c) if it's analytics-shaped, don't
  serve it from HBase at all — CDC into the warehouse. Walk the
  consistency budget explicitly: what happens when the index write fails,
  who repairs, how stale is acceptable.
- *Trap:* "scan and filter" (full-table scan in production) or proposing
  the index table without addressing its atomicity gap — the gap IS the
  senior content.

**P4. "The optimizer suddenly picked a terrible plan for a query that ran
fine for a year. What happened and what do you do?"**
- *Model:* likely causes: data distribution drifted past a statistics
  boundary (histogram stale → cardinality misestimate → plan flip), an
  index crossed a size/selectivity threshold, or a minor version changed
  optimizer behavior. Actions: compare plans (EXPLAIN vs historical),
  refresh statistics, then durable fixes: plan hints/pinning where the
  engine supports it, query rewrite to be plan-robust, or index that
  makes the good plan dominant. The meta-point: optimizers are
  statistical decision systems — they fail statistically; monitor plan
  changes on hot queries like deploys.
- *Trap:* "restart the database / it's a bug" — plan regression via stale
  stats is bread-and-butter ops; not knowing it flags zero relational
  production time (risky for you — **[be ready, since MySQL is on your
  resume]**).

**P5. "Are a cache, a covering index, and your pre-computed rewards
aggregate the same thing? Defend or attack."**
- *Model:* defend, with the spectrum: all three are redundant derived
  structures trading write-work/staleness for read speed. Differences are
  the two governing axes — maintainer (engine-transactional /
  app-synchronous / pipeline-async) and staleness contract (zero /
  zero-ish / bounded-with-repair) — plus rebuildability (index: rebuild
  from table; your aggregate: re-derive from raw rows; cache: refill from
  source). The unifying design question set: who maintains, how stale,
  how rebuilt, what's the write-side tax. Then the flourish: "the reason
  I can answer this is that my platform runs the whole spectrum, and the
  machinery differs but the invariants don't."
- *Trap:* "no, they're totally different technologies" — the surface
  differences are real but the question is testing abstraction; equally
  bad: "yes, identical" without the two axes.

---

## Self-test

1. The three truths that fall out of "redundant + ordered."
2. Clustered vs secondary in InnoDB: what the leaf contains in each, and
   why secondary lookups are two descents.
3. Why do fat primary keys hurt every secondary index in InnoDB?
4. The leftmost-prefix rule and the range-stops-the-prefix corollary —
   design an index for `a=, b>, ORDER BY b`.
5. What's a covering index, its cost, and its cousin in your platform?
6. Give the write-side ledger of an added index (four costs) and the
   governance discipline.
7. Selectivity: why a 3-value status column indexes badly alone, and two
   patterns that redeem it.
8. What three services does a relational engine perform for secondary
   indexes that you perform by hand in HBase?
9. Your merchant-history access path: three options with their
   freshness/write-cost trade.
10. Why do query plans regress without code changes, and the monitoring
    answer?
11. State the maintenance-visibility spectrum and place five of your
    platform's structures on it.
12. Why is "three single-column indexes" the wrong answer to a composite
    query?

<details>
<summary><b>Answers</b></summary>

1. (a) Redundancy: extra space and every write updates every index;
   (b) order is the mechanism: matching queries become O(log n) descents
   or bounded scans; (c) the index points — the query still fetches rows
   unless the index covers it.
2. Clustered: leaves contain the full rows — the table is stored in PK
   order (one descent to data). Secondary: leaves contain (indexed cols →
   PK value); a lookup descends the secondary tree, then descends the
   clustered tree by PK to fetch the row — two descents.
3. The secondary index's row locator IS the PK value, stored in every
   leaf entry of every secondary index — a 36-byte UUID PK is copied
   into all of them, bloating size, cache footprint, and write cost;
   a compact PK shrinks every index on the table.
4. Sorted by column 1, then 2 within it, etc. — usable only for prefixes
   with equalities; the first range/inequality consumes the last usable
   position, later columns become post-filters. For `a=, b>, ORDER BY b`:
   index (a, b) — equality first, range-and-sort column second; the scan
   is contiguous and pre-sorted.
5. An index containing every column the query reads — the engine answers
   from the index alone (index-only scan). Cost: wider index = more
   write amplification and space. Cousin: the pre-computed rewards
   aggregate — the entire hot query answered from one derived row.
6. One more B-tree maintained per write (random I/O), buffer-pool
   competition, space, slower bulk loads/DDL/recovery — plus optimizer
   plan-space risk. Governance: indexes enter with their query attached,
   usage audits with scheduled drops, covering consolidation, per-table
   budgets on write-critical tables.
7. It narrows 100M rows to ~33M — barely filtering, and scattered
   fetches cost more than a scan (optimizer skips it). Redeemed by:
   composite placement after an equality prefix (user_id, status), or a
   partial index over the rare hot value (WHERE status='PENDING' —
   indexing only the 0.1% work-queue slice).
8. (a) Transactional maintenance — index updated atomically with the
   row; (b) lifecycle cleanup — deletes/TTL remove index entries;
   (c) query planning — the optimizer chooses when to use it (and
   statistics keep the choice honest). By hand: async index-table
   writes with idempotency + recon repair, shared TTL discipline, and
   reader-side knowledge of which table serves which query.
9. (a) Write-path index table (merchantId:reverseTs → txnId): freshest,
   costs a mutation per txn + atomicity-gap handling. (b) CDC-maintained
   table: zero write-path cost, seconds-stale, decoupled — the
   platform-native choice. (c) Warehouse via CDC: for analytics-shaped
   access, unbounded query power, minutes-stale.
10. Optimizers decide from statistics; data distribution drift or stale
    histograms flip cardinality estimates and thus plans — no code
    changed, the data did. Monitor: plan-change detection on hot
    queries, statistics freshness, and regression alerts treating plan
    flips like deploys.
11. All are derived structures traded along (maintainer, staleness):
    engine secondary index (engine, zero-stale) — MySQL indexes;
    hand-built index table (app, near-zero, recon-repaired) — txn_index;
    covering materialization (app, event-lag) — rewards aggregate;
    pipeline view (CDC, seconds) — FDP/analytics; cache (TTL, bounded
    stale) — Aerospike lookups.
12. The optimizer can index-merge but rarely does so profitably, merges
    can't serve compound sort orders, and intersection costs often
    exceed one composite descent; the composite encodes the query's
    whole shape (equalities → range → sort) in one structure — which is
    what index design *is*.

</details>
