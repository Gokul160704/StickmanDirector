import { hashContract } from './stage-contracts.mjs';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const KINDS = new Set(['character', 'prop', 'environment', 'style']);
const FROZEN_BUNDLE = Symbol('stickman.frozen-continuity-bundle');
function string(value, name) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`); return value.trim(); }
function safePath(value) { const path = string(value, 'reference path').replaceAll('\\', '/'); if (path.startsWith('/') || /^[A-Za-z]:\//.test(path) || path.split('/').includes('..')) throw new Error('Reference path must stay within the project and cannot traverse directories.'); return path; }
function validHash(value) { return /^sha256:[a-f0-9]{64}$/.test(string(value, 'contentHash')); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function canonicalBundle(bundle) { return { version: 1, seriesId: bundle.seriesId, bibleRevisionHash: bundle.bibleRevisionHash, references: bundle.references }; }

export function createContinuityReferenceRegistry({ rootDir: configuredRootDir, seriesId, bibleRevisionHash } = {}) {
  seriesId = string(seriesId, 'seriesId'); if (!validHash(bibleRevisionHash)) throw new Error('bibleRevisionHash must be an exact lowercase SHA-256.');
  bibleRevisionHash = string(bibleRevisionHash, 'bibleRevisionHash');
  const rootDir = configuredRootDir ? realpathSync(path.resolve(configuredRootDir)) : null;
  const refs = new Map();
  function verifyFile(reference) {
    if (!rootDir) return;
    const candidate = path.resolve(rootDir, reference.path);
    const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
    if (candidate !== rootDir && !candidate.startsWith(rootPrefix)) throw new Error('Reference path escapes the project root.');
    const stat = lstatSync(candidate, { throwIfNoEntry: false });
    if (!stat) throw new Error(`Reference file does not exist: ${reference.path}.`);
    if (stat.isSymbolicLink()) throw new Error('Reference path cannot be a symlink.');
    const real = realpathSync(candidate);
    if (real !== candidate) throw new Error('Reference path resolves outside its declared file.');
    const actualHash = `sha256:${createHash('sha256').update(readFileSync(candidate)).digest('hex')}`;
    if (actualHash !== reference.contentHash) throw new Error(`Reference file bytes do not match contentHash for ${reference.id}.`);
  }
  function normalize(reference) {
    const normalized = { id: string(reference?.id, 'reference id'), kind: string(reference?.kind, 'reference kind'), path: safePath(reference?.path), contentHash: string(reference?.contentHash, 'contentHash'), approved: reference?.approved === true, metadata: structuredClone(reference?.metadata ?? {}) };
    if (!KINDS.has(normalized.kind)) throw new Error(`Unsupported reference kind ${normalized.kind}.`);
    if (!validHash(normalized.contentHash)) throw new Error('Reference contentHash must be an exact lowercase SHA-256.');
    if (!normalized.approved) throw new Error('Only approved references may enter a continuity bundle.');
    verifyFile(normalized);
    normalized.integrity = { verified: Boolean(rootDir) };
    return normalized;
  }
  return {
    seriesId, bibleRevisionHash,
    add(reference) { const normalized = normalize(reference); if (refs.has(normalized.id)) throw new Error(`Reference ${normalized.id} already exists.`); refs.set(normalized.id, normalized); return structuredClone(normalized); },
    replace(reference) { const normalized = normalize(reference); if (!refs.has(normalized.id)) throw new Error(`Unknown reference ${normalized.id}.`); refs.set(normalized.id, normalized); return structuredClone(normalized); },
    get(id) { const value = refs.get(id); if (!value) throw new Error(`Unknown reference ${id}.`); verifyFile(value); return structuredClone(value); },
    snapshot() { return [...refs.values()].map(structuredClone); },
    assertCurrent(bundle) { if (bundle?.version !== 1 || !Array.isArray(bundle.references)) throw new Error('Continuity reference bundle is malformed.'); const current = bundle.references.map((reference) => { const stored = this.get(reference.id); verifyFile(stored); return stored; }); const expected = hashContract(canonicalBundle({ ...bundle, seriesId, bibleRevisionHash, references: current })); if (expected !== bundle.bundleHash) throw new Error('Continuity reference bundle is stale or changed.'); return true; },
  };
}

export function freezeReferenceBundle(registry, referenceIds = []) {
  if (!registry?.snapshot) throw new Error('A continuity reference registry is required.');
  if (!Array.isArray(referenceIds) || new Set(referenceIds).size !== referenceIds.length) throw new Error('Continuity reference bundle cannot contain duplicate IDs.');
  const references = referenceIds.map((id) => registry.get(id));
  const kinds = new Set(references.map((reference) => reference.kind));
  for (const requiredKind of KINDS) if (!kinds.has(requiredKind)) throw new Error(`Continuity bundle requires ${requiredKind} reference.`);
  const base = { version: 1, seriesId: registry.seriesId, bibleRevisionHash: registry.bibleRevisionHash, references };
  const frozen = { ...structuredClone(base), bundleHash: hashContract(base) };
  Object.defineProperty(frozen, FROZEN_BUNDLE, { value: true, enumerable: false });
  return deepFreeze(frozen);
}

export function assertFrozenReferenceBundle(bundle) {
  if (bundle?.[FROZEN_BUNDLE] !== true) throw new Error('Batch continuity bundle must be an authentic frozen reference bundle.');
  if (bundle.version !== 1 || !Array.isArray(bundle.references)) throw new Error('Batch continuity bundle is malformed.');
  if (hashContract(canonicalBundle(bundle)) !== bundle.bundleHash) throw new Error('Batch continuity bundle hash or integrity is invalid.');
  return true;
}
