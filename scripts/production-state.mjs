import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

export const PRODUCTION_STAGES = ['research', 'script', 'continuity', 'storyboard', 'references', 'images', 'audio', 'captions', 'rendering', 'QA'];
export const PRODUCTION_STATUSES = ['draft', 'waiting-for-human', 'queued', 'running', 'generated', 'downloaded', 'reviewed', 'approved', 'rejected', 'failed', 'skipped', 'stale', 'needs-reconciliation'];
const LEGACY_STATUSES = ['pending', 'complete', 'invalidated', 'failed', 'blocked', 'running', 'skipped'];
const SECRET_KEY = /(?:secret|token|password|passwd|api[-_]?key|authorization|cookie|credential|private[-_]?key|access[-_]?key|refresh[-_]?token)/i;
const SECRET_VALUE = /(?:bearer\s+|basic\s+|(?:sk|AIza|ya29)[-_][A-Za-z0-9._~-]+|(?:api[-_]?key|secret|token)\s*[:=]\s*|-----BEGIN [A-Z ]+ KEY-----)[^\s]*/gi;
const LEGACY_TO_CANONICAL = { pending: 'draft', complete: 'generated', invalidated: 'needs-reconciliation', failed: 'failed', blocked: 'waiting-for-human', running: 'running', skipped: 'skipped' };

function assertStage(stage) { if (!PRODUCTION_STAGES.includes(stage)) throw new Error(`Unknown production stage: ${stage}`); }
function assertStatus(status) { if (!PRODUCTION_STATUSES.includes(status)) throw new Error(`Unknown production status: ${status}`); }
function now() { return new Date().toISOString(); }
function clone(value) { return structuredClone(value); }

function sanitizeString(value, key) {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  return value.replace(SECRET_VALUE, '[REDACTED]');
}

function sanitize(value, key = '') {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return sanitizeString(value, key);
  if (Array.isArray(value)) return value.map((item) => sanitize(item)).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, sanitize(item, name)]));
}

export function dependencyHash(value) {
  const canonical = JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
    : item);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function normalizeIdempotencyKey(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('idempotencyKey must be a non-empty string.');
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function legacyStatus(status) {
  return ['draft', 'waiting-for-human', 'queued', 'running'].includes(status) ? 'pending' : 'complete';
}

function legacyStagesFromCanonical(stages) {
  return Object.fromEntries(PRODUCTION_STAGES.map((stage) => [stage, { ...stages[stage], status: legacyStatus(stages[stage].status) }]));
}

function normalizeStageEntry(entry, { legacy = false } = {}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid production state: each stage entry must be an object.');
  const safe = sanitize(entry);
  const status = safe.status ?? (legacy ? 'pending' : 'draft');
  if (legacy) {
    if (!LEGACY_STATUSES.includes(status)) throw new Error(`Invalid legacy production status: ${status}`);
    return { ...safe, ...(status === 'blocked' ? { legacyStatus: 'blocked' } : {}), status: LEGACY_TO_CANONICAL[status] };
  }
  assertStatus(status);
  return { ...safe, status };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid production state: expected an object.');
  if (raw.schemaVersion !== 1) throw new Error('Invalid production state: schemaVersion must be 1.');
  if (typeof raw.episodeId !== 'string' || !raw.episodeId.trim()) throw new Error('Invalid production state: episodeId must be a non-empty string.');
  assertStage(raw.stage);
  const isDurable = raw.stateFormat === 'durable-v1';
  const hasCanonical = raw.stages !== undefined;
  const hasLegacy = raw.completedStages !== undefined;
  if (!hasCanonical && !hasLegacy) throw new Error('Invalid production state: stages or completedStages is required.');
  if (hasCanonical && (!raw.stages || typeof raw.stages !== 'object' || Array.isArray(raw.stages))) throw new Error('Invalid production state: stages must be an object.');
  if (hasLegacy && (!raw.completedStages || typeof raw.completedStages !== 'object' || Array.isArray(raw.completedStages))) throw new Error('Invalid production state: completedStages must be an object.');
  if (hasCanonical && hasLegacy && !isDurable) throw new Error('Invalid production state: conflicting canonical and legacy stage data; refusing silent migration.');
  const source = hasCanonical ? raw.stages : raw.completedStages;
  const stages = Object.fromEntries(PRODUCTION_STAGES.map((stage) => [stage, normalizeStageEntry(source[stage] ?? {}, { legacy: !hasCanonical })]));
  const attempts = raw.attempts === undefined ? [] : raw.attempts;
  if (!Array.isArray(attempts)) throw new Error('Invalid production state: attempts must be an array.');
  const safeAttempts = attempts.map((attempt) => {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) throw new Error('Invalid production state: each attempt must be an object.');
    const safe = sanitize(attempt);
    assertStage(safe.stage);
    assertStatus(safe.status);
    if (typeof safe.idempotencyKey !== 'string') throw new Error('Invalid production state: attempt idempotencyKey is required.');
    return { ...safe, idempotencyKey: normalizeIdempotencyKey(safe.idempotencyKey) };
  });
  const base = sanitize(raw);
  const completedStages = hasLegacy && !isDurable ? Object.fromEntries(PRODUCTION_STAGES.map((stage) => [stage, sanitize(raw.completedStages[stage] ?? { status: 'pending' })])) : legacyStagesFromCanonical(stages);
  return {
    ...base, stateFormat: 'durable-v1', schemaVersion: 1, episodeId: raw.episodeId.trim(), stages,
    completedStages, pendingStages: PRODUCTION_STAGES.slice(PRODUCTION_STAGES.indexOf(raw.stage) + 1),
    attempts: safeAttempts, artifacts: raw.artifacts === undefined ? [] : sanitize(raw.artifacts), errors: raw.errors === undefined ? [] : sanitize(raw.errors),
  };
}

