import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { renderEpisode } from '../scripts/render-episode.mjs';

const run = promisify(execFile);

test('renders an offline canonical episode with real FFmpeg media', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-e2e-'));
  try {
    await mkdir(path.join(root, 'images')); await mkdir(path.join(root, 'narration')); await mkdir(path.join(root, 'captions')); await mkdir(path.join(root, 'exports'));
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=darkgreen:s=640x360:d=2', '-frames:v', '1', path.join(root, 'images', 'scene.png')]);
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-ar', '48000', '-ac', '1', path.join(root, 'narration', 'episode.wav')]);
    await writeFile(path.join(root, 'episode.json'), JSON.stringify({
      schemaVersion: 1, episodeId: 'e2e', title: 'Offline E2E', topic: 'Testing', description: 'Synthetic fixture', targetAudience: 'Test', intendedDurationSeconds: 2,
      output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9' }, references: { characters: [], props: [], environments: [] },
      audio: { path: 'narration/episode.wav' }, scenes: [{ id: 'scene-01', order: 1, image: 'images/scene.png', durationSeconds: 2, captions: [{ startSeconds: 0.2, endSeconds: 1.2, text: 'Synthetic test.' }] }],
    }));
    const result = await renderEpisode(root);
    assert.equal(result.verification.videoCodec, 'h264');
    assert.equal(result.verification.audioCodec, 'aac');
    assert.equal(result.verification.width, 1920);
    assert.equal(result.verification.height, 1080);
    assert.match(await readFile(result.srtPath, 'utf8'), /Synthetic test/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
