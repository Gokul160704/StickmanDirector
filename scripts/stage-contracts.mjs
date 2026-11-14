import { createHash } from 'node:crypto';

export const STAGE_CONTRACT_VERSION = 1;
export const STAGE_IDS = Object.freeze([
  'research', 'fact-check', 'script', 'continuity', 'storyboard', 'references',
  'image-prompt', 'image-generation', 'image-qa', 'narration', 'captions',
  'render', 'final-review', 'publication',
]);

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`);
  return value.trim();
}

function clone(value) { return value === undefined ? undefined : structuredClone(value); }

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

export function hashContract(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

export function createStageDefinition({ id, name, description = '', inputKinds = [], outputKinds = [], requiresApproval = true } = {}) {
  id = required(id, 'stage id');
  name = required(name, 'stage name');
  if (!Array.isArray(inputKinds) || !Array.isArray(outputKinds)) throw new Error('Stage kinds must be arrays.');
  return { contractVersion: STAGE_CONTRACT_VERSION, id, name, description: String(description), inputKinds: [...inputKinds], outputKinds: [...outputKinds], requiresApproval: Boolean(requiresApproval) };
}

export function createStageRequest({ stageId, episodeId, input = {}, dependencyHash, providerId = 'manual', model = 'offline', metadata = {} } = {}) {
  stageId = required(stageId, 'stageId'); episodeId = required(episodeId, 'episodeId'); dependencyHash = required(dependencyHash, 'dependencyHash');
  providerId = required(providerId, 'providerId'); model = required(model, 'model');
  const base = { contractVersion: STAGE_CONTRACT_VERSION, stageId, episodeId, input: clone(input), dependencyHash, providerId, model, metadata: clone(metadata) };
  return { ...base, id: hashContract(base), requestHash: hashContract(base) };
}

export function createArtifactRecord({ id, kind, path, contentHash, provenance = {}, reviewStatus = 'needs-review' } = {}) {
  return { id: required(id, 'artifact id'), kind: required(kind, 'artifact kind'), path: required(path, 'artifact path'), contentHash: required(contentHash, 'contentHash'), provenance: clone(provenance), reviewStatus };
}

export function createStageResult({ requestId, status, artifacts = [], receipt = null, error = null, metadata = {} } = {}) {
  requestId = required(requestId, 'requestId'); status = required(status, 'result status');
  if (!Array.isArray(artifacts)) throw new Error('Stage result artifacts must be an array.');
  return { contractVersion: STAGE_CONTRACT_VERSION, requestId, status, artifacts: clone(artifacts), receipt: clone(receipt), ...(error ? { error: String(error) } : {}), metadata: clone(metadata) };
}

export function createProviderCapability({ providerId, stageId, models = [], supportsPrepare = true, supportsExecute = false, maxReferences, minWidth, maxWidth, minHeight, maxHeight, cost = { currency: 'unknown' } } = {}) {
  providerId = required(providerId, 'providerId'); stageId = required(stageId, 'stageId');
  if (!Array.isArray(models)) throw new Error('Provider models must be an array.');
  return { contractVersion: STAGE_CONTRACT_VERSION, providerId, stageId, models: [...models], supportsPrepare: Boolean(supportsPrepare), supportsExecute: Boolean(supportsExecute), ...(maxReferences === undefined ? {} : { maxReferences }), ...(minWidth === undefined ? {} : { minWidth }), ...(maxWidth === undefined ? {} : { maxWidth }), ...(minHeight === undefined ? {} : { minHeight }), ...(maxHeight === undefined ? {} : { maxHeight }), cost: clone(cost) };
}
