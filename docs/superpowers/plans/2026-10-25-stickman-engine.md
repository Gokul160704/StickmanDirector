# Stickman Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Install the upstream directing skill and build a local 9:16 renderer for code-animated stickman characters over approved Google Flow backgrounds, with optional Gemini API narration.

**Architecture:** Keep the upstream skill installed in the user-level skills directory and use its Autopilot workflow for production planning. Add a workspace-owned Canvas renderer and manifest under `scripts/engine/` so characters are drawn and keyframed deterministically in code, then composited over local Flow images and muxed with narration through FFmpeg. Add a separate Gemini TTS CLI helper that reads `GEMINI_API_KEY` from the environment; do not make the renderer depend on the key.

**Tech Stack:** Node.js 20+, `@napi-rs/canvas`, FFmpeg/FFprobe, Gemini 3.8 Flash TTS REST or current Google GenAI SDK, Google Flow browser workflow.

**Spec:** `docs/superpowers/specs/2026-10-25-stickman-engine-integration-design.md`

## Global Constraints

- Use the upstream `directing-stickman-videos` skill as the primary story-planning and production workflow.
- Keep recurring stickman characters code-drawn and code-animated; do not use generated character art.
- Generate backgrounds only in the user's signed-in Google Flow browser tab; do not use Gemini image API or another image generator.
- Use vertical 9:16 composition and keep captions inside the safe area.
- Keep `GEMINI_API_KEY` in the Windows environment; never print, log, or store its value.
- Use Gemini 3.8 Flash TTS (`gemini-3.8-flash-tts`) when currently available, with exact transcript text and structured turn-level delivery metadata.
- Check API model access, quota, billing, and price before TTS generation; obtain approval before billable narration batches.
- Check Flow's displayed model, credits, and per-output cost, and obtain approval before credit-consuming image generation.
- Keep `projects/` and `output/` episode material local and ignored; track reusable engine code, rules, scripts, and clean templates.
- Preserve the existing still-image renderer and Boords review workflow.
- Do not add or run tests unless the user asks for testing or verification.

## Review Focus

- Missing or unreadable Flow background: fail with the path and scene identifier; never silently substitute a blank background.
- Keyframes with non-finite values, duplicate timestamps, or timestamps outside the shot: reject the manifest with a field-specific error.
- Missing or malformed narration WAV: stop before encoding and explain which file/stream is required.
- Missing Gemini key or rejected API request: fail without exposing the key or response secrets, and do not retry automatically.
- Captions that collide with the safe-area boundary or exceed the supported line count: report the cue and do not silently clip it.

---

### Task 1: Install the upstream production skill

**Files:**
- User-level skill directory: `directing-stickman-videos/` (installed from `kaomei/stickman-video-director/skills/directing-stickman-videos/`)
- No repository files modified by installation

**Interfaces:**
- Produces: installed skill with `SKILL.md`, `references/`, `scripts/`, `assets/`, and its runtime `package.json` intact.

- [x] Install `directing-stickman-videos` from the upstream repository into the Codex user-level skills directory using the supported skill installer.
- [x] Preserve the upstream skill name and complete file layout; do not install the whole repository as a nested Git repository.
- [x] Install the pinned runtime dependencies in the installed skill directory, leaving generated `node_modules/` outside this repository.
- [x] Check runtime prerequisites with the upstream `doctor` command; report Node, FFmpeg, FFprobe, and key presence without displaying any secret value.

### Task 2: Add the local engine manifest and runtime dependency

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `scripts/engine/manifest.mjs`
- Create: `templates/engine-project/episode.example.json`

**Interfaces:**
- `loadEpisodeManifest(filePath: string) -> Promise<EpisodeManifest>` validates and resolves file paths relative to the manifest directory.
- `EpisodeManifest` contains `version`, `width`, `height`, `fps`, `audio`, `captions`, one `character` definition, and ordered `shots`; each shot contains its own `background` path and character keyframes.
- The first schema supports `version: 1`, `width: 1080`, `height: 1920`, and `fps: 30`.

- [x] Add the pinned `@napi-rs/canvas` runtime dependency and a `render:episode` script entry without changing existing script commands.
- [x] Define the manifest fields and numeric constraints in `manifest.mjs`; reject missing assets, invalid aspect dimensions, non-finite values, duplicate/out-of-order keyframe times, shot gaps/overlaps, and out-of-range cue times.
- [x] Add an example manifest with one background path, one continuous narration WAV, timed captions, one character definition, and two ordered shots with distinct keyframed actions.
- [x] Keep example media paths as placeholders and do not create image or audio assets in this task.

### Task 3: Draw and animate reusable characters in code

**Files:**
- Create: `scripts/engine/character.mjs`
- Create: `scripts/engine/keyframes.mjs`
- Modify: `templates/engine-project/episode.example.json`

