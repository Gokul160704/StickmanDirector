import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { importEpisodeManifest } from '../scripts/episode-manifest.mjs';
import {
  LEGACY_PRODUCTION_STATUSES,
  PRODUCTION_STATUSES,
  createProductionState,
  normalizeIdempotencyKey,
  recordProductionAttempt,
  reconcileProductionState,
  requestSafeShotRetry,
  reapproveProductionStage,
  transitionProductionState,
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
    assert.equal(loaded.stateFormat, 'durable-v1');
    assert.equal(loaded.completedStages.research.status, 'pending');
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
  assert.deepEqual(PRODUCTION_STATUSES, ['draft', 'waiting-for-human', 'queued', 'running', 'generated', 'downloaded', 'reviewed', 'approved', 'rejected', 'failed', 'skipped', 'stale', 'needs-reconciliation']);
  const first = recordProductionAttempt(state, 'research', {
    idempotencyKey: ' Research  1 ', status: 'approved', dependencyHash: 'sha256:abc', artifact: 'research/notes.md',
    approvalBinding: { approvalId: 'human-1', actor: 'reviewer', dependencyHash: 'sha256:abc', approvedAt: '2026-11-12T00:00:00.000Z' },
    receipt: { provider: 'offline', apiKey: 'do-not-store' },
  });
  const second = recordProductionAttempt(first, 'research', {
    idempotencyKey: ' research  1 ', status: 'approved', dependencyHash: 'sha256:abc', artifact: 'research/notes.md',
    approvalBinding: { approvalId: 'human-1', actor: 'reviewer', dependencyHash: 'sha256:abc', approvedAt: '2026-11-12T00:00:00.000Z' },
    receipt: { provider: 'offline', apiKey: 'do-not-store' },
  });
  assert.deepEqual(second, first);
  assert.equal(normalizeIdempotencyKey(' Research  1 '), 'research 1');
  assert.equal(first.stages.research.status, 'approved');
  assert.equal(first.attempts.length, 1);
  assert.equal(first.attempts[0].receipt.apiKey, '[REDACTED]');
  assert.equal(JSON.stringify(first).includes('do-not-store'), false);
});

test('requires complete dependency and approval proof for approved attempts', () => {
  const state = createProductionState('episode-01');
  assert.throws(() => recordProductionAttempt(state, 'research', { idempotencyKey: 'approved-1', status: 'approved' }), /dependencyHash|approvalBinding/i);
  assert.throws(() => recordProductionAttempt(state, 'research', { idempotencyKey: 'approved-2', status: 'approved', dependencyHash: 'sha256:abc', approvalBinding: { approvalId: 'human-1', actor: 'reviewer' } }), /approvedAt/i);
  const accepted = recordProductionAttempt(state, 'research', {
    idempotencyKey: 'approved-3', status: 'approved', dependencyHash: 'sha256:abc',
    approvalBinding: { approvalId: 'human-1', actor: 'reviewer', dependencyHash: 'sha256:abc', approvedAt: '2026-11-12T00:00:00.000Z' },
  });
  assert.equal(accepted.stages.research.status, 'approved');
  assert.throws(() => recordProductionAttempt(state, 'research', {
    idempotencyKey: 'approved-4', status: 'approved', dependencyHash: 'sha256:abc',
    approvalBinding: { approvalId: 'human-4', actor: 'reviewer', dependencyHash: 'sha256:other', approvedAt: '2026-11-12T00:00:00.000Z' },
  }), /equal|match|dependencyHash/i);
});

