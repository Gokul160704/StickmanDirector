import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ContractValidationError,
  approveGeminiTtsConsent,
  createGeminiTtsConsent,
  flowQuoteHash,
  flowRequestHash,
  preflightFlowGeneration,
  prepareFlowRetry,
  redactSecrets,
  validateFlowError,
  validateFlowRequest,
  validateFlowResponse,
} from '../scripts/runtime-contracts.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/flow-mcp/${name}`, import.meta.url), 'utf8'));
}

function expectCode(callback, code) {
  const codes = Array.isArray(code) ? code : [code];
  assert.throws(callback, (error) => error instanceof ContractValidationError && codes.includes(error.code));
}

const flowRequestSamples = {
  flow_status: { detailed: true },
  flow_generate: { project: 'synthetic-project', scenes: [{ id: 'scene-01', prompt: 'A quiet room.', references: ['references/rover.png'] }], max_credits: 4, acknowledge_cost: true },
  flow_wait: { job_ids: ['job-synthetic-001'], timeout_seconds: 10 },
  flow_download: { assets: ['asset-synthetic-001'], project: 'synthetic-project', quality: 'original' },
  flow_assets: { kind: 'image' },
  flow_transcribe: { video: 'videos/episode-01.wav', language: 'en', words: true },
  flow_voices: {},
};

test('validates every pinned Flow request schema and every fixture response through the validators', async () => {
  const contract = await fixture('contract.json');
  const responses = await fixture('responses.json');
  for (const tool of Object.keys(contract.tools)) {
    assert.deepEqual(validateFlowRequest(tool, flowRequestSamples[tool], contract), flowRequestSamples[tool]);
    assert.equal(validateFlowResponse(tool, responses.success[tool], contract).ok, true);
  }
  expectCode(() => validateFlowRequest('flow_status', { detailed: 'yes' }, contract), 'invalid-type');
  expectCode(() => validateFlowRequest('flow_wait', { job_ids: ['../job'], timeout_seconds: 10 }, contract), 'invalid-value');
  expectCode(() => validateFlowRequest('flow_download', { assets: ['asset'], project: '../project' }, contract), 'invalid-value');
  assert.deepEqual(validateFlowRequest('flow_generate', { ...flowRequestSamples.flow_generate, acknowledge_cost: false }, contract).acknowledge_cost, false);
});

test('rejects malformed optional fields, unsafe IDs, traversal paths, and malformed response envelopes', async () => {
  const contract = await fixture('contract.json');
  expectCode(() => validateFlowRequest('flow_wait', { job_ids: 'job-synthetic-001' }, contract), ['invalid-type', 'invalid-value']);
  expectCode(() => validateFlowRequest('flow_wait', { job_ids: [] }, contract), 'invalid-value');
  expectCode(() => validateFlowRequest('flow_transcribe', { video: '/absolute.wav' }, contract), 'invalid-value');
  expectCode(() => validateFlowRequest('flow_assets', { kind: 'unknown' }, contract), 'invalid-value');
  expectCode(() => validateFlowRequest('flow_status', { unexpected: true }, contract), 'invalid-value');
  expectCode(() => validateFlowResponse('flow_download', { ok: true, files: [{ path: '../escape.jpeg', assetId: 'asset-1', checksum: 'sha256:abc' }] }, contract), ['malformed-response', 'invalid-value']);
  expectCode(() => validateFlowResponse('flow_assets', { ok: true, assets: [{ id: 'asset-1', title: 'scene', kind: 'image' }] }, contract), ['malformed-response', 'invalid-type']);
  expectCode(() => validateFlowResponse('flow_voices', { ok: true, gemini_ready: true, voices: [{}] }, contract), ['malformed-response', 'invalid-type']);
});

