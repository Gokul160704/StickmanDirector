import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ContractValidationError,
  createGeminiTtsConsent,
  preflightFlowGeneration,
  redactSecrets,
  validateFlowError,
  validateFlowRequest,
  validateFlowResponse,
} from '../scripts/runtime-contracts.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/flow-mcp/${name}`, import.meta.url), 'utf8'));
}

test('validates typed-by-convention requests and responses against the pinned seven-tool contract', async () => {
  const contract = await fixture('contract.json');
  const responses = await fixture('responses.json');

  const request = validateFlowRequest('flow_generate', {
    project: 'synthetic-project',
    scenes: [{ id: 'scene-01', prompt: 'A quiet room at night.' }],
    max_credits: 0,
    acknowledge_cost: true,
  }, contract);
  assert.equal(request.project, 'synthetic-project');
  assert.equal(validateFlowResponse('flow_generate', responses.success.flow_generate, contract).ok, true);
  assert.throws(
    () => validateFlowRequest('flow_generate', { project: 'synthetic-project' }, contract),
    (error) => error instanceof ContractValidationError && error.code === 'missing-required',
  );
  assert.throws(
    () => validateFlowResponse('flow_transcribe', { ok: true, words: [{ start: '0' }] }, contract),
    (error) => error instanceof ContractValidationError && error.code === 'malformed-response',
  );
});

test('classifies timeout, rate-limit, and partial-output failures without exposing provider details', async () => {
  const responses = await fixture('responses.json');

  for (const name of ['timeout', 'rate_limit', 'partial_output']) {
    const result = validateFlowError(responses.errors[name]);
    assert.equal(result.kind, responses.errors[name].kind);
    assert.equal(result.retryable, true);
    assert.equal(result.safeMessage, responses.errors[name].safeMessage);
  }
  assert.equal(validateFlowError({ kind: 'provider', retryable: false, safeMessage: 'safe' }).safeMessage, 'safe');
  assert.throws(() => validateFlowError({ kind: 'provider', retryable: true }), /safeMessage/);
});

test('fails closed when entitlement, quote, approval, or composer settings are missing or changed', () => {
  const status = { ok: true, signedIn: true, inProject: true, credits: 50 };
  const request = { project: 'synthetic-project', scenes: [{ id: 'scene-01', prompt: 'A quiet room.' }], max_credits: 4 };
  const composer = { model: 'Nano Banana 2.1', aspectRatio: '16:9', variants: 1 };
  const entitlement = { provider: 'flow', available: true, source: 'account' };
  const quote = { currency: 'flow-credits', perOutput: 4, total: 4, outputs: 1 };
  const approval = { approved: true, model: composer.model, aspectRatio: composer.aspectRatio, totalCredits: 4 };

  assert.deepEqual(
    preflightFlowGeneration({ status, request, composer, entitlement, quote, approval }),
    { provider: 'flow', model: composer.model, aspectRatio: '16:9', outputs: 1, totalCredits: 4 },
  );
  assert.throws(() => preflightFlowGeneration({ status, request, composer, entitlement: null, quote, approval }), /entitlement/);
  assert.throws(() => preflightFlowGeneration({ status, request, composer, entitlement, quote: null, approval }), /quote/);
  assert.throws(() => preflightFlowGeneration({ status, request, composer: { ...composer, aspectRatio: '9:16' }, entitlement, quote, approval }), /composer settings/);
  assert.throws(() => preflightFlowGeneration({ status, request, composer, entitlement, quote: { ...quote, total: 5 }, approval: { ...approval, totalCredits: 5 } }), /max_credits/);
  assert.throws(() => preflightFlowGeneration({ status: { ...status, signedIn: false }, request, composer, entitlement, quote, approval }), /signed in/);
});

test('creates explicit Gemini model, voice, and exact transcript consent state without calling Gemini', () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network access is forbidden'); };
  try {
    const consent = createGeminiTtsConsent({
      model: 'gemini-3.8-flash-tts',
      voice: 'Charon',
      transcript: 'The station lights went dark, one by one.',
    });
    assert.deepEqual(consent, {
      schemaVersion: 1,
      provider: 'gemini-tts',
      model: 'gemini-3.8-flash-tts',
      voice: 'Charon',
      transcript: 'The station lights went dark, one by one.',
      consented: false,
      network: 'not-called',
    });
    assert.throws(() => createGeminiTtsConsent({ model: 'other-model', voice: 'Charon', transcript: 'Words.' }), /model/);
    assert.throws(() => createGeminiTtsConsent({ model: 'gemini-3.8-flash-tts', voice: 'Charon', transcript: '' }), /transcript/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('redacts secret-looking keys recursively while preserving local-only data', () => {
  assert.deepEqual(redactSecrets({
    apiKey: 'synthetic',
    nested: { authorization: 'Bearer synthetic', safe: 'kept' },
    items: [{ access_token: 'synthetic' }],
  }), {
    apiKey: '[REDACTED]',
    nested: { authorization: '[REDACTED]', safe: 'kept' },
    items: [{ access_token: '[REDACTED]' }],
  });
});
