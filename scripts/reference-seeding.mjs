import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertPathInsideRoot } from './path-safety.mjs';
import { hashContract } from './stage-contracts.mjs';

export const REFERENCE_SEED_PLAN_VERSION = 1;
export const REFERENCE_SEED_ROLES = Object.freeze(new Set(['character', 'prop', 'environment', 'style']));
const HASH = /^sha256:[a-f0-9]{64}$/;
const SECRET = /(?:token|secret|password|api[-_]?key|authorization|cookie|credential)/i;

function clone(value) { return structuredClone(value); }
function text(value, name) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`); return value.trim(); }
function hashBytes(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function validHash(value, name) { if (typeof value !== 'string' || !HASH.test(value)) throw new Error(`${name} must be an exact lowercase SHA-256.`); return value; }
function safeRelative(value, name) {
  const normalized = text(value, name).replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').includes('..')) throw new Error(`${name} must stay within its root.`);
  return normalized;
}
function finite(value, name, minimum = 0) { if (!Number.isFinite(value) || value < minimum) throw new Error(`${name} must be a finite number >= ${minimum}.`); return value; }
function sanitize(value, key = '') {
  if (SECRET.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return value.replace(/(?:bearer\s+|sk-[A-Za-z0-9_-]+|cfut_[A-Za-z0-9_-]+)/gi, '[REDACTED]');
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k)]));
  return value;
}
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function atomicWrite(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try { await writeFile(temp, `${JSON.stringify(sanitize(value), null, 2)}\n`, { flag: 'wx' }); await rename(temp, file); }
  finally { await rm(temp, { force: true }); }
}
async function readState(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function assertDimensions(dimensions) {
  const width = dimensions?.width; const height = dimensions?.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 256 || width > 1920 || height < 256 || height > 1920) throw new Error('Reference seed output dimensions must be integers from 256 through 1920.');
  if (width * 9 !== height * 16) throw new Error('Reference seed output dimensions must preserve 16:9.');
  return { width, height };
}
function approval(value, name) {
  if (!value?.approvalId || !value.actor || !Number.isFinite(Date.parse(value.approvedAt))) throw new Error(`${name} requires approvalId, actor, and approvedAt.`);
  return { approvalId: text(value.approvalId, `${name}.approvalId`), actor: text(value.actor, `${name}.actor`), approvedAt: new Date(value.approvedAt).toISOString() };
}
function normalizeCandidate(candidate, index) {
  const id = text(candidate?.id, `inputCandidates[${index}].id`);
  const role = text(candidate?.role, `inputCandidates[${index}].role`);
  if (!REFERENCE_SEED_ROLES.has(role)) throw new Error(`Unsupported seed candidate role ${role}.`);
  const width = candidate?.width; const height = candidate?.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width >= 512 || height >= 512) throw new Error(`Seed input candidate ${id} must be verified and smaller than 512x512.`);
  return { id, role, path: safeRelative(candidate.path, `inputCandidates[${index}].path`), contentHash: validHash(candidate.contentHash, `inputCandidates[${index}].contentHash`), width, height, license: text(candidate.license ?? 'unspecified', `inputCandidates[${index}].license`), consent: approval(candidate.consent, `inputCandidates[${index}].consent`) };
}
export function createReferenceSeedPlan({ seedBatchId, episodeId, providerId, model, dimensions, items, inputCandidates = [], dependencyHash, seed = null } = {}) {
  seedBatchId = text(seedBatchId, 'seedBatchId'); episodeId = text(episodeId, 'episodeId'); providerId = text(providerId, 'providerId'); model = text(model, 'model'); dependencyHash = text(dependencyHash, 'dependencyHash');
  const imageSpec = assertDimensions(dimensions); if (!Array.isArray(items) || items.length < 1) throw new Error('Reference seed plan requires at least one output item.');
  const candidates = inputCandidates.map(normalizeCandidate); if (candidates.length > 4 || new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) throw new Error('Reference seed plan supports at most four unique input candidates.');
  const seen = new Set(); const prompts = new Set();
  const normalizedItems = items.map((item, index) => {
    const id = text(item?.id, `items[${index}].id`); const role = text(item?.role, `items[${index}].role`); const prompt = text(item?.prompt, `items[${index}].prompt`);
    if (!REFERENCE_SEED_ROLES.has(role)) throw new Error(`Unsupported reference seed role ${role}.`);
    if (seen.has(id)) throw new Error(`Duplicate reference seed item ${id}.`); if (prompts.has(prompt)) throw new Error('Reference seed prompts must be distinct.');
    seen.add(id); prompts.add(prompt);
    const outputPath = safeRelative(item.outputPath ?? `references/seed/${id}.png`, `items[${index}].outputPath`);
    const promptHash = hashContract({ prompt });
    const identity = { seedBatchId, episodeId, providerId, model, imageSpec, role, id, promptHash, inputCandidateIds: candidates.map((candidate) => candidate.id), inputCandidateHashes: candidates.map((candidate) => candidate.contentHash), dependencyHash, seed };
    return { id, role, prompt, promptHash, outputPath, requestHash: hashContract(identity), idempotencyKey: hashContract({ ...identity, kind: 'reference-seed' }), status: 'pending' };
  });
  const base = { version: REFERENCE_SEED_PLAN_VERSION, kind: 'reference-seed', seedBatchId, episodeId, providerId, model, imageSpec, dependencyHash, seed, inputCandidates: candidates, items: normalizedItems };
  return { ...base, requestHash: hashContract(base) };
}
export async function verifySeedCandidates(plan, projectRoot) {
  if (!(plan.inputCandidates ?? []).length) return [];
  if (!projectRoot) throw new Error('A projectRoot is required to verify seed candidates.');
  const root = path.resolve(projectRoot); const inputs = [];
  for (const candidate of plan.inputCandidates ?? []) {
    const file = path.resolve(root, candidate.path); await assertPathInsideRoot(root, file, `Seed candidate ${candidate.id}`);
    const stat = await lstat(file); if (stat.isSymbolicLink()) throw new Error(`Seed candidate ${candidate.id} cannot be a symlink.`);
    const bytes = await readFile(file); if (hashBytes(bytes) !== candidate.contentHash) throw new Error(`Seed candidate bytes do not match contentHash for ${candidate.id}.`);
    inputs.push({ ...candidate, bytes });
  }
  return inputs;
}
function assertPlan(plan) { if (plan?.version !== REFERENCE_SEED_PLAN_VERSION || plan.kind !== 'reference-seed' || !Array.isArray(plan.items)) throw new Error('Malformed reference seed plan.'); return true; }

export function createReferenceSeedRunner({ plan, adapter, checkpointPath, outputRoot, projectRoot, concurrency = 2, budget = {} } = {}) {
  assertPlan(plan); if (!adapter?.prepare || !adapter?.execute) throw new Error('Reference seed adapter must provide prepare and execute.');
  if (!checkpointPath || !outputRoot) throw new Error('checkpointPath and outputRoot are required.');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('concurrency must be a positive integer.');
  const maxCost = finite(budget.maxCost ?? 0, 'budget.maxCost'); const statePath = path.resolve(checkpointPath); const root = path.resolve(outputRoot);
  let state = { version: 1, kind: 'reference-seed-checkpoint', plan: clone(plan), spent: 0, reserved: 0, status: 'ready', items: plan.items.map((item) => ({ ...clone(item), attempts: [] })), updatedAt: new Date().toISOString() };
  let writeChain = Promise.resolve();
  async function persist() { state.updatedAt = new Date().toISOString(); writeChain = writeChain.then(() => atomicWrite(statePath, state)); return writeChain; }
  async function load() { const saved = await readState(statePath); if (!saved) return clone(state); if (saved.plan?.requestHash !== plan.requestHash || saved.plan?.model !== plan.model || saved.plan?.seedBatchId !== plan.seedBatchId) throw new Error('Reference seed checkpoint does not match the approved plan.'); state = saved; return clone(state); }
  function safeOutput(item) { const file = path.resolve(root, item.outputPath); const relative = path.relative(root, file); if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Reference seed output path escapes the output root.'); return file; }
  async function reconcile(itemId, result) {
    const item = state.items.find((entry) => entry.id === itemId); if (!item || item.status !== 'unknown') throw new Error('Only unknown reference seed outcomes may be reconciled.');
    if (!result?.receipt || !result.authorization?.approvalId || !result.authorization.actor || !Number.isFinite(Date.parse(result.authorization.approvedAt)) || !['present', 'absent', 'unknown'].includes(result.status)) throw new Error('Reference seed reconciliation requires matching receipt and authorization.');
    const attemptId = item.attempts.at(-1)?.attemptId; if (result.receipt.itemId !== item.id && result.receipt.attemptId !== attemptId && result.receipt.requestId !== item.id) throw new Error('Reference seed reconciliation receipt does not match the unknown attempt.');
    if (result.status === 'unknown') return clone(item);
    const held = finite(item.reservedCost ?? 0, 'reserved reference seed cost');
    if (result.status === 'present') { const actualCost = finite(result.actualCost, 'reconciled reference seed cost'); if (actualCost > held || state.spent + actualCost > maxCost) throw new Error('Reconciled reference seed cost exceeds the authorized budget.'); state.spent += actualCost; item.status = 'needs-review'; item.cost = actualCost; }
    else item.status = 'failed';
    item.reservedCost = 0; state.reserved = Math.max(0, state.reserved - held); item.reconciliation = sanitize(result); await persist(); return clone(item);
  }
  async function executeItem(item, reservation) {
    const attemptId = `${item.id}:${(item.attempts.length ?? 0) + 1}`; if (state.spent + state.reserved + reservation > maxCost) throw new Error('Reference seed budget reservation is exhausted.');
    state.reserved += reservation; item.reservedCost = reservation; item.status = 'running'; item.attempts.push({ attemptId, status: 'running', startedAt: new Date().toISOString(), requestHash: item.requestHash }); await persist();
    try {
      const result = await adapter.execute({ plan: state.plan, item: clone(item), attemptId }); const cost = finite(result?.cost ?? 0, 'reference seed provider cost'); if (cost > reservation || state.spent + cost > maxCost) { const error = new Error('Reference seed result exceeds its reserved budget.'); error.unknownOutcome = true; throw error; }
      if (!result?.output?.bytes && !result?.output?.contentHash) throw new Error('Reference seed provider output requires bytes or a verified contentHash.');
      const output = { ...result.output }; if (output.bytes) output.contentHash = hashBytes(output.bytes); else if (!HASH.test(output.contentHash)) throw new Error('Reference seed output contentHash is invalid.');
      const expectedPath = item.outputPath; if (output.path !== expectedPath) throw new Error('Reference seed output path must match the declared plan path.');
      const file = safeOutput(item); await mkdir(path.dirname(file), { recursive: true }); if (await exists(file)) throw new Error('Reference seed output already exists; dispatch refused.');
      if (output.bytes) { await writeFile(file, output.bytes, { flag: 'wx' }); } else throw new Error('Reference seed output bytes are required for safe local materialization.');
      item.status = 'needs-review'; item.output = { path: expectedPath, contentHash: output.contentHash }; item.cost = cost; item.receipt = sanitize(result.receipt ?? null); item.provenance = sanitize(result.provenance ?? {}); item.reservedCost = 0; state.spent += cost; state.reserved = Math.max(0, state.reserved - reservation); item.attempts[item.attempts.length - 1] = { ...item.attempts.at(-1), status: 'succeeded', finishedAt: new Date().toISOString(), cost, receipt: item.receipt }; await persist();
    } catch (error) { const unknown = error?.unknownOutcome === true; item.status = unknown ? 'unknown' : 'failed'; item.error = String(error.message || error); item.attempts[item.attempts.length - 1] = { ...item.attempts.at(-1), status: item.status, finishedAt: new Date().toISOString(), error: item.error }; if (!unknown) { item.reservedCost = 0; state.reserved = Math.max(0, state.reserved - reservation); } await persist(); if (!unknown) throw error; }
  }
  async function run({ retryItemIds = [] } = {}) {
    await load(); await verifySeedCandidates(state.plan, projectRoot); const retryIds = new Set(retryItemIds); for (const id of retryIds) { const item = state.items.find((entry) => entry.id === id); if (item?.status === 'unknown') throw new Error('Unknown reference seed outcome requires reconciliation before retry.'); if (!item || item.status !== 'failed' && item.status !== 'needs-review') throw new Error(`Only failed or needs-review seed items may be retried: ${id}.`); item.status = 'pending'; }
    for (const item of state.items) if (item.status === 'unknown' && retryIds.has(item.id)) throw new Error('Unknown reference seed outcome requires reconciliation before retry.');
    const candidates = state.items.filter((item) => item.status === 'pending'); const quote = await adapter.prepare({ plan: clone(state.plan), items: clone(candidates), projectRoot }); const estimated = finite(quote.totalCost, 'reference seed quote'); if (estimated + state.spent > maxCost) { state.status = 'paused-budget'; await persist(); throw new Error('Reference seed budget is insufficient; no provider request was dispatched.'); }
    const reservations = new Map(candidates.map((item) => [item.id, finite(quote.itemCosts?.[item.id], `quote for ${item.id}`)])); for (const item of candidates) { const output = safeOutput(item); if (await exists(output)) throw new Error('Reference seed output already exists; dispatch refused.'); }
    let cursor = 0; let firstError = null; const worker = async () => { while (!firstError) { const item = candidates[cursor++]; if (!item) return; try { await executeItem(item, reservations.get(item.id)); } catch (error) { firstError ??= error; return; } } }; await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker())); if (firstError) { state.status = 'failed'; await persist(); throw firstError; } state.status = state.items.some((item) => item.status === 'unknown') ? 'needs-reconciliation' : 'needs-review'; await persist(); return clone(state);
  }
  async function approve(itemId, evidence) { const item = state.items.find((entry) => entry.id === itemId); if (!item || item.status !== 'needs-review') throw new Error('Only needs-review seed outputs may be approved.'); const bound = approval(evidence, 'Reference seed output approval'); if (evidence.outputHash !== item.output?.contentHash) throw new Error('Reference seed approval must bind to the immutable output hash.'); item.status = 'approved'; item.approval = { ...bound, outputHash: item.output.contentHash, requestHash: item.requestHash, dependencyHash: item.dependencyHash ?? state.plan.dependencyHash, inputCandidateHashes: state.plan.inputCandidates.map((candidate) => candidate.contentHash) }; await persist(); return clone(item); }
  return { load, run, reconcile, approve, getState: () => clone(state) };
}

export async function promoteApprovedSeedReferences({ state, registry, projectRoot } = {}) {
  assertPlan(state?.plan); if (!registry?.add) throw new Error('A continuity reference registry is required for promotion.'); const root = path.resolve(projectRoot); const promoted = [];
  for (const item of state.items) {
    if (item.status !== 'approved' || !item.output?.contentHash || item.approval?.outputHash !== item.output.contentHash) throw new Error(`Seed output ${item.id} lacks human approval bound to its bytes.`);
    const file = path.resolve(root, item.output.path); await assertPathInsideRoot(root, file, `Promoted seed ${item.id}`); const bytes = await readFile(file); if (hashBytes(bytes) !== item.output.contentHash) throw new Error(`Promoted seed ${item.id} bytes changed.`);
    const reference = registry.add({ id: item.id, kind: item.role, path: path.relative(root, file).replaceAll(path.sep, '/'), contentHash: item.output.contentHash, approved: true, metadata: { width: state.plan.imageSpec.width, height: state.plan.imageSpec.height, license: item.provenance?.license ?? 'provider-output', source: 'reference-seed', provenance: item.provenance } }); promoted.push(reference);
  }
  return promoted;
}

export async function promoteApprovedCandidateReference({ candidate, registry, projectRoot, approval: evidence } = {}) {
  const bound = approval(evidence, 'Candidate reference approval'); if (evidence.contentHash !== candidate.contentHash) throw new Error('Candidate approval must bind to the current contentHash.'); const root = path.resolve(projectRoot); const file = path.resolve(root, candidate.path); await assertPathInsideRoot(root, file, `Candidate ${candidate.id}`); const stat = await lstat(file); if (stat.isSymbolicLink()) throw new Error('Candidate reference cannot be a symlink.'); const bytes = await readFile(file); if (hashBytes(bytes) !== candidate.contentHash) throw new Error(`Candidate bytes do not match contentHash for ${candidate.id}.`); return registry.add({ id: candidate.id, kind: candidate.role, path: candidate.path, contentHash: candidate.contentHash, approved: true, metadata: { width: candidate.width, height: candidate.height, license: candidate.license, approval: bound, source: 'approved-candidate' } });
}
