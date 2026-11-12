import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { importEpisodeManifest } from '../scripts/episode-manifest.mjs';
import {
  PRODUCTION_STATUSES,
  createProductionState,
  recordProductionAttempt,
  reconcileProductionState,
  saveProductionState,
  loadProductionState,
} from '../scripts/production-state.mjs';

const manifest = {
  schemaVersion: 1,
  episodeId: 'episode-01',
  title: 'A Small Beginning',
  topic: 'Courage',
  description: 'A short illustrated story.',
  targetAudience: 'General audience',
  intendedDurationSeconds: 4,
  output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9' },
  references: { characters: [], props: [], environments: [], visualStyle: 'minimal' },
  scenes: [{ id: 'scene-01', order: 1, image: 'images/scene-01.png', durationSeconds: 4 }],
};

test('imports a validated v1 manifest without changing episode.json semantics', () => {
  const result = importEpisodeManifest(manifest);
  assert.equal(result.episodeId, 'episode-01');
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.production.stage, 'research');
  assert.notStrictEqual(result, manifest);
});

test('loads the sanitized legacy v1 checkpoint fixture into the additive shape', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/production-state-v1.json', import.meta.url), 'utf8'));
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-fixture-'));
  try {
    const file = path.join(root, 'state.json');
    await writeFile(file, JSON.stringify(fixture));
    const loaded = await loadProductionState(file);
    assert.equal(loaded.episodeId, 'fixture-episode-01');
    assert.equal(loaded.stages.research.status, 'pending');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects unsupported manifest versions and legacy data without an explicit adapter', () => {
  assert.throws(() => importEpisodeManifest({ ...manifest, schemaVersion: 2 }), /schemaVersion/i);
  assert.throws(() => importEpisodeManifest({ title: 'legacy' }), /schemaVersion|legacy/i);
});

test('records attempts idempotently and keeps only canonical status values', () => {
  const state = createProductionState('episode-01');
  assert.deepEqual(PRODUCTION_STATUSES, ['pending', 'running', 'complete', 'failed', 'blocked', 'invalidated', 'skipped']);
  const first = recordProductionAttempt(state, 'research', {
    idempotencyKey: 'research-1', status: 'complete', dependencyHash: 'sha256:abc', artifact: 'research/notes.md',
    receipt: { provider: 'offline', apiKey: 'do-not-store' },
  });
  const second = recordProductionAttempt(first, 'research', {
    idempotencyKey: 'research-1', status: 'complete', dependencyHash: 'sha256:abc', artifact: 'research/notes.md',
  });
  assert.deepEqual(second, first);
  assert.equal(first.stages.research.status, 'complete');
  assert.equal(first.attempts.length, 1);
  assert.equal('receipt' in first.attempts[0], false);
  assert.equal(JSON.stringify(first).includes('do-not-store'), false);
});

test('invalidates downstream bookkeeping when a dependency hash changes', () => {
  let state = recordProductionAttempt(createProductionState('episode-01'), 'research', {
    idempotencyKey: 'research-1', status: 'complete', dependencyHash: 'sha256:old',
  });
  state = recordProductionAttempt(state, 'script', {
    idempotencyKey: 'script-1', status: 'complete', dependencyHash: 'sha256:script',
  });
  const reconciled = reconcileProductionState(state, { research: 'sha256:new' });
  assert.equal(reconciled.stages.research.status, 'invalidated');
  assert.equal(reconciled.stages.research.invalidatedReason, 'dependency-hash-changed');
  assert.equal(reconciled.attempts[0].status, 'invalidated');
  assert.equal(reconciled.stages.script.status, 'invalidated');
  assert.equal(reconciled.attempts[1].status, 'invalidated');
});

test('recovers a valid backup after an interrupted checkpoint write', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-state-'));
  try {
    const file = path.join(root, 'production-state.json');
    const state = createProductionState('episode-01');
    await saveProductionState(file, state);
    await writeFile(`${file}.bak`, JSON.stringify(state));
    await writeFile(file, '{"interrupted":');
    const recovered = await loadProductionState(file);
    assert.equal(recovered.episodeId, 'episode-01');
    assert.equal(recovered.recoveredFrom, 'backup');
    assert.equal(JSON.parse(await readFile(`${file}`, 'utf8')).episodeId, 'episode-01');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
