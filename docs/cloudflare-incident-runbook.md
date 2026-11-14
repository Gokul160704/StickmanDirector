# Cloudflare image-persistence incident runbook

This runbook covers provider inference where the provider may have accepted a
request but the local harness did not preserve the original image bytes.

## Outcome vocabulary

- `SUCCEEDED`: verified bytes were persisted atomically, with format, dimensions,
  SHA-256, and a durable sidecar receipt.
- `PROVIDER_REJECTED`: a definite provider rejection was observed before a
  successful inference result; preserve the sanitized status/code envelope.
- `UNKNOWN_AFTER_DISPATCH`: timeout, stream loss, MCP truncation, failed file or
  receipt write, or missing usage after dispatch.
- `NEEDS_RECONCILIATION`: the local checkpoint is waiting for a matching provider
  read-back receipt and explicit owner authorization.
- `UNRECOVERABLE_OUTPUT_LOSS`: no retrievable provider output or receipt exists;
  never claim the image was absent or retry automatically.

## Required evidence

Keep only redacted metadata in checkpoints and reports: provider/model, request
and quote hashes, attempt and response IDs, status/code, latency, byte length,
MIME/extension, dimensions, SHA-256, and usage status. Never store API keys,
raw provider envelopes, or base64 image data in a receipt or Trello comment.

The local normalizer is model-specific. JSON/base64, binary stream, and MCP
image-content routes are explicit; unsupported or conflicting shapes fail closed.
Output extensions come from magic bytes, not requested filenames. Existing
source files are preserved; a JPEG with a `.png` name is reported or copied to
a verified `.jpg` only through a non-destructive operation.

## Retry rule

Do not retry an unknown attempt. First reconcile it with a matching provider
receipt/read-back. If no read-back is available, record the outcome as
unrecoverable/unknown and obtain fresh owner approval for any new request.
Local idempotency keys do not prove provider-side deduplication.

All development tests for this path use synthetic fixtures and injected mock
transports. Live inference, paid upgrades, quota changes, and provider retries
are separate owner-approved operations and are not part of the corrective PR.
