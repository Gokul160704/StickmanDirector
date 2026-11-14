import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { assertFrozenReferenceBundle } from './continuity-refs.mjs';
import { assertPathInsideRoot } from './path-safety.mjs';

const TERMINAL = new Set(['succeeded', 'needs-review', 'failed', 'unknown', 'approved']);
const RETRYABLE = new Set(['failed', 'needs-review']);
const SECRET = /(?:token|secret|password|api[-_]?key|authorization|cookie|credential)/i;

function clone(value) { return structuredClone(value); }
function now() { return new Date().toISOString(); }
function safeNumber(value, name, min = 0) { if (!Number.isFinite(value) || value < min) throw new Error(`${name} must be a finite number >= ${min}.`); return value; }
function sanitize(value, key = '') {
  if (SECRET.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return value.replace(/(?:bearer\s+|sk-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]+)/gi, '[REDACTED]');
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
async function readCheckpoint(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function validateReferenceBinding(bundle, expected) {
  assertFrozenReferenceBundle(bundle);
  if (bundle.bundleHash !== expected) throw new Error('Batch reference bundle is stale or changed; rebind requires explicit approval.');
}
function safeOutputPath(root, output) {
  if (!output || typeof output.path !== 'string' || !output.path.trim()) throw new Error('Provider output path is required.');
  const resolvedRoot = path.resolve(root); const resolved = path.resolve(root, output.path);
  const relative = path.relative(resolvedRoot, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Provider output path escapes the batch output root.');
  return resolved;
}
function bytesHash(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function contentHash(output) {
  if (output.bytes !== undefined) {
    const actual = bytesHash(output.bytes);
    if (output.contentHash !== undefined && output.contentHash !== actual) throw new Error('Provider output contentHash does not match returned bytes.');
    return actual;
  }
  if (typeof output.contentHash === 'string' && /^sha256:[a-f0-9]{64}$/.test(output.contentHash)) return output.contentHash;
  throw new Error('Provider output requires bytes or a verified SHA-256 contentHash.');
}

export function createBatchRunner({ plan, referenceBundle, referenceRegistry, adapter, checkpointPath, outputRoot, concurrency = 2, budget = {} } = {}) {
  if (!plan?.items?.length) throw new Error('A non-empty batch plan is required.');
  if (!adapter || typeof adapter.prepare !== 'function' || typeof adapter.execute !== 'function') throw new Error('A provider adapter with prepare and execute is required.');
  if (!checkpointPath || !outputRoot) throw new Error('checkpointPath and outputRoot are required.');
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('concurrency must be a positive integer.');
  validateReferenceBinding(referenceBundle, plan.referenceBundleHash);
  if (referenceRegistry?.assertCurrent) referenceRegistry.assertCurrent(referenceBundle);
  const maxCost = safeNumber(budget.maxCost ?? 0, 'budget.maxCost');
  const statePath = path.resolve(checkpointPath); const root = path.resolve(outputRoot);
  let state = { version: 1, plan: clone(plan), referenceBundleHash: referenceBundle.bundleHash, spent: 0, reserved: 0, status: 'ready', items: plan.items.map((item) => ({ ...clone(item), status: item.status ?? 'pending', attempts: [] })), updatedAt: now() };
  let writeChain = Promise.resolve();
  async function persist() { state.updatedAt = now(); writeChain = writeChain.then(() => atomicWrite(statePath, state)); return writeChain; }
  async function load() {
    const saved = await readCheckpoint(statePath); if (!saved) return state;
    if (saved.referenceBundleHash !== referenceBundle.bundleHash || saved.plan?.batchId !== plan.batchId) throw new Error('Checkpoint does not match the approved batch or reference bundle.');
    state = saved; return clone(state);
  }
  function eligible(item, retryIds) { return retryIds.size ? retryIds.has(item.id) : item.status === 'pending'; }
  function assertNoUnknown(retryIds) { for (const item of state.items) if (item.status === 'unknown' && retryIds.has(item.id)) throw new Error('Unknown provider outcome requires reconciliation before retry.'); }
  async function reconcile(itemId, result) {
    const item = state.items.find((entry) => entry.id === itemId); if (!item || item.status !== 'unknown') throw new Error('Only unknown outcomes may be reconciled.');
    if (!result || !['present', 'absent', 'unknown'].includes(result.status) || !result.receipt || !result.authorization?.approvalId || !result.authorization?.actor || !Number.isFinite(Date.parse(result.authorization.approvedAt))) throw new Error('Reconciliation requires provider read-back receipt and explicit authorization.');
    const attemptId = item.attempts?.at(-1)?.attemptId; if (result.receipt.itemId !== item.id && result.receipt.requestId !== item.id && result.receipt.attemptId !== attemptId) throw new Error('Reconciliation receipt does not match the unknown attempt.');
    if (result.status === 'unknown') return clone(item);
    const held = safeNumber(item.reservedCost ?? 0, 'reserved unknown cost');
    if (result.status === 'present') { const actualCost = safeNumber(result.actualCost, 'reconciled provider cost'); if (actualCost > held || state.spent + actualCost > maxCost) throw new Error('Reconciled provider cost exceeds the approved budget.'); state.spent += actualCost; item.status = 'needs-review'; item.cost = actualCost; }
    else item.status = 'failed';
    state.reserved = Math.max(0, state.reserved - held); item.reservedCost = 0; item.reconciliation = sanitize(result); await persist(); return clone(item);
  }
  async function run({ retryItemIds = [] } = {}) {
    validateReferenceBinding(referenceBundle, state.referenceBundleHash); if (referenceRegistry?.assertCurrent) referenceRegistry.assertCurrent(referenceBundle); await load(); await mkdir(root, { recursive: true });
    const retryIds = new Set(retryItemIds); assertNoUnknown(retryIds);
    for (const id of retryIds) { const item = state.items.find((entry) => entry.id === id); if (!item) throw new Error(`Unknown batch item ${id}.`); if (!RETRYABLE.has(item.status)) throw new Error(`Only failed or needs-review items may be retried: ${id}.`); item.status = 'pending'; item.retryRequested = true; }
    const candidates = state.items.filter((item) => eligible(item, retryIds));
    const quote = await adapter.prepare({ plan: clone(state.plan), referenceBundle: clone(referenceBundle), items: clone(candidates) });
    const estimated = safeNumber(quote?.totalCost ?? quote?.cost ?? 0, 'provider estimate');
    if (estimated + state.spent > maxCost) { state.status = 'paused-budget'; await persist(); throw new Error('Approved batch budget is insufficient; no provider request was dispatched.'); }
    const itemCosts = quote?.itemCosts ?? {};
    const outputPaths = quote?.outputPaths ?? {};
    const reservations = new Map(candidates.map((item) => {
      const value = itemCosts[item.id] ?? (candidates.length === 1 ? estimated : 0);
      if (estimated > 0 && candidates.length > 1 && itemCosts[item.id] === undefined) throw new Error('Per-item cost quotes are required before concurrent dispatch.');
      return [item.id, safeNumber(value, `quote for ${item.id}`)];
    }));
    if (candidates.reduce((sum, item) => sum + reservations.get(item.id), 0) + state.spent > maxCost) { state.status = 'paused-budget'; await persist(); throw new Error('Per-item batch reservations exceed the approved budget; no provider request was dispatched.'); }
    if (quote?.outputPaths) for (const item of candidates) { const declared = quote.outputPaths[item.id]; if (declared) { const file = safeOutputPath(root, { path: declared }); await assertPathInsideRoot(root, file, 'Declared provider output path'); if (await exists(file)) throw new Error('Declared provider output already exists; dispatch refused.'); } }
    let cursor = 0; let firstError = null;
    const worker = async () => { while (!firstError) { const item = candidates[cursor++]; if (!item) return; try { await executeItem(item, reservations.get(item.id), outputPaths[item.id]); } catch (error) { firstError ??= error; return; } } };
    await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
    if (firstError) { state.status = 'failed'; await persist(); throw firstError; }
    state.status = state.items.every((item) => item.status === 'approved') ? 'approved' : state.items.some((item) => item.status === 'unknown') ? 'needs-reconciliation' : 'needs-review'; await persist(); return clone(state);
  }
  async function executeItem(item, reservation = 0, declaredOutputPath) {
    if (TERMINAL.has(item.status) && item.status !== 'failed' && item.status !== 'needs-review') return;
    const attemptId = `${item.id}:${(item.attempts?.length ?? 0) + 1}`;
    if (state.spent + state.reserved + reservation > maxCost) throw new Error('Approved budget reservation is exhausted; provider dispatch refused.');
    state.reserved += reservation; item.reservedCost = reservation; item.status = 'running'; item.attempts ??= []; item.attempts.push({ attemptId, startedAt: now(), status: 'running', requestHash: item.requestHash }); await persist();
    try {
      const result = await adapter.execute({ item: clone(item), referenceBundle: clone(referenceBundle), attemptId });
      const cost = safeNumber(result?.cost ?? 0, 'provider cost'); if (cost > reservation || state.spent + cost > maxCost) { const error = new Error('Provider result exceeds its reserved approved budget.'); error.unknownOutcome = true; throw error; }
      const output = result.output ? { ...result.output, contentHash: contentHash(result.output) } : null; if (!output) throw new Error('Provider result must include an output.');
      if (output.path) {
        if (!declaredOutputPath || output.path !== declaredOutputPath) throw new Error('Provider output path must be declared and reserved during prepare.');
        const file = safeOutputPath(root, output); await assertPathInsideRoot(root, file, 'Provider output path');
        if (await exists(file)) { const actual = bytesHash(await readFile(file)); if (actual !== output.contentHash) throw new Error('Provider output file bytes do not match its contentHash.'); }
        else if (output.bytes === undefined) throw new Error('Provider output file is missing and no returned bytes are available for verification.');
        try { const stat = await lstat(file); if (stat.isSymbolicLink()) throw new Error('Output path cannot be a symlink.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      item.status = 'needs-review'; item.output = sanitize(output); item.receipt = sanitize(result.receipt ?? null); item.cost = cost; item.provenance = sanitize(result.provenance ?? {}); item.attempts[item.attempts.length - 1] = { ...item.attempts.at(-1), attemptId, status: 'succeeded', finishedAt: now(), cost, receipt: item.receipt }; state.spent += cost; state.reserved = Math.max(0, state.reserved - reservation); item.reservedCost = 0; await persist();
    } catch (error) {
      const unknown = error?.unknownOutcome === true;
      item.status = unknown ? 'unknown' : 'failed'; item.error = String(error.message || error); item.attempts[item.attempts.length - 1] = { ...item.attempts.at(-1), status: item.status, finishedAt: now(), error: item.error }; if (!unknown) { state.reserved = Math.max(0, state.reserved - reservation); item.reservedCost = 0; } await persist(); if (!unknown) throw error;
    }
  }
  return { load, run, reconcile, getState: () => clone(state), async approve(itemId, approval) { const item = state.items.find((entry) => entry.id === itemId); if (!item || item.status !== 'needs-review') throw new Error('Only needs-review items may be approved.'); if (!approval?.approvalId || !approval.actor || !approval.approvedAt) throw new Error('Human approval provenance is required.'); item.status = 'approved'; item.approval = { ...approval, outputHash: item.output?.contentHash, requestHash: item.requestHash, dependencyHash: item.dependencyHash, referenceBundleHash: item.referenceBundleHash }; await persist(); return clone(item); } };
}
