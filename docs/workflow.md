# Production workflow

## 1. Develop

Use `directing-stickman-videos` for the premise, series bible, character continuity, episode arcs, natural storytelling narration, captions, and scene prompts. Never use Caveman mode for story material. Keep a current `script.md` and exact spoken-text files in each local project.

## 2. Storyboard

Create a Boords project for each series. Arrange frames in story order and include shot/action, narration or sound, reference art, and review status. Use Boords comments and review tools to resolve changes. Link each episode storyboard to its script where supported.

## 3. Establish continuity

Before episode scenes, make and review reusable references for every recurring character and important prop in Google Flow. Record design, ownership, initial state, and later changes in continuity notes. Reuse these references across scenes and episodes.

## 4. Make art in Google Flow

Use the configured GTAI-1 Flow MCP for mood-board exploration, prompt refinement, reference creation, image generation, and edits. Call `flow_status` first and verify sign-in and the intended project. If the MCP is unavailable, use the signed-in Flow browser as a fallback. Do not route image generation through Gemini API, ChatGPT ImageGen, or another service unless the user explicitly changes the tool choice. See [Google Flow MCP setup and findings](google-flow-mcp.md).

Before a credit-consuming batch, inspect the current model, available credits, and displayed per-output cost in Flow; show the proposed outputs and estimated total and wait for explicit authorization. MCP caps and acknowledgment fields do not replace this approval. An approval for one prompt/model/batch does not cover revisions or added outputs. Use the prompt-pack script to prepare still-image prompts; it does not access Flow or spend credits.

Final scene art must depict one complete 16:9 story moment. Reject scene cards, storyboard layouts, labels, panel splits, prompt summaries, arrows, explanatory text, and other artifacts. Review each at full size and in sequence for composition, text, and continuity. Keep captions out of generated images.

## 5. Review and assemble

Attach approved Flow outputs to the matching Boords frames or Asset Library. Default to 16:9 illustrated storytelling. Prepare narration according to [AUDIO.md](../AUDIO.md), then put the approved stills, explicit scene durations/captions, and narration path in `episode.json`. Validate and run `node scripts/render-episode.mjs <series-folder>` to assemble the static image sequence with FFmpeg.

For a local still-image fallback, use `npm run render:stills -- <projectDir> <part>` to assemble five approved images with narration and a caption sidecar. This path does not animate characters. Keep the same script and exact spoken text in the local project and Boords.

## 6. Keep the repo clean

Reusable docs, utilities, and templates belong in Git. `projects/` and `output/` are local-only by default. See [repository policy](repository-policy.md).
