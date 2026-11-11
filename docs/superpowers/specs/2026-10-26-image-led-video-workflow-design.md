# Image-Led Video Workflow Design

## Goal

Make StickmanDirector the primary project for producing narrated, illustrated videos from approved still images and Flow image-to-video clips, following the user-provided reference.

## Current state

- StickmanDirector is the clean primary GitHub checkout. Its latest commit added a code-drawn, keyframed stickman renderer.
- The separate `Stickman video director` checkout contains additional uncommitted animation work and points to a different GitHub remote. Keep it intact until the user confirms whether to archive/delete the local checkout or remove the remote repository.
- The GTAI-1 Flow MCP configuration and its setup/test notes have been added to StickmanDirector.
- The reference is a 848×474, 30 fps, 8:44 illustrated survival-story video. It uses a 16:9 frame, recurring simple 2D characters over detailed environments, expressive scene illustrations, dialogue/callout text, occasional information cards/diagrams, dramatic lighting, and narrated scene progression.

## Proposed production direction

- Use Boords for scripts, ordered storyboards, continuity notes, and review.
- Use Google Flow through GTAI-1 `flow-mcp` for approved character/reference images, scene stills, and image-to-video generation from those stills. Do not use the code renderer to animate characters in new productions.
- Use Gemini TTS through the existing `scripts/gemini-tts.mjs` workflow for narration. Use `flow_captions` or an editor for timed captions and final assembly.
- Use 16:9 landscape as the default because the reference is landscape. Keep generated media and episode data local under ignored project/output folders.
- Match the reference's broad format and visual language while writing original scripts and creating original character designs, illustrations, and branding. Do not reuse the reference's visible `@SURVIVALBREAKS` mark.
- Inspect current Flow model, credit balance, and per-output quote before each paid batch; show the exact proposed scenes and wait for approval.

## Retire the code-animation feature

After approval of this design, remove the renderer from the active StickmanDirector project: its engine source, renderer command/dependency, animation-only templates/tests, and engine-specific setup documentation. Keep story scaffolding, Flow prompt preparation, Gemini TTS, and the reusable Flow MCP setup. Git history preserves the removed renderer for recovery.

## Acceptance criteria

- StickmanDirector is the documented and configured primary workspace, with the Flow MCP available to VS Code agents.
- The default episode workflow starts from a reviewed script/storyboard, creates approved image references, then uses Flow image-to-video from approved stills.
- No active workflow tells agents to draw or keyframe the stickman in code.
- The production docs match the supplied reference's landscape illustrated-story format and retain all Flow credit approval gates.
- The old checkout is not deleted until its local/remote retirement scope is resolved and its uncommitted work is preserved or explicitly discarded.

## Open decisions

- Final runtime and scene count for a typical episode.
- Which Flow video model and image-to-video duration to use; choose per batch from the live Flow account and quote.
- Whether the old checkout means local-only retirement or deleting its separate GitHub repository as well.
