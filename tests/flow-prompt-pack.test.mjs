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
      scenes: [{ id: 'scene-01', order: 1, image: 'images/scene-01.png', durationSeconds: 4, visualDescription: 'Rover opens a door.', camera: 'wide shot', characters: ['rover'], props: ['key'], narration: 'The door opened.' }],
    }));
    const output = await buildPromptPack(file);
    const text = await readFile(output, 'utf8');
    assert.match(text, /Reference image prompts/);
    assert.match(text, /Character references: rover/);
    assert.match(text, /one complete, full-frame 16:9 story illustration/);
    assert.match(text, /Reserve extra negative space toward the right and bottom edges/);
    assert.match(text, /protected inner framing area/);
    assert.doesNotMatch(text, /Image-to-video/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('does not emit obsolete video prompts from a legacy prompt source', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-prompts-'));
  try {
    const file = path.join(root, 'flow-prompts.json');
    await writeFile(file, JSON.stringify({
      series: 'Series',
      aspectRatio: '16:9',
      styleAnchor: 'clean stickman',
      characterAnchors: [{ name: 'Rover', description: 'red cap and yellow coat', reference: 'references/rover.png' }],
      scenes: [{ imagePrompt: 'A full-frame still illustration.', videoPrompt: 'Animate this scene for eight seconds.' }],
    }));
    const output = await buildPromptPack(file);
    const text = await readFile(output, 'utf8');
    assert.match(text, /Still image/);
    assert.match(text, /character reference — Rover/i);
    assert.match(text, /Reserve extra negative space toward the right and bottom edges/);
    assert.match(text, /red cap and yellow coat/);
    assert.doesNotMatch(text, /videoPrompt|image-to-video|Optional external motion handoff|Animate this scene/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('applies safe framing to canonical reference prompts without watermark-removal instructions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-prompts-'));
  try {
    const file = path.join(root, 'episode.json');
    await writeFile(file, JSON.stringify({
      schemaVersion: 1, episodeId: 'e2', title: 'References', topic: 'Topic', description: 'Desc', targetAudience: 'Everyone', intendedDurationSeconds: 4,
      output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9' },
      references: { characters: ['references/characters/rover.png'], props: [], environments: [], visualStyle: 'clean stickman' },
      scenes: [{ id: 'scene-01', order: 1, image: 'images/scene-01.png', durationSeconds: 4, visualDescription: 'Rover waits.' }],
    }));
    const output = await buildPromptPack(file);
    const text = await readFile(output, 'utf8');
    assert.ok((text.match(/Reserve extra negative space toward the right and bottom edges/g) ?? []).length >= 2);
    assert.doesNotMatch(text, /remove|erase|mask|watermark/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
