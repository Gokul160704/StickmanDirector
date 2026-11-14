import { hashContract } from './stage-contracts.mjs';

const KINDS = new Set(['character', 'prop', 'environment', 'style']);
function string(value, name) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be a non-empty string.`); return value.trim(); }
function safePath(value) { const path = string(value, 'reference path').replaceAll('\\', '/'); if (path.startsWith('/') || /^[A-Za-z]:\//.test(path) || path.split('/').includes('..')) throw new Error('Reference path must stay within the project and cannot traverse directories.'); return path; }
function validHash(value) { return /^sha256:[a-f0-9]{4,128}$/i.test(string(value, 'contentHash')); }

export function createContinuityReferenceRegistry({ seriesId, bibleRevisionHash } = {}) {
  seriesId = string(seriesId, 'seriesId'); bibleRevisionHash = string(bibleRevisionHash, 'bibleRevisionHash');
  const refs = new Map();
  return {
    seriesId, bibleRevisionHash,
    add(reference) { const normalized = { id: string(reference?.id, 'reference id'), kind: string(reference?.kind, 'reference kind'), path: safePath(reference?.path), contentHash: string(reference?.contentHash, 'contentHash'), approved: reference?.approved === true, metadata: structuredClone(reference?.metadata ?? {}) }; if (!KINDS.has(normalized.kind)) throw new Error(`Unsupported reference kind ${normalized.kind}.`); if (!validHash(normalized.contentHash)) throw new Error('Reference contentHash must be sha256-prefixed.'); if (!normalized.approved) throw new Error('Only approved references may enter a continuity bundle.'); if (refs.has(normalized.id)) throw new Error(`Reference ${normalized.id} already exists.`); refs.set(normalized.id, normalized); return structuredClone(normalized); },
    replace(reference) { refs.delete(string(reference?.id, 'reference id')); return this.add(reference); },
    get(id) { const value = refs.get(id); if (!value) throw new Error(`Unknown reference ${id}.`); return structuredClone(value); },
    snapshot() { return [...refs.values()].map(structuredClone); },
    assertCurrent(bundle) { const current = bundle.references.map((reference) => this.get(reference.id)); const expected = hashContract({ seriesId, bibleRevisionHash, references: current }); if (expected !== bundle.bundleHash) throw new Error('Continuity reference bundle is stale or changed.'); return true; },
  };
}

export function freezeReferenceBundle(registry, referenceIds = []) {
  if (!registry?.snapshot) throw new Error('A continuity reference registry is required.');
  const references = referenceIds.map((id) => registry.get(id));
  const kinds = new Set(references.map((reference) => reference.kind));
  for (const requiredKind of KINDS) if (!kinds.has(requiredKind)) throw new Error(`Continuity bundle requires ${requiredKind} reference.`);
  const base = { version: 1, seriesId: registry.seriesId, bibleRevisionHash: registry.bibleRevisionHash, references };
  return Object.freeze({ ...structuredClone(base), bundleHash: hashContract(base) });
}