test('requires finite, exact, consented Flow quotes and binds approval to the complete request batch', () => {
  const status = { ok: true, signedIn: true, inProject: true, credits: 50 };
  const request = { project: 'synthetic-project', scenes: [{ id: 'scene-01', prompt: 'A quiet room.', references: ['references/rover.png'] }], max_credits: 4, acknowledge_cost: true };
  const composer = { model: 'Nano Banana 2.1', aspectRatio: '16:9', variants: 1 };
  const entitlement = { provider: 'flow', available: true, source: 'account' };
  const quote = { currency: 'flow-credits', perOutput: 4, total: 4, outputs: 1 };
  const validApproval = { approved: true, requestHash: flowRequestHash(request, composer), quoteHash: flowQuoteHash(quote) };
  const approved = preflightFlowGeneration({ status, request, composer, entitlement, quote, approval: validApproval });
  assert.equal(approved.totalCredits, 4);
  for (const badQuote of [
    { ...quote, perOutput: Number.NaN },
    { ...quote, total: -1 },
    { ...quote, outputs: 0 },
    { ...quote, outputs: 1.5 },
    { ...quote, total: 3 },
  ]) expectCode(() => preflightFlowGeneration({ status, request, composer, entitlement, quote: badQuote, approval: validApproval }), ['preflight', 'invalid-type']);
  expectCode(() => preflightFlowGeneration({ status, request: { ...request, acknowledge_cost: false }, composer, entitlement, quote, approval: validApproval }), 'preflight');
  expectCode(() => preflightFlowGeneration({ status, request, composer, entitlement, quote, approval: { ...validApproval, approved: false } }), 'preflight');
  expectCode(() => preflightFlowGeneration({ status, request: { ...request, scenes: [{ ...request.scenes[0], id: 'scene-02' }] }, composer, entitlement, quote, approval: validApproval }), 'preflight');
  expectCode(() => preflightFlowGeneration({ status, request: { ...request, scenes: [{ ...request.scenes[0], references: ['references/other.png'] }] }, composer, entitlement, quote, approval: validApproval }), 'preflight');
  expectCode(() => preflightFlowGeneration({ status, request, composer: { ...composer, model: 'changed-model' }, entitlement, quote, approval: validApproval }), 'preflight');
  expectCode(() => preflightFlowGeneration({ status, request, composer: { ...composer, aspectRatio: '9:16' }, entitlement, quote, approval: validApproval }), 'preflight');
  expectCode(() => preflightFlowGeneration({ status, request, composer, entitlement, quote: { ...quote, perOutput: 2, total: 2 }, approval: validApproval }), 'preflight');
});

test('requires read-back before timeout or partial-output retry and permits only one explicitly consented failed shot', () => {
  const base = { error: { kind: 'timeout', retryable: true, safeMessage: 'timed out' }, readback: { stateChecked: true, assetsChecked: true, jobStatus: 'failed' }, failedShotIds: ['scene-01'], shotId: 'scene-01', consented: true, previousRetries: [] };
  assert.deepEqual(prepareFlowRetry(base), { shotId: 'scene-01', status: 'retry-authorized' });
  for (const kind of ['pending', 'timeout', 'partial-output']) {
    expectCode(() => prepareFlowRetry({ ...base, error: { kind, retryable: true, safeMessage: 'not ready' }, readback: kind === 'pending' ? null : { stateChecked: false, assetsChecked: true, jobStatus: 'failed' } }), 'retry-blocked');
  }
  expectCode(() => prepareFlowRetry({ ...base, consented: false }), 'retry-blocked');
  expectCode(() => prepareFlowRetry({ ...base, shotId: 'scene-02' }), 'retry-blocked');
  expectCode(() => prepareFlowRetry({ ...base, previousRetries: ['scene-01'] }), 'retry-blocked');
});

test('requires Gemini entitlement, billing approval, exact transcript hash, and fresh consent after changes', () => {
  const entitlement = { provider: 'gemini-tts', available: true, source: 'account' };
  const input = { model: 'gemini-3.8-flash-tts', voice: 'Charon', transcript: 'Exact approved words.' };
  const pending = createGeminiTtsConsent({ ...input, entitlement, billingApproved: true });
  expectCode(() => approveGeminiTtsConsent(pending, { ...input, entitlement, billingApproved: false }), 'consent');
  const consent = approveGeminiTtsConsent(pending, { ...input, entitlement, billingApproved: true });
  assert.equal(consent.consented, true);
  assert.match(consent.transcriptHash, /^[a-f0-9]{64}$/);
  assert.doesNotThrow(() => approveGeminiTtsConsent(consent, { ...input, entitlement, billingApproved: true }));
  expectCode(() => approveGeminiTtsConsent(consent, { ...input, transcript: 'Changed words.', entitlement, billingApproved: true }), 'consent');
  expectCode(() => approveGeminiTtsConsent(consent, { ...input, voice: 'ChangedVoice', entitlement, billingApproved: true }), 'consent');
  expectCode(() => createGeminiTtsConsent({ ...input, entitlement: { ...entitlement, available: false }, billingApproved: true }), 'consent');
});

test('normalizes timeout, rate-limit, and partial-output errors and redacts keys and secret patterns under arbitrary keys', async () => {
  const responses = await fixture('responses.json');
  for (const name of ['timeout', 'rate_limit', 'partial_output']) assert.equal(validateFlowError(responses.errors[name]).retryable, true);
  assert.equal(validateFlowError({ kind: 'provider', retryable: false, safeMessage: 'Bearer synthetic-token' }).safeMessage, '[REDACTED]');
  assert.deepEqual(redactSecrets({
    arbitrary: 'Bearer synthetic-token',
    nested: { payload: 'sk-synthetic-secret', safe: 'kept' },
    metadata: { value: 'AIza-SyntheticKey' },
  }), {
    arbitrary: '[REDACTED]',
    nested: { payload: '[REDACTED]', safe: 'kept' },
    metadata: { value: '[REDACTED]' },
  });
});
