import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEpisodeManifest } from '../scripts/episode-manifest.mjs';

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
