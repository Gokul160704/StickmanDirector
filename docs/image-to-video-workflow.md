# Historical external image-to-video handoff

This document is retained for historical/externally authorized handoffs only. The current approved StickmanDirector production profile uses approved full-frame illustrations as still inputs and assembles them locally; it does not require or generate Google Flow video clips. Do not use this workflow for the local pilot unless the user explicitly changes the production contract.

## Shot workflow

1. Lock the script, narration text, character and prop continuity, and ordered storyboard in Boords. Keep the current script and exact spoken text in the local series folder.
2. Prepare image prompts with `templates/series-project/flow-prompts.example.json` and `scripts/build-flow-prompt-pack.mjs`. Use 16:9 landscape framing unless the production explicitly chooses another format.
3. Generate stills in the configured GTAI-1 Flow MCP. Review each at full size and in sequence. Confirm character identity, prop state, composition, story beat, and absence of unintended text. Attach approved images to the corresponding Boords frames.
4. Select shots where motion improves the story. For each, use its approved still as the image-to-video input and write a focused motion prompt: specify the subject's small action, camera movement if needed, and the intended emotional beat. Preserve character appearance, clothing, props, scene layout, and illustration style. Avoid adding new story information or text.
5. Check current Flow model, credit balance, and per-output cost. Before generation, present the selected shots, model, output count, and total estimated credits; wait for explicit approval for that batch. Revised prompts, added outputs, or model changes need fresh approval.
6. Review generated clips for continuity drift, unwanted morphing, camera changes, and artifacts. Keep only approved clips. If a generated clip breaks continuity, use the still as the final shot or revise the motion prompt and request approval for a new generation.
7. Produce narration with the established Gemini TTS process in `AUDIO.md`. Assemble approved Flow clips and stills, narration, captions, and sound in the chosen editor. Keep captions as an editing layer, not embedded in generated art.

## What to do

- Use a single approved still for each Flow image-to-video shot.
- Keep prompts specific and restrained: one primary action and only necessary camera movement.
- Reuse approved character and prop references and record each clip's source still and prompt in the episode notes.
- Use the prompt pack's separate `imagePrompt` and `videoPrompt` fields. Existing `prompt` fields remain accepted as still-image prompts.
- Use `npm run render:stills -- <projectDir> <part>` only when a still-image review cut is useful or Flow video generation is not selected. It creates a still slideshow, not character animation.

## What not to do

- Do not generate video before the source still has been approved.
- Do not ask Flow to redesign or replace the character, props, or composition during animation.
- Do not use long, multi-action motion prompts that invite scene changes or identity drift.
- Do not expect the local still renderer to animate characters.
- Do not use the retired code-drawn animation engine for new work.
- Do not spend Flow credits until the batch has been priced and explicitly approved.

## Prompt pack

Copy `templates/series-project/flow-prompts.example.json` to a series folder as `flow-prompts.json`, fill in its visual anchors and scenes, and run:

```powershell
node scripts/build-flow-prompt-pack.mjs projects/<series>/flow-prompts.json
```

The generated Markdown contains separate still-image and image-to-video prompts. It does not access Flow or spend credits.
