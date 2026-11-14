import { createHash } from 'node:crypto';
import { verifySeedCandidates } from '../reference-seeding.mjs';
import { hashContract } from '../stage-contracts.mjs';
import { CLOUDFLARE_FLUX_KLEIN_4B, CLOUDFLARE_PROVIDER_ID, getCloudflareImageCapability, decodeCloudflareImage, assertCloudflareImageBytes } from './cloudflare-workers-ai.mjs';
import { classifyCloudflareFailure } from '../provider-usage-reconciliation.mjs';

function hash(value) { return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`; }
function text(value, name) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`); return value.trim(); }
function finite(value, name) { if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite number >= 0.`); return value; }
function tiles(width, height) { return Math.ceil(width / 512) * Math.ceil(height / 512); }
function assertPlan(plan) {
  if (plan?.kind !== 'reference-seed' || plan.providerId !== CLOUDFLARE_PROVIDER_ID || !Array.isArray(plan.items)) throw new Error('Cloudflare reference seeding requires a valid reference-seed plan.');
  if (plan.model !== CLOUDFLARE_FLUX_KLEIN_4B) throw new Error('Cloudflare reference seeding requires the approved FLUX 2 Klein model.');
}

export function createCloudflareWorkersAiReferenceSeedAdapter({ mode = 'mock', transport, projectRoot, now = () => new Date().toISOString() } = {}) {
  if (!['mock', 'live'].includes(mode)) throw new Error('Cloudflare reference seed mode must be mock or live.');
  let prepared = null;
  let authorization = null;
  const capability = getCloudflareImageCapability(CLOUDFLARE_FLUX_KLEIN_4B);

  async function prepare({ plan, items = plan?.items, projectRoot: requestedRoot = projectRoot } = {}) {
    assertPlan(plan); if (!Array.isArray(items) || !items.length) throw new Error('Reference seed preparation requires at least one item.');
    const dimensions = { ...plan.imageSpec }; if (dimensions.width < 256 || dimensions.height < 256 || dimensions.width > 1920 || dimensions.height > 1920 || dimensions.width * 9 !== dimensions.height * 16) throw new Error('Reference seed dimensions must be valid 16:9 values from 256 through 1920.');
    if ((plan.inputCandidates ?? []).length > capability.maxReferences) throw new Error('Cloudflare reference seed input count exceeds model capability.');
    await verifySeedCandidates(plan, requestedRoot);
    const itemCosts = Object.fromEntries(items.map((item) => [item.id, capability.outputNeurons * tiles(dimensions.width, dimensions.height) + capability.inputNeurons * (plan.inputCandidates ?? []).length]));
    const totalCost = Object.values(itemCosts).reduce((sum, value) => sum + value, 0);
    const requestHash = hashContract({ planRequestHash: plan.requestHash, itemIds: items.map((item) => item.id), promptHashes: items.map((item) => item.promptHash), dimensions, inputCandidateHashes: (plan.inputCandidates ?? []).map((candidate) => candidate.contentHash) });
    const quote = { providerId: CLOUDFLARE_PROVIDER_ID, stageId: 'reference-seeding', model: plan.model, requestHash, itemCosts, totalCost, dimensions, inputCandidateHashes: (plan.inputCandidates ?? []).map((candidate) => candidate.contentHash), paidOverageAllowed: false };
    quote.quoteHash = hashContract(quote); prepared = { plan: structuredClone(plan), itemIds: items.map((item) => item.id), quote }; return structuredClone(quote);
  }
  async function authorize(evidence = {}) {
    if (!prepared) throw new Error('Prepare the reference seed batch before authorization.');
    if (evidence.requestHash !== prepared.quote.requestHash || evidence.quoteHash !== prepared.quote.quoteHash) throw new Error('Reference seed authorization must bind to the current request and quote.');
    if (!evidence.approvalId || !evidence.actor || !Number.isFinite(Date.parse(evidence.approvedAt))) throw new Error('Reference seed authorization requires approval provenance.');
    if (evidence.maxCost < prepared.quote.totalCost) throw new Error('Reference seed authorization budget is below the quote.');
    if (evidence.paidOverage !== false) throw new Error('Reference seed authorization must prohibit paid overage.');
    if (!evidence.quota || evidence.quota.remainingNeurons < prepared.quote.totalCost) throw new Error('Verified remaining Cloudflare quota is below the quote.');
    if (mode === 'live' && evidence.live !== true) throw new Error('Live reference seeding requires explicit live authorization.');
    if (mode === 'live' && (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN)) throw new Error('Live reference seeding requires scoped Cloudflare credentials.');
    authorization = { ...evidence, spent: 0, completed: new Set() }; return { provider: CLOUDFLARE_PROVIDER_ID, requestHash: evidence.requestHash, quoteHash: evidence.quoteHash, maxCost: evidence.maxCost, quota: { remainingNeurons: evidence.quota.remainingNeurons, evidenceId: evidence.quota.evidenceId ?? null }, live: evidence.live === true };
  }
  async function execute({ plan, item, attemptId } = {}) {
    if (!authorization || !prepared) throw new Error('Authorized reference seed execution is required.');
    if (!prepared.itemIds.includes(item?.id) || item.requestHash !== prepared.plan.items.find((entry) => entry.id === item.id)?.requestHash) throw new Error('Reference seed item is not bound to the approved plan.');
    if (authorization.completed.has(item.id)) throw new Error('Reference seed item already has a completed provider attempt; reconcile before repeating it.');
    const cost = prepared.quote.itemCosts[item.id]; if (authorization.spent + cost > authorization.maxCost || authorization.spent + cost > authorization.quota.remainingNeurons) throw new Error('Reference seed authorization budget or quota is exhausted.');
    const { width, height } = prepared.quote.dimensions; let bytes; let receipt; let actualCost = cost; let usageStatus = 'reported'; let usageWarning = null;
    if (mode === 'mock') { bytes = Buffer.from(`MOCK-REFERENCE-SEED:${hash({ itemId: item.id, promptHash: item.promptHash, candidateHashes: prepared.quote.inputCandidateHashes })}`); receipt = { provider: CLOUDFLARE_PROVIDER_ID, stage: 'reference-seeding', requestId: item.id, attemptId, mode: 'mock', usage: { neurons: cost } }; }
    else {
      if (typeof transport !== 'function') throw new Error('A live Cloudflare transport is required.');
      const candidates = await verifySeedCandidates(plan, projectRoot); const formData = new FormData(); formData.append('prompt', item.prompt); formData.append('width', String(width)); formData.append('height', String(height)); if (plan.seed !== null && plan.seed !== undefined) formData.append('seed', String(plan.seed));
      candidates.forEach((candidate, index) => formData.append(`input_image_${index}`, new Blob([candidate.bytes], { type: 'application/octet-stream' }), `${candidate.id}.bin`));
      let response; try { response = await transport({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN, model: plan.model, formData }); } catch (error) { const safe = String(error?.message ?? error).replaceAll(process.env.CLOUDFLARE_API_TOKEN ?? '', '[REDACTED]').replaceAll(process.env.CLOUDFLARE_ACCOUNT_ID ?? '', '[REDACTED]'); const classification = classifyCloudflareFailure(error); const ambiguous = new Error(safe); ambiguous.classification = classification.classification; ambiguous.unknownOutcome = classification.unknownOutcome; throw ambiguous; }
      bytes = await decodeCloudflareImage(response, { model: plan.model, expectedDimensions: { width, height } }); assertCloudflareImageBytes(bytes, { width, height }); if (Number.isFinite(response.usage?.neurons)) { actualCost = finite(response.usage.neurons, 'Cloudflare actual neuron usage'); if (actualCost > cost) usageWarning = `Cloudflare reported ${actualCost} neurons for an item quoted at ${cost} neurons.`; } else { actualCost = cost; usageStatus = 'unreported'; usageWarning = 'Cloudflare did not report per-request neuron usage; the quoted cost is provisional pending dashboard reconciliation.'; } if (authorization.spent + actualCost > authorization.maxCost || authorization.spent + actualCost > authorization.quota.remainingNeurons) { const ambiguous = new Error('Cloudflare actual usage exceeded the approved quote or quota.'); ambiguous.unknownOutcome = true; throw ambiguous; } receipt = { provider: CLOUDFLARE_PROVIDER_ID, stage: 'reference-seeding', requestId: response.requestId ?? item.id, attemptId, mode: 'live', usage: usageStatus === 'reported' ? { neurons: actualCost, status: usageStatus } : { neurons: null, estimatedNeurons: actualCost, status: usageStatus } };
    }
    authorization.spent += actualCost; authorization.completed.add(item.id); return { cost: actualCost, requiresApproval: Boolean(usageWarning && usageStatus === 'reported' && actualCost > cost), usageWarning, output: { path: item.outputPath, bytes }, receipt, provenance: { provider: CLOUDFLARE_PROVIDER_ID, stage: 'reference-seeding', model: plan.model, width, height, seed: plan.seed, inputCandidateHashes: prepared.quote.inputCandidateHashes, generatedAt: now(), reviewStatus: 'needs-review', usageStatus, usageWarning, mode } };
  }
  return { providerId: CLOUDFLARE_PROVIDER_ID, stageId: 'reference-seeding', prepare, authorize, execute, getSecurityState: () => ({ mode, liveAuthorized: authorization?.live === true, credentialsPersisted: false }) };
}
