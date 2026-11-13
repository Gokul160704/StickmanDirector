import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createBoordsHandoff } from './boords-handoff.mjs';
import { validateEpisodeManifest } from './episode-manifest.mjs';
import { dependencyHash } from './production-state.mjs';
import { DEFAULT_SAFE_FRAMING_PROFILE, normalizeSafeFramingProfile } from './safe-framing.mjs';
import { planImageCount } from './image-count-planner.mjs';
import { scaffoldSeries, validateSeriesBible } from './series-bible.mjs';

const FORMAT = 'stickmandirector-series-producer-v1';

function clone(value) { return structuredClone(value); }

function required(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function validateReferenceHashes(referenceHashes, bible) {
  if (!referenceHashes || typeof referenceHashes !== 'object' || Array.isArray(referenceHashes)) throw new Error('referenceHashes must be an object.');
  for (const [id, hash] of Object.entries(referenceHashes)) {
    required(id, 'reference id');
    if (typeof hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(hash)) throw new Error(`referenceHashes.${id} must be a sha256 hash.`);
    const reference = Object.values(bible?.references ?? {}).flat().find((item) => item.id === id);
    if (!reference) throw new Error(`referenceHashes.${id} is not present in the pinned series bible.`);
    if (reference.revisionSha256 && hash !== reference.revisionSha256.replace(/^sha256:/, 'sha256:')) throw new Error(`referenceHashes.${id} does not match the pinned reference hash.`);
  }
  for (const reference of Object.values(bible?.references ?? {}).flat()) if (reference.filePath && !Object.hasOwn(referenceHashes, reference.id)) throw new Error(`Missing approved hash for reference ${reference.id}.`);
  return referenceHashes;
}

function assertEpisodeOrder(episodes) {
  const byId = new Map(episodes.map((episode) => [episode.episodeId, episode]));
  for (const episode of episodes) {
    if (!episode.predecessorId) continue;
    const predecessor = byId.get(episode.predecessorId);
    if (!predecessor || predecessor.index >= episode.index) throw new Error(`Episode ${episode.episodeId} has an out-of-order predecessor.`);
    const seen = new Set([episode.episodeId]);
    let current = predecessor;
    while (current) {
      if (seen.has(current.episodeId)) throw new Error('Episode predecessor dependency cycle detected.');
      seen.add(current.episodeId);
      current = current.predecessorId ? byId.get(current.predecessorId) : null;
    }
  }
}

function episodeDependency(series, episode, safeFraming, overrides = {}) {
  return dependencyHash({
    seriesId: series.bible.seriesId,
    bibleRevisionHash: overrides.bibleRevisionHash ?? series.bibleRevisionHash,
    referenceHashes: overrides.referenceHashes ?? series.referenceHashes,
    narrator: series.narrator ?? series.bible.narrator,
    styleAnchor: series.styleAnchor ?? series.bible.styleAnchor,
    safeFramingHash: safeFraming.hash,
    imageCountPlan: series.imageCountPlan ?? null,
    episodeId: episode.episodeId,
    predecessorId: episode.predecessorId,
  });
}

async function writeJsonAtomically(file, value) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temp, file);
}

function recordFromManifest(manifest, manifestPath, bible, safeFraming, referenceHashes) {
  const episode = bible.episodes.find((item) => item.episodeId === manifest.episodeId);
  if (!episode) throw new Error(`Manifest ${manifest.episodeId} is not present in the pinned series bible.`);
  const metadata = manifest.series ?? {};
  const expectedDependencyHash = episodeDependency({ bible, bibleRevisionHash: bible.revision.integrity.hash, referenceHashes, narrator: bible.narrator, styleAnchor: bible.styleAnchor, imageCountPlan: manifest.planning?.imageCount ?? null }, episode, safeFraming);
  const stale = metadata.bibleRevisionHash !== bible.revision.integrity.hash
    || metadata.episodeIndex !== episode.index
    || (metadata.predecessorId ?? null) !== (episode.predecessor ?? null)
    || metadata.safeFramingHash !== safeFraming.hash
    || JSON.stringify(metadata.continuityInputs?.referenceHashes ?? {}) !== JSON.stringify(referenceHashes)
    || (metadata.approval?.status === 'approved' && metadata.approval.dependencyHash !== expectedDependencyHash);
  return {
    episodeId: episode.episodeId,
    index: episode.index,
    title: episode.title,
    predecessorId: episode.predecessor ?? null,
    manifestPath,
    dependencyHash: expectedDependencyHash,
    approval: stale ? { status: 'needs-review' } : (metadata.approval ?? { status: 'draft' }),
    ...(stale ? { invalidatedReason: 'manifest approval or continuity binding is stale' } : {}),
    safeFraming,
    referenceHashes,
  };
}

