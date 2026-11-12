# Production Evidence — Why Do We Dream? Episode 01

Evidence captured from the completed pilot run on 2026-11-12. This report distinguishes demonstrated behavior from repository work that remains to be implemented.

## Executive result

The existing repository successfully produced a 60-second narrated still-image episode from a canonical manifest. The pilot used GTAI-1 `flow-mcp` for Google Flow still generation and downloading, the repository Gemini TTS helper for narration, local timing/transcription for captions, and the repository FFmpeg renderer for final assembly.

The pilot is technically reproducible, but it is not evidence that the proposed guided plugin exists. The user recorded approval of the complete pilot, and Boords was read back with the storyboard and all 36 frames marked Approved. The retouched alternate video is a separate local derivative; the canonical Flow stills retain the provider mark.

## Evidence matrix

| Requirement | Evidence | Result |
| --- | --- | --- |
| Reuse the repository | Existing `scripts/`, `tests/`, `episode.json`, prompt pack, continuity notes, TTS helper, renderer, and production-state modules were used. | Demonstrated |
| GTAI-1 connectivity | `flow_status` reached the signed-in Flow project at `https://flow.google.com/project/173284a8-00f8-4be9-a4eb-7048a2e268f5`; the MCP returned live project, composer, credit, and job state. | Demonstrated in this desktop environment; remote-host access remains unproven |
| Flow image generation | `flow_generate` jobs completed for 36 scenes across batches B01–B14; outputs were downloaded with `flow_download`. | Demonstrated |
| Flow job recovery | B13 scene 02 had a failed local job record, but the existing Flow asset was found and downloaded without regeneration or credit use. | Demonstrated |
| Flow asset inspection | `flow_assets` listed the project media; current live check returned 101 image assets. | Demonstrated |
| Flow narration/transcription support | `flow_voices` returned available voices and `gemini_ready: true`; `flow_transcribe` returned word timings for the generated WAV. | Demonstrated |
| Image model/cost gate | The generation run used `Nano Banana 2.1`, 16:9, one image per scene, and each output reported zero Flow credits. Live balance after the run was 50 credits. | Demonstrated for the pilot; current Flow composer has since drifted to `Nano Banana Pro`, 9:16, so a new run must re-check settings |
| TTS helper | `scripts/gemini-tts.mjs` generated a valid WAV using `gemini-3.8-flash-tts` and voice `Charon`; receipt is beside the audio. | Demonstrated |
| TTS timing | Source narration measured 55.6 seconds; local padding produced a 60.0-second 24 kHz mono WAV. | Demonstrated |
| Caption generation | Word-alignment JSON and SRT were generated from measured timings and used by the renderer. | Demonstrated |
| FFmpeg assembly | `npm run render:stills -- projects/why-do-we-dream manifest` produced a 60.000-second 1920×1080 H.264/AAC MP4. | Demonstrated |
| Repository safety | Original Flow stills and original MP4 remain preserved; the watermark-retouched render is stored separately. | Demonstrated |
| Boords connection | Boords storyboard `7n28pd` contains 36 frames and all 36 have attached images. After the user's approval, a read-back confirmed the storyboard and all 36 frame statuses are `Approved`. | Demonstrated; approval recorded |
| Automated tests | `npm test` completed with 27 passing tests and 0 failures. | Demonstrated |

## Exact pilot artifacts

- Canonical manifest: `projects/why-do-we-dream/episode.json`
- Flow still review: `projects/why-do-we-dream/flow-review.md`
- Flow stills: `projects/why-do-we-dream/images/flow-reviewed/scene-01.jpeg` through `scene-36.jpeg`
- Original final MP4: `projects/why-do-we-dream/exports/why-do-we-dream-01-final.mp4`
- Retouched alternate MP4: `projects/why-do-we-dream-retouched/exports/why-do-we-dream-01-retouched.mp4`
- TTS request: `projects/why-do-we-dream/tts-request.json`
- TTS receipt: `projects/why-do-we-dream/narration/why-do-we-dream-01-gemini.wav.receipt.json`
- TTS audio: `projects/why-do-we-dream/narration/why-do-we-dream-01-gemini-60s.wav`
- Caption alignment: `projects/why-do-we-dream/captions/why-do-we-dream-01-final.json`
- Caption SRT: `projects/why-do-we-dream/captions/why-do-we-dream-01-rendered.srt`
- Flow tool guidance: `docs/google-flow-mcp.md`
- Audio workflow contract: `AUDIO.md`
- Production contracts: `docs/production-contracts.md`

## What remains to implement

1. **Guided Producer Agent:** No guided plugin/agent entry point currently exists. The repository contains workflow documentation and reusable scripts, not the interactive producer experience described in the proposal.
2. **Interactive setup wizard:** No wizard currently gathers project, model, voice, cost, reference, or approval choices.
3. **Persistent production integration:** `scripts/production-state.mjs` and its tests prove checkpoint primitives, but the pilot did not prove a single integrated Flow → TTS → captions → render → Boords resumable state machine.
4. **Remote execution proof:** The desktop agent reached `127.0.0.1:8787`; this does not prove that a remotely hosted agent can reach a user's local Flow MCP. A remote deployment needs a reachable authenticated bridge or an explicit same-machine execution contract.
5. **Schema contract tests:** The repository now contains offline contract tests that pin the required runtime schemas for `flow_status`, `flow_generate`, `flow_wait`, `flow_download`, `flow_assets`, `flow_transcribe`, and `flow_voices`. These tests do not authorize or perform live generation.
6. **Manifest reconciliation:** The manifest now deliberately records the verified pilot state: each scene is `generated` and `approved`, while the top-level production provenance records the user's approval. These are explicit evidence updates, not values derived from file existence alone.
7. **Human creative approval:** The user approved the complete pilot; no scene changes or regeneration were requested. This approval applies to the existing pilot only and does not authorize a new generation batch or publication.

## Commands used for local proof

```text
npm test
npm run validate:episode -- projects/why-do-we-dream/episode.json
npm run render:stills -- projects/why-do-we-dream manifest
npm run validate:episode -- projects/why-do-we-dream-retouched/episode.json
npm run render:stills -- projects/why-do-we-dream-retouched manifest
```

The live Flow evidence came from `flow_status`, `flow_assets`, `flow_voices`, `flow_download`, `flow_transcribe`, and the completed `flow_generate`/`flow_wait` job records. No credentials, cookies, API keys, or browser profile contents were included in this report.
