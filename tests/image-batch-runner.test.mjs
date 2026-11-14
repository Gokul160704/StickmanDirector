import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createContinuityReferenceRegistry, freezeReferenceBundle } from '../scripts/continuity-refs.mjs';
import { createBatchPlan } from '../scripts/image-batch-contract.mjs';
import { createBatchRunner } from '../scripts/image-batch-runner.mjs';

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function fixture(count = 1) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-runner-'));
  await mkdir(path.join(root, 'refs'));
  const refs = [['character-1', 'character'], ['prop-1', 'prop'], ['environment-1', 'environment'], ['style-1', 'style']];
  const registry = createContinuityReferenceRegistry({ rootDir: root, seriesId: 'series-1', bibleRevisionHash: hash('bible') });
  for (const [id, kind] of refs) { const value = `${id}-bytes`; await writeFile(path.join(root, 'refs', `${id}.bin`), value); registry.add({ id, kind, path: `refs/${id}.bin`, contentHash: hash(value), approved: true }); }
  const bundle = freezeReferenceBundle(registry, refs.map(([id]) => id));
  const plan = createBatchPlan({ episodeId: 'episode-1', batchId: `batch-${count}`, providerId: 'offline', model: 'mock', scenes: Array.from({ length: count }, (_, i) => `scene-${i + 1}`), referenceBundle: bundle, dependencyHash: hash('dependency') });
  return { root, registry, bundle, plan };
}

function provider({ failAt, unknownAt, quote = 0 } = {}) {
  const calls = [];
  return { calls, prepare: async () => ({ totalCost: quote }), execute: async ({ item }) => { calls.push(item.batchIndex); if (item.batchIndex === failAt) throw new Error('mock failure'); if (item.batchIndex === unknownAt) { const error = new Error('timeout after acceptance'); error.unknownOutcome = true; throw error; } return { cost: 0, output: { bytes: `image-${item.id}` }, receipt: { provider: 'offline', requestId: item.id }, provenance: { mode: 'synthetic' } }; } };
}

test('plans and executes arbitrary sizes with bounded concurrency and review gating', async () => {
  for (const count of [1, 3, 8, 36, 100]) {
    const { root, registry, bundle, plan } = await fixture(count); const adapter = provider();
    const runner = createBatchRunner({ plan, referenceBundle: bundle, referenceRegistry: registry, adapter, checkpointPath: path.join(root, 'batch.json'), outputRoot: path.join(root, 'images'), concurrency: 2, budget: { maxCost: 0 } });
    const result = await runner.run();
    assert.equal(result.items.length, count); assert.equal(result.items.every((item) => item.status === 'needs-review'), true); assert.equal(new Set(adapter.calls).size, count);
  }
});

test('failure at item 19 persists earlier items and selective retry survives restart', async () => {
  const { root, registry, bundle, plan } = await fixture(36); const adapter = provider({ failAt: 18 });
  const checkpointPath = path.join(root, 'batch.json'); const options = { plan, referenceBundle: bundle, referenceRegistry: registry, adapter, checkpointPath, outputRoot: path.join(root, 'images'), concurrency: 1, budget: { maxCost: 0 } };
  await assert.rejects(() => createBatchRunner(options).run(), /mock failure/);
  const saved = JSON.parse(await readFile(checkpointPath, 'utf8')); assert.equal(saved.items.slice(0, 18).every((item) => item.status === 'needs-review'), true); assert.equal(saved.items[18].status, 'failed'); assert.equal(saved.items[19].status, 'pending');
  const retryAdapter = provider(); const resumed = createBatchRunner({ ...options, adapter: retryAdapter }); const result = await resumed.run({ retryItemIds: [plan.items[18].id] });
  assert.equal(result.items[18].status, 'needs-review'); assert.equal(retryAdapter.calls.length, 1); assert.equal(retryAdapter.calls[0], 18);
  const restarted = createBatchRunner({ ...options, adapter: provider() }); await restarted.load(); assert.equal(restarted.getState().items[0].output.contentHash, saved.items[0].output.contentHash);
});

