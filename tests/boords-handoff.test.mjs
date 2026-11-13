import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoordsHandoff } from '../scripts/boords-handoff.mjs';

test('maps manifest scenes to reviewable Boords frame records', () => {
  const handoff = createBoordsHandoff({
    episodeId: 'episode-01', title: 'Episode', topic: 'Topic',
    scenes: [{ id: 'scene-01', order: 1, image: 'images/scene-01.png', durationSeconds: 4, visualDescription: 'A door opens.', characters: ['rover'], props: ['key'], camera: 'wide', narration: 'The door opened.', continuityNotes: 'Key remains in Rover hand.' }],
  });
  assert.equal(handoff.format, 'stickmandirector-boords-handoff-v1');
  assert.deepEqual(handoff.frames[0], {
    sceneId: 'scene-01', order: 1, shot: 'wide', action: 'A door opens.', characters: ['rover'], props: ['key'], narration: 'The door opened.', durationSeconds: 4, imagePath: 'images/scene-01.png', continuityNotes: 'Key remains in Rover hand.', reviewStatus: 'pending',
  });
});

test('maps planned story beats to one stable proposed frame per scene', () => {
  const handoff = createBoordsHandoff({
    episodeId: 'episode-01', title: 'Episode', topic: 'Topic',
    scenes: [
      { id: 'scene-01', order: 1, storyBeatId: 'beat-01', image: 'images/scene-01.png', durationSeconds: 2 },
      { id: 'scene-02', order: 2, storyBeatId: 'beat-01', image: 'images/scene-02.png', durationSeconds: 2 },
    ],
  });
  assert.deepEqual(handoff.frames.map((frame) => ({ sceneId: frame.sceneId, order: frame.order, storyBeatId: frame.storyBeatId })), [
    { sceneId: 'scene-01', order: 1, storyBeatId: 'beat-01' },
    { sceneId: 'scene-02', order: 2, storyBeatId: 'beat-01' },
  ]);
  assert.equal(handoff.integration.mode, 'manual-import');
});

test('includes optional safe-framing provenance and a read-only geometry preview per frame', () => {
  const handoff = createBoordsHandoff({
    episodeId: 'episode-01', title: 'Episode', topic: 'Topic',
    safeFraming: { version: 'safe-framing-v1', enabled: true, targetAspectRatio: '16:9', margins: { left: 0.04, top: 0.04, right: 0.08, bottom: 0.1 } },
    scenes: [{ id: 'scene-01', order: 1, image: 'images/scene-01.png', imageDimensions: { width: 2000, height: 1000 }, durationSeconds: 4 }],
  });
  assert.equal(handoff.frames[0].imagePath, 'images/scene-01.png');
  assert.equal(handoff.frames[0].safeFraming.targetAspectRatio, '16:9');
  assert.equal(handoff.frames[0].safeFraming.previewOnly, true);
  assert.equal(handoff.frames[0].safeFraming.destructive, false);
});
