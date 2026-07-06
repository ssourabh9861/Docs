# 07 — System Design (Google-calibrated)

**Status: ✅ Complete.** The method doc plus twelve worked designs at
interview depth — each with scoped requirements, decision-attached
estimation, argued trade-offs (rejected alternatives named), two-plus deep
dives, an operations wrap, probes with traps, and a self-test.

## Reading order

Read `00-method.md` first, then designs in any order — but do 01 (your home
turf) and 06 (the fan-out canonical) early.

| # | Design | The load-bearing idea |
|---|--------|----------------------|
| 0 | [Method](00-method.md) | The rubric, the 45-minute choreography, the estimation kit, the anti-checklist |
| 1 | [Payment system](01-payment-system.md) | Ledger-as-double-entry unprompted; the four-wall idempotency chain; scale-appropriate storage |
| 2 | [Rate limiter](02-rate-limiter.md) | The enforcement ladder → local token batches; failure policy per limit class |
| 3 | [Notification system](03-notification-system.md) | Class contracts (transactional vs marketing); a demand-shaping funnel onto rate-limited providers |
| 4 | [URL shortener](04-url-shortener.md) | Calibration: it's a caching problem; counter-batch generation; 302-because-analytics |
| 5 | [Chat](05-chat.md) | Durability before ack; (conv_id, seq) keys; receipts as cursors; order manufactured by sequencers |
| 6 | [News feed](06-news-feed.md) | The celebrity arithmetic → hybrid fan-out as a decision procedure; feed cache as rebuildable view |
| 7 | [Distributed cache](07-distributed-cache.md) | The contract's three legal losses license the whole latency budget |
| 8 | [Ad-click aggregator](08-ad-click-aggregator.md) | Two consumer contracts; raw log as ledger; stream + batch + recon |
| 9 | [Object store](09-object-store-s3.md) | Metadata/data split; durability = redundancy × repair-speed × independence |
| 10 | [Top-K & typeahead](10-top-k-typeahead.md) | Precompute-or-die; prefix tables over tries; count-min for the head |
| 11 | [Distributed scheduler](11-distributed-scheduler.md) | Leases + fencing + outbox-shaped firing; every crash lands on "late or duplicate, never lost" |
| 12 | [Proximity service](12-proximity-service.md) | 2D→1D cells with locality; static vs moving variants flip everything |

## The recurring moves (your design voice across all twelve)

1. **Scope by the five questions; estimate only what decides.**
2. **Per-operation consistency + error direction** — the two lenses that
   appear in every design.
3. **Classify before designing:** cache / store / materialized view /
   ephemeral state — half of every design's probes fall out of the
   classification.
4. **At-least-once + identity = effectively-once** — the standing equation,
   from payments to schedulers.
5. **Write path first (correctness), read path second (scale), operations
   wrap always** — what breaks first, what pages, what the 10× wall is.

## Practice protocol

For each design: read once; three days later, run it cold against a timer
(45 min, out loud, whiteboard); compare against the doc; feed misses into
the spaced-repetition deck (`15-mock-interviews/`). Then have someone run
the probes on you — the traps are calibrated to real interviewer behavior.
