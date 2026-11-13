import { createHash } from 'node:crypto';

export const NARRATIVE_PARTS = [
  'Opening hook',
  'Subject introduction',
  'Background/context',
  'Main evidence/story',
  'Different perspectives',
  'Challenges/consequences/significance',
  'Conclusion',
  'Sources/further learning',
];

const CLAIM_STATUSES = new Set(['VERIFIED', 'CONFLICTING', 'REQUIRES VERIFICATION']);
const NARRATION_TYPES = new Set(['FACT', 'ANALYSIS', 'OPINION']);

function clone(value) { return structuredClone(value); }
function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}
function hash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}
function sourceMap(pkg) { return new Map(pkg.sources.map((source) => [source.id, source])); }
function claimMap(pkg) { return new Map(pkg.claims.map((claim) => [claim.id, claim])); }

function assertSourceLinks(pkg) {
  const sources = sourceMap(pkg);
  for (const claim of pkg.claims) {
    if (!CLAIM_STATUSES.has(claim.status)) throw new Error(`Claim ${claim.id} has an invalid status.`);
    if (!Array.isArray(claim.sourceIds) || claim.sourceIds.length === 0) throw new Error(`Claim ${claim.id} requires source IDs.`);
    for (const sourceId of claim.sourceIds) if (!sources.has(sourceId)) throw new Error(`Claim ${claim.id} references missing source ${sourceId}.`);
    if (claim.status === 'CONFLICTING') throw new Error(`Claim ${claim.id} is CONFLICTING and cannot be approved.`);
  }
}

function assertEpisodes(pkg, { allowUnresolved = false } = {}) {
  const claims = claimMap(pkg);
  if (!Array.isArray(pkg.episodes) || pkg.episodes.length < 1) throw new Error('At least one documentary episode is required.');
  for (const episode of pkg.episodes) {
    if (!Array.isArray(episode.segments) || episode.segments.length !== NARRATIVE_PARTS.length) throw new Error(`Episode ${episode.id} must contain all eight narrative parts.`);
    if (episode.segments.map((segment) => segment.part).join('|') !== NARRATIVE_PARTS.join('|')) throw new Error(`Episode ${episode.id} narrative parts are incomplete or out of order.`);
    for (const segment of episode.segments) {
      required(segment.narration, `${episode.id} ${segment.part} narration`);
      if (!Array.isArray(segment.evidence)) throw new Error(`${episode.id} ${segment.part} evidence must be an array.`);
      for (const claimId of segment.evidence) if (!claims.has(claimId)) throw new Error(`${episode.id} ${segment.part} references missing claim ${claimId}.`);
    }
    for (const narration of episode.narration ?? []) {
      if (!NARRATION_TYPES.has(narration.type)) throw new Error(`Narration ${narration.id} must be FACT, ANALYSIS, or OPINION.`);
      if (!Array.isArray(narration.claimIds)) throw new Error(`Narration ${narration.id} requires claim IDs.`);
      for (const claimId of narration.claimIds) {
        const claim = claims.get(claimId);
        if (!claim) throw new Error(`Narration ${narration.id} references missing claim ${claimId}.`);
        if (narration.type === 'FACT' && claim.status !== 'VERIFIED') {
          if (allowUnresolved) continue;
          throw new Error(`FACT narration ${narration.id} requires a verified source claim; ${claimId} is ${claim.status}.`);
        }
      }
    }
    if (!Array.isArray(episode.shots) || episode.shots.length < 1) throw new Error(`Episode ${episode.id} requires still-image shots.`);
    for (const shot of episode.shots) {
      if (shot.aspectRatio !== '16:9' || shot.visualKind !== 'still-image') throw new Error(`Shot ${shot.id} must be a full-frame 16:9 still-image direction.`);
      if (!shot.provenance || typeof shot.provenance !== 'object') throw new Error(`Shot ${shot.id} requires asset provenance.`);
      if (!Array.isArray(shot.claimIds)) throw new Error(`Shot ${shot.id} requires claim IDs.`);
      for (const claimId of shot.claimIds) if (!claims.has(claimId)) throw new Error(`Shot ${shot.id} references missing claim ${claimId}.`);
      if (shot.reconstruction?.isReconstruction === true && !requiredOrNull(shot.reconstruction.label)) throw new Error(`Shot ${shot.id} requires a reconstruction label.`);
    }
  }
}