export function createProductionState(episodeId) {
  if (typeof episodeId !== 'string' || !episodeId.trim()) throw new Error('episodeId must be a non-empty string.');
  const stages = Object.fromEntries(PRODUCTION_STAGES.map((stage) => [stage, { status: 'draft' }]));
  return { schemaVersion: 1, stateFormat: 'durable-v1', episodeId: episodeId.trim(), stage: PRODUCTION_STAGES[0], stages, completedStages: legacyStagesFromCanonical(stages), pendingStages: PRODUCTION_STAGES.slice(1), attempts: [], artifacts: [], errors: [], actions: [], approvalBindings: {}, retryRequests: [], updatedAt: now() };
}

export function transitionProductionState(state, nextStage, { artifact, note } = {}) {
  assertStage(nextStage);
  const currentIndex = PRODUCTION_STAGES.indexOf(state.stage); const nextIndex = PRODUCTION_STAGES.indexOf(nextStage);
  if (nextIndex !== currentIndex + 1) throw new Error(`Cannot advance production stage from ${state.stage} to ${nextStage}; transitions must move forward exactly one step.`);
  const next = normalizeState(clone(state));
  next.stages[state.stage] = { ...next.stages[state.stage], status: 'generated', completedAt: now(), ...(note ? { note } : {}) };
  next.completedStages = legacyStagesFromCanonical(next.stages); next.stage = nextStage;
  next.pendingStages = PRODUCTION_STAGES.slice(nextIndex + 1);
  if (artifact) next.artifacts.push({ path: artifact, stage: nextStage, recordedAt: now() });
  next.updatedAt = now(); return next;
}

export function recordProductionAttempt(state, stage, options = {}) {
  assertStage(stage); const { idempotencyKey, status: requestedStatus = 'queued', dependencyHash: hash, artifact, error, shotId, receiptReadback, assetReadback, approvalBinding, ...metadata } = options;
  const status = requestedStatus === 'blocked' ? 'waiting-for-human' : requestedStatus;
  assertStatus(status); const normalizedKey = normalizeIdempotencyKey(idempotencyKey); const next = normalizeState(clone(state));
  const replayFingerprint = dependencyHash({ stage, idempotencyKey: normalizedKey, status, hash, artifact, shotId, approvalBinding });
  const existing = next.attempts.find((attempt) => attempt.stage === stage && attempt.idempotencyKey === normalizedKey);
  if (existing) {
    if (existing.replayFingerprint !== replayFingerprint) throw new Error('Idempotency key replay does not match the original attempt.');
    return next;
  }
  next.attempts.push(sanitize({ idempotencyKey: normalizedKey, replayFingerprint, stage, status, dependencyHash: hash, artifact, error, shotId, receiptReadback, assetReadback, approvalBinding, ...metadata, recordedAt: now() }));
  next.stages[stage] = { ...next.stages[stage], ...(requestedStatus === 'blocked' ? { legacyStatus: 'blocked' } : {}), status, ...(hash ? { dependencyHash: hash } : {}), ...(approvalBinding ? { approvalBinding } : {}), ...(error ? { error: String(error) } : {}), updatedAt: now() };
  if (approvalBinding) next.approvalBindings = { ...next.approvalBindings, [stage]: approvalBinding };
  if (artifact && !next.artifacts.some((item) => item.path === artifact && item.stage === stage)) next.artifacts.push({ path: artifact, stage, recordedAt: now() });
  if (error) next.errors.push({ stage, message: String(error), recordedAt: now() });
  next.completedStages = legacyStagesFromCanonical(next.stages); next.updatedAt = now(); return next;
}

