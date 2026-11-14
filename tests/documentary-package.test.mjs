import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { readFile as readTextFile } from 'node:fs/promises';

import {
  adaptDocumentaryPackage,
  createDocumentaryPackage,
  formatDocumentaryPackage,
  resumeDocumentaryPackage,
  validateDocumentaryPackage,
} from '../scripts/documentary-package.mjs';

const run = promisify(execFile);

function source(id, status = 'VERIFIED') {
  return {
    id,
    url: `https://example.test/${id}`,
    publisher: 'Demo source',
    publicationDate: '2026-01-01',
    accessedAt: '2026-11-14',
    supportedClaim: `${id} supports the demo claim.`,
    evidenceQuality: 'primary',
    status,
  };
}

function input({ episodeCount = 3, claimStatus = 'VERIFIED' } = {}) {
  return {
    title: 'Demo Documentary',
    subject: 'A fictional lighthouse archive',
    genre: 'history',
    location: 'Demo Coast',
    timePeriod: '2026',
    targetAudience: 'general',
    estimatedLength: '3 episodes x 6 minutes',
    centralQuestion: 'How did a community preserve a lighthouse archive?',
    mainThesis: 'Careful preservation can connect local memory with public learning.',
    researchPlan: {
      keyQuestions: ['What was preserved?'],
      peopleOrOrganisations: ['Demo Archive'],
      dataRequired: ['Archive inventory'],
      primarySources: ['source-1'],
      secondarySources: [],
      claimsRequiringVerification: claimStatus === 'VERIFIED' ? [] : ['claim-1'],
    },
    sources: [source('source-1', claimStatus)],
    claims: [{
      id: 'claim-1',
      text: 'The fictional archive contains a public inventory.',
      sourceIds: ['source-1'],
      status: claimStatus,
      type: 'FACT',
    }],
    episodes: Array.from({ length: episodeCount }, (_, index) => ({
      id: `episode-${index + 1}`,
      title: `Episode ${index + 1}`,
      segments: [
        { part: 'Opening hook', time: '00:00-00:30', purpose: 'Invite a question.', narration: 'The archive begins with a question.', visual: 'Full-frame 16:9 still of the archive exterior.', evidence: ['claim-1'], musicAndSound: 'Measured ambient sound.' },
        { part: 'Subject introduction', time: '00:30-01:00', purpose: 'Introduce the subject.', narration: 'This is the fictional lighthouse archive.', visual: 'Full-frame 16:9 still of labeled shelves.', evidence: ['claim-1'], musicAndSound: 'Quiet room tone.' },
        { part: 'Background/context', time: '01:00-01:30', purpose: 'Give context.', narration: 'The community catalogued what it could save.', visual: 'Full-frame 16:9 still of a map and notebook.', evidence: ['claim-1'], musicAndSound: 'Soft pulse.' },
        { part: 'Main evidence/story', time: '01:30-02:00', purpose: 'Show evidence.', narration: 'The inventory makes the preservation visible.', visual: 'Full-frame 16:9 still of an inventory page.', evidence: ['claim-1'], musicAndSound: 'Low unobtrusive bed.' },
        { part: 'Different perspectives', time: '02:00-02:30', purpose: 'Compare views.', narration: 'The archive can be read as memory or evidence.', visual: 'Full-frame 16:9 still of two visitors reading.', evidence: ['claim-1'], musicAndSound: 'Open ambient sound.' },
        { part: 'Challenges/consequences/significance', time: '02:30-03:00', purpose: 'Explain significance.', narration: 'Preservation also raises questions about access.', visual: 'Full-frame 16:9 still of a locked cabinet.', evidence: ['claim-1'], musicAndSound: 'Restrained tension.' },
        { part: 'Conclusion', time: '03:00-03:30', purpose: 'Resolve the question.', narration: 'The archive remains a bridge between memory and learning.', visual: 'Full-frame 16:9 still at sunset.', evidence: ['claim-1'], musicAndSound: 'Warm resolution.' },
        { part: 'Sources/further learning', time: '03:30-04:00', purpose: 'Invite further learning.', narration: 'The source ledger is available for review.', visual: 'Full-frame 16:9 still of the source ledger.', evidence: ['claim-1'], musicAndSound: 'Fade out.' },
      ],
      narration: [{ id: `narration-${index + 1}`, text: 'The archive begins with a question.', type: 'FACT', claimIds: ['claim-1'] }],
      shots: [{ id: `shot-${index + 1}`, prompt: 'Full-frame 16:9 illustrated stickman still of the archive.', aspectRatio: '16:9', visualKind: 'still-image', claimIds: ['claim-1'], provenance: { sourceType: 'offline-demo', license: 'demo-only' }, reconstruction: { isReconstruction: false, label: null } }],
      bRollPlan: { establishingShots: ['Archive exterior'], interviews: ['Questions only; no invented testimony'], archivalVisuals: ['Illustrated source-inspired still'], maps: ['Map still'], charts: ['Inventory chart still'], reconstructedScenes: ['None'], ambientSound: ['Room tone'] },
    })),
    factCheck: { names: 'checked', dates: 'checked', stats: 'none', quotations: 'none', sources: 'checked', reconstructionLabeling: 'checked', sensitiveTreatment: 'checked' },
    youtubeMetadata: { title: 'Demo Documentary', description: 'Draft only.', keywords: ['archive'], hashtags: ['#demo'], thumbnailText: 'Archive', thumbnailPrompt: 'Still-image prompt only.' },
  };
}

