import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

export const PRODUCTION_STAGES = ['research', 'script', 'continuity', 'storyboard', 'references', 'images', 'audio', 'captions', 'rendering', 'QA'];
export const PRODUCTION_STATUSES = ['draft', 'waiting-for-human', 'queued', 'running', 'generated', 'downloaded', 'reviewed', 'approved', 'rejected', 'failed', 'skipped', 'stale', 'needs-reconciliation'];
export const LEGACY_PRODUCTION_STATUSES = ['pending', 'complete', 'invalidated', 'failed', 'blocked', 'running', 'skipped'];
const LEGACY_STATUSES = LEGACY_PRODUCTION_STATUSES;
const SECRET_KEY = /(?:secret|token|password|passwd|api[-_]?key|authorization|cookie|credential|private[-_]?key|access[-_]?key|refresh[-_]?token)/i;
const SECRET_VALUE = /(?:bearer\s+|basic\s+|(?:ghp|github_pat|sk|AIza|ya29)[-_][A-Za-z0-9._~-]+|AKIA[0-9A-Z]{16}|(?:api[-_]?key|secret|token)\s*[:=]\s*|-----BEGIN [A-Z ]+ KEY-----)[^\s]*/gi;
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

function legacyStatus(entry) {
  const { status } = entry;
  if (['draft', 'queued', 'running'].includes(status)) return 'pending';
  if (status === 'waiting-for-human') return entry.legacyStatus === 'blocked' ? 'blocked' : 'pending';
  if (['generated', 'downloaded', 'reviewed'].includes(status)) return 'complete';
  if (status === 'approved') return validApprovalBinding(entry.approvalBinding, entry.dependencyHash) ? 'complete' : 'invalidated';
  if (['rejected', 'stale', 'needs-reconciliation'].includes(status)) return 'invalidated';
  if (['failed', 'skipped'].includes(status)) return status;
  return 'invalidated';
}

function legacyStagesFromCanonical(stages) {
  return Object.fromEntries(PRODUCTION_STAGES.map((stage) => [stage, { ...stages[stage], status: legacyStatus(stages[stage]) }]));
}

function validTimestamp(value) { return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value)); }

function validApprovalBinding(binding, dependencyHash) {
  return Boolean(binding && typeof binding === 'object' && !Array.isArray(binding)
    && typeof binding.approvalId === 'string' && binding.approvalId.trim()
    && (typeof binding.actor === 'string' && binding.actor.trim() || typeof binding.source === 'string' && binding.source.trim())
    && validTimestamp(binding.approvedAt)
    && typeof binding.dependencyHash === 'string' && binding.dependencyHash.trim() && binding.dependencyHash === dependencyHash);
}

function assertApprovalProof(hash, binding) {
  if (typeof hash !== 'string' || !hash.trim()) throw new Error('Approved production records require an exact dependencyHash.');
  if (!validApprovalBinding(binding, hash)) throw new Error('Approved production records require matching approvalBinding.dependencyHash, approvalId, actor/source, and approvedAt.');
}

