export function createStageRegistry() {
  const adapters = new Map();
  return {
    register(adapter) {
      if (!adapter || typeof adapter !== 'object') throw new Error('Stage adapter is required.');
      if (!adapter.providerId || !adapter.stageId) throw new Error('Stage adapter requires providerId and stageId.');
      const key = `${adapter.stageId}:${adapter.providerId}`;
      if (adapters.has(key)) throw new Error(`Provider ${key} is already registered.`);
      adapters.set(key, adapter); return adapter;
    },
    get(stageId, providerId) {
      const key = `${stageId}:${providerId}`;
      const adapter = adapters.get(key);
      if (!adapter) throw new Error(`No provider registered for ${key}; automatic fallback is disabled.`);
      return adapter;
    },
    list() { return [...adapters.values()]; },
  };
}
