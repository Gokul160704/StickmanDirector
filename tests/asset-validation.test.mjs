import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateImageAssets } from '../scripts/asset-validation.mjs';

test('reports missing scene assets before rendering', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-assets-'));
  try {
    await assert.rejects(
      validateImageAssets(root, [{ id: 'scene-01', image: 'images/missing.png' }]),
      /Missing image asset.*scene-01/i,
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects an invalid media file with an actionable error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-assets-'));
  try {
    await writeFile(path.join(root, 'broken.png'), 'not an image');
    await assert.rejects(validateImageAssets(root, [{ id: 'scene-01', image: 'broken.png' }]), /invalid image|ffprobe/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
