# Worked Design 6: News Feed

THE fan-out design — the canonical home of the write-vs-read fan-out
decision and the celebrity problem, plus ranking, pagination, and feed
freshness. Where chat stored once and signaled many, feeds *materialize
per-reader views* — which makes this the design where the
cache/store/materialized-view triangle (`03-caching/01`) does the most work.

**Prompt:** "Design the Twitter/Instagram home feed."

---

## 1. Requirements & scope (0–5)

Functional: post creation (text + media pointers); follow graph; home feed
= merged, ranked posts from followees; pagination (infinite scroll);
like/comment counts on feed items (ask how live — it changes read-path
fan-in). Out of scope: the ranking *model* itself (treat as a scoring
service — design the plumbing, not the ML), ads injection, stories.

Non-functional: 200 M DAU; feed load p95 < ~200 ms (the product IS the
read path); **staleness tolerance is the gift of this domain — seconds to
a minute is invisible** (say it: this is why feeds are architecturally
easier than payments — the error direction of staleness is "slightly old
content," which is free); posting is async-tolerant (a post appearing to
followers over ~seconds is fine); no lost posts (durability at write),
but a feed *entry* lost from a cache is self-healing (rebuildable view).

## 2. Estimation (5–9)

Reads: 200 M DAU × 5 feed loads/day ≈ 12 k avg / ~50 k peak feed-QPS;
each feed = ~50 items ⇒ item-fetch fan-in matters. Writes: 200 M × 0.5
posts/day ≈ 1.2 k/s avg. **The number that decides the architecture:**
fan-out per post = median followers (~200) vs celebrity followers
(10–100 M). Median post ⇒ 200 feed-inserts (1.2 k/s × 200 = 240 k
inserts/s — heavy but tractable for a cache-tier); celebrity post ⇒
10⁷–10⁸ inserts — **a single post generating 100 M writes is the
non-starter that forces the hybrid** (this arithmetic, done aloud, IS
the design justification). Feed storage: per-user list of ~500 entry
pointers × 200 M × ~30 B ≈ 3 TB — cache-tier feasible.

## 3. Data model (9–14)

- `posts`: post_id (time-ordered ID — Snowflake-style,
  `01-distributed-systems/06` P5) → author, content refs, ts. The system
  of record.
- `follows`: follower → followees (and the reverse index followee →
  followers — the fan-out's driving table; celebrity rows are huge:
  store as sharded adjacency, `01-distributed-systems/04` hot-key
  thinking).
- `feed_cache` (per-user materialized timeline): user → list[(post_id,
  score/ts)], capped ~500–1000 entries, in Redis-class storage.
  **Classify it out loud:** a *rebuildable materialized view with cache
  economics* — evictable (inactive users), regenerable from
  follows+posts on miss; loss = rebuild cost, never data loss. That
  classification answers half the later probes.

## 4. The core decision: fan-out on write vs read vs hybrid (14–24)

- **Fan-out on write (push):** on post, insert post_id into every
  follower's feed_cache. Read = one list fetch (fast, cheap — the
  200 ms budget loves it). Cost: write amplification = followers;
  celebrity posts detonate (the §2 math); wasted work for inactive
  followers (~80% of fan-out lands in feeds never read — say the
  number, it motivates the inactive-user cutoff).
- **Fan-out on read (pull):** feed load = fetch followee list → fetch
  recent posts per followee → merge+rank. No write amplification;
  read cost = K-way merge across ~200 followees per load — 50 k
  feed-QPS × 200 lookups = 10⁷ point-reads/s — the read-side
  non-starter at scale (also: harder to hit 200 ms).
- **Hybrid (the answer):** push for normal authors; **pull for
  celebrities** (per-author follower-count threshold ~10 k–100 k
  [tunable]): reader's feed = their pushed timeline ⊕ merge-in of
  followed-celebrities' recent posts at read time (celebrities are
  few per user — the merge is ~5-way, not 200-way). Plus: skip pushes
  to long-inactive users (rebuild on their return — the view is
  regenerable, so laziness is free correctness).
