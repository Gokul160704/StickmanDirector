import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  approveEpisodePlan,
  createEpisodeBoordsHandoff,
  createSeriesProducer,
  planSeriesEpisodes,
  reconcileSeriesDependencies,
  resumeSeriesProducer,
  saveSeriesProducer,
} from '../scripts/series-producer.mjs';

async function tempRoot(prefix = 'stickman-series-producer-') {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('creates an opt-in three-episode producer with independent schema-v1 manifests', async () => {
  const parent = await tempRoot();
  try {
    const root = path.join(parent, 'series');
    const result = await createSeriesProducer({ root, name: 'Demo Series', topic: 'A careful adventure' });
    assert.equal(result.mode, 'series');
    assert.equal(result.episodes.length, 3);
    assert.equal(result.bible.revision.status, 'draft');
    assert.equal(result.episodes[1].predecessorId, result.episodes[0].episodeId);
    assert.equal(result.episodes.every((episode) => episode.approval.status === 'draft'), true);
    for (const episode of result.episodes) {
      const manifest = JSON.parse(await readFile(episode.manifestPath, 'utf8'));
      assert.equal(manifest.schemaVersion, 1);
      assert.equal(manifest.output.aspectRatio, '16:9');
      assert.equal(manifest.series.bibleRevisionHash, result.bible.revision.integrity.hash);
      assert.equal(manifest.series.episodeIndex, episode.index);
    }
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('accepts custom positive episode counts without changing legacy manifest semantics', async () => {
  const parent = await tempRoot();
  try {
    const result = await createSeriesProducer({ root: path.join(parent, 'series'), name: 'Five Part', episodeCount: 5 });
    assert.equal(result.episodes.length, 5);
    assert.equal(result.episodes.at(-1).index, 5);
    await assert.rejects(createSeriesProducer({ root: path.join(parent, 'bad'), name: 'Bad', episodeCount: 0 }), /positive integer/i);
    await assert.rejects(createSeriesProducer({ root: path.join(parent, 'bad-hash'), name: 'Bad hash', referenceHashes: { rover: 'not-a-hash' } }), /sha256 hash/i);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('binds approval to the current revision and invalidates only the affected future episode', async () => {
  const parent = await tempRoot();
  try {
    const root = path.join(parent, 'series');
    const created = await createSeriesProducer({ root, name: 'Approval Series' });
    const approved = approveEpisodePlan(created, created.episodes[1].episodeId, { approvalId: 'owner-episode-2-v1', actor: 'owner' });
    assert.equal(approved.episodes[1].approval.status, 'approved');
    await saveSeriesProducer(approved);
    assert.equal((await resumeSeriesProducer(root)).episodes[1].approval.status, 'approved');
    const changed = reconcileSeriesDependencies(approved, { bibleRevisionHash: 'sha256:changed' });
    assert.equal(changed.episodes[0].approval.status, 'draft');
    assert.equal(changed.episodes[1].approval.status, 'needs-review');
    assert.equal(changed.episodes[2].approval.status, 'needs-review');
    assert.match(changed.episodes[1].invalidatedReason, /dependency/i);
    const voiceChanged = reconcileSeriesDependencies(approved, { narrator: { model: 'different' } });
    assert.equal(voiceChanged.episodes[1].approval.status, 'needs-review');
    assert.notEqual(voiceChanged.episodes[1].dependencyHash, approved.episodes[1].dependencyHash);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('resume is idempotent and manual Boords handoff is local, ordered, and safe-framing aware', async () => {
  const parent = await tempRoot();
  try {
    const root = path.join(parent, 'series');
    const created = await createSeriesProducer({ root, name: 'Resume Series' });
    const resumed = await resumeSeriesProducer(root);
    assert.deepEqual(resumed.episodes.map(({ episodeId, manifestPath }) => ({ episodeId, manifestPath })), created.episodes.map(({ episodeId, manifestPath }) => ({ episodeId, manifestPath })));
    const handoff = await createEpisodeBoordsHandoff(root, resumed.episodes[0].episodeId);
    assert.equal(handoff.integration.mode, 'manual-import');
    assert.equal(handoff.integration.liveBoordsAccessVerified, false);
    assert.equal(handoff.safeFraming.targetAspectRatio, '16:9');
    assert.equal(handoff.outputPath.endsWith('boords-handoff.json'), true);
    assert.equal(JSON.parse(await readFile(handoff.outputPath, 'utf8')).integration.mode, 'manual-import');
    assert.equal(handoff.providerCalls, undefined);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('plans image counts per episode and rejects stale persisted approvals on resume', async () => {
  const parent = await tempRoot();
  try {
    const root = path.join(parent, 'series');
    const created = await createSeriesProducer({ root, name: 'Plan Series' });
    const planned = planSeriesEpisodes(created, {
      [created.episodes[0].episodeId]: {
        beats: [{ id: 'beat-01', startSeconds: 0, endSeconds: 8 }],
        customImageCount: 2,
        timingSource: 'offline-test',
      },
    });
    assert.equal(planned.episodes[0].imageCountPlan.requestedCount, 2);
    const manifestPath = planned.episodes[0].manifestPath;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.series.approval = { status: 'approved', approvalId: 'stale', actor: 'owner', approvedAt: '2026-11-13T00:00:00.000Z', dependencyHash: 'sha256:stale' };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const resumed = await resumeSeriesProducer(root);
    assert.equal(resumed.episodes[0].approval.status, 'needs-review');
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('rejects predecessor cycles and mismatched revision bindings before any provider action', async () => {
  const parent = await tempRoot();
  try {
    const root = path.join(parent, 'series');
    const created = await createSeriesProducer({ root, name: 'Continuity Series' });
    const cycle = structuredClone(created);
    cycle.episodes[0].predecessorId = cycle.episodes[2].episodeId;
    assert.throws(() => reconcileSeriesDependencies(cycle, {}), /predecessor|cycle|order/i);
    assert.throws(() => approveEpisodePlan(created, created.episodes[0].episodeId, { approvalId: '', actor: 'owner' }), /approvalId/i);
    const changed = reconcileSeriesDependencies(created, { referenceHashes: { traveler: 'sha256:missing' } });
    assert.equal(changed.episodes[0].approval.status, 'needs-review');
  } finally { await rm(parent, { recursive: true, force: true }); }
});
