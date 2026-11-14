import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertFrozenReferenceBundle } from '../continuity-refs.mjs';
import { assertPathInsideRoot } from '../path-safety.mjs';
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
function bytesHash(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
export function getCloudflareImageCapability(model) { const capability = MODEL_CAPABILITIES[model]; if (!capability) throw new Error(`Unsupported Cloudflare Workers AI image model: ${model}.`); return clone(capability); }
function modelCapability(model) { return getCloudflareImageCapability(model); }
function tiles(width, height) { return Math.ceil(width / 512) * Math.ceil(height / 512); }
function dimensionsFor(plan) { return { width: plan.imageSpec?.width ?? 1024, height: plan.imageSpec?.height ?? 576 }; }
function assertDimensions(plan, capability) {
  const { width, height } = dimensionsFor(plan);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < capability.minWidth || width > capability.maxWidth || height < capability.minHeight || height > capability.maxHeight) throw new Error('Cloudflare image dimensions are outside the supported 256-1920 range.');
  if (width * 9 !== height * 16) throw new Error('Cloudflare image dimensions must preserve the 16:9 aspect ratio.');
  return { width, height };
}
async function assertReferences(plan, bundle, items, capability, referenceRegistry) {
  assertFrozenReferenceBundle(bundle);
  if (referenceRegistry?.assertCurrent) referenceRegistry.assertCurrent(bundle);
  const ids = bundle.references.map((reference) => reference.id);
  if (ids.length > capability.maxReferences) throw new Error(`Cloudflare model supports at most ${capability.maxReferences} references.`);
  for (const reference of bundle.references) {
    const width = reference.metadata?.width; const height = reference.metadata?.height;
    if (capability.maxReferences > 0 && (!Number.isInteger(width) || !Number.isInteger(height))) throw new Error('Cloudflare reference dimensions must be verified before dispatch.');
    if (width >= 512 || height >= 512) throw new Error('Cloudflare reference images must be smaller than 512x512.');
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

async function readReferenceInputs(bundle, projectRoot) {
  if (!projectRoot) throw new Error('A projectRoot is required to build live Cloudflare reference inputs.');
  const root = path.resolve(projectRoot); const inputs = [];
  for (const reference of bundle.references) {
    const file = path.resolve(root, reference.path); await assertPathInsideRoot(root, file, 'Cloudflare reference path');
    const stat = await lstat(file); if (stat.isSymbolicLink()) throw new Error('Cloudflare reference path cannot be a symlink.');
    const bytes = await readFile(file); if (bytesHash(bytes) !== reference.contentHash) throw new Error(`Cloudflare reference bytes do not match contentHash for ${reference.id}.`);
    inputs.push({ id: reference.id, bytes });
  }
  return inputs;
}

export function decodeCloudflareImage(response) {
  if (response?.image && typeof response.image === 'string') return Buffer.from(response.image, 'base64');
  if (response?.bytes) return Buffer.from(response.bytes);
  throw new Error('Cloudflare live response did not include its documented base64 image field.');
}
export function assertCloudflareImageBytes(bytes, expected) {
  const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  const webp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !jpeg && !webp) throw new Error('Cloudflare output is not a recognized PNG, JPEG, or WebP image.');
  if (png) { const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20); if (width !== expected.width || height !== expected.height) throw new Error('Cloudflare output dimensions do not match the approved request.'); }
}

