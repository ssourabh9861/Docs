# Worked Design 7: Distributed Cache (Build Redis/Memcached)

The "build the infrastructure you usually use" genre — interviewers use it to
check whether your caching knowledge is consumer-level or mechanism-level.
You have an unfair advantage: `02-databases/06-aerospike-internals.md` is
essentially this design's answer key, and `03-caching/*` supplies the
semantics. The trap of the genre: importing database guarantees into a cache
and destroying the latency budget that justified it.

**Prompt:** "Design a distributed cache — like Memcached/Redis — as a
service for hundreds of internal teams."

---

## 1. Requirements & scope (0–5)

Functional: GET/SET/DELETE with per-key TTL; atomic ops (INCR, CAS) — ask
whether data structures (lists/sets) are needed; assume flat KV (say why:
structures triple the design; Redis vs Memcached in one fork). Multi-tenant:
namespaces with quotas.

Non-functional — **the contract IS the design; state it aggressively:**
- Sub-ms p99 (RAM path, one network hop — everything bends to this).
- **It's a cache:** misses are legal, eviction is legal, and — the decision
  most candidates dodge — **acked-write loss on node failure is legal**
  (callers must treat it as a cache; the `03-caching/01` classification as
  a *service contract*). This one sentence licenses async replication,
  cheap failover, and the whole latency budget. If a team needs
  store-semantics, that's a different SKU (Aerospike-style persistence) —
  offering the fork explicitly is the senior move.
- Scale: 10 M ops/s aggregate, 10 TB across the fleet, single-digit-ms
  failover.

## 2. Estimation (5–9)

10 M ops/s ÷ ~100–500 k ops/node (single-threaded event loop vs
multi-threaded — the Redis/Memcached fork again) ⇒ ~30–100 nodes. 10 TB ÷
~64–128 GB RAM/node ⇒ ~100–150 nodes — memory bounds the fleet, not CPU
(**which means**: per-entry overhead matters — ~50–100 B/entry metadata;
small values are overhead-dominated, `03-caching/04` §2.2). Network: 10 M ×
1 KB = 10 GB/s aggregate — NIC-comfortable spread over the fleet.

## 3. Architecture (9–24)

