# StickmanDirector

A reusable workflow and toolkit for planning illustrated stickman story series, preparing reviewed provider-neutral still batches, managing storyboards in Boords, and assembling narrated 1080p MP4s locally with FFmpeg. Google Flow is the default provider; Cloudflare Workers AI and suitably licensed manual imports are opt-in alternatives with separate approval.

## What belongs in this repository

This repo tracks reusable rules, documentation, scripts, and an empty series template. By default, `projects/` and `output/` are ignored: they can contain scripts, generated art/audio/video, references, and other episode-specific material. They remain on this computer. Selectively remove an ignore rule only when you intentionally want chosen project material versioned and it is appropriate to publish.

## Choose an entry point

- Creative/storytelling series: use the multi-episode Producer with `--series-create`, then resume with `--series`.
- Documentary: use `--documentary-create` for a local draft metadata package. It does not replace `episode.json`, publish, or imply editorial acceptance.
- Offline decision guide: use `--manual`. It is a non-interactive printout, not a wizard and not a provider runner.
- Portable agent: read [agent/SKILL.md](agent/SKILL.md), with orientation in [docs/portable-agent.md](docs/portable-agent.md). Codex, OpenCode, and Qoder use explicit owner-controlled invocation; no webhook or repository event launches an agent.

```powershell
node scripts/producer-cli.mjs --series-create "Series name" "projects/series-name" --episodes 3
node scripts/producer-cli.mjs --series "projects/series-name"
node scripts/producer-cli.mjs --documentary-create "Demo Documentary" projects/demo-documentary --episodes 3
node scripts/producer-cli.mjs --manual
```

These commands are offline-first scaffold, resume, draft-package, and decision-guide operations. They do not call providers, spend credits or neurons, publish media, or overwrite an existing scaffold unless the underlying command explicitly permits it.

For the provider-neutral stage and batch contracts, see [stage architecture](docs/stage-architecture.md) and [batch image workflow](docs/batch-image-workflow.md).

## Legacy single-series scaffold

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

Prepare full-frame 16:9 scene illustrations with the selected approved provider and review them. Flow remains the default and requires a live `flow_status`/model/credit/cost preflight; Cloudflare is opt-in and its current adapter is offline/mock verified, not live benchmark evidence; manual imports must be suitably licensed and reviewed. The approved local profile assembles stills only and does not require or generate Flow video clips. Produce narration with the existing Gemini TTS workflow in [AUDIO.md](AUDIO.md), whose Gemini/API billing gate is separate from Flow credits and Cloudflare neurons.

For the canonical path, fill `episode.json` with ordered scenes, approved image paths, timing/captions, and narration, then run:

```powershell
node scripts/validate-episode.mjs projects/<slug>/episode.json
node scripts/render-episode.mjs projects/<slug>
```

The output is written under `exports/` by default. The older five-image renderer compatibility path remains available; it does not select or substitute a provider:

```powershell
npm ci
npm run render:stills -- projects/<slug> 1
```

The review MP4 and SRT are written under that project folder. This compatibility path does not generate animation. See [upstream compatibility](docs/upstream-compatibility.md) for the boundary with the installed official skill.

## Operator route and safeguards

1. Choose Creative or Documentary, then collect research/evidence and mark unresolved claims.
2. Write the series bible, speakable script, and episode plan; organize the ordered Boords storyboard and resolve review feedback.
3. Create and approve reusable character/prop/style references. Freeze a SHA-256 reference bundle and stable `episodeId`/`sceneId`/variant plan for the intended 8/36/100+ batch.
4. Select Flow (default), an explicitly approved Cloudflare batch, or a suitably licensed manual import. Check provider capability, licensing, model, aspect ratio, quota/credits or neurons, quote, bounded concurrency, and exact output count. Obtain fresh human authorization for that batch; there is no silent fallback.
5. Generate or import stills only after that approval. Record per-image provenance, idempotency/receipt state, known versus unknown outcomes, selected retries, and continuity/QA review. Preserve originals and visible watermarks; geometry previews do not alter pixels and cropping to hide a watermark is prohibited.
6. Obtain separate Gemini/API billing approval for narration, keep exact spoken text and SRT/caption timing synchronized, then validate the canonical manifest and render locally with FFmpeg to 1920x1080/30fps MP4 plus SRT.
7. Complete independent human creative/release review and obtain publication permission. Technical tests, CI, Trello status, a merged PR, a prior pilot, or a stage permission never imply provider authorization, creative consent, or publication approval.

See [docs/workflow.md](docs/workflow.md), [docs/repository-policy.md](docs/repository-policy.md), and [AGENTS.md](AGENTS.md) for full operating rules.

See [production contracts](docs/production-contracts.md) for manifest sections, resumable checkpoints, Boords handoff, caption timing, and output safety.

See [documentary direction](docs/documentary-direction.md), [producer guide](docs/producer-guide.md), and [repository policy](docs/repository-policy.md) for the current offline-first boundaries. `projects/` and `output/` remain ignored local paths by default.
