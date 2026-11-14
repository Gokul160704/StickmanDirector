import { createHash } from 'node:crypto';
import { assertFrozenReferenceBundle } from '../continuity-refs.mjs';
import { hashContract } from '../stage-contracts.mjs';

export const CLOUDFLARE_PROVIDER_ID = 'cloudflare-workers-ai';
export const CLOUDFLARE_FLUX_KLEIN_4B = '@cf/black-forest-labs/flux-2-klein-4b';
export const CLOUDFLARE_FLUX_SCHNELL = '@cf/black-forest-labs/flux-1-schnell';

const MODEL_CAPABILITIES = Object.freeze({
  [CLOUDFLARE_FLUX_KLEIN_4B]: Object.freeze({
    maxReferences: 4, minWidth: 256, maxWidth: 1920, minHeight: 256, maxHeight: 1920,
    supportsSeed: true, inferenceSteps: 4, inputNeurons: 5.37, outputNeurons: 26.05,
    referenceLimit: 'four input images, each smaller than 512x512',
  }),
  [CLOUDFLARE_FLUX_SCHNELL]: Object.freeze({
    maxReferences: 0, minWidth: 256, maxWidth: 1920, minHeight: 256, maxHeight: 1920,
    supportsSeed: true, inferenceSteps: null, inputNeurons: 0, outputNeurons: 4.8,
    referenceLimit: 'text-to-image only',
  }),
});

function clone(value) { return value === undefined ? undefined : structuredClone(value); }
function text(value, name) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`); return value.trim(); }
function finite(value, name, minimum = 0) { if (!Number.isFinite(value) || value < minimum) throw new Error(`${name} must be a finite number >= ${minimum}.`); return value; }
function hash(value) { return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`; }
function modelCapability(model) { const capability = MODEL_CAPABILITIES[model]; if (!capability) throw new Error(`Unsupported Cloudflare Workers AI image model: ${model}.`); return capability; }
function tiles(width, height) { return Math.ceil(width / 512) * Math.ceil(height / 512); }
function dimensionsFor(plan) { return { width: plan.imageSpec?.width ?? 1024, height: plan.imageSpec?.height ?? 576 }; }
function assertDimensions(plan, capability) {
  const { width, height } = dimensionsFor(plan);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < capability.minWidth || width > capability.maxWidth || height < capability.minHeight || height > capability.maxHeight) throw new Error('Cloudflare image dimensions are outside the supported 256-1920 range.');
  if (width * 9 !== height * 16) throw new Error('Cloudflare image dimensions must preserve the 16:9 aspect ratio.');
  return { width, height };
}
function assertReferences(plan, bundle, items, capability) {
  assertFrozenReferenceBundle(bundle);
  const ids = bundle.references.map((reference) => reference.id);
  if (ids.length > capability.maxReferences) throw new Error(`Cloudflare model supports at most ${capability.maxReferences} references.`);
  for (const reference of bundle.references) {
    const width = reference.metadata?.width; const height = reference.metadata?.height;
    if (width !== undefined && height !== undefined && (width >= 512 || height >= 512)) throw new Error('Cloudflare reference images must be smaller than 512x512.');
  }
  for (const item of items) {
    if (item.providerId !== CLOUDFLARE_PROVIDER_ID || item.model !== plan.model) throw new Error('Batch item provider/model does not match the selected Cloudflare adapter.');
    if (item.referenceBundleHash !== bundle.bundleHash || JSON.stringify(item.referenceIds) !== JSON.stringify(ids)) throw new Error('Every Cloudflare item must use the exact approved reference bundle mapping.');
  }
  if (capability.maxReferences === 0 && ids.length) throw new Error('The selected Cloudflare model does not support reference images; no implicit fallback is allowed.');
}
function requestIdentity(plan, bundle, items, dimensions) {
  return { providerId: plan.providerId, model: plan.model, batchId: plan.batchId, imageSpec: dimensions, referenceBundleHash: bundle.bundleHash, itemIds: items.map((item) => item.id), promptHash: plan.imageSpec?.promptHash ?? null };
}