**Interfaces:**
- `CharacterDefinition` contains `id`, `headRadius`, `torsoLength`, `upperArmLength`, `lowerArmLength`, `upperLegLength`, `lowerLegLength`, `strokeWidth`, and named colors.
- `CharacterKeyframe` contains shot-relative `t` seconds, root `{x,y}`, radians for `head`, `torso`, `shoulderL`, `elbowL`, `shoulderR`, `elbowR`, `hipL`, `kneeL`, `hipR`, and `kneeR`, plus `expression` values for `brows` and `mouth`.
- `interpolateKeyframes(keys: CharacterKeyframe[], time: number) -> CharacterPose` interpolates root position and joint angles between neighboring keyframes using smoothstep easing and holds the nearest keyed expression.
- `drawCharacter(ctx: CanvasRenderingContext2D, definition: CharacterDefinition, pose: CharacterPose) -> void` paints vector limbs, head, eyes, brows, mouth, and hands using only local Canvas primitives.
- `CharacterDefinition` owns stable proportions, palette, and line widths; `CharacterPose` owns per-shot body/joint state.

- [x] Define the keyframe interpolation rules: clamp to first/last key outside the keyed interval; require strictly increasing nonnegative shot-relative `t`; interpolate root coordinates and joint angles only; hold the prior expression until the next key.
- [x] Draw an articulated, slender stick figure with separate torso, upper/lower arms, upper/lower legs, hands, head, and expression primitives.
- [x] Keep character geometry independent from backgrounds, captions, and narration so a background change cannot alter character appearance or motion.
- [x] Update the example manifest with one character acting keyframe sequence that demonstrates visible arm and body movement across the two shots.

### Task 4: Composite scenes and render a vertical episode

**Files:**
- Create: `scripts/engine/render-episode.mjs`
- Modify: `package.json`
- Modify: `templates/engine-project/episode.example.json`

**Interfaces:**
- `renderEpisode(manifestPath: string, options?: { previewSeconds?: number; outputPath?: string }) -> Promise<RenderResult>` composites background, character layers, and timed captions into 1080×1920 frames and muxes narration using FFmpeg.
- `RenderResult` contains `outputPath`, `durationSeconds`, `width`, `height`, and `fps`.
- Renderer accepts existing local background and narration assets only; it does not generate either one.

- [x] Load and fit each background image as a full-frame vertical plate without stretching; keep code characters above the background and captions in the configured safe band.
- [x] Render at manifest frame rate and time each shot against the approved audio duration; fail before encoding if required assets or FFmpeg are unavailable.
- [x] Write intermediate frames and exports only in ignored, project-local `output/` paths; clean only renderer-owned temporary files, including when frame generation fails.
- [x] Encode H.264/AAC MP4 with 1080×1920 dimensions, 30 fps, and an SRT sidecar while preserving the narration's original rate.
- [x] Keep `scripts/render-episode.mjs` available unchanged for existing projects.

### Task 5: Add the Gemini TTS command

**Files:**
- Create: `scripts/gemini-tts.mjs`
- Modify: `package.json`
- Modify: `AUDIO.md`

**Interfaces:**
- CLI: `node scripts/gemini-tts.mjs --request <path> --output <path> --allow-network`.
- Request JSON: `{"model":"gemini-3.8-flash-tts","voice":"<approved voice>","turns":[{"text":"<exact spoken words>","style":"<optional sustained delivery>"}]}`. Each turn maps to one verbatim transcript part with structured `speech_metadata`.
- Reads `GEMINI_API_KEY` from the process environment.
- Writes the provider's WAV bytes directly and a nonsecret receipt containing model, voice, request timestamp, and output path.
- Makes one request per invocation and never retries automatically.

- [x] Implement the current Gemini TTS request format from the request JSON with approved verbatim transcript, selected voice, and structured turn-level `speech_metadata`; do not insert stage directions into transcript text.
- [x] Validate request fields and environment key presence before network access; error messages must never include the key or raw provider response body.
- [x] Save the WAV without adding a second WAV header and write only safe metadata to the receipt.
- [x] Require explicit `--allow-network` for the billable API request; no API request is part of setup or engine scaffolding.

### Task 6: Document the cross-editor workflow

**Files:**
- Modify: `README.md`
- Modify: `docs/workflow.md`
- Modify: `AUDIO.md`
- Create: `docs/engine-setup.md`

**Interfaces:**
- Documents the same CLI and manifest names as the implementation tasks.
- Describes Flow image generation as browser-based and manual asset handoff; does not claim an image MCP or API integration.

- [x] Document upstream skill install/use, Node/FFmpeg prerequisites, the local manifest format, and the render command.
- [x] Document using the same workspace TTS CLI from Codex or a VS Code terminal agent with `GEMINI_API_KEY` available in that agent's process environment.
- [x] Document Flow background generation/review and placing approved images into the local project; retain model/credit/per-output approval checks.
- [x] State that Boords MCP is the storyboard/review workspace and keep local `script.md` and per-episode spoken-text copies synchronized.
- [x] Preserve the existing repository policy that ignores generated project and output media.
