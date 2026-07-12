# TLS — Handshakes, Resumption, mTLS, and Why HMAC Still Exists

TLS is the layer everyone uses and few can narrate. Interviewers reach for
it two ways: the mechanics probe ("walk me through the handshake") and the
judgment probe ("you have TLS — why do your webhooks also use HMAC?"). The
second one is aimed at you specifically, and this doc arms both.

---

## 1. Plain definition

TLS gives an application three properties over an untrusted network:
**confidentiality** (eavesdroppers see ciphertext), **integrity**
(tampering is detected), and **authenticity** (you're talking to who the
certificate says — normally server-authenticated only; mTLS adds the
client side). Mechanically it's a bootstrap: use expensive **asymmetric**
crypto once to authenticate and agree on keys, then run the actual
conversation under cheap **symmetric** encryption.

The trust model in one paragraph: the server presents a **certificate** —
its public key plus identity (hostnames in the SAN), signed by a
**certificate authority (CA)**; the client validates the signature chain
up to a CA it already trusts (the OS/JVM trust store), checks the
hostname matches, checks validity dates. Trust is *delegated*: you trust
the endpoint because you trust the CA that vouched for it. Every TLS
failure mode is a failure of one link in that chain — expired cert, wrong
SAN, untrusted/internal CA missing from a trust store (the
"works-on-curl, fails-in-the-JVM" classic).

---

## 2. How it works in practice

### 2.1 The handshake, and what 1.3 fixed

- **TLS 1.2:** ~2 RTTs of handshake before application data (hello/
  cert exchange, then key exchange/finished) — stacked on TCP's 1 RTT,
  a cold HTTPS connection cross-region = ~3 × 100 ms before byte one.
- **TLS 1.3 (the modern baseline):** **1 RTT** — the client sends its
  key share optimistically in the first flight; the server responds
  with its share, certificate, and is ready. Also: legacy/broken
  options removed wholesale — only ephemeral (ECDHE) key exchange
  survives, making **forward secrecy** mandatory (compromise of the
  server's long-term key later does NOT decrypt recorded past
  sessions, because session keys came from ephemeral exchanges that
  were discarded). "1.3 = 1-RTT + forward-secrecy-only + smaller attack
  surface" is the summary to carry.
- **Session resumption:** returning clients present a **session ticket**
  and skip the full handshake. 1.3 adds **0-RTT early data** —
  application data in the very first flight — with the famous caveat
  (§3).

### 2.2 mTLS (mutual TLS)

