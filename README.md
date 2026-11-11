# StickmanDirector

A reusable workflow and toolkit for planning 16:9 illustrated stickman story series, producing stills and image-to-video in Google Flow, managing storyboards in Boords, and preparing Gemini narration and edits.

## What belongs in this repository

This repo tracks reusable rules, documentation, scripts, and an empty series template. By default, `projects/` and `output/` are ignored: they can contain scripts, generated art/audio/video, references, and other episode-specific material. They remain on this computer. Selectively remove an ignore rule only when you intentionally want chosen project material versioned and it is appropriate to publish.

## Start a series

For the full topic-to-video process, see [Creating a video series](docs/creating-a-video-series.md).

```powershell
node scripts/new-series.mjs "The Last Window Light"
```

This creates a local scaffold under `projects/<slug>` without overwriting an existing folder.

## Prepare Flow prompts

Fill `flow-prompts.json` inside a series folder (see [example](templates/series-project/flow-prompts.example.json)), then run:

```powershell
node scripts/build-flow-prompt-pack.mjs projects/<slug>/flow-prompts.json
```

The script writes a Markdown prompt pack beside the JSON. Use the configured Google Flow MCP to submit approved prompts (see [Flow MCP setup and safety notes](docs/google-flow-mcp.md)); it does not call image APIs, generate media, or spend credits.

## Create and render an episode

Create full-frame 16:9 scene illustrations in Flow, review and approve them, then use Flow image-to-video on selected stills where motion helps the story. Follow the [image-to-video workflow](docs/image-to-video-workflow.md) and use the configured Flow MCP. Produce narration with the existing Gemini TTS workflow in [AUDIO.md](AUDIO.md).

For a local still-image fallback with captions and narration, place five approved stills and the narration WAV in a series project, then run:

```powershell
npm ci
npm run render:stills -- projects/<slug> 1
```

The review MP4 and SRT are written under that project folder. This fallback does not generate animation.

## Workflow

1. Develop the premise, series bible, character and prop continuity, episode arcs, narration, captions, and scene prompts using the installed `directing-stickman-videos` skill.
2. Organize the series and ordered frame storyboards in Boords. Keep a current copy of the used script in the local series folder.
3. Create and review character and prop references in Google Flow before scene art.
4. Use the Google Flow MCP for visual exploration, generation, and edits. Check the live project, model, and credit cost before generation; obtain approval before spending credits. Use browser control only as a fallback if the MCP is unavailable.
5. Attach approved Flow images to Boords frames and review art as full-size scenes and as a sequence. Reject prompt cards, scene labels, contact sheets, split panels, and instruction text.
6. Generate motion selectively from approved stills in Flow, produce narration using [AUDIO.md](AUDIO.md), then assemble the approved clips, captions, and sound.

See [docs/workflow.md](docs/workflow.md), [docs/repository-policy.md](docs/repository-policy.md), and [AGENTS.md](AGENTS.md) for full operating rules.
