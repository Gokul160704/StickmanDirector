# Production contracts

`episode.json` remains the only canonical local production manifest. It may carry
the following machine-readable sections:

- `research`: questions, source records, verified claims, and uncertainty notes.
- `script`: approval status and revision metadata; scene narration remains in each scene.
- `continuity`: stable character, prop, and environment records maintained by the Director.
- `storyboard`: Boords source and handoff format metadata.
- `references`: approved reference asset paths and visual style anchor.
- `production`: current stage (`research`, `script`, `continuity`, `storyboard`, `references`, `images`, `audio`, `captions`, `rendering`, or `QA`).

## Resume and checkpoints

Use `scripts/production-state.mjs` to create and advance a checkpoint. It refuses to
skip stages and writes checkpoints through a temporary file followed by a rename. A
previous checkpoint is retained as a local `.bak` recovery candidate; a malformed
primary checkpoint is recovered only from that backup or an interrupted temporary file.
Completed artifacts and errors remain in the project-local state file so an interrupted
run can resume without regenerating approved work.

The state file is operational bookkeeping, not a second creative manifest. The only
canonical creative manifest remains `episode.json`, and `importEpisodeManifest` accepts
only validated schema v1 data. Legacy data must be converted explicitly before import.
Canonical state statuses are exactly `draft`, `waiting-for-human`, `queued`, `running`,
`generated`, `downloaded`, `reviewed`, `approved`, `rejected`, `failed`, `skipped`,
`stale`, and `needs-reconciliation`. The old `completedStages` view is retained only as
a compatibility projection for legacy readers; it is not the canonical vocabulary.
Legacy stage data, unknown fields, and nontrivial attempt metadata are retained during
v1 migration. A file without `stateFormat` is the only input eligible for the one-time
upgrade to `durable-v1`; the loader preserves its legacy data while adding the canonical
projection. Once `stateFormat: "durable-v1"` is present, this writer owns both
`stages` and `completedStages` and updates them together. An old writer that changes only
the legacy projection, removes one projection, or creates a projection conflict fails
closed with a migration-boundary error; the loader never guesses which data to discard.

Attempts require a normalized idempotency key and a replay fingerprint over all
sanitized material metadata, including receipt/read-back data, errors, and extension
fields; a mismatched replay is rejected. An `approved` attempt must include the exact
dependency hash and an approval binding whose dependency hash is the same exact
non-empty value, plus approval ID, actor or source, and a valid approval timestamp.
Persisted approvals without that proof are downgraded to
`needs-reconciliation`. Call `reconcileProductionState` with current dependency hashes:
affected generated/downloaded/reviewed records become `stale`, approved records become
`needs-reconciliation`, and failed, waiting, running, and skipped records are preserved.
Approved records carry dependency and approval bindings, and reconciliation records an
explicit human re-approval action. Re-approval must use the exact current dependency hash
that triggered reconciliation. A stage marked reviewed, approved, rejected, waiting for
human input, or needing reconciliation cannot advance through the ordinary sequential
transition, preventing an implicit approval downgrade.

The legacy `completedStages` projection emits only the pre-existing enum `pending`,
`complete`, `invalidated`, `failed`, `blocked`, `running`, or `skipped`. Draft, waiting,
and queued map to `pending`; generated, downloaded, and reviewed map to `complete` only
in that compatibility projection. An approved stage maps to `complete` only with its
canonical approval proof. Rejected, stale, and needs-reconciliation map to
`invalidated`, never `complete`; failed, blocked, running, and skipped retain their
legacy meanings. Conflicting status-bearing projections fail closed.

`requestSafeShotRetry` only queues a retry for an explicitly consented failed or
needs-reconciliation shot with receipt and asset read-back metadata. It performs no
provider call and never silently retries paid work. State persistence redacts nested
receipt/provider secret values; provider/network calls and receipt contents are
deliberately outside this offline foundation.

## Boords handoff

Run `node scripts/boords-handoff.mjs <episode.json>` to create
`boords-handoff.json`. Each frame contains the stable scene ID, order, shot/action,
characters, props, exact narration, duration, image path, continuity notes, and review
status. This is a manual-import handoff; the referenced Boords pages were not
programmatically accessible in this environment, so no live integration is claimed.

## Images and captions

`render-episode.mjs` validates image integrity and 16:9 dimensions through FFprobe
before invoking FFmpeg. Captions are either explicitly timed in scene records or loaded
from `captions.alignmentPath`. Without alignment data, the manifest must use
`timingSource: "manual"`; the renderer reports that source rather than claiming forced
alignment. Existing legacy projects retain their proportional caption fallback.

## Output safety

Renders and caption sidecars are written to temporary sibling files and renamed only
after FFprobe verification. Existing outputs are refused by default; `--replace` is an
explicit operator choice. FFmpeg is invoked with an argument array, never a shell string.

FFmpeg and FFprobe can be selected with `STICKMAN_FFMPEG` and `STICKMAN_FFPROBE`
(or the conventional `FFMPEG` and `FFPROBE`) when the host does not expose the
executables under their default names.

## Safe-framing profile

`safe-framing-v1` is optional schema-v1 metadata for new episodes. Its default
fractions are left 0.04, top 0.04, right 0.08, and bottom 0.10; the protected
rectangle is derived from those margins. Per-scene profiles may override the
episode profile. Profiles are normalized and SHA-256 hashed. Guided sessions
persist the profile, and changing it invalidates storyboard and downstream
approvals. Flow approval hashes may include this profile hash while requests
that predate the field retain their existing hash shape. Boords handoffs may
include profile and read-only geometry preview metadata; their original image
paths remain the source of truth.

Geometry previews fit a 16:9 region without stretching, calculate protected
pixel bounds, and can warn about supplied normalized landmark boxes or proposed
trim ratios. They never crop or modify an image. Composition prompts are
heuristic guidance and cannot guarantee model placement. Provider marks and
provenance must remain intact; watermark removal or concealment is prohibited.