Both sides present certificates — the client proves identity too.
This is the workhorse of **service-to-service identity** inside
platforms (and what service meshes automate: sidecars carry
workload certs, rotate them hourly, and enforce peer identity —
`08-api-design/06` §4's east-west layer). Versus API keys: an mTLS
identity is unforgeable-without-the-private-key, mutually
authenticated at the transport layer, and rotatable centrally; an API
key is a bearer secret that leaks into logs and configs. Cost:
certificate lifecycle infrastructure (issuance, rotation, revocation) —
which is exactly what meshes exist to amortize.

### 2.3 Termination topology

Where TLS ends is an architecture decision: **edge termination** (LB/
gateway decrypts; plaintext or re-encrypted hops inside) vs
**end-to-end** (terminate at the service). Edge termination centralizes
cert management and lets L7 LBs route on content (`05-load-balancing.md`),
but everything behind the terminator must be trusted-or-re-secured —
which is why "TLS everywhere internally" (via mesh mTLS) became the
norm as trust boundaries shrank. Say the trade, not a dogma.

### 2.4 Operational reality

- **Cert expiry is the classic correlated outage** — the same cert (or
  the same forgotten renewal) takes out every "redundant" replica at
  the same instant (`01-distributed-systems/01` §3's list; it's on it
  for a reason). Modern answer: short-lived auto-renewed certs
  (ACME/Let's Encrypt-style, mesh-issued hourly certs) — rotation as a
  *continuously exercised* path instead of an annual ritual.
- **Revocation is quietly broken:** CRLs/OCSP checks are slow,
  soft-fail, and widely skipped — the industry's working answer is
  short lifetimes (revocation by expiry). One sentence of honesty
  interviewers respect.
- **JVM specifics you own:** trust stores (internal CAs must be
  installed — the works-in-curl bug), and TLS handshake CPU (a
  handshake costs real CPU ~ms-scale asymmetric ops; at gateway QPS,
  session resumption and keep-alive pools are CPU decisions, not just
  latency ones — reason #4 for connection pools, completing
  `01-tcp.md`'s ledger).

---

## 3. Senior-level depth

- **0-RTT's replay problem (the best TLS interview moment, and it's
  yours):** early data rides *before* the handshake completes, so a
  network attacker can **capture and replay** the 0-RTT flight — the
  server may execute it twice. TLS itself cannot prevent this; the
  spec's answer is "only send replay-safe (idempotent) requests as
  early data." So: 0-RTT GETs fine; **0-RTT payment POSTs never** —
  unless the application layer is idempotency-keyed, at which point
  your `05-resilience/07` machinery is literally what makes a transport
  optimization safe. The lens you already own — "which operations
  survive replay" — turns out to gate a TLS feature.
- **Why HMAC webhooks when TLS exists** (the judgment probe aimed at
  you): TLS authenticates the *channel* between two hops; HMAC
  authenticates the *message* end-to-end. Differences that matter:
  (1) TLS terminates — at their LB, your LB, proxies — and asserts
  nothing once the payload is past the terminator or at rest in a
  queue; the HMAC travels *with the body* through buffers, queues
  (your Pulsar-buffered callbacks!), retries, and storage.
  (2) TLS proves "some client connected to me"; HMAC proves "the
  holder of *this partner's* secret produced *this exact payload*" —
  sender authentication at message granularity. (3) The signature is
  *verifiable later* (audit/dispute: "they did send this"). Channel
  security and message authenticity are different layers; payments
  want both.
- **What TLS doesn't protect:** metadata (SNI/hostnames historically,
  traffic timing/volume), compromised endpoints, and anything after
  termination. Framing TLS as one layer of defense-in-depth — not
  "encrypted = secure" — is the calibration signal.
- **L4/L5/L6:** L4 "TLS encrypts traffic; certs prove identity." L5:
  1.3's 1-RTT + forward secrecy, resumption and the 0-RTT replay
  gate, mTLS vs API keys, termination trades, cert-expiry as
  correlated failure, and the channel-vs-message HMAC distinction.
  L6: PKI as platform (mesh-issued short-lived certs, rotation as
  routine, trust-domain design), and crypto-agility posture.

## 4. Resume connection + spoken answer

Everything partner-facing you run is TLS + HMAC layered (Juspay/SM
callbacks), secrets in Cryptex, JVM trust-store realities, and your
0-RTT answer writes itself from your idempotency chain. **[VERIFY: does
your platform run internal mTLS / mesh, or perimeter-trust with
app-layer auth? Know which — "describe your internal trust model" is a
fair follow-up.]**

**30–60 s spoken answer** ("you have TLS — why do webhooks need HMAC?"):

> "Because TLS authenticates the channel and HMAC authenticates the
> message, and they fail differently. TLS terminates — at their load
> balancer, at ours — and once the payload is past the terminator, TLS
> asserts nothing about it; our callbacks are also buffered through a
> queue and retried, and the HMAC travels with the body through all of
> that. Second, identity granularity: TLS on an inbound callback proves
> some client reached us; the HMAC proves the holder of this specific
> partner's secret produced this exact payload — sender authentication
> per message, and it's verifiable later for dispute and audit. So
> channel security and message authenticity are different layers, and
> money wants both — plus a signed timestamp, because neither TLS nor
> HMAC gives freshness; a captured valid message replays forever
> without it. The same replay lens gates TLS's own newest feature:
> 1.3's 0-RTT early data can be captured and replayed by design, so
> it's only safe for idempotent requests — a payment POST rides 0-RTT
> only if the application layer is idempotency-keyed, which is exactly
> the machinery we already run."

## Self-test

1. The three properties TLS provides, and the asymmetric-to-symmetric
   bootstrap.
2. Walk chain validation and name three distinct failure modes.
3. TLS 1.2 vs 1.3: RTTs, and the two other 1.3 changes that matter.
4. Define forward secrecy and what makes it mandatory in 1.3.
5. 0-RTT: the mechanism, the attack, the rule, and the connection to
   your platform.
6. mTLS vs API keys: three differences and the cost mTLS carries.
7. Edge termination vs end-to-end: the trade and the modern
   resolution.
8. Why is cert expiry a *correlated* failure, and the modern
   mitigation?
9. Why is revocation "quietly broken," and the working answer?
10. Channel vs message authentication: the three reasons HMAC
    survives TLS.
11. Complete the connection-pool ledger with TLS's contribution.
12. Name three things TLS does not protect.

<details>
<summary><b>Answers</b></summary>

1. Confidentiality, integrity, authenticity (server-side by default).
   Bootstrap: asymmetric crypto (certificates + key exchange)
   authenticates and agrees on session keys once; the conversation
   then runs under fast symmetric encryption (AEAD ciphers).
2. Client verifies the server cert's signature chain up to a trusted
   root in its trust store, checks hostname against the SAN, checks
   validity dates (and nominally revocation). Failures: expired cert
   (dates), wrong/missing SAN (hostname mismatch), internal CA absent
   from a trust store (works-in-curl-fails-in-JVM), plus broken
   intermediate chains.
3. 1.2: ~2 handshake RTTs. 1.3: 1 RTT (optimistic client key share).
   Also: only ephemeral ECDHE key exchange survives (forward secrecy
   mandatory) and legacy/broken cipher options were removed wholesale
   (smaller attack surface, fewer misconfiguration traps).
4. Session keys derive from ephemeral per-connection exchanges that
   are discarded after use — later compromise of the server's
   long-term private key cannot decrypt recorded past traffic. 1.3
   made it mandatory by removing static-RSA key exchange entirely.
5. Resumed clients send application data in the very first flight,
   before the handshake completes. A network attacker can capture and
   replay that flight; the server may execute it twice — TLS cannot
   prevent it. Rule: 0-RTT for replay-safe (idempotent) requests
   only. Platform connection: an idempotency-keyed POST is replay-
   safe, so your `05-resilience/07` machinery is what would make
   0-RTT usable for mutating calls.
6. mTLS: unforgeable without the private key, mutual authentication
   at transport, centrally rotatable (mesh-issued short-lived certs);
   API key: a bearer secret — leakable into logs/configs, one-sided,
   manually rotated. Cost of mTLS: certificate lifecycle
   infrastructure (issuance, rotation, distribution) — what service
   meshes exist to amortize.
7. Edge: central cert management + L7 content routing, but the
   interior must be trusted or re-secured. End-to-end: no plaintext
   interior, but cert sprawl and no L7 routing on content. Modern
   resolution: terminate at the edge for routing AND re-encrypt
   internally via mesh mTLS — shrunken trust boundaries made
   "TLS everywhere" the norm.
8. The same certificate (or the same missed renewal process) is
   deployed to every replica — all of them fail at the same instant;
   redundancy math assumed independence that the shared cert
   violates. Mitigation: short-lived, automatically renewed certs
   (ACME, mesh hourly issuance) — rotation becomes a continuously
   exercised path instead of an annual ritual that can be forgotten.
9. CRL/OCSP checks add latency, fail soft (clients proceed when the
   check is unavailable), and are widely disabled — so revoking a
   compromised cert doesn't reliably stop its use. Working answer:
   short lifetimes — revocation by expiry within hours/days.
10. (1) Termination: TLS asserts nothing past the terminator or at
    rest — the HMAC travels with the payload through LBs, queues,
    retries, storage. (2) Granularity: TLS proves a client connected;
    HMAC proves the specific partner's secret signed this exact
    payload — per-message sender authentication. (3) Auditability:
    the signature is verifiable after the fact for dispute
    resolution. (Freshness still requires a signed timestamp —
    neither layer gives it.)
11. TLS adds 1 RTT (1.3) or ~2 RTTs (1.2) of setup per cold
    connection PLUS ms-scale asymmetric CPU per handshake — at
    gateway QPS, resumption and keep-alive pools are both a latency
    and a CPU decision. Pools now amortize four things: TCP
    handshake, slow-start, TIME_WAIT churn, and TLS
    handshake RTT+CPU.
12. Traffic metadata (timing, volume, historically SNI); compromised
    endpoints (TLS delivers plaintext faithfully to a breached
    server); everything after termination (queues, logs, storage);
    and message freshness (replay within the app layer). Encrypted ≠
    secure — one layer of defense in depth.

</details>