export function reconcileProductionState(state, dependencies = {}) {
  const next = normalizeState(clone(state));
  for (const [stage, currentHash] of Object.entries(dependencies)) {
    assertStage(stage); const stageIndex = PRODUCTION_STAGES.indexOf(stage);
    if (!currentHash || next.stages[stage].dependencyHash === undefined || next.stages[stage].dependencyHash === currentHash) continue;
    for (const affectedStage of PRODUCTION_STAGES.slice(stageIndex)) {
      const previous = next.stages[affectedStage];
      if (!['generated', 'downloaded', 'reviewed', 'approved'].includes(previous.status)) continue;
      const nextStatus = previous.status === 'approved' ? 'needs-reconciliation' : 'stale';
      next.stages[affectedStage] = { ...previous, status: nextStatus, invalidatedReason: 'dependency-hash-changed', dependencyBinding: { previousHash: previous.dependencyHash, currentHash }, invalidatedAt: now() };
      for (const attempt of next.attempts) if (attempt.stage === affectedStage && ['generated', 'downloaded', 'reviewed', 'approved'].includes(attempt.status)) {
        attempt.status = nextStatus;
        attempt.dependencyBinding = { previousHash: previous.dependencyHash, currentHash };
      }
      if (previous.status === 'approved') next.actions.push({ type: 'human-reapproval-required', stage: affectedStage, dependency: { previousHash: previous.dependencyHash, currentHash }, approval: next.approvalBindings?.[affectedStage] ?? previous.approvalBinding, recordedAt: now() });
    }
  }
  next.completedStages = legacyStagesFromCanonical(next.stages); next.updatedAt = now(); return next;
}

export function reapproveProductionStage(state, stage, { approvalId, dependencyHash: hash, actor = 'human' } = {}) {
  assertStage(stage); if (!approvalId || !hash) throw new Error('Human re-approval requires approvalId and dependencyHash.');
  const next = normalizeState(clone(state)); if (next.stages[stage].status !== 'needs-reconciliation') throw new Error(`Stage ${stage} does not require reconciliation.`);
  const binding = { approvalId, dependencyHash: hash, actor, approvedAt: now() };
  next.stages[stage] = { ...next.stages[stage], status: 'approved', dependencyHash: hash, approvalBinding: binding };
  next.approvalBindings = { ...next.approvalBindings, [stage]: binding }; next.actions.push({ type: 'human-reapproved', stage, approval: binding });
  next.completedStages = legacyStagesFromCanonical(next.stages); next.updatedAt = now(); return next;
}

export function requestSafeShotRetry(state, { shotId, consented, receiptReadback, assetReadback } = {}) {
  if (typeof shotId !== 'string' || !shotId.trim()) throw new Error('shotId must be a non-empty string.');
  const shot = state.shots?.[shotId]; if (!shot || !['failed', 'needs-reconciliation'].includes(shot.status)) throw new Error('Only failed or needs-reconciliation shots may be retried.');
  if (consented !== true) throw new Error('Explicit retry consent is required.');
  if (!receiptReadback || !assetReadback || typeof receiptReadback.status !== 'string' || typeof assetReadback.status !== 'string') throw new Error('Retry requires receipt and asset read-back metadata.');
  const next = normalizeState(clone(state)); next.retryRequests ??= [];
  if (!next.retryRequests.some((request) => request.shotId === shotId)) next.retryRequests.push(sanitize({ shotId, status: 'queued', consented: true, receiptReadback, assetReadback, requestedAt: now() }));
  return next;
}

async function writeAtomic(target, state, { backup = true } = {}) {
  await mkdir(path.dirname(target), { recursive: true }); const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(sanitize(state), null, 2)}\n`, { flag: 'wx' });
    if (backup) { try { await copyFile(target, `${target}.bak`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}

export async function saveProductionState(file, state) { const target = path.resolve(file); await writeAtomic(target, normalizeState(state)); return target; }

export async function loadProductionState(file, { recover = true } = {}) {
  const target = path.resolve(file); const candidates = [target];
  if (recover) {
    candidates.push(`${target}.bak`);
    try { candidates.push(...(await readdir(path.dirname(target))).filter((name) => name.startsWith(`${path.basename(target)}.tmp-`)).sort().map((name) => path.join(path.dirname(target), name))); } catch { /* primary read reports the useful error */ }
  }
  const failures = [];
  for (const candidate of candidates) {
    try {
      const value = normalizeState(JSON.parse(await readFile(candidate, 'utf8')));
      if (candidate !== target) { value.recoveredFrom = candidate.endsWith('.bak') ? 'backup' : 'temporary'; await writeAtomic(target, value, { backup: false }); }
      return value;
    } catch (error) { failures.push({ candidate, error }); }
  }
  const primary = failures.find((failure) => failure.candidate === target)?.error;
  const detail = failures.map(({ candidate, error }) => `${path.basename(candidate)}: ${error.message}`).join('; ');
  throw new Error(`Unable to recover production state. Primary error: ${primary?.message ?? 'unavailable'}. Candidates: ${detail}`, { cause: primary });
}
