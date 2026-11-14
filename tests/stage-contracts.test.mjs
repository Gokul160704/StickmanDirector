import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_CONTRACT_VERSION,
  createArtifactRecord,
  createProviderCapability,
  createStageDefinition,
  createStageRequest,
  createStageResult,
  hashContract,
} from '../scripts/stage-contracts.mjs';
import { createStageRegistry } from '../scripts/stage-registry.mjs';

test('creates deterministic versioned stage contracts without provider side effects', () => {
  const definition = createStageDefinition({ id: 'image-generation', name: 'Image generation' });
  const request = createStageRequest({ stageId: definition.id, episodeId: 'ep-1', input: { sceneId: 'scene-01' }, dependencyHash: 'sha256:dep' });
  const artifact = createArtifactRecord({ id: 'asset-01', kind: 'image', path: 'images/scene-01.png', contentHash: 'sha256:asset' });
  const result = createStageResult({ requestId: request.id, status: 'prepared', artifacts: [artifact] });
  const capability = createProviderCapability({ providerId: 'flow', stageId: definition.id, models: ['still-model'], supportsPrepare: true, supportsExecute: true });

  assert.equal(definition.contractVersion, STAGE_CONTRACT_VERSION);
  assert.match(request.requestHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.artifacts[0].contentHash, artifact.contentHash);
  assert.deepEqual(capability.models, ['still-model']);
  assert.equal(hashContract({ b: 2, a: 1 }), hashContract({ a: 1, b: 2 }));
});

test('registry requires explicit provider registration and rejects duplicates', () => {
  const registry = createStageRegistry();
  const adapter = { providerId: 'manual', stageId: 'image-generation' };
  registry.register(adapter);
  assert.equal(registry.get('image-generation', 'manual'), adapter);
  assert.throws(() => registry.get('image-generation', 'flow'), /No provider registered/);
  assert.throws(() => registry.register(adapter), /already registered/);
});
