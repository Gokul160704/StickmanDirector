import { copyFile, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

export const PRODUCTION_STAGES = ['research', 'script', 'continuity', 'storyboard', 'references', 'images', 'audio', 'captions', 'rendering', 'QA'];
export const PRODUCTION_STATUSES = ['pending', 'running', 'complete', 'failed', 'blocked', 'invalidated', 'skipped'];
const SECRET_KEY = /(?:secret|token|password|passwd|api[-_]?key|authorization|cookie|credential|private[-_]?key|access[-_]?key|refresh[-_]?token)/i;

function assertStage(stage) { if (!PRODUCTION_STAGES.includes(stage)) throw new Error(`Unknown production stage: ${stage}`); }
function assertStatus(status) { if (!PRODUCTION_STATUSES.includes(status)) throw new Error(`Unknown production status: ${status}`); }
function now() { return new Date().toISOString(); }

function cleanValue(value, key = '') {
  if (SECRET_KEY.test(key)) return undefined;
  if (Array.isArray(value)) return value.map((item) => cleanValue(item)).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, cleanValue(item, name)]).filter(([, item]) => item !== undefined));
}

export function dependencyHash(value) {
  const canonical = JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
    : item);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function createProductionState(episodeId) {
  if (typeof episodeId !== 'string' || !episodeId.trim()) throw new Error('episodeId must be a non-empty string.');
  const stages = Object.fromEntries(PRODUCTION_STAGES.map((stage) => [stage, { status: 'pending' }]));
  return { schemaVersion: 1, episodeId: episodeId.trim(), stage: PRODUCTION_STAGES[0], stages, completedStages: stages, pendingStages: PRODUCTION_STAGES.slice(1), attempts: [], artifacts: [], errors: [], updatedAt: now() };
}

function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid production state: expected an object.');
  if (raw.schemaVersion !== 1) throw new Error('Invalid production state: schemaVersion must be 1.');
  if (typeof raw.episodeId !== 'string' || !raw.episodeId.trim()) throw new Error('Invalid production state: episodeId must be a non-empty string.');
  assertStage(raw.stage);
  const sourceStages = raw.stages ?? raw.completedStages;
  if (!sourceStages || typeof sourceStages !== 'object' || Array.isArray(sourceStages)) throw new Error('Invalid production state: stages must be an object.');
  const stages = Object.fromEntries(PRODUCTION_STAGES.map((stage) => {
    const entry = cleanValue(sourceStages[stage] ?? { status: 'pending' });
    assertStatus(entry.status ?? 'pending');
    return [stage, { ...entry, status: entry.status ?? 'pending' }];
  }));
  const attempts = Array.isArray(raw.attempts) ? raw.attempts.map((attempt) => {
    const safeAttempt = cleanValue(attempt);
    assertStatus(safeAttempt.status ?? 'pending');
    return { ...safeAttempt, status: safeAttempt.status ?? 'pending' };
  }) : [];
  return { ...cleanValue(raw), schemaVersion: 1, episodeId: raw.episodeId.trim(), stages, completedStages: stages, pendingStages: PRODUCTION_STAGES.filter((stage) => stages[stage].status !== 'complete'), attempts, artifacts: Array.isArray(raw.artifacts) ? cleanValue(raw.artifacts) : [], errors: Array.isArray(raw.errors) ? cleanValue(raw.errors) : [] };
}

export function transitionProductionState(state, nextStage, { artifact, note } = {}) {
  assertStage(nextStage);
  const currentIndex = PRODUCTION_STAGES.indexOf(state.stage);
  const nextIndex = PRODUCTION_STAGES.indexOf(nextStage);
  if (nextIndex !== currentIndex + 1) throw new Error(`Cannot advance production stage from ${state.stage} to ${nextStage}; transitions must move forward exactly one step.`);
  const next = normalizeState(structuredClone(state));
  next.stages[state.stage] = { status: 'complete', completedAt: now(), ...(note ? { note } : {}) };
  next.stage = nextStage;
  next.pendingStages = PRODUCTION_STAGES.slice(nextIndex + 1);
  if (artifact) next.artifacts.push({ path: artifact, stage: nextStage, recordedAt: now() });
  next.updatedAt = now();
  return next;
}

export function recordProductionAttempt(state, stage, { idempotencyKey, status = 'running', dependencyHash: hash, artifact, error } = {}) {
  assertStage(stage); assertStatus(status);
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw new Error('idempotencyKey must be a non-empty string.');
  const next = normalizeState(structuredClone(state));
  if (next.attempts.some((attempt) => attempt.stage === stage && attempt.idempotencyKey === idempotencyKey)) return next;
  next.attempts.push(cleanValue({ idempotencyKey: idempotencyKey.trim(), stage, status, dependencyHash: hash, artifact, error, recordedAt: now() }));
  next.stages[stage] = { ...next.stages[stage], status, ...(hash ? { dependencyHash: hash } : {}), ...(error ? { error: String(error) } : {}), updatedAt: now() };
  if (artifact && !next.artifacts.some((item) => item.path === artifact && item.stage === stage)) next.artifacts.push({ path: artifact, stage, recordedAt: now() });
  if (error) next.errors.push({ stage, message: String(error), recordedAt: now() });
  next.pendingStages = PRODUCTION_STAGES.filter((name) => next.stages[name].status !== 'complete');
  next.updatedAt = now();
  return next;
}

export function reconcileProductionState(state, dependencies = {}) {
  const next = normalizeState(structuredClone(state));
  for (const [stage, currentHash] of Object.entries(dependencies)) {
    assertStage(stage);
    if (!currentHash || next.stages[stage].dependencyHash === undefined || next.stages[stage].dependencyHash === currentHash) continue;
    const firstInvalidated = PRODUCTION_STAGES.indexOf(stage);
    for (const affectedStage of PRODUCTION_STAGES.slice(firstInvalidated)) {
      if (next.stages[affectedStage].status === 'pending') continue;
      next.stages[affectedStage] = { ...next.stages[affectedStage], status: 'invalidated', invalidatedReason: 'dependency-hash-changed', invalidatedAt: now() };
      for (const attempt of next.attempts) if (attempt.stage === affectedStage && attempt.status === 'complete') attempt.status = 'invalidated';
    }
  }
  next.pendingStages = PRODUCTION_STAGES.filter((stage) => next.stages[stage].status !== 'complete');
  next.updatedAt = now();
  return next;
}

async function writeAtomic(target, state, { backup = true } = {}) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(cleanValue(state), null, 2)}\n`, { flag: 'wx' });
    if (backup) { try { await copyFile(target, `${target}.bak`); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}

export async function saveProductionState(file, state) {
  const target = path.resolve(file);
  await writeAtomic(target, normalizeState(state));
  return target;
}

export async function loadProductionState(file, { recover = true } = {}) {
  const target = path.resolve(file); const candidates = [target];
  if (recover) {
    candidates.push(`${target}.bak`);
    try { candidates.push(...(await readdir(path.dirname(target))).filter((name) => name.startsWith(`${path.basename(target)}.tmp-`)).map((name) => path.join(path.dirname(target), name))); } catch { /* primary error is reported below */ }
  }
  let lastError;
  for (const candidate of candidates) {
    try {
      const value = normalizeState(JSON.parse(await readFile(candidate, 'utf8')));
      if (candidate !== target) { value.recoveredFrom = candidate.endsWith('.bak') ? 'backup' : 'temporary'; await writeAtomic(target, value, { backup: false }); }
      return value;
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
