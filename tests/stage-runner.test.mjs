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
  const result = await runner.execute(request, { consent: { approved: true, requestHash: request.requestHash } });
  assert.equal(result.status, 'succeeded');
  assert.equal(calls, 1);
});

test('runner fails closed when a provider capability cannot satisfy a request', () => {
  const registry = createStageRegistry();
  registry.register({ providerId: 'limited', stageId: 'image-generation', describeCapabilities: () => ({ providerId: 'limited', stageId: 'image-generation', models: ['offline'], maxReferences: 1, supportsPrepare: true, supportsExecute: true }) });
  const runner = createStageRunner({ registry });
  const request = createStageRequest({ stageId: 'image-generation', episodeId: 'ep-1', input: { references: ['a', 'b'] }, dependencyHash: 'sha256:dep', providerId: 'limited', model: 'offline' });
  assert.throws(() => runner.prepare(request), /references|capability/i);
});
