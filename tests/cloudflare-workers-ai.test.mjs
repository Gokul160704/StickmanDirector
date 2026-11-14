import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createContinuityReferenceRegistry, freezeReferenceBundle } from '../scripts/continuity-refs.mjs';
import { createBatchPlan } from '../scripts/image-batch-contract.mjs';
import { createBatchRunner } from '../scripts/image-batch-runner.mjs';
import { createCloudflareWorkersAiAdapter, registerCloudflareWorkersAiProvider, CLOUDFLARE_FLUX_KLEIN_4B, CLOUDFLARE_FLUX_SCHNELL } from '../scripts/providers/cloudflare-workers-ai.mjs';
import { createStageRegistry } from '../scripts/stage-registry.mjs';

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function fixture(count = 1, { model = CLOUDFLARE_FLUX_KLEIN_4B, dimensions = { width: 1024, height: 576 } } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-cloudflare-'));
  await mkdir(path.join(root, 'refs'));
  const refs = [['character-1', 'character'], ['prop-1', 'prop'], ['environment-1', 'environment'], ['style-1', 'style']];
  const registry = createContinuityReferenceRegistry({ rootDir: root, seriesId: 'series-1', bibleRevisionHash: hash('bible') });
  for (const [id, kind] of refs) {
    const value = `${id}-bytes`;
    await writeFile(path.join(root, 'refs', `${id}.bin`), value);
    registry.add({ id, kind, path: `refs/${id}.bin`, contentHash: hash(value), approved: true, metadata: { width: 256, height: 256, license: 'approved-local' } });
  }
  const bundle = freezeReferenceBundle(registry, refs.map(([id]) => id));
  const plan = createBatchPlan({ episodeId: 'episode-1', batchId: `cloudflare-${count}`, providerId: 'cloudflare-workers-ai', model, scenes: Array.from({ length: count }, (_, i) => `scene-${i + 1}`), referenceBundle: bundle, dependencyHash: hash('dependency') });
  plan.imageSpec = { ...dimensions, variants: 1, prompt: 'approved prompt for episode-1', promptHash: hash('prompt') };
  return { root, registry, bundle, plan };
}

function authorization(quote, extra = {}) {
  return { approvalId: 'batch-approval-1', actor: 'owner', approvedAt: '2026-11-14T07:00:00.000Z', requestHash: quote.requestHash, quoteHash: quote.quoteHash, maxCost: quote.totalCost, paidOverageAllowed: false, quota: { remainingNeurons: quote.totalCost + 1000, evidenceId: 'quota-read-1' }, ...extra };
}

test('prepares a 36-image four-reference quote without network or credentials', async () => {
  const { bundle, plan } = await fixture(36);
  let transportCalls = 0;
  const adapter = createCloudflareWorkersAiAdapter({ transport: async () => { transportCalls += 1; } });
  const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items });
  assert.equal(quote.itemCount, 36);
  assert.equal(Object.keys(quote.outputPaths).length, 36);
  assert.equal(quote.totalCost > 0, true);
  assert.equal(quote.capability.maxReferences, 4);
  assert.equal(transportCalls, 0);
});

test('rejects a fifth reference and invalid non-16:9 dimensions before dispatch', async () => {
  const { bundle, plan } = await fixture(1);
  const adapter = createCloudflareWorkersAiAdapter({ transport: async () => { throw new Error('network forbidden'); } });
  const fifth = { ...bundle.references[0], id: 'extra-reference' };
  const tooMany = { ...bundle, references: [...bundle.references, fifth] };
  await assert.rejects(() => adapter.prepare({ plan, referenceBundle: tooMany, items: [{ ...plan.items[0], referenceIds: tooMany.references.map((ref) => ref.id) }] }), /four|reference/i);
  await assert.rejects(() => adapter.prepare({ plan: { ...plan, imageSpec: { width: 1000, height: 700 } }, referenceBundle: bundle, items: plan.items }), /16:9|aspect/i);
});

test('requires every Cloudflare reference to carry verified dimensions', async () => {
  const { root, registry, bundle, plan } = await fixture(1);
  const original = registry.get('character-1');
  registry.replace({ id: original.id, kind: original.kind, path: original.path, contentHash: original.contentHash, approved: true });
  const incomplete = freezeReferenceBundle(registry, bundle.references.map((reference) => reference.id));
  const incompletePlan = createBatchPlan({ episodeId: plan.episodeId, batchId: 'cloudflare-incomplete', providerId: plan.providerId, model: plan.model, scenes: ['scene-1'], referenceBundle: incomplete, dependencyHash: plan.dependencyHash });
  incompletePlan.imageSpec = plan.imageSpec;
  const adapter = createCloudflareWorkersAiAdapter({ mode: 'mock' });
  await assert.rejects(() => adapter.prepare({ plan: incompletePlan, referenceBundle: incomplete, items: incompletePlan.items }), /dimensions|verified/i);
  assert.equal(root.length > 0, true);
});

