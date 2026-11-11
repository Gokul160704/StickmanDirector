import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertPathInsideRoot } from '../scripts/path-safety.mjs';
import { formatConcatPath } from '../scripts/render-episode.mjs';

test('rejects output paths that escape through a symlinked parent directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-safe-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'stickman-outside-'));
  try {
    await mkdir(path.join(root, 'exports'));
    const link = path.join(root, 'exports', 'linked');
    try {
      await (await import('node:fs/promises')).symlink(outside, link, 'junction');
    } catch { return; }
    await assert.rejects(assertPathInsideRoot(root, path.join(link, 'episode.mp4'), 'output.path'), /outside the project root/i);
    await assert.rejects(assertPathInsideRoot(root, path.join(link, 'episode.srt'), 'caption output path'), /outside the project root/i);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('escapes apostrophes and backslashes in concat-demuxer paths', () => {
  const formatted = formatConcatPath("C:\\safe\\Rover's scene.png");
  assert.equal(formatted, "file 'C:/safe/Rover'\\''s scene.png'");
});