export function createEpisodeManifestMetadata({ bible, episode, safeFraming, referenceHashes = {} } = {}) {
  if (!bible?.revision?.integrity?.hash) throw new Error('A pinned bible revision hash is required.');
  return {
    seriesId: bible.seriesId,
    bibleRevision: bible.revision.version,
    bibleRevisionHash: bible.revision.integrity.hash,
    episodeIndex: episode.index,
    predecessorId: episode.predecessor ?? null,
    continuityInputs: { predecessorId: episode.predecessor ?? null, referenceHashes },
    continuityOutputs: { state: 'draft' },
    approval: { status: 'draft' },
    safeFramingProfile: safeFraming.version,
    safeFramingHash: safeFraming.hash,
  };
}

export async function createSeriesProducer({ root, name, topic = name, episodeCount = 3, safeFramingProfile = DEFAULT_SAFE_FRAMING_PROFILE, referenceHashes = {}, ...options } = {}) {
  required(root, 'root');
  const safeFraming = normalizeSafeFramingProfile(safeFramingProfile);
  const scaffold = await scaffoldSeries(root, { name: required(name, 'name'), topic, episodeCount, ...options });
  await validateSeriesBible(scaffold.bible, { root: scaffold.root });
  validateReferenceHashes(referenceHashes, scaffold.bible);
  const episodes = [];
  for (const episode of scaffold.episodes) {
    const manifestPath = path.join(scaffold.root, 'episodes', episode.episodeId, 'episode.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.safeFraming = safeFraming;
    manifest.series = createEpisodeManifestMetadata({ bible: scaffold.bible, episode, safeFraming, referenceHashes });
    await writeJsonAtomically(manifestPath, manifest);
    episodes.push(recordFromManifest(manifest, manifestPath, scaffold.bible, safeFraming, referenceHashes));
  }
  return {
    format: FORMAT,
    mode: 'series',
    root: scaffold.root,
    bible: scaffold.bible,
    bibleRevisionHash: scaffold.bible.revision.integrity.hash,
    referenceHashes: clone(referenceHashes),
    narrator: clone(scaffold.bible.narrator),
    styleAnchor: scaffold.bible.styleAnchor,
    imageCountPlan: null,
    safeFraming,
    episodes,
    providerCalls: [],
  };
}

export function approveEpisodePlan(series, episodeId, { approvalId, actor, approvedAt = new Date().toISOString() } = {}) {
  required(episodeId, 'episodeId'); required(approvalId, 'approvalId'); required(actor, 'actor');
  const next = clone(series);
  const episode = next.episodes.find((item) => item.episodeId === episodeId);
  if (!episode) throw new Error(`Unknown episode: ${episodeId}.`);
  if (episode.approval.status === 'approved') throw new Error(`Episode ${episodeId} is already approved; invalidate it before re-approval.`);
  episode.approval = { status: 'approved', approvalId, actor, approvedAt, dependencyHash: episode.dependencyHash };
  return next;
}

export function planSeriesEpisodes(series, plans = {}) {
  const next = clone(series);
  for (const [episodeId, options] of Object.entries(plans)) {
    const episode = next.episodes.find((item) => item.episodeId === episodeId);
    if (!episode) throw new Error(`Unknown episode: ${episodeId}.`);
    const planned = planImageCount(options);
    episode.imageCountPlan = { ...planned, dependencyHash: dependencyHash(planned) };
    episode.dependencyHash = episodeDependency({ ...next, imageCountPlan: episode.imageCountPlan }, episode, next.safeFraming);
    if (episode.approval.status === 'approved') episode.approval = { status: 'needs-review' };
  }
  next.imageCountPlan = Object.fromEntries(next.episodes.filter((episode) => episode.imageCountPlan).map((episode) => [episode.episodeId, episode.imageCountPlan]));
  for (const episode of next.episodes) if (episode.imageCountPlan) episode.dependencyHash = episodeDependency({ ...next, imageCountPlan: episode.imageCountPlan }, episode, next.safeFraming);
  return next;
}

export async function saveSeriesProducer(series) {
  for (const episode of series.episodes) {
    const manifest = JSON.parse(await readFile(episode.manifestPath, 'utf8'));
    manifest.series = {
      ...(manifest.series ?? {}),
      bibleRevisionHash: series.bibleRevisionHash,
      continuityInputs: { ...(manifest.series?.continuityInputs ?? {}), referenceHashes: series.referenceHashes },
      safeFramingHash: series.safeFraming.hash,
      ...(episode.imageCountPlan ? { planning: { ...(manifest.planning ?? {}), imageCount: episode.imageCountPlan } } : {}),
      approval: clone(episode.approval),
    };
    await writeJsonAtomically(episode.manifestPath, manifest);
  }
  return series;
}

export function reconcileSeriesDependencies(series, { bibleRevisionHash = series.bibleRevisionHash, referenceHashes = series.referenceHashes, safeFramingProfile = series.safeFraming, narrator = series.narrator, styleAnchor = series.styleAnchor, imageCountPlan = series.imageCountPlan } = {}) {
  const next = clone(series);
  assertEpisodeOrder(next.episodes);
  const revisionChanged = bibleRevisionHash !== series.bibleRevisionHash;
  const refsChanged = JSON.stringify(referenceHashes) !== JSON.stringify(series.referenceHashes);
  const framingChanged = JSON.stringify(safeFramingProfile) !== JSON.stringify(series.safeFraming);
  const narratorChanged = JSON.stringify(narrator) !== JSON.stringify(series.narrator);
  const styleChanged = styleAnchor !== series.styleAnchor;
  const imagePlanChanged = JSON.stringify(imageCountPlan) !== JSON.stringify(series.imageCountPlan);
  if (!revisionChanged && !refsChanged && !framingChanged && !narratorChanged && !styleChanged && !imagePlanChanged) return next;
  next.bibleRevisionHash = bibleRevisionHash;
  next.referenceHashes = clone(referenceHashes);
  next.safeFraming = normalizeSafeFramingProfile(safeFramingProfile);
  next.narrator = clone(narrator);
  next.styleAnchor = styleAnchor;
  next.imageCountPlan = clone(imageCountPlan);
  for (const episode of next.episodes) {
    const dependency = episodeDependency(next, episode, next.safeFraming, { bibleRevisionHash, referenceHashes });
    if (episode.approval.status === 'approved' || episode.index > 1 || refsChanged || framingChanged || narratorChanged || styleChanged || imagePlanChanged) {
      episode.approval = { status: 'needs-review' };
      episode.invalidatedReason = 'series dependency changed; human re-approval required';
    }
    episode.dependencyHash = dependency;
  }
  return next;
}

export async function resumeSeriesProducer(root) {
  const bible = JSON.parse(await readFile(path.join(root, 'series-bible.json'), 'utf8'));
  await validateSeriesBible(bible, { root });
  let safeFraming = null;
  let referenceHashes = null;
  const episodes = [];
  for (const episode of bible.episodes) {
    const manifestPath = path.join(root, 'episodes', episode.episodeId, 'episode.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    validateEpisodeManifest(manifest, { root: path.dirname(manifestPath) });
    safeFraming ??= normalizeSafeFramingProfile(manifest.safeFraming ?? DEFAULT_SAFE_FRAMING_PROFILE);
    referenceHashes ??= manifest.series?.continuityInputs?.referenceHashes ?? {};
    episodes.push(recordFromManifest(manifest, manifestPath, bible, safeFraming, referenceHashes));
  }
  validateReferenceHashes(referenceHashes, bible);
  return { format: FORMAT, mode: 'series', root: path.resolve(root), bible, bibleRevisionHash: bible.revision.integrity.hash, referenceHashes, safeFraming, episodes, providerCalls: [] };
}

export async function createEpisodeBoordsHandoff(root, episodeId) {
  const series = await resumeSeriesProducer(root);
  const episode = series.episodes.find((item) => item.episodeId === episodeId);
  if (!episode) throw new Error(`Unknown episode: ${episodeId}.`);
  const manifest = JSON.parse(await readFile(episode.manifestPath, 'utf8'));
  const handoff = createBoordsHandoff(manifest);
  const outputPath = path.join(path.dirname(episode.manifestPath), 'boords-handoff.json');
  const result = { ...handoff, series: { seriesId: series.bible.seriesId, bibleRevisionHash: series.bibleRevisionHash, episodeIndex: episode.index, predecessorId: episode.predecessorId }, safeFraming: series.safeFraming };
  await writeJsonAtomically(outputPath, result);
  return { ...result, outputPath, providerCalls: undefined };
}

export { FORMAT as SERIES_PRODUCER_FORMAT };