function requiredOrNull(value) { return typeof value === 'string' && value.trim(); }

function validateMetadata(pkg) {
  for (const field of ['title', 'subject', 'genre', 'location', 'timePeriod', 'targetAudience', 'estimatedLength', 'centralQuestion', 'mainThesis']) required(pkg[field], field);
  for (const field of ['keyQuestions', 'peopleOrOrganisations', 'dataRequired', 'primarySources', 'secondarySources', 'claimsRequiringVerification']) {
    if (!Array.isArray(pkg.researchPlan?.[field])) throw new Error(`researchPlan.${field} must be an array.`);
  }
  if (pkg.youtubeMetadata?.status !== 'DRAFT_ONLY') throw new Error('YouTube metadata must remain DRAFT_ONLY.');
  if (pkg.production?.providerCalls !== false || pkg.production?.published !== false) throw new Error('Documentary packages cannot call providers or publish.');
}

export function validateDocumentaryPackage(pkg, { allowUnresolved = false } = {}) {
  if (!pkg || pkg.mode !== 'documentary') throw new Error('Package mode must be documentary.');
  validateMetadata(pkg);
  if (!Array.isArray(pkg.sources) || !Array.isArray(pkg.claims)) throw new Error('Sources and claims are required.');
  assertSourceLinks(pkg);
  assertEpisodes(pkg, { allowUnresolved });
  if (pkg.approval?.status === 'approved') {
    if (pkg.claims.some((claim) => claim.status !== 'VERIFIED') || allowUnresolved) throw new Error('Only fully verified packages may be approved.');
    if (!requiredOrNull(pkg.approval.approvalId) || !requiredOrNull(pkg.approval.actor) || !requiredOrNull(pkg.approval.approvedAt) || pkg.approval.dependencyHash !== pkg.dependencyHash) throw new Error('Documentary approval must be bound to the current revision, approvalId, actor, and approvedAt.');
  }
  return true;
}

function normalize(input, { allowUnresolved = false } = {}) {
  const pkg = clone(input);
  pkg.mode = 'documentary';
  pkg.narrativeParts = [...NARRATIVE_PARTS];
  pkg.youtubeMetadata = { ...(pkg.youtubeMetadata ?? {}), status: 'DRAFT_ONLY' };
  pkg.production = { providerCalls: false, published: false, ...(pkg.production ?? {}) };
  pkg.approval ??= { status: 'draft' };
  pkg.revision = pkg.revision ?? 1;
  pkg.dependencyHash = hash({
    revision: pkg.revision,
    title: pkg.title,
    subject: pkg.subject,
    sources: pkg.sources,
    claims: pkg.claims,
    episodes: pkg.episodes,
  });
  validateDocumentaryPackage(pkg, { allowUnresolved });
  return pkg;
}

export function createDocumentaryPackage(input) {
  const pkg = normalize(input);
  return pkg;
}

export function createDraftDocumentaryPackage({ title, episodeCount = 3 } = {}) {
  if (!Number.isInteger(episodeCount) || episodeCount < 1) throw new Error('episodeCount must be a positive integer.');
  const claim = { id: 'claim-pending-1', text: 'Source-backed claim pending research.', sourceIds: ['source-pending-1'], status: 'REQUIRES VERIFICATION', type: 'FACT' };
  const source = { id: 'source-pending-1', url: 'https://example.invalid/source-pending', publisher: 'Pending research', publicationDate: null, accessedAt: null, supportedClaim: 'No claim is asserted; replace this placeholder during research.', evidenceQuality: 'unverified', status: 'REQUIRES VERIFICATION' };
  const episodes = Array.from({ length: episodeCount }, (_, index) => ({
    id: `episode-${index + 1}`, title: `Episode ${index + 1}`,
    segments: NARRATIVE_PARTS.map((part) => ({ part, time: 'TBD', purpose: 'Research required.', narration: 'Narration requires verified research.', visual: 'Full-frame 16:9 still-image direction required.', evidence: ['claim-pending-1'], musicAndSound: 'TBD' })),
    narration: [{ id: `narration-${index + 1}`, text: 'Narration requires verified research.', type: 'ANALYSIS', claimIds: ['claim-pending-1'] }],
    shots: [{ id: `shot-${index + 1}`, prompt: 'Full-frame 16:9 illustrated still-image direction pending research.', aspectRatio: '16:9', visualKind: 'still-image', claimIds: ['claim-pending-1'], provenance: { sourceType: 'pending-research', license: 'not-cleared' }, reconstruction: { isReconstruction: false, label: null } }],
    bRollPlan: { establishingShots: [], interviews: [], archivalVisuals: [], maps: [], charts: [], reconstructedScenes: [], ambientSound: [] },
  }));
  return normalize({ title: title ?? 'Untitled Documentary', subject: 'Research required', genre: 'documentary', location: 'Research required', timePeriod: 'Research required', targetAudience: 'general', estimatedLength: 'Research required', centralQuestion: 'What should this documentary investigate?', mainThesis: 'Research required; no thesis is asserted.', researchPlan: { keyQuestions: [], peopleOrOrganisations: [], dataRequired: [], primarySources: [], secondarySources: [], claimsRequiringVerification: ['claim-pending-1'] }, sources: [source], claims: [claim], episodes, factCheck: { status: 'REQUIRES VERIFICATION' }, youtubeMetadata: { title: title ?? 'Untitled Documentary' } }, { allowUnresolved: true });
}

