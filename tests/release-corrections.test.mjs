import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { replaceOutputPair } from '../scripts/atomic-output.mjs';
import { transitionProductionState, createProductionState } from '../scripts/production-state.mjs';
import { validateEpisodeManifest } from '../scripts/episode-manifest.mjs';

const baseManifest = {
  schemaVersion: 1, episodeId: 'episode-01', title: 'Episode', topic: 'Topic', description: 'Desc', targetAudience: 'Everyone', intendedDurationSeconds: 2,
  output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9' }, references: { characters: [], props: [], environments: [] }, scenes: [],
};

test('rolls back both approved outputs when SRT replacement fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-atomic-'));
  try {
    const dir = path.join(root, 'exports'); await mkdir(dir);
    const mp4 = path.join(dir, 'episode.mp4'); const srt = path.join(dir, 'episode.srt'); const nextMp4 = path.join(dir, 'episode.next.mp4'); const nextSrt = path.join(dir, 'episode.next.srt');
    await writeFile(mp4, 'approved-mp4'); await writeFile(srt, 'approved-srt'); await writeFile(nextMp4, 'new-mp4'); await writeFile(nextSrt, 'new-srt');
    let renames = 0;
    const fsOps = {
      access,
      rename: async (...args) => { renames += 1; if (renames === 4) throw new Error('injected SRT install failure'); return rename(...args); },
      rm,
    };
    await assert.rejects(replaceOutputPair({ mp4Temp: nextMp4, srtTemp: nextSrt, mp4Target: mp4, srtTarget: srt, replace: true, fsOps }), /injected SRT install failure/);
    assert.equal(await readFile(mp4, 'utf8'), 'approved-mp4');
    assert.equal(await readFile(srt, 'utf8'), 'approved-srt');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects unsafe episode IDs and unsupported output configuration', () => {
  for (const episodeId of ['../episode', 'C:\\episode', 'episode/01', 'episode\\01', 'episode 01']) {
    assert.throws(() => validateEpisodeManifest({ ...baseManifest, episodeId }), /episodeId/i);
  }
  assert.throws(() => validateEpisodeManifest({ ...baseManifest, output: { ...baseManifest.output, resolution: '1280x720' } }), /1920x1080.*supported/i);
  assert.throws(() => validateEpisodeManifest({ ...baseManifest, output: { ...baseManifest.output, frameRate: 24 } }), /30.*supported/i);
});

test('rejects repeated and backward production-stage transitions', () => {
  const script = transitionProductionState(createProductionState('episode-01'), 'script');
  assert.throws(() => transitionProductionState(script, 'script'), /forward/i);
  assert.throws(() => transitionProductionState(script, 'research'), /forward/i);
});
