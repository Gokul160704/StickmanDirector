# Upstream skill compatibility

The installed official `directing-stickman-videos` skill was inspected from
`C:\Users\ponna\.agents\skills\directing-stickman-videos`. The upstream Git
repository was checked at commit `7af3957dff97914b2d762fb248ee2427d7fca72c`
(`main`, 2026-11-12). The local installation contains the matching two-route
entry point and the Autopilot references, including `autopilot-runtime.md`.

## Reused principles

- Topic/brief-first production and explicit separation between Director and Autopilot routes.
- Relative local media paths, non-overwriting scaffolds, explicit FFmpeg/FFprobe prerequisites, and fail-closed validation.
- Actual audio probing for voice-led timing instead of pretending proportional captions are forced alignment.
- Semantic, explicitly timed caption cues and local reports/checkpoints as evidence rather than proof of human approval.
- Project-local artifacts outside the installed skill, with provider/model/voice metadata kept separate from reusable workflow code.

## Deliberate local profile

This repository uses a project-local `episode.json` profile and `scripts/render-episode.mjs`.
It does not import or modify upstream files. Upstream Autopilot Manifest v1 is built
around style-specific layers, authored local motion/SFX, and a `project.json` runtime;
its completion gates require meaningful picture motion. The approved StickmanDirector
contract here instead requires Google Flow still images only, variable-length full-frame
scenes, narration-driven FFmpeg assembly, semantic captions, and a 1080p MP4. Aliasing
the upstream runtime would therefore misrepresent static stills as satisfying motion
evidence and would introduce a second incompatible manifest.

Google Flow remains an external still-image production handoff. Boords remains the
storyboard/review workspace. Gemini TTS remains an explicitly authorized external audio
step. None of these integrations are claimed as live-tested by local unit tests.
