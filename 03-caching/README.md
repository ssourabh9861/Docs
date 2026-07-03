# 03 — Caching

**Status: ✅ Complete.** Four documents on the five-part contract, each ending
in a hidden-answer self-test. The organizing insight of the directory: your
platform's "cache tier" is mostly *not* a cache — and the
cache/store/materialized-view classification sharpens every answer you give.

## Reading order

| # | Document | One-line takeaway |
|---|----------|-------------------|
| 1 | [Cache patterns](01-cache-patterns.md) | Cache-aside/read-through/write-behind with the risk ledger, the cache/store/view triangle, and your Aerospike tier correctly classified |
| 2 | [Invalidation & consistency](02-invalidation-and-consistency.md) | The stale-set race and leases, delete-after-commit, CDC-driven invalidation, direction-of-staleness — "push for latency, pull for truth" |
| 3 | [Stampedes & hot keys](03-stampedes-and-hot-keys.md) | K ≈ QPS × C, coalescing/SWR/XFetch/jitter, the cold-start storm, the hot-key ladder — and your rewards view as stampede prevention by design |
| 4 | [Eviction & sizing](04-eviction-and-sizing.md) | LRU/LFU failure modes, W-TinyLFU's admission insight, miss-ratio thinking (10× per nine), the three miss types |

## The five sentences to walk into any interview with

1. "Classify before designing: a cache holds evictable copies, a store holds
   authoritative state, a materialized view is maintained and rebuildable —
   and our fast tier holds one of each."
2. "TTL is the recon of caching: it bounds staleness duration regardless of
   cause, which is why it stays even when event-driven invalidation exists."
3. "Prefer delete over update, invalidate after commit, and fix the
   stale-set race with leases — or derive invalidation from CDC and you
   can't invalidate what didn't commit."
4. "Stampede severity is QPS × recompute-cost: coalesce to cap the cost,
   jitter and stale-while-revalidate to control the timing — and we designed
   ours out by making the aggregate a write-path view."
5. "Past 90%, think in miss-ratio: 99 to 99.9 is a 10× cut in source load,
   and at 1% misses your p99 IS the miss latency."

## Self-test discipline

Cold self-tests ≥3 days after reading; misses go to the spaced-repetition
deck (`15-mock-interviews/` when written).
