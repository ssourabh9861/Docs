# Worked Design 8: Ad-Click Aggregator

The streaming-aggregation canonical — and secretly *your* design: counting
events correctly under at-least-once delivery, with money attached (clicks =
billing), is the rewards system plus reconciliation wearing ad-tech clothes.
Say that early; it converts a "studied" answer into an "operated" one.

**Prompt:** "Design a system that counts ad clicks: advertisers are billed
per click; dashboards show near-real-time counts per ad."

---

## 1. Requirements & scope (0–5)

Functional: ingest click events (ad_id, click_id, user/device, ts); serve
counts per ad per time window (minute/hour/day) — two consumers with
**different contracts**: dashboards (seconds-fresh, approximate acceptable)
and **billing (exact, auditable, disputable)** — the two-contract split is
the design's spine, say it in minute one. Also: click fraud/dedup (same
user hammering an ad) — ask how deep; assume dedup-by-click-ID plus basic
rules, fraud-ML out of scope.

Non-functional: 10 k clicks/s avg, 50 k peak (big ad platform); no lost
clicks (money), duplicates must not bill (money — both error directions
matter here, unusually); dashboard lag ≤ ~10 s; billing closes daily with
dispute support (audit trail).

## 2. Estimation (5–9)

50 k/s × ~200 B event ≈ 10 MB/s — trivial bus load. Raw retention (the
audit trail): 10 k/s avg ≈ 10⁹/day × 200 B ≈ 200 GB/day, ~90 d ≈ 18 TB —
cheap object/wide-column storage; **which means**: keep every raw click —
the raw log is the ledger, aggregates are derived views (the
events-and-projections shape, `14-.../04-outbox-and-cdc.md` §2.4).
Aggregate storage: ads × windows — 10 M ads × minute-buckets × 1 d ≈
1.4×10¹⁰ rows/day worst case, but sparse (only clicked ads have rows) —
time-bucketed wide-column keys (`02-databases/01` P4's time-series
pattern).

## 3. Architecture (9–24)

```
Click (from ad-serving edge, signed) → ingest API (validate, assign
event-time ts) → BUS (Kafka/Pulsar, keyed by ad_id, raw topic = the
system of record after landing to cold storage)
  ├→ STREAM PATH: windowed aggregation (per ad × minute), dedup by
  │   click_id, watermark-driven → serving store (dashboards)
  └→ BATCH/RECON PATH: hourly/daily jobs over the raw log → exact
      aggregates → billing store; recon compares stream vs batch.
```
This is the lambda shape, argued honestly: the stream path buys freshness
with at-least-once + best-effort lateness handling; the batch path over
the immutable raw log is *recomputable truth* for money; recon between
them is the detector (`14-.../05-reconciliation.md` — mismatch rate as a
deploy-health signal). Modern kappa-style alternative (one stream engine
with exactly-once state + replay for corrections) — present it, then note
billing/dispute still wants the raw log + batch recompute, so the raw log
never goes away; the debate is only about the fast path's engine.

**Dedup (the money-critical mechanism):** click_id minted at the edge
(one per impression-click — the identity, `05-resilience/07`); aggregation
is **idempotent bucketed counting**: never `count += 1` on redelivery-
prone input — either (a) exactly-once state inside the stream engine
(Flink checkpointed keyed state — scope caveat ready:
`04-messaging-streaming/04` §3.1), or (b) at-least-once + dedup store
(click_id set with TTL ≥ redelivery horizon) before increment, or
(c) recompute-from-raw (batch path — idempotent by construction). You run
(b)+(c) philosophy in production; say so.

## 4. Deep dives (24–39)

### 4.1 Event time, watermarks, late clicks

Clicks arrive late (mobile offline queues, retries): window by **event
time**, not arrival (`04-messaging-streaming/03` §3.1). Watermark = "I
believe all events ≤ T have arrived" (heuristic: max-event-time − slack);
windows finalize at watermark + allowed-lateness; later stragglers →
side-output → **corrections** to already-served windows. The design
decision: dashboards show provisional-then-corrected values (fine);
billing windows close ONCE, at batch time, hours later — lateness beyond
that lands in the *next* billing cycle by policy (a business rule, stated,
not an engineering accident). This provisional/final split is the whole
event-time discussion made concrete.

### 4.2 Hot ads (skew)

One viral ad = one hot key in keyed aggregation
(`01-distributed-systems/04` P3): two-stage aggregation — stage 1
pre-aggregates per (ad_id, random salt 0..N) partial counts; stage 2 merges
partials per window. Classic map-side-combine; converts a single hot
reducer into N warm ones at the cost of a merge step.

### 4.3 Serving store

Wide-column, key (ad_id, granularity, window_start) — point gets and
small range scans for dashboard charts; roll-ups (minute→hour→day)
computed downstream, immutable-once-final; TTL minute-grain after ~days
(the retention-by-granularity pattern).

## 5. Operations (39–45)

Page on: end-to-end freshness (click → dashboard age), watermark lag,
dedup-store health, **stream-vs-batch recon mismatch rate** (the leading
indicator — a dedup bug or dropped partition shows here first), DLQ age
on the aggregation consumers. 10×: bus and batch scale linearly; the
dedup store's ops/s and the hot-ad salting factor are the tunables.

