import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createSeriesBible,
  computeRevisionHash,
  validateSeriesBible,
  writeSeriesRevision,
  approveSeriesRevision,
  updateSeriesPlanning,
  diffSeriesBibles,
  scaffoldSeries,
} from '../scripts/series-bible.mjs';

test('creates a deterministic three-episode bible with stable continuity metadata', async () => {
  const bible = createSeriesBible({ name: 'Type II Civilization', topic: 'A planetary-scale future', episodeCount: 3, slug: 'type-ii-civilization', createdAt: '2026-11-13T00:00:00.000Z' });
  assert.equal(bible.schemaVersion, 1);
  assert.deepEqual(bible.episodes.map((episode) => episode.episodeId), [
    'type-ii-civilization-episode-01',
    'type-ii-civilization-episode-02',
    'type-ii-civilization-episode-03',
  ]);
  assert.equal(bible.episodes[1].predecessor, bible.episodes[0].episodeId);
  assert.equal(bible.narrator.approval.status, 'draft');
  assert.equal(computeRevisionHash(bible).length, 64);
  assert.equal((await validateSeriesBible(bible)).seriesId, 'type-ii-civilization');
});

test('rejects duplicate IDs, invalid counts, predecessor cycles, and bad hashes', async () => {
  const bible = createSeriesBible({ name: 'Demo', episodeCount: 3, slug: 'demo', createdAt: '2026-11-13T00:00:00.000Z' });
  assert.throws(() => createSeriesBible({ name: 'Demo', episodeCount: 0 }), /positive integer/i);
  await assert.rejects(validateSeriesBible({ ...bible, episodes: [bible.episodes[0], { ...bible.episodes[1], episodeId: bible.episodes[0].episodeId }] }), /duplicate.*id/i);
  await assert.rejects(validateSeriesBible({ ...bible, episodes: bible.episodes.map((episode, index) => ({ ...episode, predecessor: bible.episodes[(index + 1) % 3].episodeId })) }), /cycle/i);
  await assert.rejects(validateSeriesBible({ ...bible, revision: { ...bible.revision, integrity: { ...bible.revision.integrity, hash: '0'.repeat(64) } } }), /hash/i);
});

test('rejects missing, blank, malformed, mismatched, and invalid revision integrity metadata', async () => {
  const bible = createSeriesBible({ name: 'Demo', episodeCount: 1, slug: 'demo', createdAt: '2026-11-13T00:00:00.000Z' });
  const cases = [
    { revision: undefined },
    { revision: { ...bible.revision, integrity: undefined } },
    { revision: { ...bible.revision, integrity: { algorithm: 'sha256', hash: '' } } },
    { revision: { ...bible.revision, integrity: { algorithm: 'SHA-256', hash: '0'.repeat(64) } } },
    { revision: { ...bible.revision, integrity: { algorithm: 'sha256', hash: 'not-a-hash' } } },
    { revision: { ...bible.revision, integrity: { algorithm: 'sha256', hash: '0'.repeat(64) } } },
    { revision: { ...bible.revision, version: 0 } },
    { revision: { ...bible.revision, version: '1' } },
  ];
  for (const change of cases) await assert.rejects(validateSeriesBible({ ...bible, ...change }), /revision|hash|integrity/i);
});

test('writes append-only revisions and preserves approved snapshots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-bible-'));
  try {
    const first = createSeriesBible({ name: 'Demo', episodeCount: 1, slug: 'demo', createdAt: '2026-11-13T00:00:00.000Z' });
    await writeSeriesRevision(root, first);
    await assert.rejects(writeSeriesRevision(root, { ...first, revision: { ...first.revision, status: 'approved', approved: true } }, { version: 2 }), /approval|authorized|approveSeriesRevision/i);
    const approved = await approveSeriesRevision(root, { approvedBy: 'chief', approvedAt: '2026-11-13T00:00:00.000Z', authorizationId: 'trello:#17-review-1' });
    assert.equal(approved.revision.approval.status, 'approved');
    assert.equal(approved.revision.approval.boundRevisionHash.length, 64);
    const before = await readFile(path.join(root, 'series-bible.revisions', 'revision-02.json'), 'utf8');
    const result = await updateSeriesPlanning(root, { premise: 'Changed premise' });
    assert.equal(result.revision.version, 3);
    assert.equal(await readFile(path.join(root, 'series-bible.revisions', 'revision-02.json'), 'utf8'), before);
    assert.equal(JSON.parse(await readFile(path.join(root, 'series-bible.json'), 'utf8')).revision.version, 3);
    await assert.rejects(writeSeriesRevision(root, first, { version: 2 }), /already exists|immutable/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects an approval record whose authorization is not bound to the revision', async () => {
  const bible = createSeriesBible({ name: 'Demo', episodeCount: 1, slug: 'demo', createdAt: '2026-11-13T00:00:00.000Z' });
  const candidate = { ...bible, revision: { ...bible.revision, approved: true, status: 'approved', approval: { status: 'approved', approvedBy: 'chief', approvedAt: '2026-11-13T00:00:00.000Z', authorizationId: 'fake', boundRevisionHash: '0'.repeat(64) } } };
  await assert.rejects(validateSeriesBible(candidate), /approval|authorization|bound/i);
  candidate.revision.approval.boundRevisionHash = computeRevisionHash(candidate);
  candidate.revision.approval.approvedAt = 'not-a-date';
  await assert.rejects(validateSeriesBible(candidate), /approval|authorization|bound/i);
});

