# Stickman video engine integration design

## Intent

Use `kaomei/stickman-video-director` as the primary story-planning and production workflow for this workspace, with the user's chosen visual split: code-drawn, code-animated stickman characters over background illustrations generated in Google Flow. Use Gemini API for narration TTS through a local command-line helper that both Codex and VS Code agents can invoke.

## What exists today

- This repository is a workflow/toolkit. Its current renderer combines five still images, narration, and caption sidecars; it does not animate articulated characters.
- The upstream repository includes the `directing-stickman-videos` skill and a local Autopilot runtime. Autopilot accepts timed shot/layer manifests, PNG/JPEG image layers, three built-in B1 pose sprites, numeric keyframes, narration, captions, and SFX.
- Upstream B1's baseline is landscape and paper-grid based. The runtime supports portrait canvases, but portrait scenes must be composed for that ratio. Its built-in pose sprite sheet is not the requested code-drawn character system.
- The upstream runtime includes optional Gemini API adapters for image and speech requests, but its speech adapter does not support the workspace's required turn-level delivery metadata. A workspace-owned TTS helper should use the current Gemini API schema directly; Flow remains a signed-in browser workflow for images.

## Goals

- Install the upstream `directing-stickman-videos` skill for Codex and use its Director/Autopilot guidance as the main workflow.
- Add a maintainable, repository-owned engine extension for reusable stickman characters drawn and animated by code, rather than generating character artwork.
- Use one approved Flow-generated, full-frame background plate per scene. Prompts must leave out characters, captions, and unwanted text so code characters remain legible when composited.
- Provide a local TTS command that Codex and VS Code agents can invoke. Read `GEMINI_API_KEY` from the process environment; never store it in repository files or project artifacts.
- Render vertical 9:16, still-background-first episodes with timed character movement, narration, captions, and sound using the upstream Autopilot renderer where its supported interfaces fit.
- Keep episode scripts, references, generated backgrounds, audio, and renders in ignored `projects/` and `output/` paths. Keep reusable engine code, install/setup instructions, and clean templates in Git.
- Preserve the workspace's Boords review and script-copy rules. Use the signed-in Google Flow browser workflow for visual generation; use Gemini API only for TTS.

## Non-goals

- Do not build a general-purpose 3D animation package or a web-based editor.
- Do not replace or discard the existing still-image renderer until the new path can render a reviewed sample.
- Do not make paid media calls, generate background images, create narration, publish videos, or create a new story series as part of engine setup.
- Do not configure Gemini API credentials merely to animate characters or generate Flow images. Gemini API is used only for narration TTS, and calls remain disabled until the user configures a key and approves a specific billable request.

## Approaches considered

1. **Install the upstream skill, add a workspace-owned renderer extension, and provide a Gemini TTS helper (chosen).** Keep the upstream skill in the user-level Codex skill location, use its Autopilot workflow and manifest as the production foundation, add code-character/background composition support here, and provide a local Gemini TTS command usable from both Codex and VS Code. Generate backgrounds directly in Google Flow. This keeps production instructions current while keeping project-specific runtime changes reviewable and versioned here.
2. **Use upstream Autopilot unchanged.** This would be the smallest setup, but its built-in B1 character support is a three-pose sprite atlas; numeric image-layer keyframes move whole images and do not animate character joints. It does not meet the requested code-animated character requirement.
3. **Fork or vendor the entire upstream repository into this repository.** This gives full control, but duplicates the skill and runtime and makes upstream updates harder to track. It is unnecessary for the targeted renderer extension.

## Proposed workflow

