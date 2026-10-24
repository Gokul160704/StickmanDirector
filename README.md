# StickmanDirector

A reusable workflow and toolkit for planning vertical stickman story series, producing artwork in Google Flow, managing storyboards in Boords, and preparing narration and edits.

## What belongs in this repository

This repo tracks reusable rules, documentation, scripts, and an empty series template. By default, `projects/` and `output/` are ignored: they can contain scripts, generated art/audio/video, references, and other episode-specific material. They remain on this computer. Selectively remove an ignore rule only when you intentionally want chosen project material versioned and it is appropriate to publish.

## Start a series

```powershell
node scripts/new-series.mjs "The Last Window Light"
```

This creates a local scaffold under `projects/<slug>` without overwriting an existing folder.

## Prepare Flow prompts

Fill `flow-prompts.json` inside a series folder (see [example](templates/series-project/flow-prompts.example.json)), then run:

```powershell
node scripts/build-flow-prompt-pack.mjs projects/<slug>/flow-prompts.json
```

The script writes a Markdown prompt pack beside the JSON. Copy prompts into the signed-in Google Flow browser tab. It does not call image APIs, generate media, or spend credits.

## Workflow

1. Develop the premise, series bible, character and prop continuity, episode arcs, narration, captions, and scene prompts using the installed `directing-stickman-videos` skill.
2. Organize the series and ordered frame storyboards in Boords. Keep a current copy of the used script in the local series folder.
3. Create and review character and prop references in Google Flow before scene art.
4. Use Google Flow directly from its signed-in browser tab for visual exploration, generation, and edits. Check the current model and credit cost before generation; obtain approval before spending credits.
5. Attach approved Flow images to Boords frames and review art as full-size scenes and as a sequence. Reject prompt cards, scene labels, contact sheets, split panels, and instruction text.
6. Produce narration using [AUDIO.md](AUDIO.md), then add captions, sound, and subtle motion in an editor.

See [docs/workflow.md](docs/workflow.md), [docs/repository-policy.md](docs/repository-policy.md), and [AGENTS.md](AGENTS.md) for full operating rules.
