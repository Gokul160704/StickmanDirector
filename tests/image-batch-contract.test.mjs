import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createContinuityReferenceRegistry, freezeReferenceBundle } from '../scripts/continuity-refs.mjs';
import { createBatchPlan, recordBatchItem, resumeBatch } from '../scripts/image-batch-contract.mjs';

function refs() {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'stickman-batch-'));
  mkdirSync(path.join(rootDir, 'refs'));
  const values = [['char-1', 'character', 'character'], ['prop-1', 'prop', 'prop'], ['env-1', 'environment', 'environment'], ['style-1', 'style', 'style']];
  for (const [id, , value] of values) writeFileSync(path.join(rootDir, 'refs', `${id}.png`), value);
  const registry = createContinuityReferenceRegistry({ rootDir, seriesId: 'series-1', bibleRevisionHash: `sha256:${'a'.repeat(64)}` });
  for (const [id, kind, value] of values) registry.add({ id, kind, path: `refs/${id}.png`, contentHash: `sha256:${createHash('sha256').update(value).digest('hex')}`, approved: true });
  return freezeReferenceBundle(registry, ['char-1', 'prop-1', 'env-1', 'style-1']);
}

test('plans arbitrary ordered image batches and variants with identical frozen references', () => {
  const plan = createBatchPlan({ episodeId: 'ep-1', batchId: 'batch-36', providerId: 'flow', model: 'still', scenes: Array.from({ length: 18 }, (_, i) => `scene-${i + 1}`), variants: 2, referenceBundle: refs(), dependencyHash: 'sha256:dep' });
  assert.equal(plan.items.length, 36);
  assert.deepEqual(plan.items.map((item) => item.batchIndex), Array.from({ length: 36 }, (_, i) => i));
  assert.equal(new Set(plan.items.map((item) => item.referenceBundleHash)).size, 1);
  assert.equal(new Set(plan.items.map((item) => item.idempotencyKey)).size, 36);
});

test('supports the required offline batch sizes without a hardcoded scene count', () => {
  for (const count of [1, 3, 8, 36, 100]) {
    const plan = createBatchPlan({ episodeId: 'ep-1', batchId: `batch-${count}`, providerId: 'manual', model: 'offline', scenes: Array.from({ length: count }, (_, i) => `scene-${i + 1}`), referenceBundle: refs(), dependencyHash: 'sha256:dep' });
    assert.equal(plan.items.length, count);
  }
});

test('resume preserves succeeded and approved outputs and only retries selected failures', () => {
  let plan = createBatchPlan({ episodeId: 'ep-1', batchId: 'batch-36', providerId: 'manual', model: 'offline', scenes: Array.from({ length: 36 }, (_, i) => `scene-${i + 1}`), referenceBundle: refs(), dependencyHash: 'sha256:dep' });
  for (let i = 0; i < 18; i += 1) plan = recordBatchItem(plan, plan.items[i].id, { status: 'succeeded', output: { path: `images/${i}.png`, contentHash: `sha256:${i}` } });
  plan = recordBatchItem(plan, plan.items[0].id, { status: 'approved', approval: { approvalId: 'approval-1', actor: 'reviewer', approvedAt: '2026-11-14T05:00:00.000Z', outputHash: plan.items[0].output.contentHash, requestHash: plan.items[0].requestHash, dependencyHash: plan.items[0].dependencyHash, referenceBundleHash: plan.items[0].referenceBundleHash } });
  plan = recordBatchItem(plan, plan.items[18].id, { status: 'failed', errorCode: 'timeout' });
  const resumed = resumeBatch(plan, { retryItemIds: [plan.items[18].id] });
  assert.equal(resumed.items[0].status, 'approved');
  assert.equal(resumed.items[17].output.contentHash, 'sha256:17');
  assert.equal(resumed.items[18].status, 'queued');
  assert.equal(resumed.items[19].status, 'pending');
  assert.throws(() => resumeBatch(plan, { retryItemIds: [plan.items[0].id] }), /approved|overwrite/i);
});

test('completed outputs reject same-status mutation and approvals require provenance', () => {
  const plan = createBatchPlan({ episodeId: 'ep-1', batchId: 'batch-1', providerId: 'manual', model: 'offline', scenes: ['scene-1'], referenceBundle: refs(), dependencyHash: 'sha256:dep' });
  const succeeded = recordBatchItem(plan, plan.items[0].id, { status: 'succeeded', output: { path: 'images/1.png', contentHash: 'sha256:one' } });
  assert.throws(() => recordBatchItem(succeeded, succeeded.items[0].id, { status: 'succeeded', output: { path: 'images/evil.png', contentHash: 'sha256:two' } }), /immutable|overwrite|completed/i);
  assert.throws(() => recordBatchItem(plan, plan.items[0].id, { status: 'approved' }), /approval/i);
});

test('provider, model and seed changes produce distinct idempotency keys and forged bundles fail', () => {
  const bundle = refs();
  const flow = createBatchPlan({ episodeId: 'ep-1', batchId: 'batch-1', providerId: 'flow', model: 'model-a', seed: 1, scenes: ['scene-1'], referenceBundle: bundle, dependencyHash: 'sha256:dep' });
  const cloudflare = createBatchPlan({ episodeId: 'ep-1', batchId: 'batch-1', providerId: 'cloudflare', model: 'model-b', seed: 2, scenes: ['scene-1'], referenceBundle: bundle, dependencyHash: 'sha256:dep' });
  assert.notEqual(flow.items[0].idempotencyKey, cloudflare.items[0].idempotencyKey);
  assert.throws(() => createBatchPlan({ episodeId: 'ep-1', batchId: 'batch-1', providerId: 'flow', model: 'model-a', scenes: ['scene-1'], referenceBundle: { ...bundle, bundleHash: 'sha256:' + '0'.repeat(64) }, dependencyHash: 'sha256:dep' }), /bundle|hash|stale|integrity|authentic/i);
});

test('batch planning rejects stale reference bundles and duplicate identities', () => {
  const bundle = refs();
  assert.throws(() => createBatchPlan({ episodeId: 'ep-1', batchId: 'batch-1', providerId: 'manual', model: 'offline', scenes: ['scene-1', 'scene-1'], referenceBundle: bundle, dependencyHash: 'sha256:dep' }), /duplicate/i);
  assert.throws(() => createBatchPlan({ episodeId: 'ep-1', batchId: 'batch-1', providerId: 'manual', model: 'offline', scenes: [], referenceBundle: bundle, dependencyHash: 'sha256:dep' }), /scene|positive/i);
});
