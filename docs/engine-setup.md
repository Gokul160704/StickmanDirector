# Stickman animation engine

This workspace engine renders a vertical episode from three authored inputs: a version 1 JSON episode manifest, approved Google Flow background images, and an approved narration WAV. Character art is drawn as Canvas vector geometry and motion comes from shot-relative keyframes. Flow images remain background plates; do not generate stickman character artwork.

## Prerequisites and install

- Node.js 20 or newer
- FFmpeg and FFprobe on `PATH`
- Install pinned workspace dependencies with `npm ci`
- The upstream `directing-stickman-videos` skill is installed in the Codex user skills directory. It handles story planning and production guidance; the renderer is a workspace CLI that can also be run by VS Code agents.

## Prepare an episode

Copy `templates/engine-project/episode.example.json` into a local `projects/<series>/<episode>/episode.json`. Keep project data ignored by Git. Make the episode's `images/flow/` directory and put approved, reviewed Flow exports there. Flow generation stays in the user's signed-in Google Flow browser tab; inspect its current model, credit balance, and per-output cost, then get explicit approval before any credit-consuming generation. There is no image-generation MCP/API in this workflow.

Put the approved narration WAV at the path in `audio.narration`. Adjust shot start/end times to cover the audio, use matching background paths, and author keyframes relative to each shot. Numeric joint angles are radians. The renderer clamps poses outside a shot's keyframe interval and smoothstep-interpolates joint positions and angles. Captions are timed against the complete episode and limited to two lines within the central safe width.

Render from the repo root:

```powershell
npm ci
npm run render:episode -- projects/<series>/<episode>/episode.json
```

The default MP4 and SRT go under ignored `output/engine/<series>/<episode>/`. Optional CLI arguments are `--preview-seconds N` and `--output FILE`. Existing `scripts/render-episode.mjs` remains available for the original still-image workflow.

## Production workspace and continuity

Use Boords for the series project, scripts, ordered storyboards, comments, review proposals, approvals, and Asset Library. Check the current Boords plan limits before depending on paid features. Attach approved Flow images to their corresponding Boords frames for review. Keep `script.md` current and keep exact per-episode spoken-text files beside generated audio; Boords and local copies should match.

## Gemini narration from any editor

Read [AUDIO.md](../AUDIO.md) before preparing narration. The `scripts/gemini-tts.mjs` helper is a local Node CLI, not a Codex-only MCP, so VS Code agents can invoke it too. Their process must have `GEMINI_API_KEY` set in its Windows environment. Verify current Gemini model access, quota, billing, and cost and get approval before API generation. Use `--allow-network` to opt into one API request. The renderer has no Gemini dependency.
