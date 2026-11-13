# Type II final production evidence

Audit date: 2026-11-13 (Asia/Calcutta)

Repository baseline: `master@44875cd29c6385630c96a26191ba8b112dc13efd`.

Episode: **The Type II Civilization That No Longer Needs a Planet**

This is a sanitized, read-only reconciliation. It does not modify the approved
media, manifest, receipts, Boords content, or provider state.

## VERIFIED

- The canonical local manifest is `projects/type-ii-civilization/episode.json` (schemaVersion 1, eight ordered scenes). Its SHA-256 is `b81a6466630f5ca7853edf5f43aabea0c118b10996404a7d43469137bbf93605`.
- The final MP4 exists at `projects/type-ii-civilization/exports/type-ii-civilization-01-final.mp4`, SHA-256 `f23d3e3622623d716ec694925963245a41c20ee06db76e135e2290e884b48138`, 6,432,687 bytes. FFprobe reports 1920x1080, H.264, 30/1 fps, AAC mono at 24 kHz, and container duration 92.566667 seconds.
- The narration WAV exists at `projects/type-ii-civilization/narration/type-ii-civilization-01-gemini.wav`, SHA-256 `f8783f2f55d8419b81b7a1fd4c9d462f8ec9ef68214edc3126ffdda3696abd24`, 4,450,588 bytes. FFprobe reports PCM s16le, mono, 24 kHz, duration 92.560000 seconds.
- The WAV is byte-identical to `work/type-ii-civilization/narration.wav` (the SHA-256 values match exactly).
- The eight manifest scene durations sum to 92.559998 seconds. The SRT contains eight ordered cues; the last cue ends at 00:01:32,560. The 90.00-second Boords planning total is therefore an approximate storyboard estimate, not the final render duration.
- Boords project `g5xod7` and storyboard `w211dd` were read back. The storyboard is status `approved`, aspect ratio `16x9`, and contains eight ordered frames (32183178–32183185). Each frame has an image asset, narrative text, action, style and continuity fields. Frame-level `status` values are null; this supports storyboard-level approval only.
- Local image dimensions are 2752x1536 for S01/S04/S05/S06/S08 and 1280x720 for S02/S03/S07. All are 16:9-compatible source stills.
- Boords asset metadata for S01, S04, S05, S06 and S08 reports the same original SHA-256, byte size and dimensions as the local counterparts.
- The owner reported listening to the full narration, noticed a voice change around 00:53, and explicitly chose to keep the current audio with no regeneration. That decision is preserved; this audit did not trigger playback or new TTS generation.

## BINARY DIFFERENT / VISUALLY CONSISTENT

Boords read-back reports re-encoded 1280x720 JPEG assets for S02, S03 and S07:

| Shot | Local file SHA-256 / bytes | Boords original SHA-256 / bytes | Boords asset | Finding |
| --- | --- | --- | --- | --- |
| S02 | `b84a88ea577f95f831a7c0ed506e592fe2e4252fda0b001166a657d31ae589d1` / 816,934 | `24ac178219990b4db3a526611a3da046fd8583eaef58b3cfd559b118ade8b9f0` / 101,865 | `a151c50b-5913-4230-ba7c-3a608593467c` | Binary different; dimensions and scene correspondence are consistent. |
| S03 | `6e268f94cd1cc87d6da9e88da86356d995601ce5d5e3d5931b3cd8d559c687f0` / 740,186 | `1bebd137d1a20e457a3facf112a6b6d391845f800782e64119b7747f42dd595a` / 118,986 | `1cd85751-084a-492d-9b45-6f0d01443b3d` | Binary different; dimensions and scene correspondence are consistent. |
| S07 | `5da813834d0e59650d407ad73481d1bb16ddb5fdf638e62fccad3d373ef21440` / 661,794 | `914e83e0fdb0b9c55b554fa3866f2af66aa57c2f1873c73f5f722cf23172c162` / 86,474 | `74fd9834-f558-4b82-ac49-da45a78fedb5` | Binary different; dimensions and scene correspondence are consistent. |

The Boords metadata records the three assets as verified and completed JPEGs at
1280x720. This is consistent with resizing/re-encoding by the Boords asset
pipeline, but no independent transformation log was available. Do not assert
byte identity or a specific encoder operation beyond that evidence.

## AUDIO RECEIPT AND PROVENANCE LIMITS

The manifest points to `narration/type-ii-civilization-01-gemini.wav.receipt.json`,
but that file is absent. The available related receipt is
`work/type-ii-civilization/narration.wav.receipt.json`; it records model
`gemini-3.8-flash-tts`, voice `Charon`, request time `2026-11-12T20:24:51.273Z`,
and the work output path, but no output SHA-256. The matching WAV hashes prove
byte identity between the local project output and the work copy; they do not
reconstruct the missing manifest-path receipt or prove historical authorization.
No historical receipt was fabricated and no original file was changed.

The manifest records approved Flow/TTS provenance and the approved script and
references, while the available evidence does not provide a complete signed
provider receipt chain for every scene. Provider-generation consent and billing
authorization are therefore **NOT VERIFIED** beyond the recorded project
metadata and existing owner-approved production record.

## GUIDED PRODUCER CLASSIFICATION

The final render is a completed, technically validated still-image episode with
Boords storyboard approval and explicit owner creative acceptance. The available
records do not prove that this exact episode was produced by a fresh, fully
instrumented Guided Producer end-to-end run with every consent/read-back event
captured. Therefore:

- Completed render: **VERIFIED**.
- Fresh Guided Producer E2E acceptance sample: **NOT VERIFIED**.
- Technical release disposition: **ACCEPTABLE WITH DOCUMENTED PROVENANCE EXCEPTION**.
- Publication authorization: **NOT GRANTED / NOT IN SCOPE**.

## ACCEPTED VARIATION AND RISKS

- The voice variation around 00:53 is an accepted characteristic of the existing
  recording. Its exact cause is **NOT VERIFIED** and is not an automatic release
  blocker because the owner explicitly chose to keep the audio.
- The 90-second storyboard estimate versus the 92.56-second narration/render is
  a documented planning-versus-final-timing difference. The manifest, WAV,
  MP4 and SRT are internally aligned at the final duration.
- Boords S02/S03/S07 are visually corresponding re-encoded assets, not byte-
  identical copies. Any future forensic or replacement decision must use the
  local originals as the render source of truth.

## RECOMMENDATION

Release QA may accept the existing technical render with the two explicit
exceptions above: the missing manifest-path audio receipt and the unverified
fresh Guided Producer classification. Keep the approved WAV and MP4 unchanged;
do not regenerate audio, generate new media, publish, or alter Boords assets.
Task #6 should record this disposition rather than claiming complete historical
provenance or a verified Guided Producer E2E sample.

Checks performed for this report: local SHA-256 inventory, manifest/SRT review,
FFprobe of MP4 and WAV, Boords project/storyboard/frame read-back, `npm test`
(98 passed on clean `master@44875cd`), and `git diff --check` (clean). The
canonical episode validator was **NOT RUN** in the clean evidence worktree
because ignored `projects/type-ii-civilization/` assets are not present there;
the manifest was reviewed and probed from the preserved local production path.