test('creates a complete three-episode documentary package with traceable still coverage', () => {
  const pkg = createDocumentaryPackage(input());
  assert.equal(pkg.mode, 'documentary');
  assert.equal(pkg.episodes.length, 3);
  assert.deepEqual(pkg.narrativeParts, [
    'Opening hook', 'Subject introduction', 'Background/context', 'Main evidence/story',
    'Different perspectives', 'Challenges/consequences/significance', 'Conclusion', 'Sources/further learning',
  ]);
  assert.equal(pkg.approval.status, 'draft');
  assert.doesNotThrow(() => validateDocumentaryPackage(pkg));
  assert.match(formatDocumentaryPackage(pkg), /DOCUMENTARY TITLE/);
});

test('rejects asserted narration without a verified source claim', () => {
  const pkg = input({ claimStatus: 'REQUIRES VERIFICATION' });
  assert.throws(() => createDocumentaryPackage(pkg), /REQUIRES VERIFICATION|verified source/i);
});

test('keeps contradictory evidence explicitly conflicting and blocks approval', () => {
  const pkg = createDocumentaryPackage(input());
  pkg.claims.push({ id: 'claim-2', text: 'A conflicting demo account.', sourceIds: ['source-1'], status: 'CONFLICTING', type: 'FACT' });
  assert.throws(() => validateDocumentaryPackage(pkg), /CONFLICTING|conflict/i);
});

test('requires reconstruction labels and source provenance for every proposed shot', () => {
  const pkg = createDocumentaryPackage(input({ episodeCount: 1 }));
  pkg.episodes[0].shots[0].reconstruction = { isReconstruction: true, label: null };
  assert.throws(() => validateDocumentaryPackage(pkg), /reconstruction label/i);
  pkg.episodes[0].shots[0].reconstruction.label = 'AI-generated reconstruction';
  delete pkg.episodes[0].shots[0].provenance;
  assert.throws(() => validateDocumentaryPackage(pkg), /provenance/i);
});

test('invalidates downstream approval when source or revision inputs change', () => {
  const pkg = createDocumentaryPackage(input({ episodeCount: 1 }));
  pkg.approval = { status: 'approved', approvalId: 'human-demo', actor: 'owner', approvedAt: '2026-11-14T00:00:00.000Z', dependencyHash: pkg.dependencyHash };
  const changed = resumeDocumentaryPackage(adaptDocumentaryPackage(pkg, { claims: [{ ...pkg.claims[0], text: 'Changed claim.' }] }));
  assert.equal(changed.approval.status, 'needs-review');
  assert.equal(changed.approval.approvalId, undefined);
});

test('requires documentary approval to be bound to the current revision and actor', () => {
  const pkg = input({ episodeCount: 1 });
  pkg.approval = { status: 'approved' };
  assert.throws(() => createDocumentaryPackage(pkg), /approval.*bound|approvalId|dependencyHash/i);
});

