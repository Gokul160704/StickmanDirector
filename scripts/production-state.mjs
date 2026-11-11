import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const PRODUCTION_STAGES = ['research', 'script', 'continuity', 'storyboard', 'references', 'images', 'audio', 'captions', 'rendering', 'QA'];

function assertStage(stage) {
  if (!PRODUCTION_STAGES.includes(stage)) throw new Error(`Unknown production stage: ${stage}`);
}

export function createProductionState(episodeId) {
  if (typeof episodeId !== 'string' || !episodeId.trim()) throw new Error('episodeId must be a non-empty string.');
  const completedStages = Object.fromEntries(PRODUCTION_STAGES.map((stage) => [stage, { status: 'pending' }]));
  return { schemaVersion: 1, episodeId: episodeId.trim(), stage: PRODUCTION_STAGES[0], completedStages, pendingStages: PRODUCTION_STAGES.slice(1), artifacts: [], errors: [], updatedAt: new Date().toISOString() };
}

export function transitionProductionState(state, nextStage, { artifact, note } = {}) {
  assertStage(nextStage);
  const currentIndex = PRODUCTION_STAGES.indexOf(state.stage);
  const nextIndex = PRODUCTION_STAGES.indexOf(nextStage);
  if (nextIndex > currentIndex + 1) throw new Error(`Cannot advance production from ${state.stage} to ${nextStage}; complete intervening stages first.`);
  const next = structuredClone(state);
  next.completedStages[state.stage] = { status: 'complete', completedAt: new Date().toISOString(), ...(note ? { note } : {}) };
  next.stage = nextStage;
  next.pendingStages = PRODUCTION_STAGES.slice(nextIndex + 1);
  if (artifact) next.artifacts.push({ path: artifact, stage: nextStage, recordedAt: new Date().toISOString() });
  next.updatedAt = new Date().toISOString();
  return next;
}

export async function saveProductionState(file, state) {
  const target = path.resolve(file);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
  return target;
}

export async function loadProductionState(file) {
  return JSON.parse(await readFile(path.resolve(file), 'utf8'));
}