function assertProjectionCompatibility(canonical, legacy) {
  for (const stage of PRODUCTION_STAGES) {
    const left = canonical[stage] ?? {}; const right = legacy[stage] ?? {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    keys.delete('status'); keys.delete('legacyStatus');
    if (right.status !== legacyStatus(left)) throw new Error(`Invalid durable-v1 migration boundary: legacy/canonical status conflict at ${stage}; both projections are owned together and must be updated together.`);
    for (const key of keys) {
      if (!(key in left) || !(key in right)) throw new Error(`Invalid durable-v1 migration boundary: legacy/canonical projection conflict at ${stage}.${key}; both projections are owned together and must be updated together.`);
      if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) throw new Error(`Invalid durable-v1 migration boundary: legacy/canonical projection conflict at ${stage}.${key}; both projections are owned together and must be updated together.`);
    }
  }
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
  if (isDurable && (!hasCanonical || !hasLegacy)) throw new Error('Invalid durable-v1 migration boundary: canonical stages and legacy completedStages are owned together; migrate an old file without stateFormat before upgrading.');
  if (hasCanonical && hasLegacy && !isDurable) throw new Error('Invalid production state: conflicting canonical and legacy stage data; refusing silent migration.');
  if (hasCanonical && hasLegacy) assertProjectionCompatibility(raw.stages, raw.completedStages);
  const source = hasCanonical ? raw.stages : raw.completedStages;
  const stages = Object.fromEntries(PRODUCTION_STAGES.map((stage) => [stage, normalizeStageEntry(source[stage] ?? {}, { legacy: !hasCanonical })]));
  for (const stage of PRODUCTION_STAGES) if (stages[stage].status === 'approved' && (!stages[stage].dependencyHash || !validApprovalBinding(stages[stage].approvalBinding, stages[stage].dependencyHash))) stages[stage] = { ...stages[stage], status: 'needs-reconciliation', approvalStatus: 'approved', invalidatedReason: 'approval-binding-missing' };
  const attempts = raw.attempts === undefined ? [] : raw.attempts;
  if (!Array.isArray(attempts)) throw new Error('Invalid production state: attempts must be an array.');
  const safeAttempts = attempts.map((attempt) => {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) throw new Error('Invalid production state: each attempt must be an object.');
    const safe = sanitize(attempt);
    assertStage(safe.stage);
    assertStatus(safe.status);
    if (safe.status === 'approved' && (!safe.dependencyHash || !validApprovalBinding(safe.approvalBinding, safe.dependencyHash))) safe.status = 'needs-reconciliation';
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
  if (['failed', 'stale', 'approved', 'reviewed', 'rejected', 'waiting-for-human', 'needs-reconciliation'].includes(next.stages[state.stage].status)) throw new Error(`Cannot advance production stage ${state.stage} while it requires retry, human approval, or reconciliation.`);
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
  if (status === 'approved') assertApprovalProof(hash, approvalBinding);
  const sanitizedMaterial = sanitize({ stage, idempotencyKey: normalizedKey, status, dependencyHash: hash, artifact, error, shotId, receiptReadback, assetReadback, approvalBinding, metadata });
  const replayFingerprint = dependencyHash(sanitizedMaterial);
  const existing = next.attempts.find((attempt) => attempt.stage === stage && attempt.idempotencyKey === normalizedKey);
  if (existing) {
    if (existing.replayFingerprint !== replayFingerprint) throw new Error('Idempotency key replay does not match the original attempt.');
    return next;
  }
  if (status === 'approved' && ['approved', 'stale', 'needs-reconciliation'].includes(next.stages[stage].status)) throw new Error(`Cannot record approved attempt for ${next.stages[stage].status} stage ${stage}; use explicit invalidation and re-approval.`);
  if (['approved', 'reviewed'].includes(next.stages[stage].status) && status !== next.stages[stage].status) throw new Error(`Cannot overwrite ${next.stages[stage].status} stage ${stage} without explicit invalidation or re-approval.`);
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

export function reapproveProductionStage(state, stage, { approvalId, dependencyHash: hash, actor, source } = {}) {
  assertStage(stage); if (typeof approvalId !== 'string' || !approvalId.trim()) throw new Error('Human re-approval requires a non-empty approvalId.');
  if (typeof hash !== 'string' || !hash.trim()) throw new Error('Human re-approval requires a non-empty dependencyHash.');
  if (typeof actor !== 'string' || !actor.trim()) throw new Error('Human re-approval requires a non-empty actor.');
  const next = normalizeState(clone(state)); if (next.stages[stage].status !== 'needs-reconciliation') throw new Error(`Stage ${stage} does not require reconciliation.`);
  if (next.stages[stage].dependencyBinding?.currentHash !== hash) throw new Error(`Human re-approval dependencyHash must match the currentHash that triggered reconciliation.`);
  const binding = { approvalId, dependencyHash: hash, ...(source ? { source } : {}), actor, approvedAt: now() };
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
