import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertOutputAvailable, createRenderPlan, makeCaptionSrt } from '../scripts/render-episode.mjs';

test('creates a render plan for one canonical scene without five-scene assumptions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-manifest-render-'));
  try {
    await mkdir(path.join(root, 'images'));
    await mkdir(path.join(root, 'narration'));
    await writeFile(path.join(root, 'images', 'one.png'), 'image');
    await writeFile(path.join(root, 'narration', 'episode.wav'), 'audio');
    await writeFile(path.join(root, 'episode.json'), JSON.stringify({
      schemaVersion: 1, episodeId: 'e1', title: 'Episode', topic: 'Topic', description: 'Desc', targetAudience: 'Everyone', intendedDurationSeconds: 3,
      output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9' }, references: { characters: [], props: [], visualStyle: '' },
      audio: { path: 'narration/episode.wav' }, scenes: [{ id: 's1', order: 1, image: 'images/one.png', durationSeconds: 3, captions: [{ startSeconds: 0, endSeconds: 2, text: 'Hello.' }] }],
    }));
    const plan = await createRenderPlan(root);
    assert.equal(plan.mode, 'manifest');
    assert.equal(plan.scenes.length, 1);
    assert.equal(plan.duration, 3);
    assert.equal(plan.scenes[0].imagePath, path.join(root, 'images', 'one.png'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('writes explicit caption ranges with scene offsets', () => {
  const srt = makeCaptionSrt([], 5, { entries: [{ startSeconds: 1, endSeconds: 2, text: 'Scene two' }] });
  assert.match(srt, /00:00:01,000 --> 00:00:02,000/);
  assert.match(srt, /Scene two/);
});

test('refuses an existing output unless replacement is explicit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-output-'));
  try {
    const output = path.join(root, 'exports', 'episode.mp4');
    await mkdir(path.dirname(output)); await writeFile(output, 'approved');
    await assert.rejects(assertOutputAvailable(output), /Refusing to overwrite/);
    await assert.doesNotReject(assertOutputAvailable(output, { replace: true }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('loads explicit caption alignment data instead of estimating it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-align-'));
  try {
    await mkdir(path.join(root, 'images')); await writeFile(path.join(root, 'one.png'), 'image');
    await writeFile(path.join(root, 'alignment.json'), JSON.stringify({ captions: [{ start: 0.4, end: 1.1, text: 'Aligned phrase' }] }));
    await writeFile(path.join(root, 'episode.json'), JSON.stringify({
      schemaVersion: 1, episodeId: 'align', title: 'Episode', topic: 'Topic', description: 'Desc', targetAudience: 'Everyone', intendedDurationSeconds: 2,
      output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9' }, references: { characters: [], props: [] },
      captions: { timingSource: 'alignment', alignmentPath: 'alignment.json' }, scenes: [{ id: 's1', order: 1, image: 'one.png', durationSeconds: 2, captions: [] }],
    }));
    const plan = await createRenderPlan(root);
    assert.deepEqual(plan.captionEntries, [{ startSeconds: 0.4, endSeconds: 1.1, text: 'Aligned phrase' }]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