export function createCloudflareWorkersAiAdapter({ mode = 'mock', transport, now = () => new Date().toISOString() } = {}) {
  if (!['mock', 'live'].includes(mode)) throw new Error('Cloudflare adapter mode must be mock or live.');
  let prepared = null;
  let authorization = null;

  function describeCapabilities() {
    return { providerId: CLOUDFLARE_PROVIDER_ID, stageId: 'image-generation', models: Object.keys(MODEL_CAPABILITIES), supportsPrepare: true, supportsExecute: true, maxReferences: 4, minWidth: 256, maxWidth: 1920, minHeight: 256, maxHeight: 1920, cost: { currency: 'neurons', freeDailyAllowance: 10000, paidRate: '$0.011/1000 neurons' } };
  }

  async function prepare({ plan, referenceBundle, items } = {}) {
    if (!plan || plan.providerId !== CLOUDFLARE_PROVIDER_ID) throw new Error('Cloudflare adapter requires the cloudflare-workers-ai provider.');
    const capability = modelCapability(plan.model); const selected = items ?? plan.items;
    if (!Array.isArray(selected) || !selected.length) throw new Error('Cloudflare batch preparation requires at least one item.');
    const dimensions = assertDimensions(plan, capability); assertReferences(plan, referenceBundle, selected, capability);
    const identity = requestIdentity(plan, referenceBundle, selected, dimensions);
    const requestHash = hashContract(identity);
    const itemCosts = Object.fromEntries(selected.map((item) => [item.id, capability.outputNeurons * tiles(dimensions.width, dimensions.height) + capability.inputNeurons * referenceBundle.references.length]));
    const totalCost = Object.values(itemCosts).reduce((sum, value) => sum + value, 0);
    const outputPaths = Object.fromEntries(selected.map((item) => [item.id, `${item.sceneId}-v${item.variant + 1}.png`]));
    const quote = { providerId: CLOUDFLARE_PROVIDER_ID, model: plan.model, itemCount: selected.length, requestHash, itemCosts, totalCost, outputPaths, dimensions, capability: clone(capability), referenceBundleHash: referenceBundle.bundleHash };
    quote.quoteHash = hashContract(quote);
    prepared = { plan: clone(plan), referenceBundleHash: referenceBundle.bundleHash, itemIds: selected.map((item) => item.id), quote };
    return clone(quote);
  }

  async function authorize(evidence = {}) {
    if (!prepared) throw new Error('Prepare the Cloudflare batch before authorization.');
    if (evidence.requestHash !== prepared.quote.requestHash || evidence.quoteHash !== prepared.quote.quoteHash) throw new Error('Cloudflare authorization must bind to the current request and quote.');
    if (!evidence.approvalId || !evidence.actor || !Number.isFinite(Date.parse(evidence.approvedAt))) throw new Error('Cloudflare batch authorization requires approval provenance.');
    finite(evidence.maxCost, 'authorized maxCost');
    if (mode === 'live' && evidence.live !== true) throw new Error('Live Cloudflare execution requires explicit live authorization.');
    if (mode === 'live' && (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN)) throw new Error('Live Cloudflare execution requires scoped account credentials.');
    authorization = { approvalId: evidence.approvalId, actor: evidence.actor, approvedAt: evidence.approvedAt, requestHash: evidence.requestHash, quoteHash: evidence.quoteHash, maxCost: evidence.maxCost, live: evidence.live === true };
    return { ...clone(authorization), provider: CLOUDFLARE_PROVIDER_ID, credentialsPersisted: false };
  }

  async function execute({ item, referenceBundle, attemptId } = {}) {
    if (!authorization) throw new Error('Cloudflare provider authorization is required before execution.');
    if (!prepared?.itemIds.includes(item?.id) || item.referenceBundleHash !== prepared.referenceBundleHash) throw new Error('Cloudflare execution item is not bound to the prepared batch.');
    const cost = prepared.quote.itemCosts[item.id];
    if (authorization.maxCost < cost) throw new Error('Cloudflare authorization budget is below the item quote.');
    const capability = prepared.quote.capability; const { width, height } = prepared.quote.dimensions;
    let bytes = `MOCK-CLOUDFLARE-IMAGE:${hash({ itemId: item.id, model: item.model, refs: item.referenceIds, seed: item.requestedSeed })}`;
    let providerReceipt = { provider: CLOUDFLARE_PROVIDER_ID, requestId: item.id, attemptId, mode: 'mock' };
    if (mode === 'live') {
      if (typeof transport !== 'function') throw new Error('A live Cloudflare transport is required.');
      const response = await transport({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN, model: item.model, input: { promptHash: prepared.plan.imageSpec?.promptHash, width, height, seed: item.requestedSeed, referenceIds: item.referenceIds } });
      if (!response?.bytes) throw new Error('Cloudflare live response did not include output bytes.');
      bytes = response.bytes; providerReceipt = { provider: CLOUDFLARE_PROVIDER_ID, requestId: response.requestId ?? item.id, attemptId, mode: 'live', usage: response.usage ?? null };
    }
    return { cost, output: { path: prepared.quote.outputPaths[item.id], bytes }, receipt: providerReceipt, provenance: { provider: CLOUDFLARE_PROVIDER_ID, model: item.model, modelRevision: 'official-capability-2026-01-15', width, height, inferenceSteps: capability.inferenceSteps, seed: item.requestedSeed ?? null, referenceIds: [...item.referenceIds], referenceHashes: referenceBundle.references.map((reference) => reference.contentHash), referenceBundleHash: referenceBundle.bundleHash, license: referenceBundle.references.map((reference) => reference.metadata?.license ?? 'unspecified'), generatedAt: now(), reviewStatus: 'needs-review', mode } };
  }

  return { providerId: CLOUDFLARE_PROVIDER_ID, stageId: 'image-generation', describeCapabilities, prepare, authorize, execute, getSecurityState: () => ({ mode, credentialsPersisted: false, liveAuthorized: authorization?.live === true }) };
}

export function registerCloudflareWorkersAiProvider(registry, options = {}) {
  if (!registry?.register) throw new Error('A stage registry is required.');
  const adapter = createCloudflareWorkersAiAdapter(options);
  registry.register(adapter);
  return adapter;
}