test('requires explicit provider authorization before even a mock execution', async () => {
  const { bundle, plan } = await fixture(1);
  let calls = 0;
  const adapter = createCloudflareWorkersAiAdapter({ transport: async () => { calls += 1; throw new Error('network forbidden'); } });
  const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items });
  await assert.rejects(() => adapter.execute({ item: plan.items[0], referenceBundle: bundle, attemptId: 'attempt-1' }), /authorize|authorization|consent/i);
  assert.equal(calls, 0);
  await adapter.authorize(authorization(quote));
  const result = await adapter.execute({ item: plan.items[0], referenceBundle: bundle, attemptId: 'attempt-1' });
  assert.equal(result.output.path, 'scene-1-v1.png');
  assert.equal(result.provenance.provider, 'cloudflare-workers-ai');
  assert.equal(result.provenance.reviewStatus, 'needs-review');
  assert.equal(calls, 0);
});

test('runs exact mocked jobs through the merged batch runner with deterministic provenance', async () => {
  const { root, registry, bundle, plan } = await fixture(36);
  const adapter = createCloudflareWorkersAiAdapter({ mode: 'mock' });
  const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items });
  await adapter.authorize(authorization(quote));
  const runner = createBatchRunner({ plan, referenceBundle: bundle, referenceRegistry: registry, adapter, checkpointPath: path.join(root, 'batch.json'), outputRoot: path.join(root, 'images'), concurrency: 2, budget: { maxCost: quote.totalCost } });
  const state = await runner.run();
  assert.equal(state.items.length, 36);
  assert.equal(state.items.every((item) => item.status === 'needs-review'), true);
  assert.equal(new Set(state.items.map((item) => item.output.path)).size, 36);
  assert.equal((await readFile(path.join(root, 'images', 'scene-1-v1.png'), 'utf8')).startsWith('MOCK-CLOUDFLARE-IMAGE:'), true);
  assert.equal(state.items.every((item) => item.provenance.referenceBundleHash === bundle.bundleHash), true);
  assert.equal(JSON.parse(await readFile(path.join(root, 'batch.json'), 'utf8')).spent, quote.totalCost);
});

test('blocks an over-budget batch before any mock generation and never falls back to Flow', async () => {
  const { root, registry, bundle, plan } = await fixture(8);
  const adapter = createCloudflareWorkersAiAdapter({ mode: 'mock' });
  const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items });
  let calls = 0;
  const original = adapter.execute;
  adapter.execute = async (...args) => { calls += 1; return original(...args); };
  await adapter.authorize(authorization(quote));
  const runner = createBatchRunner({ plan, referenceBundle: bundle, referenceRegistry: registry, adapter, checkpointPath: path.join(root, 'budget.json'), outputRoot: path.join(root, 'images'), budget: { maxCost: quote.totalCost - 1 } });
  await assert.rejects(() => runner.run(), /budget|authorized|quote/i);
  assert.equal(calls, 0);
});

test('does not permit live execution without explicit live authorization and scoped credentials', async () => {
  const { bundle, plan } = await fixture(1);
  const adapter = createCloudflareWorkersAiAdapter({ mode: 'live', transport: async () => ({ ok: true }) });
  const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items });
  await assert.rejects(() => adapter.authorize(authorization(quote)), /live|credential|account/i);
  assert.equal(adapter.getSecurityState().credentialsPersisted, false);
});

test('builds live multipart reference inputs and records actual image usage', async () => {
  const { root, registry, bundle, plan } = await fixture(1);
  const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.writeUInt32BE(1024, 16); png.writeUInt32BE(576, 20);
  const calls = [];
  const originalAccount = process.env.CLOUDFLARE_ACCOUNT_ID; const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'account-test'; process.env.CLOUDFLARE_API_TOKEN = 'opaque-token-test';
  try {
    const adapter = createCloudflareWorkersAiAdapter({ mode: 'live', projectRoot: root, referenceRegistry: registry, transport: async (request) => { calls.push(request); return { image: png.toString('base64'), requestId: 'cf-request-1', usage: { neurons: 12.5 } }; } });
    const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items });
    await adapter.authorize(authorization(quote, { live: true, quota: { remainingNeurons: 1000, evidenceId: 'quota-live-1' } }));
    const result = await adapter.execute({ item: plan.items[0], referenceBundle: bundle, attemptId: 'attempt-live-1' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, CLOUDFLARE_FLUX_KLEIN_4B);
    assert.equal(calls[0].formData.get('prompt'), 'approved prompt for episode-1');
    assert.equal(calls[0].formData.get('input_image_0') instanceof Blob, true);
    assert.equal(result.cost, 12.5);
    assert.equal(result.output.bytes[0], 0x89);
  } finally {
    if (originalAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = originalAccount;
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = originalToken;
  }
});