export function adaptDocumentaryPackage(pkg, changes = {}) {
  const next = clone(pkg);
  for (const [key, value] of Object.entries(changes)) next[key] = clone(value);
  next.revision = (pkg.revision ?? 1) + 1;
  return next;
}

export function resumeDocumentaryPackage(pkg) {
  const next = clone(pkg);
  const previousHash = next.dependencyHash;
  next.dependencyHash = hash({ revision: next.revision, title: next.title, subject: next.subject, sources: next.sources, claims: next.claims, episodes: next.episodes });
  if (next.approval?.status === 'approved' && next.approval.dependencyHash !== next.dependencyHash) next.approval = { status: 'needs-review', invalidatedReason: 'documentary sources, claims, or editorial revision changed' };
  if (previousHash !== next.dependencyHash && next.approval?.status === 'approved') next.approval = { status: 'needs-review', invalidatedReason: 'documentary dependency changed' };
  validateDocumentaryPackage(next, { allowUnresolved: next.approval?.status !== 'approved' });
  return next;
}

export function formatDocumentaryPackage(pkg) {
  validateDocumentaryPackage(pkg, { allowUnresolved: pkg.approval?.status !== 'approved' });
  const lines = [
    '# Documentary Package', '', `Mode: ${pkg.mode}`, `Revision: ${pkg.revision}`, `Approval: ${pkg.approval.status}`, '',
    '## DOCUMENTARY TITLE', pkg.title, '', '## SUBJECT', pkg.subject, '', '## GENRE', pkg.genre, '', '## LOCATION', pkg.location, '', '## TIME PERIOD', pkg.timePeriod, '', '## TARGET AUDIENCE', pkg.targetAudience, '', '## ESTIMATED LENGTH', pkg.estimatedLength, '', '## CENTRAL QUESTION', pkg.centralQuestion, '', '## MAIN THESIS', pkg.mainThesis, '',
    '## RESEARCH PLAN', JSON.stringify(pkg.researchPlan, null, 2), '', '## EPISODE STRUCTURE',
  ];
  for (const episode of pkg.episodes) { lines.push(`### ${episode.id}: ${episode.title}`); for (const segment of episode.segments) lines.push(`- ${segment.part}: ${segment.narration} | Visuals: ${segment.visual} | Evidence: ${segment.evidence.join(', ')}`); }
  lines.push('', '## FULL NARRATION', ...pkg.episodes.flatMap((episode) => episode.narration.map((narration) => `- [${narration.type}] ${narration.text} (claims: ${narration.claimIds.join(', ')})`)), '', '## STILL / VISUAL COVERAGE PLAN', JSON.stringify(pkg.episodes.flatMap((episode) => episode.shots), null, 2), '', '## FACT-CHECK CHECKLIST', JSON.stringify(pkg.factCheck, null, 2), '', '## YOUTUBE METADATA (DRAFT ONLY)', JSON.stringify(pkg.youtubeMetadata, null, 2), '', '## SOURCES', JSON.stringify(pkg.sources, null, 2), '');
  return `${lines.join('\n')}\n`;
}