test('normalizes persisted approval without proof to needs-reconciliation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-approval-proof-'));
  try {
    const file = path.join(root, 'state.json');
    const state = createProductionState('episode-approval-01');
    state.stages.research = { status: 'approved' };
    state.completedStages.research = { status: 'invalidated' };
    await writeFile(file, JSON.stringify(state));
    const loaded = await loadProductionState(file, { recover: false });
    assert.equal(loaded.stages.research.status, 'needs-reconciliation');
    assert.equal(loaded.stages.research.approvalStatus, 'approved');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('preserves legacy stage data and unknown fields through additive migration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-roundtrip-'));
  try {
    const file = path.join(root, 'state.json');
    const legacy = {
      schemaVersion: 1, episodeId: 'legacy-01', stage: 'script', ownerNote: { keep: true },
      completedStages: {
        research: { status: 'complete', artifact: 'research.md', custom: { keep: 'yes' } },
        script: { status: 'pending', attempts: 2 },
      },
      pendingStages: ['continuity'], legacyMarker: 'preserve-me', artifacts: ['research.md'], errors: [],
    };
    await writeFile(file, JSON.stringify(legacy));
    const loaded = await loadProductionState(file);
    assert.equal(loaded.stages.research.status, 'generated');
    assert.equal(loaded.stages.research.custom.keep, 'yes');
    assert.equal(loaded.ownerNote.keep, true);
    assert.equal(loaded.legacyMarker, 'preserve-me');
    await saveProductionState(file, loaded);
    const roundTrip = await loadProductionState(file);
    assert.equal(roundTrip.stages.research.artifact, 'research.md');
    assert.equal(roundTrip.completedStages.research.status, 'complete');
    assert.equal(roundTrip.legacyMarker, 'preserve-me');
    await writeFile(file, JSON.stringify({ ...legacy, stages: { research: { status: 'draft' } } }));
    await assert.rejects(() => loadProductionState(file, { recover: false }), /conflicting.*stage/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fails closed when durable projections contain legacy-only unknown stage data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-dual-projection-'));
  try {
    const file = path.join(root, 'state.json');
    const state = createProductionState('dual-01');
    state.completedStages.research.legacyOnly = 'do-not-drop';
    await writeFile(file, JSON.stringify(state));
    await assert.rejects(() => loadProductionState(file, { recover: false }), /legacy.*unknown|projection|conflict/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fails closed when dual projections disagree on a stage status', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-status-projection-'));
  try {
    const file = path.join(root, 'state.json');
    const state = createProductionState('dual-status-01');
    state.stages.research = { status: 'failed' };
    state.completedStages.research = { status: 'pending' };
    await writeFile(file, JSON.stringify(state));
    await assert.rejects(() => loadProductionState(file, { recover: false }), /status|projection|conflict/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('fails closed at the durable migration boundary when an old writer mutates only completedStages', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-migration-boundary-'));
  try {
    const file = path.join(root, 'state.json');
    const durable = transitionProductionState(createProductionState('boundary-01'), 'script');
    durable.completedStages.research.status = 'pending';
    await writeFile(file, JSON.stringify(durable));
    await assert.rejects(() => loadProductionState(file, { recover: false }), /durable-v1.*migration|owned.*together|projection.*conflict/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('does not project unsafe statuses as legacy complete', () => {
  assert.deepEqual(LEGACY_PRODUCTION_STATUSES, ['pending', 'complete', 'invalidated', 'failed', 'blocked', 'running', 'skipped']);
  for (const status of ['rejected', 'stale', 'needs-reconciliation']) {
    const state = recordProductionAttempt(createProductionState(`unsafe-projection-${status}`), 'research', { idempotencyKey: `${status}-1`, status });
    assert.equal(state.completedStages.research.status, 'invalidated');
    assert.equal(LEGACY_PRODUCTION_STATUSES.includes(state.completedStages.research.status), true);
  }
});

test('projects only proven approvals as legacy complete', () => {
  const state = recordProductionAttempt(createProductionState('approved-projection-01'), 'research', {
    idempotencyKey: 'approved-projection', status: 'approved', dependencyHash: 'sha256:approved',
    approvalBinding: { approvalId: 'human-1', actor: 'reviewer', dependencyHash: 'sha256:approved', approvedAt: '2026-11-12T00:00:00.000Z' },
  });
  assert.equal(state.completedStages.research.status, 'complete');
  assert.equal(LEGACY_PRODUCTION_STATUSES.includes(state.completedStages.research.status), true);
});

test('invalidates only affected completed records and preserves active failure semantics', () => {
  let state = recordProductionAttempt(createProductionState('episode-01'), 'research', {
    idempotencyKey: 'research-1', status: 'approved', dependencyHash: 'sha256:old', approvalBinding: { approvalId: 'human-1', actor: 'reviewer', approvedAt: '2026-11-12T00:00:00.000Z', dependencyHash: 'sha256:old' },
  });
  state = recordProductionAttempt(state, 'script', {
    idempotencyKey: 'script-1', status: 'generated', dependencyHash: 'sha256:script',
  });
  for (const [stage, status] of [['continuity', 'failed'], ['storyboard', 'blocked'], ['references', 'running'], ['images', 'skipped']]) {
    state = recordProductionAttempt(state, stage, { idempotencyKey: `${stage}-1`, status, dependencyHash: `sha256:${stage}` });
  }
  const reconciled = reconcileProductionState(state, { research: 'sha256:new' });
  assert.equal(reconciled.stages.research.status, 'needs-reconciliation');
  assert.equal(reconciled.stages.research.invalidatedReason, 'dependency-hash-changed');
  assert.equal(reconciled.stages.script.status, 'stale');
  assert.deepEqual(reconciled.attempts[1].dependencyBinding, { previousHash: 'sha256:script', currentHash: 'sha256:new' });
  assert.equal(reconciled.stages.continuity.status, 'failed');
  assert.equal(reconciled.stages.storyboard.status, 'waiting-for-human');
  assert.equal(reconciled.stages.storyboard.legacyStatus, 'blocked');
  assert.equal(reconciled.stages.references.status, 'running');
  assert.equal(reconciled.stages.images.status, 'skipped');
  assert.equal(reconciled.actions[0].type, 'human-reapproval-required');
  assert.equal(reconciled.actions[0].dependency.previousHash, 'sha256:old');
  const reapproved = reapproveProductionStage(reconciled, 'research', { approvalId: 'human-2', dependencyHash: 'sha256:new', actor: 'reviewer' });
  assert.equal(reapproved.stages.research.status, 'approved');
  assert.equal(reapproved.approvalBindings.research.dependencyHash, 'sha256:new');
  assert.throws(() => reapproveProductionStage(reconciled, 'research', { approvalId: 'human-3', dependencyHash: 'sha256:wrong', actor: 'reviewer' }), /currentHash|dependencyHash/i);
  for (const value of ['', '  ', 42]) assert.throws(() => reapproveProductionStage(reconciled, 'research', { approvalId: value, dependencyHash: 'sha256:new', actor: 'reviewer' }), /approvalId/i);
  for (const value of ['', '  ', 42]) assert.throws(() => reapproveProductionStage(reconciled, 'research', { approvalId: 'human-4', dependencyHash: value, actor: 'reviewer' }), /dependencyHash/i);
  for (const value of ['', '  ', 42]) assert.throws(() => reapproveProductionStage(reconciled, 'research', { approvalId: 'human-5', dependencyHash: 'sha256:new', actor: value }), /actor/i);
});

test('does not silently downgrade an approved stage while advancing', () => {
  const state = recordProductionAttempt(createProductionState('episode-01'), 'research', {
    idempotencyKey: 'approved-transition-1', status: 'approved', dependencyHash: 'sha256:abc',
    approvalBinding: { approvalId: 'human-1', actor: 'reviewer', dependencyHash: 'sha256:abc', approvedAt: '2026-11-12T00:00:00.000Z' },
  });
  assert.throws(() => transitionProductionState(state, 'script'), /approved|approval|re-approval/i);
});

test('refuses attempts that overwrite an approved stage without invalidation', () => {
  const state = recordProductionAttempt(createProductionState('episode-01'), 'research', {
    idempotencyKey: 'approved-overwrite-1', status: 'approved', dependencyHash: 'sha256:abc',
    approvalBinding: { approvalId: 'human-1', actor: 'reviewer', dependencyHash: 'sha256:abc', approvedAt: '2026-11-12T00:00:00.000Z' },
  });
  for (const status of ['failed', 'stale', 'skipped', 'generated']) {
    assert.throws(() => recordProductionAttempt(state, 'research', { idempotencyKey: `overwrite-${status}`, status, dependencyHash: 'sha256:def' }), /approved|invalidation|re-approval/i);
  }
});

test('refuses a second approved attempt while the stage is already approved', () => {
  const state = recordProductionAttempt(createProductionState('episode-approved-01'), 'research', {
    idempotencyKey: 'approved-first', status: 'approved', dependencyHash: 'sha256:first',
    approvalBinding: { approvalId: 'human-first', actor: 'reviewer', dependencyHash: 'sha256:first', approvedAt: '2026-11-12T00:00:00.000Z' },
  });
  assert.throws(() => recordProductionAttempt(state, 'research', {
    idempotencyKey: 'approved-second', status: 'approved', dependencyHash: 'sha256:second',
    approvalBinding: { approvalId: 'human-second', actor: 'reviewer', dependencyHash: 'sha256:second', approvedAt: '2026-11-12T00:01:00.000Z' },
  }), /approved|invalidation|re-approval/i);
});

test('refuses approved attempts while a stage is stale or needs reconciliation', () => {
  const stale = reconcileProductionState(recordProductionAttempt(createProductionState('episode-stale-01'), 'research', {
    idempotencyKey: 'stale-source', status: 'generated', dependencyHash: 'sha256:old',
  }), { research: 'sha256:new' });
  const needs = reconcileProductionState(recordProductionAttempt(createProductionState('episode-needs-01'), 'research', {
    idempotencyKey: 'needs-source', status: 'approved', dependencyHash: 'sha256:old',
    approvalBinding: { approvalId: 'human-old', actor: 'reviewer', dependencyHash: 'sha256:old', approvedAt: '2026-11-12T00:00:00.000Z' },
  }), { research: 'sha256:new' });
  for (const state of [stale, needs]) assert.throws(() => recordProductionAttempt(state, 'research', {
    idempotencyKey: 'bypass-approved', status: 'approved', dependencyHash: 'sha256:new',
    approvalBinding: { approvalId: 'human-new', actor: 'reviewer', dependencyHash: 'sha256:new', approvedAt: '2026-11-12T00:02:00.000Z' },
  }), /stale|reconciliation|re-approval/i);
});

test('requires retry or reconciliation before advancing failed or stale stages', () => {
  for (const status of ['failed', 'stale']) {
    const state = recordProductionAttempt(createProductionState(`blocked-transition-${status}`), 'research', {
      idempotencyKey: `stage-${status}`, status,
    });
    assert.throws(() => transitionProductionState(state, 'script'), /failed|stale|retry|reconciliation/i);
  }
});

test('rejects replay when material receipt, error, or arbitrary metadata changes', () => {
  const state = createProductionState('episode-01');
  const first = recordProductionAttempt(state, 'research', {
    idempotencyKey: 'material-1', status: 'failed', dependencyHash: 'sha256:abc', error: 'first',
    receipt: { receiptId: 'r1' }, receiptReadback: { status: 'failed' }, assetReadback: { status: 'absent' }, custom: { version: 1 },
  });
  for (const change of [
    { error: 'second' },
    { receipt: { receiptId: 'r2' } },
    { receiptReadback: { status: 'complete' } },
    { assetReadback: { status: 'present' } },
    { custom: { version: 2 } },
  ]) assert.throws(() => recordProductionAttempt(first, 'research', { idempotencyKey: ' MATERIAL-1 ', status: 'failed', dependencyHash: 'sha256:abc', ...change }), /replay/i);
});

test('gates retries to consented failed or reconciled shots with read-back metadata', () => {
  const state = createProductionState('episode-01');
  state.shots = { 'scene-01': { status: 'failed' }, 'scene-02': { status: 'approved' } };
  assert.throws(() => requestSafeShotRetry(state, { shotId: 'scene-01', consented: false }), /consent/i);
  assert.throws(() => requestSafeShotRetry(state, { shotId: 'scene-01', consented: true }), /receipt.*asset|read-back/i);
  const next = requestSafeShotRetry(state, {
    shotId: 'scene-01', consented: true,
    receiptReadback: { receiptId: 'receipt-1', status: 'failed' }, assetReadback: { assetId: 'asset-1', status: 'absent' },
  });
  assert.equal(next.retryRequests[0].status, 'queued');
  assert.equal(next.retryRequests[0].shotId, 'scene-01');
  assert.throws(() => requestSafeShotRetry(state, { shotId: 'scene-02', consented: true, receiptReadback: {}, assetReadback: {} }), /failed.*needs-reconciliation/i);
});

test('redacts nested receipt secret values and reports the primary recovery error deterministically', async () => {
  const state = recordProductionAttempt(createProductionState('episode-01'), 'research', {
    idempotencyKey: 'receipt-1', status: 'failed', receipt: { nested: { message: 'Bearer super-secret-token' }, apiKey: 'AIza-secret', notes: 'ghp_1234567890 github_pat_ABC AKIAIOSFODNN7EXAMPLE sk-proj-123' },
  });
  assert.equal(JSON.stringify(state).includes('super-secret-token'), false);
  assert.equal(JSON.stringify(state).includes('AIza-secret'), false);
  assert.equal(JSON.stringify(state).includes('ghp_1234567890'), false);
  assert.equal(JSON.stringify(state).includes('github_pat_ABC'), false);
  assert.equal(JSON.stringify(state).includes('AKIAIOSFODNN7EXAMPLE'), false);
  assert.equal(JSON.stringify(state).includes('sk-proj-123'), false);
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-recovery-'));
  try {
    const file = path.join(root, 'state.json');
    await writeFile(file, '{bad-primary');
    await writeFile(`${file}.bak`, '{bad-backup');
    await assert.rejects(() => loadProductionState(file), (error) => /Primary error:.*state\.json/i.test(error.message) && /state\.json\.bak/.test(error.message));
  } finally { await rm(root, { recursive: true, force: true }); }
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
