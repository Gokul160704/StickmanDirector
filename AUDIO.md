# StickmanDirector audio workflow

This document defines the default narration workflow for each series. Read it before writing or generating narration.

## Storytelling first

Write complete, speakable sentences with point of view, emotional progression, suspense, and purposeful pacing. Never use Caveman mode, compressed fragments, or shorthand for story text, captions, or voice direction. Keep a verbatim spoken-text file for each episode beside its audio. Any approved script revision must be reflected in both the project script and the narration text before rendering.

## Model and voice

Start with Gemini 3.8 Flash TTS (`gemini-3.8-flash-tts`) when currently available; consider Flash-Lite for high-volume or cost-sensitive work. Confirm current access, price, quota, and billing before use. Google AI Plus does not imply Gemini API quota or payment coverage. Use `GEMINI_API_KEY` from the Windows environment. Never ask for, print, or log the key.

Choose one supported voice for each recurring narrator and keep it consistent. Audition a short passage with the exact voice and performance metadata before creating full episode audio. Do not silently substitute a voice or model. Verify the live SDK/REST request schema for the selected model; do not assume the installed skill's legacy adapter supports current TTS models or style metadata.

## Expressive performance

Use turn-level style metadata for sustained delivery changes such as a whisper that begins at a story turning point. Use sparse inline vocal and pause tags only for momentary events supported by the model. The transcript itself should remain the exact words spoken; do not insert stage directions when the model expects metadata. Keep emotion attached to the narrative beat and avoid constant overacting.

## Production gates

1. Approve the script and per-episode spoken text.
2. Check current model access, cost, quota, and billing.
3. Audition the selected voice and style transition.
4. Obtain approval before a paid full narration batch.
5. Keep request receipts free of secrets and store only safe metadata.
6. Review audio against the approved text and final scene timing; retime captions after the final audio is accepted.

Google Flow's image workflow uses the signed-in Flow browser tab directly and does not require a Gemini API key. Narration API use is separate from Flow's browser-based visual workflow.
