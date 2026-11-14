import test from 'node:test';
import assert from 'node:assert/strict';
import { createStageRequest } from '../scripts/stage-contracts.mjs';
import { createStageRegistry } from '../scripts/stage-registry.mjs';
import { createStageRunner } from '../scripts/stage-runner.mjs';

test('prepare and estimate are offline, while execute requires exact consent', async () => {
  let calls = 0;
  const registry = createStageRegistry();
  registry.register({
    providerId: 'manual', stageId: 'image-generation',
    describeCapabilities: () => ({ providerId: 'manual', stageId: 'image-generation', models: ['offline'], supportsPrepare: true, supportsExecute: true }),
    estimate: () => ({ units: 1, currency: 'offline', total: 0 }),
    prepare: ({ request }) => ({ requestId: request.id, status: 'prepared', artifacts: [] }),
    execute: async ({ request }) => { calls += 1; return { requestId: request.id, status: 'succeeded', artifacts: [] }; },
    verify: (result) => result.status === 'succeeded',
    reconcile: (result) => result,
  });
  const runner = createStageRunner({ registry });
  const request = createStageRequest({ stageId: 'image-generation', episodeId: 'ep-1', input: { sceneId: 'scene-01' }, dependencyHash: 'sha256:dep', providerId: 'manual', model: 'offline' });

  assert.deepEqual(runner.prepare(request).status, 'prepared');
  assert.equal(runner.estimate(request).total, 0);
  await assert.rejects(() => runner.execute(request), /Explicit execution consent/);
  assert.equal(calls, 0);
  const result = await runner.execute(request, { consent: { approved: true, requestHash: request.requestHash, authorization: { approvalId: 'approval-1', actor: 'reviewer', approvedAt: '2026-11-14T05:00:00.000Z' }, budget: { quoteHash: 'sha256:quote', maxCost: 0 } } });
  assert.equal(result.status, 'succeeded');
  assert.equal(calls, 1);
});

test('execution rejects post-consent mutation, provider identity mismatch, unsupported execution, and missing authorization', async () => {
  let calls = 0;
  const registry = createStageRegistry();
  registry.register({ providerId: 'manual', stageId: 'image-generation', describeCapabilities: () => ({ providerId: 'manual', stageId: 'image-generation', models: ['offline'], supportsExecute: true }), execute: async () => { calls += 1; return { status: 'succeeded' }; } });
  const runner = createStageRunner({ registry });
  const request = createStageRequest({ stageId: 'image-generation', episodeId: 'ep-1', input: { sceneId: 'scene-01' }, dependencyHash: 'sha256:dep', providerId: 'manual', model: 'offline' });
  const consent = { approved: true, requestHash: request.requestHash, authorization: { approvalId: 'approval-1', actor: 'reviewer', approvedAt: '2026-11-14T05:00:00.000Z' }, budget: { quoteHash: 'sha256:quote', maxCost: 0 } };
  await assert.rejects(() => runner.execute({ ...request, input: { sceneId: 'tampered' } }, { consent }), /digest|changed|request/i);
  await assert.rejects(() => runner.execute(request, { consent: { approved: true, requestHash: request.requestHash } }), /authorization|budget/i);
  assert.equal(calls, 0);

  const mismatch = createStageRegistry();
  mismatch.register({ providerId: 'wrong', stageId: 'other-stage', describeCapabilities: () => ({ providerId: 'manual', stageId: 'image-generation', models: ['offline'], supportsExecute: true }), execute: async () => ({ status: 'succeeded' }) });
  await assert.rejects(() => createStageRunner({ registry: mismatch }).execute(request, { consent }), /provider|stage|registered/i);

  const noExecute = createStageRegistry();
  noExecute.register({ providerId: 'manual', stageId: 'image-generation', describeCapabilities: () => ({ providerId: 'manual', stageId: 'image-generation', models: ['offline'], supportsExecute: false }), execute: async () => ({ status: 'succeeded' }) });
  await assert.rejects(() => createStageRunner({ registry: noExecute }).execute(request, { consent }), /execute|capability/i);
});

test('runner fails closed when a provider capability cannot satisfy a request', () => {
  const registry = createStageRegistry();
  registry.register({ providerId: 'limited', stageId: 'image-generation', describeCapabilities: () => ({ providerId: 'limited', stageId: 'image-generation', models: ['offline'], maxReferences: 1, supportsPrepare: true, supportsExecute: true }) });
  const runner = createStageRunner({ registry });
  const request = createStageRequest({ stageId: 'image-generation', episodeId: 'ep-1', input: { references: ['a', 'b'] }, dependencyHash: 'sha256:dep', providerId: 'limited', model: 'offline' });
  assert.throws(() => runner.prepare(request), /references|capability/i);
});