- **Partitioning:** consistent hashing with virtual nodes OR fixed
  partition count (4096) with a deterministic map — present both, pick
  fixed-count for operational predictability (the
  `01-distributed-systems/04` §2.2 trade, and Aerospike's answer).
- **Routing: smart clients** holding the partition map (pushed on cluster
  events) → one hop, no proxy tier (a proxy costs ~0.3–0.5 ms of the
  ~1 ms budget — the estimation kills the proxy; say the arithmetic).
  Map staleness → MOVED-style redirect + refresh (the eventually-
  consistent routing protocol).
- **Node internals:** hash table + per-key TTL wheel; eviction = sampled
  LRU/LFU (true LRU bookkeeping too expensive — the Redis detail,
  `03-caching/04` §1); single-threaded event loop per shard-core
  (predictable latency, no locks) with N shards/node.
- **Replication (the contract pays off):** async primary→replica per
  partition; failover = promote replica on failure detection
  (`01-distributed-systems/07` — aggressive timeouts are fine BECAUSE
  wrong failovers only lose cache entries); acked-but-unreplicated
  writes lost = contractually fine. No quorums, no fsync — that's what
  sub-ms buys.
- **Memory management:** slab allocation (memcached-style size classes)
  to fight fragmentation — the classic deep-dive: fragmentation from
  mixed value sizes can waste 20–50% of RAM; slabs trade internal
  fragmentation (rounded-up sizes) for allocator stability; mention
  jemalloc as Redis's answer.
- **Multi-tenancy:** per-namespace memory quotas + eviction isolation
  (tenant A's flood must not evict tenant B — per-tenant LRU domains) +
  per-namespace ops/s limits (`05-resilience/05` — the limiter reappears
  as a platform feature).

## 4. Deep dives (24–39)

- **CAS/atomics:** per-key version counters checked on write — trivially
  correct on a single-threaded owner (no cross-node coordination:
  the key lives in exactly one partition) — ownership manufactures
  atomicity, the standing theme.
- **Node death end-to-end:** detector fires (~1–3 s) → replica promotes →
  map v+1 pushed → clients re-route; lost: unreplicated writes (fine) +
  the dead node's un-replicated share if RF=1 (a miss storm — which is
  the REAL cost of cache-node death: the *source* takes the misses;
  `03-caching/03` §2.6 cold-start playbook applies — this connection is
  the senior moment of the whole design).
- **Hot keys:** per-key ops counters → detect → client-side L1 for
  flagged keys + key replication (`03-caching/03` §3 ladder, now as a
  *platform feature* with automatic detection).
- **What guarantee do you sell?** Best-effort freshness: no cross-replica
  read consistency promises (failover may resurrect older values,
  async replicas lag) — document "cache may return stale or nothing;
  never use as source of truth," and enforce culturally via the
  classification doctrine. The interviewer who asks "what if a team
  stores checkout carts in it?" gets: quota'd namespaces + the
  store-SKU fork + the governance answer (L6 flavor).

## 5. Operations (39–45)

Page on: p99 per namespace, hit ratio per namespace (blended lies —
`03-caching/04` §2.3), eviction age (thrash detector), fragmentation ratio,
map-churn rate. 10×: linear node adds (fixed partitions migrate
predictably); the walls are hot keys and per-namespace governance, not
throughput.

---

## Probes & traps

- **"Why not strong consistency between replicas?"** — quorum writes cost
  a round trip + coordination on EVERY op, tripling the latency budget to
  protect data that is *by contract* evictable copies; the correct spend
  of the latency budget is misses-and-staleness tolerance at the client
  (`08-cap-pacelc.md` PACELC: this is EL, chosen loudly). Trap: agreeing
  to "just add quorums" — you'd have built a slow store, not a cache.
- **"Redis or Memcached — which are you building and why?"** — the fork:
  data structures + richer semantics + single-threaded simplicity
  (Redis) vs multi-threaded flat-KV throughput (Memcached). For a
  multi-tenant platform cache: flat KV, sharded event loops —
  structures invite store-usage of a cache (the misuse you're trying to
  prevent). Knowing the fork's *governance* dimension beats the
  performance trivia.
- **"A client's map is stale during a migration — walk the request."** —
  request hits old owner → MOVED/redirect with new epoch → client
  refreshes map → retry → hit; during the window, brief double-routing
  is safe because worst case is a miss (cache semantics absorbing
  routing races — another payoff of the contract).
- **"Persistence — teams want warm restarts."** — the honest fork:
  snapshot-to-disk for warm-start (bounded staleness on restore, fine
  for a cache) ≠ durability promises (still no acked-write guarantee);
  if they need durability, that's the store SKU. Restart-warming exists
  to protect the *source* from the cold-start storm, not to protect the
  data — the purpose distinction is the answer.

## Self-test

1. State the service contract's three "legal losses" and what each
   licenses architecturally.
2. Why smart clients over a proxy tier? Show the budget arithmetic.
3. Fixed partitions vs consistent hashing here — the operational
   argument.
4. Why is async replication correct for this system when it's wrong
   for a database?
5. Slab allocation: the problem, the mechanism, the trade.
6. Node death: what's actually lost, and what's the REAL cost?
7. How do you get atomic CAS without distributed coordination?
8. Multi-tenant eviction isolation: the failure it prevents.
9. What do you tell the team storing carts in your cache?
10. Where does the latency budget actually go (component by
    component) in a 1 ms p99?

<details>
<summary><b>Answers</b></summary>

1. Misses legal (clients must handle absence → no availability
   heroics needed); eviction legal (memory pressure resolves locally
   → no capacity coordination); acked-write loss on failure legal
   (→ async replication, instant promotion, no fsync/quorums —
   the entire latency budget).
2. Proxy adds a hop: ~0.3–0.5 ms of a ~1 ms budget — 30–50% spent on
   routing. Smart clients cache the partition map and go direct;
   map staleness is handled by redirect-and-refresh, whose worst
   case (a miss) is contractually free.
3. Fixed count (4096-style): deterministic map, predictable
   migration units, no vnode variance tuning; membership change
   moves only affected partitions. Consistent hashing works but
   adds ring-balance tuning for no benefit at platform scale
   (`01-distributed-systems/04` §2.2).
4. A database's acked write is a durability promise — losing it is
   silent wrongness. Here the contract says copies-not-truth, so
   the failure converts to a miss (visible, self-healing via the
   source). Same mechanism, opposite verdict — because the
   contract differs.
5. Mixed value sizes fragment general-purpose allocators (20–50%
   waste over time). Slabs: memory carved into size-classes;
   each allocation rounds up to its class — internal fragmentation
   (bounded, measurable) traded for external stability and O(1)
   alloc/free.
6. Lost: unreplicated recent writes (contractually fine) and — if
   under-replicated — the node's share of cached entries. Real
   cost: the miss storm hitting the SOURCE (DB) for that key
   share — cache-node death is a source-load event, mitigated by
   the cold-start playbook (ramps, coalescing, warming).
7. Each key lives in exactly one partition owned by one node
   running a single-threaded event loop — all ops on a key are
   naturally serialized; CAS = compare version, write, no locks,
   no consensus. Ownership manufactures atomicity.
8. One tenant's write flood filling shared LRU evicts every other
   tenant's working set — noisy-neighbor eviction. Per-namespace
   quotas + per-tenant eviction domains cap the blast radius
   (bulkhead thinking in RAM).
9. The contract conversation: this tier may evict, lose on
   failover, and return stale — carts will vanish. Options:
   the persistent store SKU (Aerospike-class), or a real DB with
   this cache in front. Then the platform answer: namespace
   quotas and (ideally) linting/review gates that catch
   store-usage-of-cache patterns.
10. Client hash+map lookup ~µs → network hop ~100–500 µs
    (dominant) → event-loop queue + hash lookup ~1–10 µs →
    response hop. The budget is ~80% network — which is why the
    proxy dies, why locality/topology matters, and why node-side
    work must stay lock-free and O(1).

</details>