test('rejects live authorization when verified remaining quota is below the quote', async () => {
  const { bundle, plan } = await fixture(1); const adapter = createCloudflareWorkersAiAdapter({ mode: 'live' });
  const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items });
  const account = process.env.CLOUDFLARE_ACCOUNT_ID; const token = process.env.CLOUDFLARE_API_TOKEN; process.env.CLOUDFLARE_ACCOUNT_ID = 'account-test'; process.env.CLOUDFLARE_API_TOKEN = 'opaque-token-test';
  try { await assert.rejects(() => adapter.authorize(authorization(quote, { live: true, quota: { remainingNeurons: quote.totalCost - 0.01, evidenceId: 'quota-low' } })), /quota|remaining|budget/i); }
  finally { if (account === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = account; if (token === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = token; }
});

test('requires live approval to prohibit paid overage', async () => {
  const { bundle, plan } = await fixture(1); const adapter = createCloudflareWorkersAiAdapter({ mode: 'live' });
  const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items });
  const account = process.env.CLOUDFLARE_ACCOUNT_ID; const token = process.env.CLOUDFLARE_API_TOKEN; process.env.CLOUDFLARE_ACCOUNT_ID = 'account-test'; process.env.CLOUDFLARE_API_TOKEN = 'opaque-token-test';
  try { await assert.rejects(() => adapter.authorize(authorization(quote, { live: true, paidOverageAllowed: true })), /overage/i); }
  finally { if (account === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = account; if (token === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = token; }
});

test('records unreported live usage as provisional instead of zero', async () => {
  const { root, registry, bundle, plan } = await fixture(1);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID; const token = process.env.CLOUDFLARE_API_TOKEN; process.env.CLOUDFLARE_ACCOUNT_ID = 'account-test'; process.env.CLOUDFLARE_API_TOKEN = 'opaque-token-test';
  const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.writeUInt32BE(1024, 16); png.writeUInt32BE(576, 20);
  try {
    const adapter = createCloudflareWorkersAiAdapter({ mode: 'live', projectRoot: root, referenceRegistry: registry, transport: async () => ({ image: png.toString('base64'), requestId: 'cf-unreported-1' }) });
    const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items }); await adapter.authorize(authorization(quote, { live: true }));
    const result = await adapter.execute({ item: plan.items[0], referenceBundle: bundle, attemptId: 'attempt-unreported-1' });
    assert.equal(result.receipt.usage.status, 'unreported'); assert.equal(result.receipt.usage.neurons, null); assert.equal(result.cost, quote.itemCosts[plan.items[0].id]);
  } finally { if (account === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = account; if (token === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = token; }
});

test('marks an ambiguous live transport failure as unknown and redacts the token', async () => {
  const { root, registry, bundle, plan } = await fixture(1);
  const originalAccount = process.env.CLOUDFLARE_ACCOUNT_ID; const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'account-test'; process.env.CLOUDFLARE_API_TOKEN = 'opaque-token-test';
  try {
    const adapter = createCloudflareWorkersAiAdapter({ mode: 'live', projectRoot: root, referenceRegistry: registry, transport: async () => { throw new Error('connection lost opaque-token-test after acceptance'); } });
    const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items }); await adapter.authorize(authorization(quote, { live: true }));
    await assert.rejects(() => adapter.execute({ item: plan.items[0], referenceBundle: bundle, attemptId: 'attempt-unknown-1' }), (error) => error.unknownOutcome === true && !String(error.message).includes('opaque-token-test'));
  } finally {
    if (originalAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID; else process.env.CLOUDFLARE_ACCOUNT_ID = originalAccount;
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN; else process.env.CLOUDFLARE_API_TOKEN = originalToken;
  }
});

test('rejects a resumed checkpoint when the selected provider or model changes', async () => {
  const { root, registry, bundle, plan } = await fixture(1);
  const adapter = createCloudflareWorkersAiAdapter({ mode: 'mock' });
  const quote = await adapter.prepare({ plan, referenceBundle: bundle, items: plan.items });
  await adapter.authorize(authorization(quote));
  const checkpointPath = path.join(root, 'identity.json');
  const options = { referenceBundle: bundle, referenceRegistry: registry, adapter, checkpointPath, outputRoot: path.join(root, 'images'), budget: { maxCost: quote.totalCost } };
  await createBatchRunner({ ...options, plan }).run();
  const changed = { ...plan, model: CLOUDFLARE_FLUX_SCHNELL, items: plan.items.map((item) => ({ ...item, model: CLOUDFLARE_FLUX_SCHNELL })) };
  await assert.rejects(() => createBatchRunner({ ...options, plan: changed }).run(), /provider|model|checkpoint|identity/i);
});

test('registers Cloudflare beside other explicit providers without replacing Flow or manual paths', () => {
  const registry = createStageRegistry();
  const adapter = registerCloudflareWorkersAiProvider(registry, { mode: 'mock' });
  assert.equal(registry.get('image-generation', 'cloudflare-workers-ai'), adapter);
  assert.deepEqual(registry.list().map((entry) => entry.providerId), ['cloudflare-workers-ai']);
  assert.equal(adapter.describeCapabilities().models.includes(CLOUDFLARE_FLUX_KLEIN_4B), true);
});