This three-way with the arithmetic is the interview's core; deliver it
as a decision procedure, not a memorized verdict — *"the threshold is
where write-amplification cost crosses read-merge cost, both of which
we just computed."*

## 5. Deep dives (24–39)

### 5.1 The write path (post → feeds)

Post append (durable, system of record) → outbox event
(`14-.../04-outbox-and-cdc.md` — a post that exists but never fans out
is the dual-write bug wearing a feed costume) → fan-out workers consume:
fetch follower list (sharded reads), batch-insert into follower
feed_caches (idempotent by (user, post_id) — redelivery-safe;
at-least-once bus + idempotent inserts, the standing equation).
Backpressure: fan-out lag is *visible and tolerable* (posts appear over
seconds; backlog age is the SLI) — queue-depth absorption, your
platform's shape (`04-messaging/08`).

### 5.2 Read path (feed load)

feed_cache fetch (one range read) → celebrity merge-in (few authors'
recent-post lists, cached hot — celebrities are, by definition, THE hot
keys and THE most cacheable: same content for millions —
`03-caching/03` §3 ladder pre-applied) → hydrate items (batch fetch post
content + counters from caches — N+1 discipline: one multiget, not 50
gets) → rank (scoring service; degrade to recency on its
timeout/breaker — a *designed brownout*, `05-resilience/06` §2.4) →
paginate.

### 5.3 Pagination

Keyset/cursor by (score/ts, post_id) — never OFFSET
(`02-databases/07` P5): stable under inserts (no repeated/skipped items
as new posts land), O(page) at any depth; cursor = last item's key,
opaque to clients. Feed-specific twist: re-ranking between pages can
reorder — freeze the ranking epoch in the cursor (rank-as-of ts) so a
session paginates one consistent snapshot.

### 5.4 Counters (likes/views) — the sub-problem that's its own design

Live-ish counts on every item at 50 k feed-QPS × 50 items: cached,
approximately-fresh counters (write-heavy aggregation → the ad-click
aggregator shape, `08-...md`); exact-on-click, approximate-in-feed —
error-direction: a stale like-count costs nothing. Never read the
counter's source on the feed path.

## 6. Operations (39–45)

Page on: feed p95 + cache hit ratio; fan-out backlog **age** (posts
invisible to followers = the user-facing symptom); celebrity-merge
latency; scoring-service breaker state (brownout = recency-ranked feeds
— users barely notice, you should). Failure drills: feed_cache cluster
loss → rebuild-on-read storm → ramped admission + rebuild throttling
(the cold-start storm playbook, `03-caching/03` §2.6 — and the
rebuildable-view classification is why it's an incident, not data
loss). 10×: fan-out worker fleet and follower-list read amplification
scale linearly; celebrity threshold re-tunes downward; feed_cache
memory grows with MAU not traffic — the walls are all known and
named.

---

## Probes & traps

- **"Where's the celebrity threshold exactly?"** — not a constant, a
  crossover: push cost (followers × insert cost, paid once) vs pull
  cost (that author merged at read by followers × their feed-loads);
  solve with your own estimates, present the *procedure* — and note it
  can be per-author dynamic (activity-weighted). Trap: quoting "10 k"
  as gospel.
- **"User follows someone new — feed?"** — backfill on next load
  (merge the new followee's recents at read once; optionally
  lazy-insert into the cached timeline) — the view is regenerable, so
  correctness is a read-path patch, not a migration. Unfollow: filter
  at read + lazy purge (don't synchronously scrub timelines). Both
  answers flow from the classification.
- **"Feed shows a deleted post."** — pointers, not copies, in
  feed_cache ⇒ hydration misses the deleted post_id and drops it
  (negative-cache the tombstone) — storing IDs instead of content is
  what makes delete/edit O(1) instead of O(followers); say that as
  the reason for pointer-based timelines.
- **"Why is this easier than your payment platform?"** — the gift
  question: staleness error-direction is benign, feed entries are
  rebuildable views (no recon needed — regeneration IS recon), and
  there's no cross-org boundary; the hard parts (fan-out economics,
  hot keys) are capacity problems, not correctness problems. Showing
  you *rank problem hardness by error direction and rebuildability*
  is the senior close.