test('unknown provider outcomes require reconciliation before retry', async () => {
  const { root, registry, bundle, plan } = await fixture(1); const checkpointPath = path.join(root, 'batch.json'); const adapter = provider({ unknownAt: 0 });
  const runner = createBatchRunner({ plan, referenceBundle: bundle, referenceRegistry: registry, adapter, checkpointPath, outputRoot: path.join(root, 'images'), budget: { maxCost: 0 } }); const state = await runner.run();
  assert.equal(state.items[0].status, 'unknown'); await assert.rejects(() => runner.run({ retryItemIds: [plan.items[0].id] }), /reconciliation/);
  await runner.reconcile(plan.items[0].id, { status: 'absent', receipt: { itemId: plan.items[0].id, status: 'absent' }, authorization: { approvalId: 'reconcile-1', actor: 'reviewer', approvedAt: new Date().toISOString() }, reason: 'provider read-back confirmed absent' }); const retry = provider(); const retryRunner = createBatchRunner({ plan, referenceBundle: bundle, referenceRegistry: registry, adapter: retry, checkpointPath, outputRoot: path.join(root, 'images'), budget: { maxCost: 0 } });
  const result = await retryRunner.run({ retryItemIds: [plan.items[0].id] }); assert.equal(result.items[0].status, 'needs-review'); assert.equal(retry.calls.length, 1);
});

test('budget and stale-reference checks fail closed before dispatch', async () => {
  const { root, registry, bundle, plan } = await fixture(3); const adapter = provider({ quote: 1 }); const runner = createBatchRunner({ plan, referenceBundle: bundle, referenceRegistry: registry, adapter, checkpointPath: path.join(root, 'batch.json'), outputRoot: path.join(root, 'images'), budget: { maxCost: 0 } });
  await assert.rejects(() => runner.run(), /budget/); assert.equal(adapter.calls.length, 0);
  const forged = { ...bundle, bundleHash: hash('forged') }; assert.throws(() => createBatchRunner({ plan, referenceBundle: forged, adapter, checkpointPath: path.join(root, 'other.json'), outputRoot: path.join(root, 'images') }), /authentic|integrity|hash/);
  await writeFile(path.join(root, 'refs', 'character-1.bin'), 'mutated'); assert.throws(() => createBatchRunner({ plan, referenceBundle: bundle, referenceRegistry: registry, adapter, checkpointPath: path.join(root, 'changed.json'), outputRoot: path.join(root, 'images') }), /stale|changed|bytes/);
});

test('human approval binds the immutable output and cannot overwrite it', async () => {
  const { root, registry, bundle, plan } = await fixture(1); const runner = createBatchRunner({ plan, referenceBundle: bundle, referenceRegistry: registry, adapter: provider(), checkpointPath: path.join(root, 'batch.json'), outputRoot: path.join(root, 'images'), budget: { maxCost: 0 } });
  await runner.run(); const before = runner.getState().items[0].output.contentHash; const approved = await runner.approve(plan.items[0].id, { approvalId: 'human-1', actor: 'reviewer', approvedAt: new Date().toISOString() }); assert.equal(approved.approval.outputHash, before); assert.equal(runner.getState().items[0].status, 'approved');
});

test('declared output paths are preflighted and returned bytes cannot forge hashes', async () => {
  const { root, registry, bundle, plan } = await fixture(1); const outputRoot = path.join(root, 'images'); await mkdir(outputRoot); await writeFile(path.join(outputRoot, 'scene-1.png'), 'existing'); let calls = 0;
  const pathAdapter = { prepare: async () => ({ totalCost: 0, outputPaths: { [plan.items[0].id]: 'scene-1.png' } }), execute: async () => { calls += 1; return { cost: 0, output: { path: 'scene-1.png', bytes: 'new' } }; } };
  const blocked = createBatchRunner({ plan, referenceBundle: bundle, referenceRegistry: registry, adapter: pathAdapter, checkpointPath: path.join(root, 'path.json'), outputRoot, budget: { maxCost: 0 } }); await assert.rejects(() => blocked.run(), /already exists/); assert.equal(calls, 0);
  const forged = createBatchRunner({ plan, referenceBundle: bundle, referenceRegistry: registry, adapter: { prepare: async () => ({ totalCost: 0 }), execute: async () => ({ cost: 0, output: { bytes: 'actual', contentHash: hash('forged') } }) }, checkpointPath: path.join(root, 'hash.json'), outputRoot: path.join(root, 'other-images'), budget: { maxCost: 0 } }); await assert.rejects(() => forged.run(), /does not match/);
});
