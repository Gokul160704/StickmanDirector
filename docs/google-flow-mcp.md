# Google Flow MCP integration

## Decision and current state

Use [GTAI-1/flow-mcp](https://github.com/GTAI-1/flow-mcp) as the preferred way for an agent to operate Google Flow, because its dedicated MCP tools expose session status, prompt batches, assets, and downloads without requiring the agent to repeatedly inspect and click the browser UI. It still controls a real Chrome window through Playwright/CDP; it is not a direct Flow API and does not eliminate browser automation.

Verified on 2026-10-26 against upstream commit `84b548f` (2026-10-23): the local clone at `%USERPROFILE%\flow-mcp` installed and built with Node.js 24.19.0. An MCP stdio smoke check returned the tool list and `flow_status`. After sign-in, status confirmed an active project and 50 credits. A separate Flow project named **StickmanDirector MCP Tool Test** was created for testing.

The MCP is connected in Codex's user config as `google-flow` and this repository has a VS Code workspace entry in `.vscode/mcp.json`. Both configurations set `FLOW_MCP_WHISPER` to the local Windows executable under `%USERPROFILE%\.flow-mcp\bin\whisper-cpp\Release\whisper-cli.exe`. Restart/reload the agent host after configuration changes. The server launches a separate Chrome profile at `%USERPROFILE%\.flow-mcp\chrome-profile`; sign into Google there manually and open the desired Flow project. This profile is separate from the everyday browser and from any Flow tab previously used by computer control.

## Installation notes

The supplied `npx -y @gtai/flow-mcp` command does not work: npm returned 404 for that package. The unscoped `flow-mcp` package is also unpublished. Follow the upstream README's current local-clone method instead:

```powershell
git clone https://github.com/GTAI-1/flow-mcp.git "$env:USERPROFILE\flow-mcp"
Set-Location "$env:USERPROFILE\flow-mcp"
npm ci
npm run build
npm run login
```

Requirements listed upstream include Node.js 22+, Google Chrome, and a signed-in Google account. This project has Node.js 24.19.0. Upstream says Windows is supported but also says it has not yet been tested on a real Windows PC; our install/build and MCP protocol smoke check passed, but this is not an end-to-end Flow generation test.

For Codex, configure the local server with the built `dist/index.js` entry point. The Codex user config already has this entry; verify with `codex mcp list`. For VS Code, `.vscode/mcp.json` uses the VS Code `servers` format. Keep the local clone path in sync if it is moved. Do not replace existing MCP entries when editing either host's config.

## Safe operating procedure

1. Call `flow_status` first. Confirm sign-in, the active project, current plan/credits, and queue state before planning a run. Stop if it reports a hint or the active project is unexpected.
2. Treat the Flow UI's live quote and balance as authoritative. Never assume a fixed daily credit amount, a model price, or that a subscription includes API quota; these can change by account and over time.
3. Before a batch that may spend credits, show the exact prompts/scenes, model, output count, per-output quote, and estimated total, then wait for explicit user approval for that batch. The repository approval rule remains in force even when an MCP tool advertises a safety feature.
4. For `flow_generate`, set `max_credits` deliberately. The server checks Flow's quote per scene and skips a scene that exceeds the cap; keep the cap at or below the approved per-output amount. Variants multiply outputs and possible spend. Do not infer that the cap is a batch-total limit or a user confirmation dialog.
5. `flow_edit` and `flow_continue` do not receive a usable pre-generation quote. Their required `acknowledge_cost: true` is an input guard, not proof that the user approved this specific operation. Get approval first and state the expected spend as unknown or estimated.
6. `flow_agent_images` says it makes images at zero credits and has no pre-run quote. Do not rely on the zero-cost claim without checking the current account and UI. It also lets Flow's agent rewrite prompts, so use it only when that variability is acceptable and review every result.
7. After a timeout or uncertain result, call `flow_wait`, `flow_status`, or `flow_assets` to inspect the existing job/output before retrying. Never repeat a generation just because a tool call timed out; the first job may still be running or may already have spent credits.
8. Review generated stills at full size, attach approved images to Boords, and use Flow image-to-video from approved stills for selected shots. Inspect clips for character and prop continuity before use. The still renderer is only an optional fallback and does not animate characters.
9. Do not call tools that move assets to Flow Trash, discard local output, or create paid edits without following the applicable confirmation/approval rules.

## Findings and limitations

- The server exposes tools such as `flow_status`, `flow_generate`, `flow_wait`, `flow_assets`, and `flow_download`; this is more efficient for the agent than repeated UI screenshots and clicks, but Flow is still operated in a visible dedicated Chrome session. The computer must stay awake while jobs run.
- The repository README describes a per-scene `max_credits` quote gate for standard generation. This is useful protection against unexpectedly expensive quotes, but it does not itself wait for user approval. Other operations explicitly note that no quote is shown.
- In the separate Flow test project, `flow_generate` created one simple image with `max_credits: 0`; the result reported 0 credits, and the balance remained at 50. `flow_assets` found it and `flow_download` retrieved it to the local test folder. The image was visually reviewed.
- Keep one long-lived MCP stdio connection open from `flow_generate` through `flow_wait`. A one-shot client that closes immediately after enqueueing can lose its in-memory job queue before completion; inspect the project with `flow_status`/`flow_assets` before ever considering a retry.
- `flow_narrate` was tested with both local Windows voices and Gemini TTS at 0 Flow credits. The user selected the existing Gemini TTS workflow for audio. `flow_voices` reports Gemini is ready when `%USERPROFILE%\.flow-mcp\gemini-key` exists; this local key file is populated from the existing `GEMINI_API_KEY` environment variable and protected for the current Windows user. Never print the key. For production narration, keep using this repository's `scripts/gemini-tts.mjs` workflow and its `AUDIO.md` approval and audition requirements; the Flow MCP Gemini voice is a verified tool path, not a replacement for the project's approved TTS helper.
- The `flow_character` rights notice was accepted for this test at the user's explicit request. `MCP Test Bot` appears in `flow_characters`. Creating a second character from an existing image and editing its portrait also passed.
- Installed the official Windows x64 `whisper-cli.exe` build from [ggml-org/whisper.cpp release b5454](https://github.com/ggml-org/whisper.cpp/releases/tag/b5454) under `%USERPROFILE%\.flow-mcp\bin\whisper-cpp\Release`. `flow_transcribe` and `flow_captions` then passed on the sample voiceover; transcription returned the exact 11-word line, and captions produced an MP4 plus SRT. The executable path is configured in both the workspace VS Code MCP config and Codex's user MCP config. The English `ggml-base.en.bin` model was fetched into the local model cache.
- The earlier MCP tool audit included a four-second vertical test video using Omni 1.1 Flash at 360p. Its `max_credits` cap was 7; Flow charged 4 credits. `flow_continue` succeeded and charged 10 credits. The recorded balance after that audit was 36, down from 50; check the live balance before any new generation. This vertical sample is historical and does not set the current 16:9 production default.
- `flow_agent_images` made one test image at 0 credits. `flow_download` downloaded a test video successfully; an image download also succeeded in the initial test, but a later character-image tile failed with "no Download item" in the current Flow UI. Verify downloaded files.
- `flow_edit` failed explicitly on the first valid test video with Flow's generic `Failed` result and deducted no credits. A second attempt reached the asynchronous path but its MCP client timed out; the final project listing and 36-credit balance showed no completed edit. Treat edit as unreliable/unverified in this Flow session.
- `flow_trash` moved the disposable `Empty mist pine forest` test image to Flow Trash and `flow_assets` confirmed it no longer appears. It remains recoverable in Flow's Trash; it was not permanently deleted.
- MCP protocol and authenticated status checks passed: the server listed its tools and, after manual sign-in, returned `signedIn: true`, `inProject: true`, and 50 credits remaining.
- `flow_cancel` and `flow_retry` were exercised with a nonexistent job ID while the queue was empty; both returned the expected no-job error without changing Flow.
- `npm ci` reported six dependency advisories in the upstream lockfile (three high, three moderate; npm reported fixes available). Do not run `npm audit fix` blindly against the upstream tool: review the upstream dependency update and compatibility first. This is a local third-party checkout, not a dependency added to this renderer.
- The upstream `npm test` script is a placeholder that intentionally exits with an error; use the successful TypeScript build and an MCP protocol/status smoke check for setup validation instead.
- Upstream notes Codex support as not yet tried. Our stdio smoke check and one zero-credit image/download test passed on Windows. The Codex desktop host still needs a restart and a check that it loaded the tools.

### Tool coverage from this run

| Tool | Result |
| --- | --- |
| `flow_status` | Passed; signed in, correct project open, empty queue at final check, 36 credits remaining. |
| `flow_generate` | Passed for one image at 0 credits and one 4-second vertical video; video cap was 7, actual cost was 4 credits. |
| `flow_wait` | Passed when called on the same long-lived MCP connection as the generation. |
| `flow_cancel` | Safe no-job case passed; no queued job existed to cancel. |
| `flow_retry` | Safe no-job case passed; no failed job existed to retry. |
| `flow_assets` | Passed; listed images, videos, and test characters, and confirmed the trashed test image was no longer in the project grid. |
| `flow_download` | Video download passed; an image download passed earlier, but one current character-image tile had no Download menu item. |
| `flow_agent_images` | Passed; one image created at 0 credits. |
| `flow_edit` | One valid-video attempt failed explicitly; a second timed out before a result. The latest asset list and credit balance showed no completed edit or deduction. |
| `flow_continue` | Passed from the generated video; 10 credits charged. |
| `flow_trash` | Passed on a disposable test image; it disappeared from project assets and remains recoverable in Flow Trash. |
| `flow_character` | Passed for both the earlier described character and an existing-image character after the user accepted Flow's rights notice. Both named characters appear in the character list. |
| `flow_character_edit` | Passed; restyled the isolated image-import test character and saved its portrait locally. |
| `flow_characters` | Passed; returned `MCP Test Bot`, `MCP Audit Image Character`, and the existing `Untitled character`. |
| `flow_techniques` | Passed; returned the camera and image prompt presets. |
| `flow_narrate` | Passed with Gemini TTS and a local Windows voice at 0 Flow credits. Gemini is the selected TTS route; production narration still follows `AUDIO.md` and `scripts/gemini-tts.mjs`. |
| `flow_voices` | Passed; lists Gemini and local voices. `gemini_ready: true` with the Flow MCP key file configured from the existing environment key. |
| `flow_assemble` | Passed with Gemini and local narration; rendered local MP4 files. |
| `flow_transcribe` | Passed after installing the official local whisper.cpp Windows binary and downloading the English model. |
| `flow_captions` | Passed; produced a captioned MP4 and `.srt` from the test narration. |

## Do and don't

**Do:** check status first, confirm the correct Flow project, price each approved batch from current UI quotes, set a narrow per-scene cap, wait on existing jobs, and review downloaded media.

**Don't:** use the outdated scoped `npx` command; assume the server is a stable API; assume all operations have a quote or approval pause; batch extra outputs without fresh approval; auto-retry uncertain paid operations; or let the MCP generate the animated stickman instead of the code renderer.