test('updates planning into a new review-required revision and reports changed top-level fields', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-bible-update-'));
  try {
    const first = createSeriesBible({ name: 'Demo', episodeCount: 1, slug: 'demo', createdAt: '2026-11-13T00:00:00.000Z' });
    await writeSeriesRevision(root, first);
    const next = await updateSeriesPlanning(root, { premise: 'A changed premise' });
    assert.equal(next.revision.version, 2);
    assert.equal(next.revision.parentVersion, 1);
    assert.equal(next.revision.status, 'review-required');
    assert.deepEqual(diffSeriesBibles(first, next), ['premise', 'revision']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('blocks unsafe or stale reference files before accepting a bible', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-bible-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'stickman-bible-outside-'));
  try {
    const file = path.join(root, 'references', 'traveler.txt');
    await mkdir(path.dirname(file));
    await writeFile(file, 'Traveler: red cap, yellow clothes', 'utf8');
    const bible = createSeriesBible({ name: 'Demo', episodeCount: 1, slug: 'demo', createdAt: '2026-11-13T00:00:00.000Z' });
    bible.references.characters.push({ id: 'traveler', name: 'Traveler', owner: 'series', state: 'stable', source: 'local', filePath: 'references/traveler.txt', revisionSha256: 'sha256:' + (await import('node:crypto')).createHash('sha256').update('Traveler: red cap, yellow clothes').digest('hex'), history: [] });
    bible.revision.integrity.hash = computeRevisionHash(bible);
    assert.equal((await validateSeriesBible(bible, { root })).references.characters[0].id, 'traveler');
    await assert.rejects(validateSeriesBible({ ...bible, references: { ...bible.references, characters: [{ ...bible.references.characters[0], revisionSha256: undefined }] } }, { root }), /revisionSha256 is required/i);
    await assert.rejects(validateSeriesBible({ ...bible, references: { ...bible.references, characters: [{ ...bible.references.characters[0], filePath: '../outside.txt' }] } }, { root }), /project root|relative path/i);
    await symlink(outside, path.join(root, 'linked'), 'junction');
    await assert.rejects(validateSeriesBible({ ...bible, references: { ...bible.references, characters: [{ ...bible.references.characters[0], filePath: 'linked/file.txt' }] } }, { root }), /outside the project root/i);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('scaffolds independent episodes and refuses an existing root', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'stickman-scaffold-'));
  try {
    const root = path.join(parent, 'demo');
    const result = await scaffoldSeries(root, { name: 'Demo', episodeCount: 3 });
    assert.equal(result.episodes.length, 3);
    assert.equal(JSON.parse(await readFile(path.join(root, 'episodes', 'demo-episode-03', 'episode.json'), 'utf8')).schemaVersion, 1);
    await assert.rejects(scaffoldSeries(root, { name: 'Demo', episodeCount: 3 }), /refusing to overwrite|already exists/i);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('rejects an active bible symlink and preserves the outside target', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-bible-link-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'stickman-bible-link-outside-'));
  try {
    const target = path.join(root, 'series-bible.json');
    const outsideTarget = path.join(outside, 'series-bible.json');
    await writeFile(outsideTarget, 'outside-original', 'utf8');
    await symlink(outsideTarget, target, 'file');
    const bible = createSeriesBible({ name: 'Demo', episodeCount: 1, slug: 'demo', createdAt: '2026-11-13T00:00:00.000Z' });
    await assert.rejects(writeSeriesRevision(root, bible), /outside the project root|symlink/i);
    assert.equal(await readFile(outsideTarget, 'utf8'), 'outside-original');
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('rolls back a failed active write without orphaning a new snapshot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-bible-atomic-'));
  try {
    const first = createSeriesBible({ name: 'Demo', episodeCount: 1, slug: 'demo', createdAt: '2026-11-13T00:00:00.000Z' });
    await writeSeriesRevision(root, first);
    const next = { ...first, premise: 'new premise' };
    next.revision.integrity.hash = computeRevisionHash(next);
    let failed = false;
    await assert.rejects(writeSeriesRevision(root, next, { version: 2, io: { rename: async (from, to) => { if (!failed && to.endsWith('series-bible.json')) { failed = true; throw new Error('simulated interrupted active write'); } return (await import('node:fs/promises')).rename(from, to); } } }), /interrupted active write/i);
    assert.equal(JSON.parse(await readFile(path.join(root, 'series-bible.json'), 'utf8')).revision.version, 1);
    await assert.rejects(readFile(path.join(root, 'series-bible.revisions', 'revision-02.json'), 'utf8'), /ENOENT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