---

## Probes & traps

- **"Why both stream and batch — isn't Flink exactly-once enough?"** —
  scope the claim (`04-messaging/04` P2): exactly-once *state within the
  engine*; billing additionally needs audit/recompute/dispute against an
  immutable raw log, and corrections-after-close need a policy either
  way. The raw log + recompute isn't a legacy artifact; it's the ledger.
  Trap: either dismissing Flink (it genuinely simplifies the fast path)
  or believing the marketing scope.
- **"Same user clicks 50 times."** — three different questions layered:
  transport duplicates (same click_id — dedup store, effectively-once);
  *distinct* clicks by one user (real events — count, but flag: billing
  rules cap per-user-per-ad frequency — a business rule the pipeline
  enforces, not invents — the delivery-dedup vs business-dedup line,
  `00-resume-arsenal/02` B1); bot fraud (out-of-scope ML, but the raw
  log + device signals are its feedstock). Separating the three IS the
  answer.
- **"Advertiser disputes yesterday's bill."** — the audit path: raw
  immutable log → recompute the window → compare with billed aggregate →
  ledger-grade adjustment entry if wrong (never edit the aggregate —
  reversing entries, `14-.../06` §2.8). Billing without a recompute path
  is billing without a defense.
- **"Dashboard says 10,432; billing says 10,398."** — expected, by
  design: provisional (watermark-closed, stream-path) vs final
  (batch-closed) — the two contracts diverge within a declared bound;
  recon monitors the bound. Trap: promising they'll match — you'd be
  promising away your own lateness policy.

## Self-test

1. The two consumer contracts and the design element each one owns.
2. Why is the raw click log "the ledger"? Three things it enables.
3. Three implementations of duplicate-safe counting and where each
   fits.
4. Event time vs processing time here; what's a watermark and what
   does allowed-lateness trade?
5. The provisional/final split: who sees which, and where does a
   3-hour-late click go?
6. The hot-ad fix, mechanically.
7. Serving-store key design and the retention pattern.
8. Why does recon-between-paths exist even if both paths are
   "correct"?
9. The three layers of "same user clicks 50 times."
10. Map this design onto your rewards system: five correspondences.

<details>
<summary><b>Answers</b></summary>

1. Dashboards: seconds-fresh, approximate/provisional acceptable —
   owns the stream path (watermarks, corrections). Billing: exact,
   auditable, close-once — owns the raw log, batch recompute,
   dispute/adjustment machinery.
2. Immutable raw events enable: recompute (any window, any bug, any
   time — aggregates are derived views); audit/dispute defense
   (show the clicks behind the bill); and future consumers (fraud
   ML, new aggregations) without re-instrumentation — the
   event-sourcing dividend.
3. (a) Exactly-once keyed state in the stream engine (Flink) —
   fast path, scope-limited to the engine; (b) at-least-once +
   click_id dedup store before increment — engine-agnostic, needs
   TTL ≥ redelivery horizon; (c) recompute-from-raw — idempotent by
   construction, the batch/billing path and the universal repair.
4. Windows keyed by when the click *happened* (event ts), since
   arrival lags vary (offline devices, retries). Watermark: a
   heuristic claim that events ≤ T have arrived (max-seen − slack),
   triggering window finalization. Allowed-lateness trades
   freshness (windows stay open longer) against correction volume
   (fewer post-close stragglers).
5. Dashboards see provisional counts that may be corrected
   (watermark-closed + correction stream). Billing sees final
   counts closed once at batch time. A 3-hour-late click: dashboard
   correction if within stream lateness; for billing, lands in the
   next cycle per stated business policy — a rule, not an accident.
6. Two-stage aggregation: stage 1 counts per (ad_id, salt 0..N) —
   the hot key becomes N warm partials on different partitions;
   stage 2 sums partials per (ad, window). Map-side combine —
   write-spread bought with one merge hop.
7. (ad_id, granularity, window_start) — dashboard queries are point
   gets and short range scans per ad; time-bucketed keys make
   retention = drop-by-granularity (minute rows TTL after days,
   hourly after months) — the time-series pattern.
8. Because "correct" components still diverge via bugs, config
   drift, partial outages, and lateness-policy edges — recon
   compares outcomes without needing a failure model, and its
   mismatch rate is the earliest detector of a broken dedup store
   or dropped partition (the unknown-unknowns argument).
9. Transport duplicates (one click_id delivered twice — dedup,
   never billed twice); genuine repeat clicks (distinct events —
   counted, then capped by billing frequency rules: business
   dedup); fraud (bots — flagged from raw log + signals, ML layer).
10. Raw clicks ↔ raw reward rows (ground truth); aggregates ↔ the
    checkpoint-based aggregate (derived, rebuildable); click_id
    dedup ↔ natural-key + is_aggregated marker idempotency;
    batch recompute ↔ re-derivation-from-scan on uncertain paths;
    stream-vs-batch recon ↔ your recon/invariant checkers as
    deploy-health signals.

</details>
