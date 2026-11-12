import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPromptPack } from '../scripts/build-flow-prompt-pack.mjs';

test('builds still-image prompts from canonical episode metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-prompts-'));
  try {
    const file = path.join(root, 'episode.json');
    await writeFile(file, JSON.stringify({
      schemaVersion: 1, episodeId: 'e1', title: 'Episode', topic: 'A topic', description: 'Desc', targetAudience: 'Everyone', intendedDurationSeconds: 4,
      output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9' },
      references: { characters: ['references/characters/rover.png'], props: ['references/props/key.png'], visualStyle: 'clean stickman' },
      scenes: [{ id: 'scene-01', order: 1, image: 'images/scene-01.png', durationSeconds: 4, visualDescription: 'Rover opens a door.', camera: 'wide shot', characters: ['rover'], props: ['key'], references: ['REF-01', 'REF-02'], narration: 'The door opened.' }],
    }));
    const output = await buildPromptPack(file);
    const text = await readFile(output, 'utf8');
    assert.match(text, /Reference image prompts/);
    assert.match(text, /Character references: rover/);
    assert.match(text, /Reference IDs: REF-01, REF-02/);
    assert.match(text, /one complete, full-frame 16:9 story illustration/);
    assert.doesNotMatch(text, /Image-to-video/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
