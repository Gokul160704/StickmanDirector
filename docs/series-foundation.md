# Series foundation

The series foundation is an offline metadata contract for recurring story elements. It does not replace the canonical per-episode `episode.json` manifest and it never calls Flow, Boords, Gemini, FFmpeg, or a provider.

## Create a series

The legacy command remains unchanged:

```text
node scripts/new-series.mjs "A single episode"
```

Use the additive mode for a versioned series bible. The default is three episodes; any positive integer is accepted:

```text
node scripts/new-series.mjs --multi-episode "Type II Civilization" --episodes 3
```

The generated local folder contains `series-bible.json`, append-only snapshots in `series-bible.revisions/`, and independent manifests under `episodes/<episode-id>/`. Each episode retains the schema-v1 manifest consumed by existing validation and rendering tools.

## Contract and integrity

`series-bible.json` has `schemaVersion: 1`, a stable kebab-case `seriesId`, recurring `references` grouped as characters, props, environments, and styles, narrator provider/model/voice/delivery metadata, an episode registry, continuity timeline, and a revision record. Draft records are not approvals. File-backed references must use a relative `filePath` beneath the series root and a matching `sha256:<hex>` `revisionSha256`.

Revision hashes are SHA-256 over canonical JSON with the revision hash field blanked. Every revision must carry `revision.version`, `integrity.algorithm: "sha256"`, and a 64-character lowercase hash that matches its content. A changed plan is written as a new revision snapshot; the previous snapshot is never overwritten. `updateSeriesPlanning()` marks the new revision `review-required`, records `parentVersion`, and leaves approved snapshots intact.

Human approval is a separate operation: `approveSeriesRevision()` creates a new immutable approved snapshot with approver, timestamp, authorization ID, and a binding hash over the pre-approval content. `writeSeriesRevision()` rejects caller-supplied approved state without that authorized operation.

## Safety behavior

Series creation refuses an existing root and all file writes are exclusive or atomic. Active-bible replacement validates the destination and uses a temporary file with rollback, while a failed replacement removes only the new snapshot and preserves the previous active and approved revisions. IDs, episode indexes, predecessor references, hashes, absolute paths, traversal paths, missing reference files, symlink escapes, and predecessor cycles are rejected before the bible is accepted. If a new scaffold fails part way through, only its newly created root is removed; an existing project is never deleted.

All tests use temporary folders and local fixtures. The series module is pure with respect to providers and media, so it is safe to validate or resume a planning workflow offline.
