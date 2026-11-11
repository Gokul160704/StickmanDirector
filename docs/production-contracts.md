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
skip stages and writes checkpoints through a temporary file followed by a rename.
Completed artifacts and errors remain in the project-local state file so an interrupted
run can resume without regenerating approved work.

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
