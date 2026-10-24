import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRenderPlan, makeCaptionSrt } from '../scripts/render-episode.mjs';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-render-'));
  await Promise.all(['images', 'narration', 'captions', 'output'].map((d) => mkdir(path.join(root, d))));
  for (let i = 1; i <= 5; i++) {
    await writeFile(path.join(root, 'images', `p1-s${i}.jpg`), 'image');
    await writeFile(path.join(root, 'captions', `caption-${i}.txt`), `Caption ${i}`);
  }
  await writeFile(path.join(root, 'narration', 'part-1.wav'), 'old audio');
  await writeFile(path.join(root, 'narration', 'part-1-v2.wav'), 'revised audio');
  return root;
}

test('render plan prefers revised audio and orders all five scene stills', async () => {
  const root = await fixture();
  try {
    const plan = await createRenderPlan(root, 1);
    assert.equal(plan.audioPath, path.join(root, 'narration', 'part-1-v2.wav'));
    assert.deepEqual(plan.imagePaths.map((file) => path.basename(file)), ['p1-s1.jpg', 'p1-s2.jpg', 'p1-s3.jpg', 'p1-s4.jpg', 'p1-s5.jpg']);
    assert.equal(plan.captionTexts.length, 5);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('caption SRT spaces one short caption at each still scene and stays within audio duration', () => {
  const srt = makeCaptionSrt(['Opening', 'Alert', 'Fast', 'Door', 'Closet'], 47.4, { displaySeconds: 2.5, offsetSeconds: 0.1 });
  assert.match(srt, /00:00:00,100 --> 00:00:02,600/);
  assert.match(srt, /00:00:09,580 --> 00:00:12,080/);
  assert.match(srt, /00:00:37,?920 --> 00:00:40,420/);
  assert.equal((srt.match(/^\d+$/gm) ?? []).length, 5);
});

test('render plan fails with an actionable missing-scene error', async () => {
  const root = await fixture();
  try {
    await rm(path.join(root, 'images', 'p1-s3.jpg'));
    await assert.rejects(createRenderPlan(root, 1), /Missing scene image.*p1-s3\.jpg/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
