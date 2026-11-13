import { createHash, randomUUID } from 'node:crypto';
import { access, link, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertPathInsideRoot } from './path-safety.mjs';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCE_GROUPS = ['characters', 'props', 'environments', 'styles'];
const EPISODE_DIRS = ['narration', 'images', 'captions', 'exports', 'references'];

function slugify(value) {
  const slug = String(value ?? '').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) throw new Error('Series name must contain at least one letter or number.');
  return slug;
}

function positiveInteger(value, field = 'episodeCount') {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer.`);
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function integrityPayload(bible) {
  const copy = structuredClone(bible);
  if (copy.revision?.integrity) copy.revision.integrity.hash = '';
  return canonicalize(copy);
}

function approvalBindingPayload(bible) {
  const copy = structuredClone(bible);
  if (copy.revision) {
    copy.revision.approved = false;
    copy.revision.status = 'draft';
    copy.revision.approval = null;
    if (copy.revision.integrity) copy.revision.integrity.hash = '';
  }
  return canonicalize(copy);
}

function computeApprovalBindingHash(bible) {
  return createHash('sha256').update(JSON.stringify(approvalBindingPayload(bible))).digest('hex');
}

export function computeRevisionHash(bible) {
  return createHash('sha256').update(JSON.stringify(integrityPayload(bible))).digest('hex');
}

function createEpisode(slug, index, count) {
  const episodeId = `${slug}-episode-${String(index).padStart(2, '0')}`;
  return {
    episodeId,
    index,
    title: `${slug.replace(/-/g, ' ')} — Episode ${index}`,
    outline: 'Add the approved episode outline.',
    status: 'planning',
    predecessor: index === 1 ? null : `${slug}-episode-${String(index - 1).padStart(2, '0')}`,
    continuity: { previousEpisode: index === 1 ? null : `${slug}-episode-${String(index - 1).padStart(2, '0')}`, changes: [] },
    _count: count,
  };
}

export function createSeriesBible({ name, topic = name, premise = '', audience = 'General audience', language = 'en', tone = '', styleAnchor = '', palette = {}, narrator = {}, references = {}, continuity = { timeline: [] }, episodeCount = 3, slug = slugify(name), createdAt = new Date().toISOString() }) {
  if (!name || typeof name !== 'string') throw new Error('Series name is required.');
  positiveInteger(episodeCount);
  const episodes = Array.from({ length: episodeCount }, (_, index) => createEpisode(slug, index + 1, episodeCount));
  episodes.forEach((episode) => delete episode._count);
  const bible = {
    seriesId: slug,
    schemaVersion: 1,
    name,
    topic,
    premise,
    audience,
    language,
    tone,
    styleAnchor,
    palette,
    narrator: {
      voiceProvider: narrator.voiceProvider ?? '',
      model: narrator.model ?? '',
      voiceId: narrator.voiceId ?? '',
      delivery: narrator.delivery ?? '',
      approval: { status: 'draft', approved: false, approvedAt: null, approvedBy: null },
    },
    references: { characters: references.characters ?? [], props: references.props ?? [], environments: references.environments ?? [], styles: references.styles ?? [] },
    episodes,
    continuity,
    revision: {
      version: 1,
      parentVersion: null,
      status: 'draft',
      approved: false,
      createdAt,
      provenance: { source: 'local', generated: false },
      approval: null,
      integrity: { algorithm: 'sha256', hash: '' },
    },
  };
  bible.revision.integrity.hash = computeRevisionHash(bible);
  return bible;
}

function assertSafeId(id, field) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error(`${field} must be a stable lowercase kebab-case ID.`);
}

function assertPredecessorGraph(episodes) {
  const byId = new Map(episodes.map((episode) => [episode.episodeId, episode]));
  for (const episode of episodes) {
    if (episode.predecessor !== null && episode.predecessor !== undefined && !byId.has(episode.predecessor)) throw new Error(`Episode ${episode.episodeId} references missing predecessor ${episode.predecessor}.`);
    const seen = new Set();
    let current = episode;
    while (current?.predecessor) {
      if (seen.has(current.episodeId)) throw new Error('Episode predecessor dependency cycle detected.');
      seen.add(current.episodeId);
      current = byId.get(current.predecessor);
    }
  }
}

async function verifyReference(root, reference, group) {
  if (!reference.filePath) return;
  if (!reference.revisionSha256) throw new Error(`${group}.revisionSha256 is required for file-backed references.`);
  if (path.isAbsolute(reference.filePath) || /^[a-zA-Z]:/.test(reference.filePath)) throw new Error(`${group}.filePath must be a relative path inside the project root.`);
  const target = await assertPathInsideRoot(root, path.join(root, reference.filePath), `${group}.filePath`);
  let data;
  try { data = await readFile(target); } catch { throw new Error(`${group}.filePath references a missing file.`); }
  if (reference.revisionSha256) {
    const expected = reference.revisionSha256.replace(/^sha256:/, '');
    const actual = createHash('sha256').update(data).digest('hex');
    if (expected !== actual) throw new Error(`${group}.revisionSha256 does not match the referenced file.`);
  }
}

export async function validateSeriesBible(input, { root } = {}) {
  const bible = structuredClone(input);
  if (!bible || bible.schemaVersion !== 1) throw new Error('series bible schemaVersion 1 is required.');
  assertSafeId(bible.seriesId, 'seriesId');
  if (!bible.revision || typeof bible.revision !== 'object') throw new Error('revision metadata is required.');
  positiveInteger(bible.revision.version, 'revision.version');
  if (!bible.revision.integrity || bible.revision.integrity.algorithm !== 'sha256' || typeof bible.revision.integrity.hash !== 'string' || !/^[a-f0-9]{64}$/.test(bible.revision.integrity.hash)) throw new Error('revision.integrity must contain algorithm sha256 and a 64-character lowercase hash.');
  positiveInteger(bible.episodes?.length, 'episodes count');
  const ids = new Set();
  for (const group of REFERENCE_GROUPS) {
    if (!Array.isArray(bible.references?.[group])) throw new Error(`references.${group} must be an array.`);
    for (const reference of bible.references[group]) {
      assertSafeId(reference.id, `references.${group}.id`);
      if (ids.has(reference.id)) throw new Error(`Duplicate stable ID: ${reference.id}.`);
      ids.add(reference.id);
    }
  }
  const episodeIds = new Set();
  const indexes = new Set();
  for (const episode of bible.episodes) {
    assertSafeId(episode.episodeId, 'episodeId');
    if (episodeIds.has(episode.episodeId) || ids.has(episode.episodeId)) throw new Error(`Duplicate stable ID: ${episode.episodeId}.`);
    if (!Number.isInteger(episode.index) || episode.index <= 0 || indexes.has(episode.index)) throw new Error('Episode indexes must be unique positive integers.');
    episodeIds.add(episode.episodeId); indexes.add(episode.index);
  }
  assertPredecessorGraph(bible.episodes);
  const isApproved = bible.revision.approved === true || bible.revision.status === 'approved';
  if (isApproved) {
    const approval = bible.revision.approval;
    if (bible.revision.approved !== true || bible.revision.status !== 'approved' || !approval || approval.status !== 'approved' || typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim() || typeof approval.approvedAt !== 'string' || Number.isNaN(Date.parse(approval.approvedAt)) || typeof approval.authorizationId !== 'string' || !approval.authorizationId.trim() || !/^[a-f0-9]{64}$/.test(approval.boundRevisionHash) || approval.boundRevisionHash !== computeApprovalBindingHash(bible)) throw new Error('approved revision requires independently verifiable authorization bound to its content.');
  } else if (bible.revision.approval?.status === 'approved') {
    throw new Error('approval metadata cannot claim approved status without an approved revision.');
  }
  if (root) {
    for (const group of REFERENCE_GROUPS) for (const reference of bible.references[group]) await verifyReference(root, reference, group);
  }
  if (bible.revision?.integrity?.hash) {
    const actual = computeRevisionHash(bible);
    if (bible.revision.integrity.hash !== actual) throw new Error(`Revision hash mismatch: expected ${bible.revision.integrity.hash}, computed ${actual}.`);
  }
  return bible;
}

function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }

async function ensureRoot(root) {
  await mkdir(root, { recursive: true });
  const absoluteRoot = path.resolve(root);
  const actualRoot = await realpath(root);
  if (actualRoot.toLowerCase() !== absoluteRoot.toLowerCase()) throw new Error('Series root must not be a symlink.');
  return actualRoot;
}

async function readActiveBible(root) {
  await ensureRoot(root);
  const activePath = path.join(root, 'series-bible.json');
  await assertPathInsideRoot(root, activePath, 'active bible path');
  return JSON.parse(await readFile(activePath, 'utf8'));
}

async function pathExists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function atomicCreate(root, target, content, io) {
  await assertPathInsideRoot(root, target, 'revision path');
  const temp = `${target}.tmp-${randomUUID()}`;
  try {
    await io.writeFile(temp, content, { flag: 'wx' });
    await io.link(temp, target);
    await io.rm(temp, { force: true });
  } catch (error) {
    await io.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

async function atomicReplace(root, target, content, io) {
  await assertPathInsideRoot(root, target, 'active bible path');
  const temp = `${target}.tmp-${randomUUID()}`;
  const backup = `${target}.bak-${randomUUID()}`;
  let movedOriginal = false;
  try {
    await io.writeFile(temp, content, { flag: 'wx' });
    if (await pathExists(target)) {
      await io.rename(target, backup);
      movedOriginal = true;
    }
    try {
      await io.rename(temp, target);
    } catch (error) {
      if (movedOriginal) await io.rename(backup, target);
      throw error;
    }
    if (movedOriginal) await io.rm(backup, { force: true });
  } catch (error) {
    await io.rm(temp, { force: true }).catch(() => {});
    if (movedOriginal && await pathExists(backup) && !(await pathExists(target))) await io.rename(backup, target).catch(() => {});
    throw error;
  }
}

export async function writeSeriesRevision(root, bible, { version = bible.revision?.version ?? 1, allowApproved = false, io: injectedIo = {} } = {}) {
  await ensureRoot(root);
  const io = { writeFile, link, rename, rm, ...injectedIo };
  const input = structuredClone(bible);
  if (!allowApproved && (input.revision?.approved === true || input.revision?.status === 'approved')) throw new Error('approved revisions require the authorized approveSeriesRevision operation.');
  await validateSeriesBible(input, { root });
  const next = structuredClone(bible);
  next.revision = { ...next.revision, version, integrity: { algorithm: 'sha256', hash: '' } };
  next.revision.integrity.hash = computeRevisionHash(next);
  await validateSeriesBible(next, { root });
  const revisionsDir = path.join(root, 'series-bible.revisions');
  await mkdir(revisionsDir, { recursive: true });
  const revisionPath = path.join(revisionsDir, `revision-${String(version).padStart(2, '0')}.json`);
  const activePath = path.join(root, 'series-bible.json');
  await atomicCreate(root, revisionPath, json(next), io);
  try {
    await atomicReplace(root, activePath, json(next), io);
  } catch (error) {
    await io.rm(revisionPath, { force: true }).catch(() => {});
    throw error;
  }
  return next;
}

export async function approveSeriesRevision(root, { approvedBy, approvedAt = new Date().toISOString(), authorizationId } = {}) {
  const current = await readActiveBible(root);
  await validateSeriesBible(current, { root });
  if (!approvedBy || !authorizationId) throw new Error('approvedBy and authorizationId are required for approval.');
  const next = structuredClone(current);
  next.revision = { ...current.revision, version: current.revision.version + 1, parentVersion: current.revision.version, status: 'approved', approved: true, approval: { status: 'approved', approvedBy, approvedAt, authorizationId, boundRevisionHash: '' }, provenance: { source: 'authorized-manual-approval', generated: false } };
  next.revision.approval.boundRevisionHash = computeApprovalBindingHash(next);
  next.revision.integrity.hash = computeRevisionHash(next);
  return writeSeriesRevision(root, next, { version: next.revision.version, allowApproved: true });
}

export function diffSeriesBibles(previous, next) {
  const changes = [];
  const keys = new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})]);
  for (const key of [...keys].sort()) if (JSON.stringify(previous?.[key]) !== JSON.stringify(next?.[key])) changes.push(key);
  return changes;
}

export async function updateSeriesPlanning(root, changes = {}) {
  const current = await readActiveBible(root);
  await validateSeriesBible(current, { root });
  const next = structuredClone(current);
  for (const field of ['premise', 'audience', 'language', 'tone', 'styleAnchor', 'palette', 'narrator', 'references', 'continuity', 'episodes']) if (field in changes) next[field] = changes[field];
  const version = positiveInteger(current.revision.version, 'revision.version') + 1;
  next.revision = { ...current.revision, version, parentVersion: current.revision.version, status: 'review-required', approved: false, approval: null, createdAt: new Date().toISOString(), provenance: { source: 'local-update', generated: false } };
  next.revision.integrity.hash = computeRevisionHash(next);
  return writeSeriesRevision(root, next, { version });
}

function episodeManifest(series, episode) {
  return {
    schemaVersion: 1,
    episodeId: episode.episodeId,
    title: episode.title,
    topic: series.topic,
    description: episode.outline,
    targetAudience: series.audience,
    intendedDurationSeconds: 60,
    output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9' },
    references: { characters: [], props: [], environments: [], visualStyle: series.styleAnchor },
    research: { questions: [], sources: [], verifiedClaims: [], uncertaintyNotes: '' },
    script: { approvalStatus: 'draft', revision: 1 },
    continuity: { characters: [], props: [], environments: [] },
    storyboard: { source: 'Boords', handoffFormat: 'stickmandirector-boords-handoff-v1' },
    audio: { path: `narration/${episode.episodeId}.wav` },
    scenes: [],
    production: { status: 'planning', provenance: { source: 'manual', approved: false } },
  };
}

export async function scaffoldSeries(root, { name, topic = name, episodeCount = 3, ...options } = {}) {
  positiveInteger(episodeCount);
  const absoluteRoot = path.resolve(root);
  try { await access(absoluteRoot); throw new Error(`Refusing to overwrite existing folder: ${absoluteRoot}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const parent = path.dirname(absoluteRoot);
  await mkdir(parent, { recursive: true });
  await mkdir(absoluteRoot);
  try {
    const bible = createSeriesBible({ name, topic, episodeCount, ...options });
    await validateSeriesBible(bible);
    await writeSeriesRevision(absoluteRoot, bible);
    await mkdir(path.join(absoluteRoot, 'series-bible.revisions'), { recursive: true });
    for (const episode of bible.episodes) {
      const episodeRoot = path.join(absoluteRoot, 'episodes', episode.episodeId);
      await assertPathInsideRoot(absoluteRoot, episodeRoot, 'episode path');
      await mkdir(episodeRoot, { recursive: true });
      for (const dir of EPISODE_DIRS) await mkdir(path.join(episodeRoot, dir), { recursive: true });
      await writeFile(path.join(episodeRoot, 'episode.json'), json(episodeManifest(bible, episode)), { flag: 'wx' });
      await writeFile(path.join(episodeRoot, 'script.md'), `# ${episode.title}\n\n`, { flag: 'wx' });
      await writeFile(path.join(episodeRoot, 'continuity.md'), `# ${episode.title} — continuity\n\n`, { flag: 'wx' });
    }
    return { root: absoluteRoot, bible, episodes: bible.episodes };
  } catch (error) {
    await rm(absoluteRoot, { recursive: true, force: true });
    throw error;
  }
}

