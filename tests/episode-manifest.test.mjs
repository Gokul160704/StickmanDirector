import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImageCountPlan, validateEpisodeManifest } from '../scripts/episode-manifest.mjs';

const valid = {
  schemaVersion: 1,
  episodeId: 'episode-01',
  title: 'A Small Beginning',
  topic: 'Courage',
  description: 'A short illustrated story.',
  targetAudience: 'General audience',
  intendedDurationSeconds: 4,
  output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9' },
  references: { characters: ['references/characters/rover.png'], props: [], visualStyle: 'minimal stickman' },
  audio: { path: 'narration/episode-01.wav' },
  scenes: [
    {
      id: 'scene-01', order: 1, image: 'images/scene-01.png', durationSeconds: 4,
      narration: 'Rover took one careful step.',
      captions: [{ startSeconds: 0.2, endSeconds: 2.5, text: 'Rover took one careful step.' }],
    },
  ],
  production: { status: 'ready', provenance: { source: 'manual', approved: false } },
};

test('validates and normalizes the canonical episode manifest', () => {
  const result = validateEpisodeManifest(valid, { root: 'C:/series/demo' });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.scenes[0].order, 1);
  assert.equal(result.output.frameRate, 30);
});

test('rejects a manifest asset path that escapes the project root', () => {
  assert.throws(
    () => validateEpisodeManifest({ ...valid, scenes: [{ ...valid.scenes[0], image: '../outside.png' }] }, { root: 'C:/series/demo' }),
    /scenes\[0\]\.image.*inside the project root/i,
  );
});

test('rejects duplicate scene order and malformed caption ranges', () => {
  assert.throws(
    () => validateEpisodeManifest({ ...valid, scenes: [
      valid.scenes[0],
      { ...valid.scenes[0], id: 'scene-02', order: 1, captions: [{ startSeconds: 3, endSeconds: 2, text: 'bad' }] },
    ] }, { root: 'C:/series/demo' }),
    /unique consecutive order|caption.*endSeconds/i,
  );
});

test('rejects POSIX and Windows traversal or absolute asset paths consistently', () => {
  for (const image of ['../outside.png', '..\\outside.png', 'a/../../outside.png', 'a\\..\\..\\outside.png', '/tmp/outside.png', '\\tmp\\outside.png', 'C:/outside.png', 'C:\\outside.png', 'D:asset.png']) {
    assert.throws(() => validateEpisodeManifest({ ...valid, scenes: [{ ...valid.scenes[0], image }] }), /inside the project root|relative path/i, image);
  }
});

test('rejects output aspect ratios other than 16:9', () => {
  assert.throws(() => validateEpisodeManifest({ ...valid, output: { ...valid.output, aspectRatio: '9:16' } }), /16:9.*supported/i);
});

test('preserves optional image-count planning metadata and story beat ids', () => {
  const result = validateEpisodeManifest({
    ...valid,
    planning: {
      imageCount: {
        mode: 'custom', requestedCount: 8, recommendedCount: 6, pace: 'cinematic',
        timingSource: 'approved', version: 'image-count-planner-v1', dependencyHash: 'sha256:plan',
      },
    },
    scenes: [{ ...valid.scenes[0], storyBeatId: 'beat-01' }],
  });
  assert.equal(result.planning.imageCount.requestedCount, 8);
  assert.equal(result.scenes[0].storyBeatId, 'beat-01');
});

test('validates optional safe-framing profiles and per-scene overrides additively', () => {
  const result = validateEpisodeManifest({
    ...valid,
    safeFraming: { version: 'safe-framing-v1', margins: { left: 0.04, top: 0.04, right: 0.08, bottom: 0.1 } },
    scenes: [{ ...valid.scenes[0], safeFraming: { margins: { right: 0.12 } } }],
  });
  assert.equal(result.safeFraming.targetAspectRatio, '16:9');
  assert.match(result.safeFraming.hash, /^sha256:/);
  assert.equal(result.scenes[0].safeFraming.margins.right, 0.12);
  assert.equal(validateEpisodeManifest(valid).safeFraming, undefined);
  assert.throws(() => validateEpisodeManifest({ ...valid, safeFraming: { margins: { right: Number.NaN } } }), /safe-framing.*right/i);
  assert.throws(() => validateEpisodeManifest({ ...valid, scenes: [{ ...valid.scenes[0], safeFraming: { margins: { left: 0.8, right: 0.3 } } }] }), /safe-framing.*protected.*area/i);
});

test('rejects malformed optional image-count planning metadata', () => {
  assert.throws(() => validateEpisodeManifest({ ...valid, planning: { imageCount: { mode: 'custom', requestedCount: 0 } } }), /planning\.imageCount\.requestedCount.*positive integer/i);
  assert.throws(() => validateEpisodeManifest({ ...valid, planning: { imageCount: { mode: 'unknown', requestedCount: 8, recommendedCount: 6, pace: 'cinematic' } } }), /planning\.imageCount\.mode/i);
});

test('applies a planner result additively without changing schema version or episode identity', () => {
  const plan = {
    version: 'image-count-planner-v1', mode: 'custom', requestedCount: 2, recommendedCount: 2,
    pace: 'cinematic', timingSource: 'approved', dependencyHash: 'sha256:plan',
    shots: [
      { sceneId: 'scene-01', storyBeatId: 'beat-01', durationFrames: 60 },
    ],
  };
  const result = applyImageCountPlan(valid, plan);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.episodeId, valid.episodeId);
  assert.equal(result.planning.imageCount.mode, 'custom');
  assert.equal(result.scenes[0].storyBeatId, 'beat-01');
  assert.equal(result.scenes[0].durationSeconds, 2);
});
