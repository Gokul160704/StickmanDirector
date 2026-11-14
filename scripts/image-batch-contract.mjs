import { hashContract } from './stage-contracts.mjs';
import { assertFrozenReferenceBundle } from './continuity-refs.mjs';

const STATUSES = new Set(['pending', 'queued', 'running', 'succeeded', 'approved', 'failed', 'needs-review']);
function text(value, name) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`); return value.trim(); }
function clone(value) { return structuredClone(value); }
function verifyBundle(bundle) {
  assertFrozenReferenceBundle(bundle);
  if (bundle.references.some((reference) => reference.approved !== true || reference.integrity?.verified !== true)) throw new Error('Batch continuity references are not verified.');
  return true;
}

export function createBatchPlan({ episodeId, batchId, providerId, model, scenes, variants = 1, referenceBundle, dependencyHash, seed = null } = {}) {
  episodeId = text(episodeId, 'episodeId'); batchId = text(batchId, 'batchId'); providerId = text(providerId, 'providerId'); model = text(model, 'model'); dependencyHash = text(dependencyHash, 'dependencyHash');
  if (!Array.isArray(scenes) || scenes.length < 1) throw new Error('Batch requires a positive scene count.');
  if (!Number.isInteger(variants) || variants < 1) throw new Error('Batch variants must be a positive integer.');
  if (new Set(scenes).size !== scenes.length) throw new Error('Batch scenes must not contain duplicate identities.');
  if (!referenceBundle?.bundleHash || !Array.isArray(referenceBundle.references)) throw new Error('Batch requires a frozen continuity reference bundle.');
  verifyBundle(referenceBundle);
  const items = scenes.flatMap((sceneId) => Array.from({ length: variants }, (_, variant) => {
    const base = { episodeId, sceneId: text(sceneId, 'sceneId'), batchId, batchIndex: 0, variant, providerId, model, dependencyHash, referenceBundleHash: referenceBundle.bundleHash, referenceIds: referenceBundle.references.map((reference) => reference.id), requestedSeed: seed };
    return { ...base, id: hashContract(base), idempotencyKey: hashContract({ episodeId, batchId, sceneId, variant, providerId, model, requestedSeed: seed, dependencyHash, referenceBundleHash: referenceBundle.bundleHash }), requestHash: hashContract({ ...base, batchIndex: undefined }), status: 'pending' };
  })).map((item, batchIndex) => ({ ...item, batchIndex }));
  return { version: 1, episodeId, batchId, providerId, model, variants, dependencyHash, referenceBundleHash: referenceBundle.bundleHash, items };
}

export function recordBatchItem(plan, itemId, update = {}) {
  const item = plan.items.find((candidate) => candidate.id === itemId); if (!item) throw new Error(`Unknown batch item ${itemId}.`);
  if (!STATUSES.has(update.status)) throw new Error(`Unsupported batch item status ${update.status}.`);
  if (item.status === 'approved' || (item.status === 'succeeded' && update.status !== 'approved')) throw new Error(`Cannot overwrite immutable completed ${item.status} batch item output.`);
  const allowed = { pending: new Set(['queued', 'running', 'succeeded', 'failed', 'needs-review']), queued: new Set(['running', 'failed', 'needs-review']), running: new Set(['succeeded', 'failed', 'needs-review']), failed: new Set(['queued']), 'needs-review': new Set(['queued']), succeeded: new Set(['approved']), approved: new Set() };
  if (update.status === 'approved' && (!update.approval?.approvalId || !update.approval?.actor || !Number.isFinite(Date.parse(update.approval.approvedAt)))) throw new Error('Approved batch items require approval provenance.');
  if (!allowed[item.status]?.has(update.status)) throw new Error(`Invalid batch item transition ${item.status} -> ${update.status}.`);
  if (update.status === 'approved' && !item.output) throw new Error('Approved batch items require a completed output.');
  const nextItems = plan.items.map((candidate) => candidate.id === itemId ? { ...candidate, ...clone(update), ...(update.output ? { output: clone(update.output) } : {}) } : candidate);
  return { ...clone(plan), items: nextItems };
}

export function resumeBatch(plan, { retryItemIds = [] } = {}) {
  const requested = new Set(retryItemIds);
  for (const itemId of requested) {
    const item = plan.items.find((candidate) => candidate.id === itemId); if (!item) throw new Error(`Unknown batch item ${itemId}.`);
    if (['approved', 'succeeded'].includes(item.status)) throw new Error(`Cannot retry approved or succeeded item ${itemId}; overwrite is disabled.`);
    if (item.status !== 'failed' && item.status !== 'needs-review') throw new Error(`Only failed or needs-review items may be retried: ${itemId}.`);
  }
  return { ...clone(plan), items: plan.items.map((item) => requested.has(item.id) ? { ...item, status: 'queued', retryRequested: true } : item) };
}
