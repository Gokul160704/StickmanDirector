# Cloudflare comparison incident record

Status: `NOT VERIFIED` for historical per-request receipts; this record is a
redacted development handoff, not a billing statement.

## Observed report

The owner reported a six-model comparison through the Cloudflare MCP path. The
dashboard later displayed `12.13k / 10k` neurons for the day, with visible model
aggregates for Phoenix, Lucid, FLUX.2 Klein 9B, FLUX.2 Klein 4B, and Other.
The local comparison directory contained no recovered `model-compare-*` files.
One FLUX.1 Schnell response was observed as image data but was not preserved as
a local artifact. A later SDXL Base request returned HTTP 429 with the provider
free-allocation exhaustion message. Exact paid overage, request IDs, and
per-request usage attribution were not available in the local checkout.

## Evidence classification

- `VERIFIED`: existing story/reference originals remain present and unchanged;
  the live dashboard showed the reported daily aggregate during the prior task.
- `NOT VERIFIED`: whether every comparison request completed inference; exact
  per-image usage, latency, response IDs, and paid billing amount.
- `UNKNOWN_AFTER_DISPATCH`: provider responses whose MCP payload or local write
  was not preserved.
- `NOT RUN`: any new live inference, retry, billing upgrade, or provider read-back
  during Trello #29 implementation.

## Corrective controls

This PR adds model-specific response normalization, magic-byte format and
dimension verification, SHA-256 checks, atomic original-byte writes, sidecar
receipts, explicit missing-usage classification, provider error classification,
and paid-overage/quota preflight guards. All tests use synthetic bytes and
injected transports; no raw image base64, credentials, or provider envelopes
are stored here.
