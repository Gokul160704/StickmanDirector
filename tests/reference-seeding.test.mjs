import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createContinuityReferenceRegistry } from '../scripts/continuity-refs.mjs';
import { createReferenceSeedPlan, createReferenceSeedRunner, promoteApprovedCandidateReference, promoteApprovedSeedReferences } from '../scripts/reference-seeding.mjs';
import { createCloudflareWorkersAiReferenceSeedAdapter } from '../scripts/providers/cloudflare-reference-seeding.mjs';

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const approval = (id) => ({ approvalId: id, actor: 'owner', approvedAt: '2026-11-14T00:00:00.000Z' });
const dependencyHash = hash('episode-dependency');

async function fixture({ withCandidate = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-reference-seed-'));
  await mkdir(path.join(root, 'references'), { recursive: true });
  const bytes = Buffer.from('approved-input-candidate'); const candidate = { id: 'style-anchor', role: 'style', path: 'references/style-anchor.bin', contentHash: hash(bytes), width: 448, height: 252, license: 'approved-local', consent: approval('candidate-consent') };
  if (withCandidate) await writeFile(path.join(root, candidate.path), bytes);
  const items = [
    { id: 'character', role: 'character', prompt: 'A young stickman discovers the blackout, matching the approved visual language.', outputPath: 'generated/character.png' },
    { id: 'prop', role: 'prop', prompt: 'A distinctive brass lantern for the blackout story, matching the approved visual language.', outputPath: 'generated/lantern.png' },
    { id: 'environment', role: 'environment', prompt: 'A city neighborhood during a blackout, matching the approved visual language.', outputPath: 'generated/neighborhood.png' },
  ];
  const plan = createReferenceSeedPlan({ seedBatchId: 'seed-01', episodeId: 'episode-01', providerId: 'cloudflare-workers-ai', model: '@cf/black-forest-labs/flux-2-klein-4b', dimensions: { width: 512, height: 288 }, items, inputCandidates: withCandidate ? [candidate] : [], dependencyHash, seed: 7 });
  return { root, plan, candidate, bytes };
}

test('reference seed plans are distinct, review-gated, and do not create a bundle', async () => {
  const { plan } = await fixture();
  assert.equal(plan.kind, 'reference-seed'); assert.equal(plan.bundleHash, undefined); assert.equal(plan.items.length, 3);
  assert.equal(new Set(plan.items.map((item) => item.promptHash)).size, 3);
  assert.equal(new Set(plan.items.map((item) => item.idempotencyKey)).size, 3);
  assert.ok(plan.inputCandidates[0].consent.approvalId);
});

test('invalid output dimensions fail before any adapter call and valid quote is 94.26 neurons', async () => {
  const { plan } = await fixture();
  assert.throws(() => createReferenceSeedPlan({ ...plan, dimensions: { width: 448, height: 252 }, items: plan.items, inputCandidates: plan.inputCandidates }), /dimensions|16:9/i);
  const adapter = createCloudflareWorkersAiReferenceSeedAdapter({ mode: 'mock', projectRoot: path.dirname(path.join((await fixture()).root, 'x')) });
  const quote = await adapter.prepare({ plan, projectRoot: (await fixture()).root });
  assert.equal(quote.totalCost, 94.26); assert.equal(quote.itemCosts.character, 31.42); assert.equal(quote.paidOverageAllowed, false);
});

test('mock runner checkpoints outputs as needs-review and promotion requires immutable approval', async () => {
  const { root, plan, candidate } = await fixture();
  const adapter = createCloudflareWorkersAiReferenceSeedAdapter({ mode: 'mock', projectRoot: root });
  const quote = await adapter.prepare({ plan, projectRoot: root });
  await adapter.authorize({ requestHash: quote.requestHash, quoteHash: quote.quoteHash, approvalId: 'batch-approval', actor: 'owner', approvedAt: '2026-11-14T00:00:00.000Z', maxCost: 500, paidOverage: false, quota: { remainingNeurons: 10000, evidenceId: 'offline-fixture' } });
  const runner = createReferenceSeedRunner({ plan, adapter, projectRoot: root, checkpointPath: path.join(root, 'state', 'checkpoint.json'), outputRoot: root, budget: { maxCost: 500 } });
  const state = await runner.run(); assert.equal(state.status, 'needs-review'); assert.ok(state.items.every((item) => item.status === 'needs-review'));
  const registry = createContinuityReferenceRegistry({ rootDir: root, seriesId: 'series-01', bibleRevisionHash: hash('bible') });
  assert.equal(registry.snapshot().length, 0);
  for (const item of state.items) await runner.approve(item.id, { ...approval(`output-${item.id}`), outputHash: item.output.contentHash });
  const promoted = await promoteApprovedSeedReferences({ state: runner.getState(), registry, projectRoot: root }); assert.equal(promoted.length, 3);
  const candidatePromoted = await promoteApprovedCandidateReference({ candidate, registry: createContinuityReferenceRegistry({ rootDir: root, seriesId: 'series-02', bibleRevisionHash: hash('bible') }), projectRoot: root, approval: { ...approval('candidate-promote'), contentHash: candidate.contentHash } });
  assert.equal(candidatePromoted.approved, true);
});

test('authorization fails closed for overage, quota, and stale candidate bytes', async () => {
  const { root, plan, candidate, bytes } = await fixture(); const adapter = createCloudflareWorkersAiReferenceSeedAdapter({ mode: 'mock', projectRoot: root }); const quote = await adapter.prepare({ plan, projectRoot: root });
  await assert.rejects(() => adapter.authorize({ requestHash: quote.requestHash, quoteHash: quote.quoteHash, approvalId: 'a', actor: 'owner', approvedAt: '2026-11-14T00:00:00Z', maxCost: 500, paidOverage: true, quota: { remainingNeurons: 10000 } }), /overage/i);
  await assert.rejects(() => adapter.authorize({ requestHash: quote.requestHash, quoteHash: quote.quoteHash, approvalId: 'a', actor: 'owner', approvedAt: '2026-11-14T00:00:00Z', maxCost: 500, paidOverage: false, quota: { remainingNeurons: 1 } }), /quota/i);
  await writeFile(path.join(root, candidate.path), Buffer.concat([bytes, Buffer.from('changed')]));
  await assert.rejects(() => adapter.prepare({ plan, projectRoot: root }), /contentHash/i);
});

test('unknown provider outcomes remain durable and require reconciliation', async () => {
  const { root, plan } = await fixture({ withCandidate: false });
  const adapter = { async prepare() { return { totalCost: 1, itemCosts: Object.fromEntries(plan.items.map((item) => [item.id, 1])) }; }, async execute() { const error = new Error('transport timeout'); error.unknownOutcome = true; throw error; } };
  const runner = createReferenceSeedRunner({ plan, adapter, projectRoot: root, checkpointPath: path.join(root, 'state', 'checkpoint.json'), outputRoot: root, budget: { maxCost: 10 } });
  const state = await runner.run(); assert.equal(state.status, 'needs-reconciliation'); assert.equal(state.items[0].status, 'unknown');
  await assert.rejects(() => runner.run({ retryItemIds: [state.items[0].id] }), /reconciliation/i);
  const reconciled = await runner.reconcile(state.items[0].id, { status: 'absent', receipt: { itemId: state.items[0].id }, authorization: approval('reconcile') }); assert.equal(reconciled.status, 'failed');
});
