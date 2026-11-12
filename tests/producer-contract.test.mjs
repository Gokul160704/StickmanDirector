import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STAGES,
  advanceStage,
  answerQuestion,
  approveStage,
  createProducerSession,
  goBack,
  invalidateFrom,
  resolveProviderChoice,
  resumeProducerSession,
} from '../scripts/producer-contract.mjs';

test('creates a side-effect-free session and resumes it from JSON', () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network is forbidden at startup'); };
  try {
    const session = createProducerSession({ episodeId: 'episode-01' });
    assert.equal(session.stage, STAGES[0]);
    assert.deepEqual(resumeProducerSession(JSON.parse(JSON.stringify(session))), session);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('requires sequential stage transitions and preserves approved stages across Back', () => {
  let session = createProducerSession({ episodeId: 'episode-01' });
  assert.throws(() => advanceStage(session, 'script'), /Cannot advance/);
  session = answerQuestion(session, 'topic', 'Why do we dream?');
  session = advanceStage(session, 'preferences');
  session = answerQuestion(session, 'audience', 'general');
  session = advanceStage(session, 'script');
  session = approveStage(session, 'script');
  session = goBack(session, 'preferences');
  assert.equal(session.stage, 'preferences');
  assert.ok(session.approvedStages.script);
});

test('requires explicit invalidation before an approved stage can change', () => {
  let session = createProducerSession({ episodeId: 'episode-01' });
  session = answerQuestion(session, 'topic', 'Why do we dream?');
  session = advanceStage(session, 'preferences');
  session = answerQuestion(session, 'audience', 'general');
  session = advanceStage(session, 'script');
  session = approveStage(session, 'script');
  assert.throws(() => invalidateFrom(session, 'script', ''), /reason/);
  session = invalidateFrom(session, 'script', 'topic changed');
  assert.equal(session.stage, 'script');
  assert.equal(session.approvedStages.script, undefined);
  assert.equal(session.invalidations.at(-1).reason, 'topic changed');
});

test('separates documented provider catalog from active entitlement', () => {
  const catalog = [{ id: 'flow:nano-banana-pro', documented: true, kind: 'image' }];
  const unavailable = [{ providerId: 'flow:nano-banana-pro', available: false, source: 'account' }];
  assert.throws(
    () => resolveProviderChoice({ providerId: 'flow:nano-banana-pro', catalog, entitlements: unavailable }),
    /not currently available/,
  );
  const available = [{ providerId: 'flow:nano-banana-pro', available: true, source: 'account' }];
  assert.deepEqual(
    resolveProviderChoice({ providerId: 'flow:nano-banana-pro', catalog, entitlements: available }),
    { providerId: 'flow:nano-banana-pro', documented: true, available: true, entitlementSource: 'account' },
  );
});