## Self-test

1. The celebrity arithmetic: compute both non-starters and state what
   the hybrid buys.
2. Classify feed_cache precisely and derive three design answers from
   the classification.
3. Why pointers (post_ids) in timelines instead of content copies?
   Three consequences.
4. The write path's outbox justification — what's the feed version of
   the dual-write bug?
5. Why keyset pagination, and what's the feed-specific cursor twist?
6. The inactive-user optimization and why it's "free correctness."
7. Ranking-service failure: the designed brownout and its user
   visibility.
8. Follow/unfollow mid-stream: both answers and their common root.
9. Feed counters: which canonical design do they escalate into, and
   what's served on the feed path?
10. Why do feeds need no reconciliation subsystem?

<details>
<summary><b>Answers</b></summary>

1. Pure push: a 100 M-follower post = 10⁸ feed inserts from one write
   — write-amplification non-starter. Pure pull: 50 k feed-QPS × ~200
   followee lookups = 10⁷ point-reads/s and a 200-way merge inside
   200 ms — read-side non-starter. Hybrid: push for the ~all authors
   with small fan-out (reads stay one-fetch cheap), pull-merge for
   the few huge authors (each user follows ~handful of celebrities ⇒
   ~5-way merge) — both explosions defused.
2. A rebuildable materialized view with cache economics: maintained
   on the write path (fan-out), evictable for inactive users,
   regenerable from posts+follows. Answers derived: cluster loss =
   rebuild storm to manage, not data loss (ramp + throttle); skip
   fan-out to inactive users (rebuild on return); new-follow backfill
   is a read-path patch, not a migration.
3. Delete/edit become O(1) (hydration by id reflects current truth —
   no scrubbing O(followers) timelines); timeline entries are tiny
   (~30 B ⇒ 3 TB total feasible); content is fetched through
   item caches shared across all feeds (one hot copy, not millions).
   Cost: hydration fan-in per feed load — batched multigets.
4. Post committed but fan-out event never published ⇒ the post exists
   (author sees it) but no follower ever receives it — silent,
   author-invisible divergence discovered by confused humans. Outbox:
   post row + event in one transaction; fan-out workers consume
   at-least-once with idempotent (user, post_id) inserts.
5. OFFSET is O(depth) and unstable under concurrent inserts (items
   repeat/vanish as new posts shift positions). Keyset on
   (score/ts, id) is O(page), stable. Twist: re-ranking between pages
   reorders items — pin a ranking epoch in the cursor so one session
   paginates a consistent snapshot.
6. ~Most fan-out lands in feeds of users who won't open the app this
   week; skipping pushes to inactive users cuts fan-out volume
   massively, and because the timeline is regenerable on their
   return, nothing is lost — laziness costs a one-time rebuild,
   which the architecture already supports.
7. Scoring-service timeout/breaker ⇒ serve recency-ordered feed
   (the pre-decided fallback): users barely perceive it; the
   dashboard must (breaker state + "brownout mode" metric), because
   engagement silently degrades while everything looks green.
8. Follow: merge the new followee's recent posts at read (optional
   lazy insert). Unfollow: filter at read, purge lazily. Common
   root: the timeline is a regenerable view — correctness patches
   happen at read time; no synchronous timeline surgery.
9. High-rate counting with approximate reads = the ad-click
   aggregator shape (bucketed, idempotent aggregation). Feed path
   serves cached approximate counters (seconds stale, error
   direction free); exact counting stays on the write/analytics
   side.
10. Because every derived artifact (timelines, counters, caches) is
    rebuildable from the system of record (posts + follows), and
    staleness is benign — regeneration IS the reconciliation, and
    divergence self-heals on the next rebuild/read. Recon subsystems
    exist where divergence is (a) not self-healing and (b) harmful —
    money, not memes.

</details>
