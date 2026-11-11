import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getMediaToolConfig } from '../scripts/media-tools.mjs';
import { createProductionState, loadProductionState, saveProductionState } from '../scripts/production-state.mjs';

test('resolves configurable FFmpeg and FFprobe executables', () => {
  const previous = { ffmpeg: process.env.STICKMAN_FFMPEG, ffprobe: process.env.STICKMAN_FFPROBE };
  process.env.STICKMAN_FFMPEG = 'custom-ffmpeg'; process.env.STICKMAN_FFPROBE = 'custom-ffprobe';
  try { assert.deepEqual(getMediaToolConfig(), { ffmpeg: 'custom-ffmpeg', ffprobe: 'custom-ffprobe' }); }
  finally {
    if (previous.ffmpeg === undefined) delete process.env.STICKMAN_FFMPEG; else process.env.STICKMAN_FFMPEG = previous.ffmpeg;
    if (previous.ffprobe === undefined) delete process.env.STICKMAN_FFPROBE; else process.env.STICKMAN_FFPROBE = previous.ffprobe;
  }
});

test('persists checkpoints in nested project folders and reloads them', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-checkpoint-'));
  try {
    const file = path.join(root, 'state', 'production-state.json');
    await saveProductionState(file, createProductionState('episode-01'));
    const loaded = await loadProductionState(file);
    assert.equal(loaded.episodeId, 'episode-01');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).stage, 'research');
  } finally { await rm(root, { recursive: true, force: true }); }
});
