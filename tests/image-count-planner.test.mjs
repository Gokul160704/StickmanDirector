import test from 'node:test';
import assert from 'node:assert/strict';
import { planImageCount } from '../scripts/image-count-planner.mjs';

const beats = [
  { id: 'beat-01', startSeconds: 0, endSeconds: 5.2, essential: true, complexity: 1, phraseBoundaries: [2.1, 3.7] },
  { id: 'beat-02', startSeconds: 5.2, endSeconds: 11.1, essential: true, complexity: 2, emotionalHold: 1.2, phraseBoundaries: [7.3, 9.5] },
  { id: 'beat-03', startSeconds: 11.1, endSeconds: 16.4, essential: true, complexity: 1, phraseBoundaries: [13.2, 14.8] },
];

test('recommends deterministic counts for each supported pacing profile', () => {
  const reflective = planImageCount({ beats, pace: 'reflective' });
  const cinematic = planImageCount({ beats, pace: 'cinematic' });
  const energetic = planImageCount({ beats, pace: 'energetic' });

  assert.ok(reflective.recommendedCount > 0);
  assert.ok(cinematic.recommendedCount > reflective.recommendedCount);
  assert.ok(energetic.recommendedCount > cinematic.recommendedCount);
  assert.deepEqual(planImageCount({ beats, pace: 'cinematic' }), cinematic);
  assert.match(cinematic.rationale, /cinematic/i);
});

test('allocates an exact custom count with unique stable shot identifiers', () => {
  const result = planImageCount({ beats, pace: 'cinematic', customImageCount: 8 });

  assert.equal(result.mode, 'custom');
  assert.equal(result.requestedCount, 8);
  assert.equal(result.shots.length, 8);
  assert.equal(new Set(result.shots.map((shot) => shot.imageSlot)).size, 8);
  assert.deepEqual(result.shots.map((shot) => shot.sceneId), result.shots.map((_, index) => `scene-${String(index + 1).padStart(2, '0')}`));
  assert.deepEqual(result.shots, planImageCount({ beats, pace: 'cinematic', customImageCount: 8 }).shots);
});

test('supports the owner-specified 8, 24, and 50 image counts when feasible', () => {
  const longBeats = Array.from({ length: 8 }, (_, index) => ({
    id: `beat-${String(index + 1).padStart(2, '0')}`,
    startSeconds: index * 12,
    endSeconds: (index + 1) * 12,
    essential: true,
  }));
  for (const count of [8, 24, 50]) {
    const result = planImageCount({ beats: longBeats, customImageCount: count });
    assert.equal(result.shots.length, count);
    assert.equal(new Set(result.shots.map((shot) => shot.imageSlot)).size, count);
  }
});

test('keeps every beat represented and preserves integer 30fps timing', () => {
  const result = planImageCount({ beats, pace: 'cinematic', customImageCount: 8, timingSource: 'approved' });
  const beatIds = new Set(result.shots.map((shot) => shot.storyBeatId));

  assert.deepEqual(beatIds, new Set(beats.map((beat) => beat.id)));
  assert.equal(result.timingSource, 'approved');
  assert.ok(result.shots.every((shot) => Number.isInteger(shot.startFrame) && Number.isInteger(shot.endFrame)));
  assert.equal(result.shots[0].startFrame, 0);
  assert.equal(result.shots.at(-1).endFrame, Math.round(16.4 * 30));
  assert.ok(result.shots.every((shot, index) => index === 0 || shot.startFrame === result.shots[index - 1].endFrame));
});

test('snaps cuts to supplied phrase boundaries', () => {
  const result = planImageCount({
    beats: [{ id: 'beat-01', startSeconds: 0, endSeconds: 4, essential: true, phraseBoundaries: [1, 2.5, 3.25] }],
    customImageCount: 4,
  });

  assert.deepEqual(result.shots.map((shot) => shot.endFrame), [30, 75, 97.5].map((frame) => Math.round(frame)).concat(120));
});

test('fails closed for invalid counts and too few slots for essential beats', () => {
  assert.throws(() => planImageCount({ beats, customImageCount: 0 }), /positive integer/i);
  assert.throws(() => planImageCount({ beats, customImageCount: 2 }), /essential beats|at least one shot per beat/i);
  assert.throws(() => planImageCount({ beats, customImageCount: 1.5 }), /positive integer/i);
  assert.throws(() => planImageCount({ beats, customImageCount: Number.NaN }), /positive integer/i);
});

test('rejects malformed or non-chronological beat timing', () => {
  assert.throws(() => planImageCount({ beats: [] }), /at least one beat/i);
  assert.throws(() => planImageCount({ beats: [{ id: 'x', startSeconds: 2, endSeconds: 1 }] }), /startSeconds.*endSeconds/i);
  assert.throws(() => planImageCount({ beats: [{ id: 'x', startSeconds: 0, endSeconds: 1 }, { id: 'x', startSeconds: 1, endSeconds: 2 }] }), /unique/i);
});

test('requires declared narration duration to match the planned timeline within one frame', () => {
  assert.doesNotThrow(() => planImageCount({ beats, durationSeconds: 16.4 + (1 / 30) }));
  assert.throws(() => planImageCount({ beats, durationSeconds: 15 }), /duration.*timeline|one frame/i);
});