1. Install the upstream skill into the Codex user skill directory, preserving its name and source layout. Keep the workspace's current `AGENTS.md` and `AUDIO.md` as the controlling project rules where they differ from upstream defaults.
2. Install/check the upstream runtime prerequisites from its own directory: Node.js 20+, FFmpeg, FFprobe, and its pinned npm dependencies. Keep the skill runtime itself upstream-owned.
3. Implement the extension in tracked workspace code. The episode manifest describes background plate, code character identity/design, per-shot action/pose/joint keyframes, audio, captions, and SFX. The character renderer draws vector/Canvas primitives deterministically per frame; the compositor places that character over the background plate and feeds the result into the upstream-compatible render path. Keep each character's proportions, colors, and reusable parts in a continuity definition. Keep motion data separate from character appearance.
4. For each scene, prepare a prompt for Google Flow that requests a complete vertical environment/background with an open character-safe region and no character, caption, label, or panel. Use the user's signed-in Flow browser tab as the source of truth. Before a credit-consuming batch, inspect the model, balance, per-output cost, and proposed images, then wait for explicit approval. Review approved images at full size and as a scene sequence.
5. Add a workspace-owned Gemini TTS command usable from Codex or VS Code terminal agents. Use `gemini-3.8-flash-tts` when available and send the exact approved transcript with supported turn-level style metadata. The command reads `GEMINI_API_KEY` from the environment and never writes it to project files.
6. Keep the current spoken script and verbatim narration text in the local series folder. TTS remains a replaceable input to the renderer rather than being coupled to character animation.
7. Produce a short local preview using existing or user-approved inputs, review its frame sequence and playback, then expand only after the user approves the sample.

## Gemini API decision

The Gemini API key is used only for narration TTS; it does not connect to Google Flow. Google AI Plus does not imply Gemini API quota or billing coverage. The engine must still render from an existing approved narration WAV when no key is configured. Before TTS use, verify current model access, request schema, quota/billing and price against `AUDIO.md`; use the current Gemini 3.8 TTS schema with the exact approved transcript and structured turn metadata. Do not assume the upstream adapter supports that schema. Use `GEMINI_API_KEY` from the Windows environment without reading or printing its value in chat or logs. Audition a short approved passage and obtain authorization before a billable full narration batch.

## Acceptance

- The upstream skill is installed and readable by Codex; its Autopilot setup/doctor guidance is followed without exposing secrets.
- Codex and VS Code agents can invoke the same local TTS command when `GEMINI_API_KEY` is configured, and no workspace config contains a credential value.
- A local engine example can describe a Flow-generated background and a code-drawn character with at least one articulated movement, render those layers deterministically into a 9:16 preview, and keep captions in the safe region.
- Changing a character joint keyframe changes the character animation without regenerating the background. Changing a background plate does not alter the character definition or timing.
- The existing still-image workflow remains available. No paid generation, API call, or publishing occurs without its respective approval.
- Episode data and generated media remain ignored by Git; reusable engine code and instructions are tracked.

## Builder decisions

- The upstream runtime currently paints through a Canvas renderer and supports image, pose, text, line, arrow, and underline layers. The implementation should inspect the installed runtime's current exports before choosing the narrowest integration point. Keep any renderer extension in this workspace rather than patching the global skill installation.
- The upstream Gemini speech adapter lacks the expressive request metadata required by this workspace. Implement a small workspace CLI helper with the current Google GenAI SDK or REST request, keeping image generation in Flow.
- Use deterministic, locally rendered character geometry and keyframes; do not make frame rendering depend on network access or model output.
- Keep the first delivery to the engine scaffold and a synthetic/offline preview fixture. Gemini images and real narration belong to a later, explicitly approved production pass.

## References

- Upstream repository and modes: <https://github.com/kaomei/stickman-video-director>
- Upstream Autopilot workflow: <https://github.com/kaomei/stickman-video-director/blob/main/skills/directing-stickman-videos/references/autopilot.md>
- Upstream Autopilot manifest/runtime: <https://github.com/kaomei/stickman-video-director/blob/main/skills/directing-stickman-videos/references/autopilot-runtime.md>
- Gemini TTS API: <https://ai.google.dev/gemini-api/docs/speech-generation>
- Workspace rules: `AGENTS.md`, `AUDIO.md`, `docs/workflow.md`
