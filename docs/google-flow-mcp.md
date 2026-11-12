# Google Flow MCP integration

## Approved role

Use GTAI-1 `flow-mcp` as the canonical controller for Google Flow still-image work. It operates a dedicated signed-in Chrome session and supports status, still-image generation, asset read-back, downloads, reference management, and prompt refinement.

StickmanDirector does not use Flow for video generation. The active production contract contains no Flow video model, clip duration, motion prompt, `flow_continue`, `flow_edit`, or animated-clip operation. Final video is assembled locally with FFmpeg from approved stills, approved Gemini narration, and captions.

## Safe still-image procedure

1. Call `flow_status` first and confirm sign-in, the intended project, current model, aspect ratio, credits, and queue state.
2. Prepare prompts from the approved Boords storyboard and `episode.json`. The storyboard determines the number of still images; there is no fixed clip batch.
3. Before a credit-consuming image batch, show the exact prompts, model, output count, per-output quote, and estimated total. Wait for explicit user approval for that batch.
4. Validate the request as still-image-only. Use an approved image model and preserve the approved aspect ratio, defaulting to 16:9. A live composer setting such as 9:16 must not silently override an approved 16:9 request.
5. After generation, read back the job and assets before retrying. Review each still at full size and in sequence for composition, continuity, unwanted text, and caption-safe space.
6. Attach approved stills to the corresponding Boords frames and record provenance. Use the established Gemini TTS workflow for narration and `flow_transcribe` only for applicable narration timing.
7. Run the local manifest validation and FFmpeg renderer to produce the MP4 and SRT.

## Installation and local configuration

The configured server uses the locally built `dist/index.js` from the GTAI-1 `flow-mcp` checkout. Keep the Codex and VS Code entries pointed at the same clone and do not replace unrelated MCP entries. Sign in manually in the dedicated Flow Chrome profile. Never print or store credentials in receipts, logs, prompts, or chat.

## Historical evidence — non-authoritative

Earlier audits exercised video-capable Flow operations, including a short vertical Omni test. Those records explain past account observations only; they do not define the current architecture, model catalog, cost policy, or supported production workflow. Do not reproduce those operations or use them as a production fallback. Git history preserves the old audit for traceability.

## Do and do not

Do check live image quotes and credits, bind approval to the exact still-image request, read back uncertain jobs, and keep approved stills as the visual source of truth.

Do not call or propose video-generation operations, select Omni/Veo/video models, add motion prompts, infer approval from MCP caps, or publish without the separate human gate.