test('rejects an approved package whose content changed without a refreshed dependency digest', () => {
  const pkg = createDocumentaryPackage(input({ episodeCount: 1 }));
  pkg.approval = { status: 'approved', approvalId: 'human-demo', actor: 'owner', approvedAt: '2026-11-14T00:00:00.000Z', dependencyHash: pkg.dependencyHash };
  pkg.claims[0].text = 'Tampered after approval.';
  assert.throws(() => validateDocumentaryPackage(pkg), /dependency hash|digest|revision/i);
});

test('rejects verified claims whose source metadata is incomplete or unverifiable', () => {
  const pkg = input({ episodeCount: 1 });
  pkg.sources[0].url = 'not-a-url';
  assert.throws(() => createDocumentaryPackage(pkg), /source.*url|URL/i);
  const undated = input({ episodeCount: 1 });
  undated.sources[0].publicationDate = null;
  assert.throws(() => createDocumentaryPackage(undated), /date.*rationale|publication/i);
});

test('preserves conflicting claims in an unresolved draft but blocks approval', () => {
  const pkg = input({ episodeCount: 1, claimStatus: 'CONFLICTING' });
  const draft = createDocumentaryPackage(pkg, { allowUnresolved: true });
  assert.equal(draft.claims[0].status, 'CONFLICTING');
  draft.approval = { status: 'approved', approvalId: 'human-demo', actor: 'owner', approvedAt: '2026-11-14T00:00:00.000Z', dependencyHash: draft.dependencyHash };
  assert.throws(() => validateDocumentaryPackage(draft), /CONFLICTING|verified|approval/i);
});

test('requires factual narration and segments to retain source lineage', () => {
  const noNarration = input({ episodeCount: 1 });
  noNarration.episodes[0].narration = [];
  assert.throws(() => createDocumentaryPackage(noNarration), /narration/i);
  const noEvidence = input({ episodeCount: 1 });
  noEvidence.episodes[0].segments[0].evidence = [];
  assert.throws(() => createDocumentaryPackage(noEvidence), /evidence/i);
  const noFactClaims = input({ episodeCount: 1 });
  noFactClaims.episodes[0].narration[0].claimIds = [];
  assert.throws(() => createDocumentaryPackage(noFactClaims), /claim/i);
});

test('keeps documentary implementation plans manual and does not require automatic subagents', async () => {
  const plan = await readTextFile(new URL('../docs/superpowers/plans/2026-11-14-documentary-direction.md', import.meta.url), 'utf8');
  assert.doesNotMatch(plan, /REQUIRED SUB-SKILL:\s*Use superpowers:subagent-driven-development/i);
  assert.match(plan, /manually invoked|manual/i);
});

test('keeps YouTube metadata draft-only and never calls providers', () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('provider call is forbidden'); };
  try {
    const pkg = createDocumentaryPackage(input({ episodeCount: 1 }));
    assert.equal(pkg.youtubeMetadata.status, 'DRAFT_ONLY');
    assert.equal(pkg.production.providerCalls, false);
    assert.equal(pkg.production.published, false);
  } finally { globalThis.fetch = previousFetch; }
});

test('CLI writes reviewable local package files without changing a legacy manifest', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'stickman-documentary-'));
  try {
    const root = path.join(parent, 'package');
    const legacy = path.join(root, 'episode.json');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(root, { recursive: true }));
    await writeFile(legacy, '{"schemaVersion":1,"output":{"aspectRatio":"16:9"}}\n');
    const before = await readFile(legacy, 'utf8');
    const { stdout } = await run(process.execPath, ['scripts/producer-cli.mjs', '--documentary-create', 'Demo CLI', root, '--episodes', '1'], { cwd: path.resolve('.') });
    const result = JSON.parse(stdout);
    assert.equal(result.mode, 'documentary');
    assert.equal(result.episodes, 1);
    assert.match(await readFile(path.join(root, 'documentary-package.md'), 'utf8'), /Sources\/further learning/);
    assert.equal(await readFile(legacy, 'utf8'), before);
  } finally { await rm(parent, { recursive: true, force: true }); }
});
