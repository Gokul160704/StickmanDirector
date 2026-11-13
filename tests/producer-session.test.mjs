import assert from 'node:assert/strict';
import test from 'node:test';

import {
  answerGuidedChoice,
  approveGuidedStage,
  createGuidedProducer,
  editGuidedChoice,
  getNextQuestion,
  goBackGuidedStage,
  invalidateGuidedStage,
  manualFallback,
  regenerateSelectedShot,
  resumeGuidedProducer,
  saveGuidedProducer,
  selectGuidedProvider,
  advanceGuidedStage,
  planGuidedImageCount,
} from '../scripts/producer-session.mjs';

test('fresh startup exposes deterministic offline choices without calling providers', () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network is forbidden at startup'); };
  try {
    const session = createGuidedProducer({ episodeId: 'episode-01' });
    assert.deepEqual(getNextQuestion(session), {
      id: 'source',
      stage: 'entry',
      choices: ['topic', 'script', 'article', 'existing-episode'],
    });
    assert.deepEqual(session.providerEntitlements, []);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('guided choices cover preferences and advance only after required decisions', () => {
  let session = createGuidedProducer({ episodeId: 'episode-01' });
  session = answerGuidedChoice(session, 'source', 'topic');
  session = advanceGuidedStage(session);
  assert.equal(session.stage, 'preferences');
  assert.deepEqual(getNextQuestion(session).choices, ['short', 'standard', 'long']);
  for (const [id, value] of [
    ['duration', 'standard'],
    ['audience', 'general'],
    ['tone', 'curious'],
    ['language', 'en'],
    ['aspectRatio', '16:9'],
    ['visualStyle', 'illustrated-stickman'],
    ['imageCountMode', 'recommended'],
    ['pace', 'cinematic'],
  ]) session = answerGuidedChoice(session, id, value);
  session = advanceGuidedStage(session);
  assert.equal(session.stage, 'script');
});

test('guides custom image count and stores a deterministic offline shot plan', () => {
  let session = createGuidedProducer({ episodeId: 'episode-01' });
  session = answerGuidedChoice(session, 'source', 'topic');
  session = advanceGuidedStage(session);
  for (const [id, value] of [
    ['duration', 'standard'], ['audience', 'general'], ['tone', 'curious'],
    ['language', 'en'], ['aspectRatio', '16:9'], ['visualStyle', 'illustrated-stickman'],
    ['imageCountMode', 'custom'], ['pace', 'reflective'], ['customImageCount', 8],
  ]) session = answerGuidedChoice(session, id, value);
  assert.equal(getNextQuestion(session), null);
  const planned = planGuidedImageCount(session, [
    { id: 'beat-01', startSeconds: 0, endSeconds: 8, essential: true },
    { id: 'beat-02', startSeconds: 8, endSeconds: 16, essential: true },
  ]);
  assert.equal(planned.imageCountPlan.requestedCount, 8);
  assert.equal(planned.imageCountPlan.shots.length, 8);
  assert.equal(planned.imageCountPlan.mode, 'custom');
  assert.deepEqual(session.imageCountPlan, undefined);
});

test('validates custom image count as a positive integer and preserves it on resume', () => {
  let session = createGuidedProducer({ episodeId: 'episode-01' });
  session = answerGuidedChoice(session, 'source', 'topic');
  session = advanceGuidedStage(session);
  for (const [id, value] of [
    ['duration', 'standard'], ['audience', 'general'], ['tone', 'curious'],
    ['language', 'en'], ['aspectRatio', '16:9'], ['visualStyle', 'illustrated-stickman'],
    ['imageCountMode', 'custom'], ['pace', 'cinematic'],
  ]) session = answerGuidedChoice(session, id, value);
  assert.throws(() => answerGuidedChoice(session, 'customImageCount', 2.5), /positive integer/i);
  assert.throws(() => answerGuidedChoice(session, 'customImageCount', 0), /positive integer/i);
  session = answerGuidedChoice(session, 'customImageCount', 24);
  assert.equal(resumeGuidedProducer(saveGuidedProducer(session)).answers.customImageCount, 24);
});

test('invalidates downstream approvals when the image-count dependency changes', () => {
  let session = createGuidedProducer({ episodeId: 'episode-01' });
  session = answerGuidedChoice(session, 'source', 'topic');
  session = advanceGuidedStage(session);
  session = answerGuidedChoice(session, 'imageCountMode', 'custom');
  session = answerGuidedChoice(session, 'pace', 'cinematic');
  session = answerGuidedChoice(session, 'customImageCount', 8);
  const beats = [
    { id: 'beat-01', startSeconds: 0, endSeconds: 4, essential: true },
    { id: 'beat-02', startSeconds: 4, endSeconds: 8, essential: true },
  ];
  session = planGuidedImageCount(session, beats);
  session.approvedStages = { storyboard: { revision: 1 }, images: { revision: 1 }, audio: { revision: 1 } };
  session = answerGuidedChoice(session, 'customImageCount', 12);
  session = planGuidedImageCount(session, beats);
  assert.equal(session.approvedStages.storyboard, undefined);
  assert.equal(session.approvedStages.images, undefined);
  assert.match(session.invalidations.at(-1).reason, /image-count planning inputs changed/i);
});

test('save and resume preserve the exact wizard step and choices', () => {
  let session = createGuidedProducer({ episodeId: 'episode-01' });
  session = answerGuidedChoice(session, 'source', 'article');
  const saved = saveGuidedProducer(session);
  assert.deepEqual(resumeGuidedProducer(saved), session);
});

test('Back and Edit preserve approvals until explicit invalidation is recorded', () => {
  let session = createGuidedProducer({ episodeId: 'episode-01' });
  session = answerGuidedChoice(session, 'source', 'topic');
  session = advanceGuidedStage(session);
  for (const [id, value] of [
    ['duration', 'short'], ['audience', 'general'], ['tone', 'warm'],
    ['language', 'en'], ['aspectRatio', '16:9'], ['visualStyle', 'minimal'],
    ['imageCountMode', 'recommended'], ['pace', 'reflective'],
  ]) session = answerGuidedChoice(session, id, value);
  session = advanceGuidedStage(session);
  session = answerGuidedChoice(session, 'scriptMode', 'draft');
  session = approveGuidedStage(session, 'script');
  session = goBackGuidedStage(session, 'preferences');
  assert.equal(session.stage, 'preferences');
  assert.equal(session.nextHumanAction.type, 'approve-stage');
  session = editGuidedChoice(session, 'tone', 'dramatic');
  assert.equal(session.nextHumanAction.type, 'approve-stage');
  assert.ok(session.approvedStages.script);
  session = invalidateGuidedStage(session, 'script', 'tone changed');
  assert.equal(session.approvedStages.script, undefined);
  assert.equal(session.invalidations.at(-1).reason, 'tone changed');
});

test('provider selection fails safely when entitlement is unavailable', () => {
  const session = { ...createGuidedProducer({ episodeId: 'episode-01' }), stage: 'providers' };
  assert.throws(
    () => selectGuidedProvider(session, 'provider.image', 'flow', [{ providerId: 'flow', available: false }]),
    /not currently available/,
  );
  assert.equal(session.answers['provider.image'], undefined);
});

test('provider answers and edits enforce entitlement and provider-stage ordering', () => {
  let session = createGuidedProducer({ episodeId: 'episode-01' });
  assert.throws(() => answerGuidedChoice(session, 'provider.image', 'flow'), /not part of the current stage/);
  session = { ...session, stage: 'providers' };
  assert.throws(() => answerGuidedChoice(session, 'provider.image', 'flow'), /not currently available/);
  assert.throws(() => editGuidedChoice(session, 'provider.image', 'flow'), /not currently available/);
});

test('future-stage edits require an explicit stage transition and manual provider is offline-safe', () => {
  const session = createGuidedProducer({ episodeId: 'episode-01' });
  assert.throws(() => editGuidedChoice(session, 'duration', 'standard'), /not part of the current stage/);
  const providerSession = { ...session, stage: 'providers' };
  const selected = selectGuidedProvider(providerSession, 'provider.image', 'manual');
  assert.equal(selected.answers['provider.image'], 'manual');
});

test('approval requires every guided answer in the stage', () => {
  const session = createGuidedProducer({ episodeId: 'episode-01' });
  assert.throws(() => approveGuidedStage(session, 'entry'), /answer source first/);
});

test('selected-shot regeneration records an approval request without generation', () => {
  const session = createGuidedProducer({ episodeId: 'episode-01' });
  const next = regenerateSelectedShot(session, 'shot-03');
  assert.deepEqual(next.regenerationRequests, [{ shotId: 'shot-03', status: 'awaiting-approval' }]);
  assert.equal(next.nextHumanAction.type, 'approve-shot-regeneration');
  assert.throws(() => regenerateSelectedShot(next, 'shot-03'), /already has a regeneration request/);
});

test('manual fallback is non-interactive and names every guided decision', () => {
  const guide = manualFallback();
  for (const choice of ['topic', 'script', 'article', 'existing-episode', 'duration', 'audience', 'tone', 'language', 'aspect ratio', 'visual style', 'image count', 'pace', 'provider']) {
    assert.match(guide.toLowerCase(), new RegExp(choice));
  }
});
