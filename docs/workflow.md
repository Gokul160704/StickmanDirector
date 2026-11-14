# Production workflow

## 1. Develop

Use `directing-stickman-videos` for the premise, series bible, character continuity, episode arcs, natural storytelling narration, captions, and scene prompts. Never use Caveman mode for story material. Keep a current `script.md` and exact spoken-text files in each local project.

## 2. Storyboard

Create a Boords project for each series. Arrange frames in story order and include shot/action, narration or sound, reference art, and review status. Use Boords comments and review tools to resolve changes. Link each episode storyboard to its script where supported.

## 3. Establish continuity

Before episode scenes, make and review reusable references for every recurring character and important prop. Record design, ownership, initial state, later changes, and SHA-256 content hashes in continuity notes. Freeze the approved bundle and reuse it across scenes and episodes; a changed reference invalidates dependent approvals.

## 4. Select and prepare an approved still-image batch

Use Flow by default through the configured GTAI-1 Flow MCP for mood-board exploration, prompt refinement, reference creation, image generation, and edits. Call `flow_status` first and verify sign-in, intended project, current model, aspect ratio, credits, and displayed cost. If the MCP is unavailable, the signed-in Flow browser is a transport fallback for the same approved Flow work, not permission to switch providers.

An owner-approved Cloudflare Workers AI batch or suitably licensed manual still import is a separate provider choice. The provider-neutral batch runner bounds concurrency, enforces quotes and output-path safety, records receipts and hashes, and never substitutes another provider. Cloudflare capability and mock behavior are verified offline; live inference, quality, quota, credits, and neurons are `NOT RUN` without separate evidence.

Before any billable or quota-consuming batch, inspect the selected provider's current model/capability, available allowance, displayed or calculated per-output cost, reference bundle, and exact output count; show the proposed outputs and estimated total and wait for explicit authorization. MCP caps, Cloudflare neuron estimates, and acknowledgment fields do not replace this approval. An approval for one prompt/model/reference bundle/batch does not cover revisions, added outputs, or a different provider. Use the prompt-pack and batch-plan tools to prepare still-image requests; they do not access providers or spend credits.

Final scene art must depict one complete 16:9 story moment. Reject scene cards, storyboard layouts, labels, panel splits, prompt summaries, arrows, explanatory text, and other artifacts. Review each at full size and in sequence for composition, text, and continuity. Keep captions out of generated images.

## 5. Review and assemble

Attach approved outputs to the matching Boords frames or Asset Library. Default to 16:9 illustrated storytelling. Review every image and its provenance/continuity state, then prepare narration according to [AUDIO.md](../AUDIO.md). Keep Gemini/API billing separate from provider image allowances, put the approved stills, explicit scene durations/captions, and narration path in `episode.json`, validate, and run `node scripts/render-episode.mjs <series-folder>` to assemble the static image sequence with FFmpeg.

For a local still-image fallback, use `npm run render:stills -- <projectDir> <part>` to assemble five approved images with narration and a caption sidecar. This path does not animate characters. Keep the same script and exact spoken text in the local project and Boords.

## 6. Keep the repo clean

Reusable docs, utilities, and templates belong in Git. `projects/` and `output/` are local-only by default. See [repository policy](repository-policy.md).
