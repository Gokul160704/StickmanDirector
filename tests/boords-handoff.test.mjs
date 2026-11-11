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
