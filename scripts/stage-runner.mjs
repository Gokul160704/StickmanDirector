import { createProviderCapability, createStageResult } from './stage-contracts.mjs';

function capabilityFor(adapter) { return createProviderCapability(adapter.describeCapabilities?.() ?? { providerId: adapter.providerId, stageId: adapter.stageId }); }

function assertCapability(request, capability) {
  if (capability.models.length && !capability.models.includes(request.model)) throw new Error(`Provider capability does not support model ${request.model}.`);
  const input = request.input ?? {};
  const references = Array.isArray(input.references) ? input.references : [];
  if (capability.maxReferences !== undefined && references.length > capability.maxReferences) throw new Error(`Provider capability supports at most ${capability.maxReferences} references.`);
  for (const [field, limit, direction] of [['width', capability.maxWidth, 'max'], ['height', capability.maxHeight, 'max'], ['width', capability.minWidth, 'min'], ['height', capability.minHeight, 'min']]) {
    if (input[field] !== undefined && limit !== undefined && (direction === 'max' ? input[field] > limit : input[field] < limit)) throw new Error(`Provider capability rejects ${field}=${input[field]}.`);
  }
}

export function createStageRunner({ registry } = {}) {
  if (!registry?.get) throw new Error('A stage registry is required.');
  function adapterFor(request) { const adapter = registry.get(request.stageId, request.providerId); assertCapability(request, capabilityFor(adapter)); return adapter; }
  return {
    prepare(request) { const adapter = adapterFor(request); if (adapter.prepare) return adapter.prepare({ request, capability: capabilityFor(adapter) }); return createStageResult({ requestId: request.id, status: 'prepared', artifacts: [] }); },
    estimate(request) { const adapter = adapterFor(request); if (typeof adapter.estimate !== 'function') throw new Error('Provider does not implement estimate.'); return adapter.estimate({ request, capability: capabilityFor(adapter) }); },
    async execute(request, { consent } = {}) {
      if (consent?.approved !== true || consent.requestHash !== request.requestHash) throw new Error('Explicit execution consent must match the exact request hash.');
      const adapter = adapterFor(request); if (typeof adapter.execute !== 'function') throw new Error('Provider does not implement execute.');
      return adapter.execute({ request, capability: capabilityFor(adapter) });
    },
    verify(request, result) { const adapter = adapterFor(request); return typeof adapter.verify === 'function' ? adapter.verify({ request, result, capability: capabilityFor(adapter) }) : false; },
    reconcile(request, result) { const adapter = adapterFor(request); return typeof adapter.reconcile === 'function' ? adapter.reconcile({ request, result, capability: capabilityFor(adapter) }) : result; },
  };
}
