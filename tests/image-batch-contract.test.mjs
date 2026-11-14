import test from 'node:test';
import assert from 'node:assert/strict';
import { createContinuityReferenceRegistry, freezeReferenceBundle } from '../scripts/continuity-refs.mjs';
import { createBatchPlan, recordBatchItem, resumeBatch } from '../scripts/image-batch-contract.mjs';

function refs() {
  const registry = createContinuityReferenceRegistry({ seriesId: 'series-1', bibleRevisionHash: 'sha256:bible' });
  for (const [id, kind, letter] of [['char-1', 'character', 'a'], ['prop-1', 'prop', 'b'], ['env-1', 'environment', 'c'], ['style-1', 'style', 'd']]) registry.add({ id, kind, path: `refs/${id}.png`, contentHash: `sha256:${letter.repeat(64)}`, approved: true });
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
  for (let i = 0; i < 18; i += 1) plan = recordBatchItem(plan, plan.items[i].id, { status: i === 0 ? 'approved' : 'succeeded', output: { path: `images/${i}.png`, contentHash: `sha256:${i}` } });
  plan = recordBatchItem(plan, plan.items[18].id, { status: 'failed', errorCode: 'timeout' });
  const resumed = resumeBatch(plan, { retryItemIds: [plan.items[18].id] });
  assert.equal(resumed.items[0].status, 'approved');
  assert.equal(resumed.items[17].output.contentHash, 'sha256:17');
  assert.equal(resumed.items[18].status, 'queued');
  assert.equal(resumed.items[19].status, 'pending');
  assert.throws(() => resumeBatch(plan, { retryItemIds: [plan.items[0].id] }), /approved|overwrite/i);
});

test('batch planning rejects stale reference bundles and duplicate identities', () => {
  const bundle = refs();
  assert.throws(() => createBatchPlan({ episodeId: 'ep-1', batchId: 'batch-1', providerId: 'manual', model: 'offline', scenes: ['scene-1', 'scene-1'], referenceBundle: bundle, dependencyHash: 'sha256:dep' }), /duplicate/i);
  assert.throws(() => createBatchPlan({ episodeId: 'ep-1', batchId: 'batch-1', providerId: 'manual', model: 'offline', scenes: [], referenceBundle: bundle, dependencyHash: 'sha256:dep' }), /scene|positive/i);
});
