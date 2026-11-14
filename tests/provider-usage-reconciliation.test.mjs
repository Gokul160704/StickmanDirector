import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCloudflareFailure, reconcileProviderUsage, assertCloudflarePreflight } from '../scripts/provider-usage-reconciliation.mjs';

test('classifies quota, capacity, retired-model, provider, and unknown failures without retry advice', () => {
  assert.deepEqual(classifyCloudflareFailure({ status: 429, code: 4006 }), { classification: 'quota-blocked', retry: false, unknownOutcome: false });
  assert.deepEqual(classifyCloudflareFailure({ status: 429, code: 3040 }), { classification: 'capacity-blocked', retry: false, unknownOutcome: false });
  assert.deepEqual(classifyCloudflareFailure({ status: 410, code: 5028 }), { classification: 'model-retired', retry: false, unknownOutcome: false });
  assert.deepEqual(classifyCloudflareFailure({ status: 503, code: 9999 }), { classification: 'unknown-after-dispatch', retry: false, unknownOutcome: true });
  assert.deepEqual(classifyCloudflareFailure(new Error('network timeout')), { classification: 'unknown-after-dispatch', retry: false, unknownOutcome: true });
});

test('keeps missing usage unknown and never converts an aggregate dashboard total into per-image spend', () => {
  assert.deepEqual(reconcileProviderUsage({ quotedNeurons: 10 }), { status: 'unreported', actualNeurons: null, estimatedNeurons: 10, overQuote: false, attribution: 'per-request-unreported' });
  assert.deepEqual(reconcileProviderUsage({ quotedNeurons: 10, dashboardAggregate: 12000 }), { status: 'unknown', actualNeurons: null, estimatedNeurons: 10, overQuote: false, attribution: 'aggregate-only' });
  assert.deepEqual(reconcileProviderUsage({ quotedNeurons: 10, reportedNeurons: 12 }), { status: 'reported', actualNeurons: 12, estimatedNeurons: 10, overQuote: true, attribution: 'per-request-reported' });
});

test('fails closed when quota, approval, or paid-overage evidence is missing', () => {
  const base = { estimatedNeurons: 10, remainingNeurons: 10, paidOverageAllowed: false, approvalId: 'approval-1', quoteHash: `sha256:${'a'.repeat(64)}` };
  assert.doesNotThrow(() => assertCloudflarePreflight(base));
  for (const change of [{ remainingNeurons: 9 }, { approvalId: null }, { paidOverageAllowed: true }, { quoteHash: null }]) assert.throws(() => assertCloudflarePreflight({ ...base, ...change }), /quota|approval|overage|quote/i);
});
