# Versioning and Pagination

The two contract-evolution problems every API meets: how to change without
breaking consumers you can't see (versioning), and how to return collections
that are bigger than a response (pagination). Both have famous wrong answers
that interviewers fish for — and both are disciplines you've already learned
in other clothes (schema evolution on your CDC streams; keyset scans on your
HBase keys).

---

## 1. Versioning

### 1.1 The reframe that wins the question

"How do you version APIs?" is a trap dressed as a menu question. The L5
answer starts one level up: **versioning is the fallback for when
compatible evolution fails — so the first-order design goal is never
needing it.** Additive evolution rules (identical to your stream
discipline, `04-messaging-streaming/07` §3.2):

- Add optional fields freely; never remove, rename, or re-type in place.
- Consumers must ignore unknown fields (tolerant reader — write it into
  the contract; test it in CI with contract tests).
- New behavior behind new fields/endpoints, defaulting to old behavior.
- Breaking change = new *thing* (field v2, endpoint v2), parallel-run,
  migrate, retire — never mutate a live contract.
With that discipline, most APIs live for years on one version. State this
first; then answer the menu.

### 1.2 The menu (when you DO version)

- **URL path (`/v2/payments`):** visible, cacheable, log-greppable,
  trivially routable — the pragmatic default and the industry majority.
  Cost: "resource identity changes with version" purism (ignore it —
  say you're ignoring it and why: operability beats theory here).
- **Header (`Accept: application/vnd.x.v2+json` or custom):** URLs
  stable, content negotiated — elegant, but invisible in logs/browsers,
  awkward for caches (Vary), and confuses every debugging session.
  Right for media-type-centric APIs; rare.
- **Query param (`?version=2`):** the worst of both; avoid (optional
  params get forgotten, defaults drift).
- **Stripe's date-pinning** (worth name-dropping precisely): each
  account pins an API *date*; server-side transforms adapt requests/
  responses across dozens of dated micro-versions. Buys: consumers
  never break, upgrades are opt-in per-account. Costs: a transform
  layer maintained forever — a platform investment few orgs can afford;
  knowing it exists AND why it's expensive is the calibrated take.

### 1.3 Deprecation is the hard 90%

Versioning's real cost isn't routing — it's running N versions forever
unless you can retire them: usage telemetry per version per consumer
(you can't retire what you can't attribute), deprecation headers
(`Deprecation`, `Sunset`) + docs + direct comms, migration windows sized
to consumer reality (external partners: quarters), brownout testing
(deliberate brief 4xx windows before final shutdown — the game-day
instinct applied to contracts), and the org policy that N ≤ 2 live
versions. Internal APIs: consumer-driven contract tests let you move
faster (you can see all callers; Google's internal reality —
monorepo + visibility — is why internal versioning is rare there;
worth saying in a Google interview).

---

## 2. Pagination

### 2.1 Offset — and why it dies

`GET /payments?offset=50000&limit=20`: the store walks and discards
50 000 entries per request — O(offset) cost (`02-databases/07` P5's
mechanism), and **unstable under mutation**: an insert at position 3
between page reads shifts everything — items repeat or vanish across
pages (the duplicate-row-in-the-export bug every team meets once).
Acceptable only for: small bounded collections, admin UIs needing
page-jump, and SQL-generated internal reports.

### 2.2 Cursor/keyset — the production answer

Response carries an **opaque cursor** encoding the last item's sort key:
`GET /payments?cursor=eyJ0cyI6...&limit=20` →
`WHERE (created_at, id) < (:ts, :id) ORDER BY created_at DESC, id DESC` —
O(page) at any depth, stable under inserts, and it maps 1:1 onto your
storage reality (an HBase scan-from-rowkey IS keyset pagination —
`02-databases/03` P5's connection; your platform paginates this way by
construction).

Cursor design rules (where the depth points live):
- **Opaque to clients** (base64 of key material + filter fingerprint) —
  the moment clients parse cursors, your sort key is a public contract.
- **Total order required:** the sort key needs a tiebreaker (unique id
  appended) or rows with equal timestamps are skipped/duplicated at page
  boundaries — the subtle bug interviewers plant.
- **Bind the cursor to its query:** encode a hash of the filters; a
  cursor replayed against different filters must 400, not silently
  return nonsense.
- **Expiry/validity:** cursors over live data are best-effort snapshots;
  document that deleted items vanish and new items may not appear
  mid-walk (or pin a snapshot/as-of point for export-grade walks —
  the ranking-epoch trick from `07-system-design/06` §5.3).

### 2.3 The questions that always ride along

- **Total counts:** `COUNT(*)` over filtered millions is a full scan
  per page view — offer none, an estimate, or a capped count
  ("10 000+") — and say which the product actually needs (usually
  "has_more", which the +1-row-fetch trick answers for free).
- **Page size:** server-enforced max (someone WILL send limit=10⁶ —
  it's a load-shedding boundary, `05-resilience/06`), default ~20–100.
- **has_more/next link:** fetch limit+1 rows, return limit, set
  has_more — one query, no count.

---

## 3. Senior-level depth

- **Compatibility is a *tested* property, not a policy:** contract
  tests in CI (schema diffing against the published OpenAPI; consumer-
  driven contracts for internal callers) — the registry-compatibility-
  gate pattern (`04-messaging-streaming/07` P3) for synchronous
  surfaces. "We're careful" is not a mechanism.
- **Versioning across the whole surface:** the API version is only one
  contract — error codes, webhook payloads (`04-webhooks.md`), event
  schemas, and cursor formats all evolve; the additive-first rule
  governs all of them, and webhook payload changes are the most-
  forgotten breaking change in the industry.
- **L4/L5/L6:** L4 picks /v1/ and offset because familiar. L5 leads
  with additive evolution, versions as last resort with a deprecation
  machine, ships opaque keyset cursors with tiebreakers and filter
  binding. L6 runs the governance: compatibility gates, version-count
  budgets, deprecation as product policy, org-wide cursor/error/
  header conventions.

## 4. Resume connection + spoken answer

Your platform: additive evolution is your CDC/protobuf discipline;
keyset pagination is your storage's native shape; your partner-facing
contracts (SM response codes via config-driven resolver) are
version-tolerance machinery — one story, three surfaces.

**30–60 s spoken answer** ("how do you version and paginate?"):

> "Versioning starts with not versioning: additive evolution — add
> optional fields, never remove or re-type, tolerant readers enforced by
> contract tests in CI — the same discipline as our event-schema
> evolution, because a synchronous API is just another contract surface.
> When a break is unavoidable: new endpoint or path version, parallel-
> run, migrate with per-consumer usage telemetry — you can't retire what
> you can't attribute — deprecation and sunset headers, and brownout
> tests before shutdown. The hard part is never the routing; it's the
> deprecation machine. Pagination: keyset cursors, never offset — offset
> is O(depth) per request and unstable under concurrent inserts, where
> a keyset cursor is O(page) at any depth and maps directly onto how
> ordered stores actually scan; our HBase pagination is keyset by
> construction. Cursor discipline: opaque to clients, total order with
> a unique tiebreaker so equal sort keys don't skip rows at page
> boundaries, bound to a fingerprint of the filters so a replayed
> cursor can't silently lie, and has-more from the limit-plus-one fetch
> instead of a count, because counting filtered millions is a full scan
> nobody budgeted."

## Self-test

1. State the versioning reframe and the four additive-evolution rules.
2. The versioning menu: four options with the calibrated take on each.
3. Why is deprecation "the hard 90%"? Five elements of the machine.
4. Offset pagination: both failure modes, and where it remains
   acceptable.
5. Keyset mechanics: the WHERE clause shape and why it's O(page).
6. Four cursor-design rules and the bug each prevents.
7. The total-count problem and three honest answers.
8. Why must page size be server-capped? Which discipline does it
   belong to?
9. What's the most-forgotten breaking change in industry practice?
10. Connect both halves of this doc to two disciplines you already
    run.

<details>
<summary><b>Answers</b></summary>

1. Versioning is the fallback for failed compatible evolution — design
   to never need it. Rules: additive-only (new optional fields);
   never remove/rename/re-type in place; tolerant readers (ignore
   unknown fields, contract-tested); breaking changes become new
   parallel things (field/endpoint), migrated then retired.
2. URL path: visible, routable, log-friendly — pragmatic default
   (accept the purist objection knowingly). Header/media-type:
   elegant, invisible in logs, cache-awkward — niche. Query param:
   forgettable defaults, avoid. Stripe date-pinning: consumers never
   break, upgrades opt-in — bought with a permanent server-side
   transform layer few orgs can staff.
3. Because running N versions forever is the real cost. Machine:
   per-version-per-consumer usage telemetry; Deprecation/Sunset
   headers + comms; migration windows sized to consumer type;
   brownout tests before shutdown; org budget of ≤2 live versions
   (and consumer-driven contract tests internally).
4. O(offset) walk-and-discard per request (deep pages linearly
   slower); instability under mutation (inserts/deletes shift
   positions — rows repeat or vanish across pages). Acceptable:
   small bounded sets, admin page-jump UIs, one-off internal
   reports.
5. WHERE (sort_key, id) < (:cursor_key, :cursor_id) ORDER BY
   sort_key DESC, id DESC LIMIT k — a composite-index descent to the
   cursor position then k sequential reads: cost proportional to the
   page, independent of depth; inserts land before or after the
   cursor position without shifting it.
6. Opaque encoding — else the sort key becomes an unbreakable public
   contract; unique tiebreaker in the total order — else equal-key
   rows skip/duplicate at boundaries; filter fingerprint bound in —
   else a cursor replayed with different filters returns silent
   nonsense; documented validity/expiry — else clients treat a live
   walk as a consistent snapshot and file bugs about mutation
   artifacts.
7. Exact COUNT over filtered millions = full scan per page. Honest
   answers: no count (has_more only, via limit+1 fetch); estimated
   count (planner statistics — labeled as estimate); capped count
   ("10 000+", stop counting at the cap). Pick by what the product
   actually renders.
8. Unbounded limits are a self-DDoS vector (one limit=10⁶ request =
   a table scan + a giant response); the cap is admission control —
   load-shedding discipline applied at the contract boundary.
9. Webhook/event payload changes: teams version their REST surface
   carefully, then add/rename fields in webhook bodies without
   notice — breaking consumers who parse strictly. The additive
   rules govern every emitted contract, not just request/response.
10. Additive evolution = the protobuf/schema-registry discipline from
    the CDC pipeline (field numbering, compatibility gates). Keyset
    pagination = the HBase scan-from-rowkey model — your storage
    paginates by cursor natively, and exposing it is the honest
    contract.

</details>