export function createCloudflareWorkersAiAdapter({ mode = 'mock', transport, projectRoot, referenceRegistry, now = () => new Date().toISOString() } = {}) {
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
    const dimensions = assertDimensions(plan, capability); await assertReferences(plan, referenceBundle, selected, capability, referenceRegistry);
    if (mode === 'live' && !text(plan.imageSpec?.prompt, 'Cloudflare live prompt')) throw new Error('Cloudflare live execution requires the approved prompt text.');
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
    if (evidence.maxCost < prepared.quote.totalCost) throw new Error('Cloudflare authorization budget is below the quoted batch total.');
    if (mode === 'live' && evidence.live !== true) throw new Error('Live Cloudflare execution requires explicit live authorization.');
    if (mode === 'live' && (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN)) throw new Error('Live Cloudflare execution requires scoped account credentials.');
    if (!evidence.quota || !Number.isFinite(evidence.quota.remainingNeurons) || evidence.quota.remainingNeurons < prepared.quote.totalCost) throw new Error('Verified remaining Cloudflare quota is below the quoted batch total.');
    authorization = { approvalId: evidence.approvalId, actor: evidence.actor, approvedAt: evidence.approvedAt, requestHash: evidence.requestHash, quoteHash: evidence.quoteHash, maxCost: evidence.maxCost, quota: { remainingNeurons: evidence.quota.remainingNeurons, evidenceId: evidence.quota.evidenceId ?? null }, spent: 0, live: evidence.live === true, completedItems: new Set() };
    return { ...clone(authorization), provider: CLOUDFLARE_PROVIDER_ID, credentialsPersisted: false };
  }

  async function execute({ item, referenceBundle, attemptId } = {}) {
    if (!authorization) throw new Error('Cloudflare provider authorization is required before execution.');
    if (!prepared?.itemIds.includes(item?.id) || item.referenceBundleHash !== prepared.referenceBundleHash) throw new Error('Cloudflare execution item is not bound to the prepared batch.');
    if (authorization.completedItems.has(item.id)) throw new Error('Cloudflare item already has a completed provider attempt; reconcile before repeating it.');
    const cost = prepared.quote.itemCosts[item.id];
    if (authorization.spent + cost > authorization.maxCost || authorization.spent + cost > authorization.quota.remainingNeurons) throw new Error('Cloudflare authorization budget or remaining quota is exhausted.');
    const capability = prepared.quote.capability; const { width, height } = prepared.quote.dimensions;
    let bytes = `MOCK-CLOUDFLARE-IMAGE:${hash({ itemId: item.id, model: item.model, refs: item.referenceIds, seed: item.requestedSeed })}`;
    let providerReceipt = { provider: CLOUDFLARE_PROVIDER_ID, requestId: item.id, attemptId, mode: 'mock' };
    let actualCost = cost;
    if (mode === 'live') {
      if (typeof transport !== 'function') throw new Error('A live Cloudflare transport is required.');
      const referenceInputs = await readReferenceInputs(referenceBundle, projectRoot); const formData = new FormData();
      formData.append('prompt', prepared.plan.imageSpec.prompt); formData.append('width', String(width)); formData.append('height', String(height));
      if (item.requestedSeed !== null && item.requestedSeed !== undefined) formData.append('seed', String(item.requestedSeed));
      referenceInputs.forEach((input, index) => formData.append(`input_image_${index}`, new Blob([input.bytes], { type: 'application/octet-stream' }), `${input.id}.bin`));
      let response;
      try { response = await transport({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN, model: item.model, formData }); }
      catch (error) { const safe = String(error?.message ?? error).replaceAll(process.env.CLOUDFLARE_API_TOKEN, '[REDACTED]').replaceAll(process.env.CLOUDFLARE_ACCOUNT_ID, '[REDACTED]'); const ambiguous = new Error(safe); ambiguous.unknownOutcome = true; throw ambiguous; }
      bytes = decodeCloudflareImage(response); assertCloudflareImageBytes(bytes, { width, height }); actualCost = finite(response.usage?.neurons, 'Cloudflare actual neuron usage');
      if (actualCost > cost || authorization.spent + actualCost > authorization.maxCost || authorization.spent + actualCost > authorization.quota.remainingNeurons) { const ambiguous = new Error('Cloudflare actual usage exceeded the approved quote or quota.'); ambiguous.unknownOutcome = true; throw ambiguous; }
      providerReceipt = { provider: CLOUDFLARE_PROVIDER_ID, requestId: response.requestId ?? item.id, attemptId, mode: 'live', usage: { neurons: actualCost } };
    }
    authorization.spent += actualCost; authorization.completedItems.add(item.id);
    return { cost: actualCost, output: { path: prepared.quote.outputPaths[item.id], bytes }, receipt: providerReceipt, provenance: { provider: CLOUDFLARE_PROVIDER_ID, model: item.model, modelRevision: 'official-capability-2026-01-15', width, height, inferenceSteps: capability.inferenceSteps, seed: item.requestedSeed ?? null, referenceIds: [...item.referenceIds], referenceHashes: referenceBundle.references.map((reference) => reference.contentHash), referenceBundleHash: referenceBundle.bundleHash, license: referenceBundle.references.map((reference) => reference.metadata?.license ?? 'unspecified'), generatedAt: now(), reviewStatus: 'needs-review', mode } };
  }

  return { providerId: CLOUDFLARE_PROVIDER_ID, stageId: 'image-generation', describeCapabilities, prepare, authorize, execute, getSecurityState: () => ({ mode, credentialsPersisted: false, liveAuthorized: authorization?.live === true }) };
}

export function registerCloudflareWorkersAiProvider(registry, options = {}) {
  if (!registry?.register) throw new Error('A stage registry is required.');
  const adapter = createCloudflareWorkersAiAdapter(options);
  registry.register(adapter);
  return adapter;
}
