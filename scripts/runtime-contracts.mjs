import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FLOW_TOOLS = new Set(['flow_status', 'flow_generate', 'flow_wait', 'flow_download', 'flow_assets', 'flow_transcribe', 'flow_voices']);
export const IMAGE_GENERATION_MODELS = new Set(['Nano Banana 2.1', 'Nano Banana Pro']);
const GEMINI_TTS_MODELS = new Set(['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const CHECKSUM = /^sha256:[a-f0-9]{64}$/;
const SECRET_KEY = /api[-_]?key|authorization|cookie|access[-_]?token|secret|password|credential|token/i;
const SECRET_VALUE = /bearer\s+\S+|AIzaSy[A-Za-z0-9_-]+|ya29\.[A-Za-z0-9._-]+|(?:sk|gh[pousr]|xox[baprs])[-_][A-Za-z0-9._-]+|-----BEGIN[^\n]+-----[\s\S]*?-----END[^\n]+-----/i;

export class ContractValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContractValidationError';
    this.code = code;
  }
}

export function validateStillImageGenerationRequest(input) {
  const request = object(input, 'Flow still-image request');
  const prohibitedKeys = new Set(['mediaType', 'operation', 'durationSeconds', 'videoPrompt', 'motionPrompt', 'videoModel']);
  for (const key of Object.keys(request)) if (prohibitedKeys.has(key)) fail('video-generation-disabled', `Flow still-image requests cannot contain video-generation field ${key}.`);
  if (typeof request.model === 'string' && /omni|veo|video/i.test(request.model)) fail('video-generation-disabled', 'Flow video-generation models are not supported.');
  if (Array.isArray(request.scenes)) for (const scene of request.scenes) {
    if (scene && typeof scene === 'object' && Object.keys(scene).some((key) => prohibitedKeys.has(key))) fail('video-generation-disabled', 'Flow scenes cannot contain video-generation instructions.');
  }
  return structuredClone(request);
}

export function validateImageComposer(composer, approvedAspectRatio = '16:9') {
  object(composer, 'Flow composer settings');
  nonEmptyString(composer.model, 'Flow composer model');
  if (!IMAGE_GENERATION_MODELS.has(composer.model)) fail('preflight', 'Flow composer model must be an approved image-generation model.');
  nonEmptyString(composer.aspectRatio, 'Flow composer aspect ratio');
  if (composer.aspectRatio !== approvedAspectRatio) fail('preflight', `Flow composer aspect ratio must remain ${approvedAspectRatio} for this approved image request.`);
  if (!Number.isInteger(composer.variants) || composer.variants < 1) fail('preflight', 'Flow composer variants must be a positive integer.');
  return structuredClone(composer);
}

function fail(code, message) { throw new ContractValidationError(code, message); }
function object(value, field) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-type', `${field} must be an object.`); return value; }
function nonEmptyString(value, field) { if (typeof value !== 'string' || !value.trim()) fail('invalid-type', `${field} must be a non-empty string.`); return value; }
function finiteNumber(value, field) { if (typeof value !== 'number' || !Number.isFinite(value)) fail('invalid-type', `${field} must be a finite number.`); return value; }
function safeId(value, field) { nonEmptyString(value, field); if (!SAFE_ID.test(value)) fail('invalid-value', `${field} must be a safe identifier.`); return value; }
function safePath(value, field) {
  nonEmptyString(value, field);
  if (/^(?:[A-Za-z]:|[\\/])/.test(value) || /[\0\r\n]/.test(value)) fail('invalid-value', `${field} must be a safe relative path.`);
  let depth = 0;
  for (const segment of value.split(/[\\/]+/)) {
    if (!segment || segment === '.') continue;
    if (segment.includes(':')) fail('invalid-value', `${field} must not contain alternate data streams or drive prefixes.`);
    if (segment === '..') { depth -= 1; if (depth < 0) fail('invalid-value', `${field} must not traverse outside the project.`); }
    else depth += 1;
  }
  return value.replaceAll('\\', '/');
}
function optionalBoolean(value, field) { if (value !== undefined && typeof value !== 'boolean') fail('invalid-type', `${field} must be boolean.`); }
function optionalEnum(value, field, values) { if (value !== undefined && !values.includes(value)) fail('invalid-value', `${field} must be one of: ${values.join(', ')}.`); }
function requiredFields(tool, request, contract) {
  const definition = contract?.tools?.[tool];
  if (!definition) fail('unknown-tool', `No pinned contract exists for ${tool}.`);
  for (const field of definition.required) if (request[field] === undefined || request[field] === null) fail('missing-required', `${tool}.${field} is required.`);
  const allowed = new Set([...definition.required, ...(definition.optional ?? [])]);
  for (const field of Object.keys(request)) if (!allowed.has(field)) fail('invalid-value', `${tool}.${field} is not part of the pinned request schema.`);
}

export function validateFlowRequest(tool, input, contract) {
  if (!FLOW_TOOLS.has(tool)) fail('unknown-tool', `Unknown Flow MCP tool: ${tool}.`);
  const request = object(input, `${tool} request`);
  requiredFields(tool, request, contract);
  if (tool === 'flow_status') optionalBoolean(request.detailed, 'flow_status.detailed');
  if (tool === 'flow_generate') {
    safeId(request.project, 'flow_generate.project');
    if (!Array.isArray(request.scenes) || request.scenes.length === 0) fail('invalid-type', 'flow_generate.scenes must be a non-empty array.');
    request.scenes.forEach((scene, index) => {
      object(scene, `flow_generate.scenes[${index}]`); exactKeys(scene, ['id', 'prompt', 'references'], `flow_generate.scenes[${index}]`); safeId(scene.id, `flow_generate.scenes[${index}].id`); nonEmptyString(scene.prompt, `flow_generate.scenes[${index}].prompt`);
      if (scene.references !== undefined) { if (!Array.isArray(scene.references)) fail('invalid-type', `flow_generate.scenes[${index}].references must be an array.`); scene.references.forEach((path, refIndex) => safePath(path, `flow_generate.scenes[${index}].references[${refIndex}]`)); }
    });
    if (request.max_credits !== undefined) { finiteNumber(request.max_credits, 'flow_generate.max_credits'); if (request.max_credits < 0) fail('invalid-value', 'flow_generate.max_credits must not be negative.'); }
    if (request.acknowledge_cost !== undefined && typeof request.acknowledge_cost !== 'boolean') fail('invalid-type', 'flow_generate.acknowledge_cost must be boolean.');
  }
  if (tool === 'flow_wait') {
    if (request.job_ids !== undefined) { if (!Array.isArray(request.job_ids) || request.job_ids.length === 0) fail('invalid-value', 'flow_wait.job_ids must be a non-empty array.'); request.job_ids.forEach((id, index) => safeId(id, `flow_wait.job_ids[${index}]`)); }
    if (request.timeout_seconds !== undefined) { finiteNumber(request.timeout_seconds, 'flow_wait.timeout_seconds'); if (request.timeout_seconds <= 0) fail('invalid-value', 'flow_wait.timeout_seconds must be positive.'); }
  }
  if (tool === 'flow_download') {
    if (!Array.isArray(request.assets) || request.assets.length === 0) fail('invalid-type', 'flow_download.assets must be a non-empty array.');
    request.assets.forEach((asset, index) => safeId(asset, `flow_download.assets[${index}]`)); safeId(request.project, 'flow_download.project'); optionalEnum(request.quality, 'flow_download.quality', ['original', 'preview']);
  }
  if (tool === 'flow_assets') optionalEnum(request.kind, 'flow_assets.kind', ['image', 'audio', 'character', 'all']);
  if (tool === 'flow_transcribe') { safePath(request.video, 'flow_transcribe.video'); if (request.language !== undefined) nonEmptyString(request.language, 'flow_transcribe.language'); optionalBoolean(request.words, 'flow_transcribe.words'); }
  return structuredClone(request);
}

function validateChecksum(value, field) { nonEmptyString(value, field); if (!CHECKSUM.test(value)) fail('malformed-response', `${field} must be sha256 followed by 64 lowercase hexadecimal characters.`); }
function exactKeys(value, allowed, field) { for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('malformed-response', `${field}.${key} is not declared by the pinned response envelope.`); }
function verifyLocalChecksum(file, checksum, localFiles) {
  const localPath = localFiles?.[file.assetId];
  if (!localPath) return;
  let actual;
  try { actual = `sha256:${createHash('sha256').update(readFileSync(localPath)).digest('hex')}`; } catch { fail('malformed-response', `local file for ${file.assetId} could not be read.`); }
  if (actual !== checksum) fail('malformed-response', `local file checksum does not match ${file.assetId}.`);
}

export function validateFlowResponse(tool, input, contract, { localFiles = {} } = {}) {
  if (!FLOW_TOOLS.has(tool)) fail('unknown-tool', `Unknown Flow MCP tool: ${tool}.`);
  if (!contract?.tools?.[tool]) fail('unknown-tool', `No pinned contract exists for ${tool}.`);
  const response = object(input, `${tool} response`);
  if (response.ok !== true) fail('malformed-response', `${tool} response must have ok=true.`);
  if (tool === 'flow_status') { exactKeys(response, ['ok', 'signedIn', 'inProject', 'credits', 'project'], tool); if (typeof response.signedIn !== 'boolean' || typeof response.inProject !== 'boolean') fail('malformed-response', 'flow_status response is missing account state.'); finiteNumber(response.credits, 'flow_status.credits'); if (response.credits < 0) fail('malformed-response', 'flow_status.credits must not be negative.'); safeId(response.project, 'flow_status.project'); }
  if (tool === 'flow_generate' || tool === 'flow_wait') { exactKeys(response, tool === 'flow_wait' ? ['ok', 'finished', 'jobs'] : ['ok', 'jobs'], tool); if (!Array.isArray(response.jobs)) fail('malformed-response', `${tool}.jobs must be an array.`); response.jobs.forEach((job) => { object(job, `${tool}.jobs[]`); exactKeys(job, ['id', 'status'], `${tool}.jobs[]`); safeId(job.id, `${tool}.jobs[].id`); nonEmptyString(job.status, `${tool}.jobs[].status`); }); if (tool === 'flow_wait' && typeof response.finished !== 'boolean') fail('malformed-response', 'flow_wait.finished must be boolean.'); }
  if (tool === 'flow_download') { exactKeys(response, ['ok', 'files'], tool); if (!Array.isArray(response.files)) fail('malformed-response', 'flow_download.files must be an array.'); response.files.forEach((file) => { object(file, 'flow_download.files[]'); exactKeys(file, ['path', 'assetId', 'checksum'], 'flow_download.files[]'); safePath(file.path, 'flow_download.files[].path'); if (/\.(?:mp4|webm|mov|mkv)$/i.test(file.path)) fail('video-generation-disabled', 'Flow downloads may contain still images only.'); safeId(file.assetId, 'flow_download.files[].assetId'); validateChecksum(file.checksum, 'flow_download.files[].checksum'); verifyLocalChecksum(file, file.checksum, localFiles); }); }
  if (tool === 'flow_assets') { exactKeys(response, ['ok', 'assets'], tool); if (!Array.isArray(response.assets)) fail('malformed-response', 'flow_assets.assets must be an array.'); response.assets.forEach((asset) => { object(asset, 'flow_assets.assets[]'); exactKeys(asset, ['id', 'title', 'kind', 'checksum', 'path'], 'flow_assets.assets[]'); safeId(asset.id, 'flow_assets.assets[].id'); nonEmptyString(asset.title, 'flow_assets.assets[].title'); nonEmptyString(asset.kind, 'flow_assets.assets[].kind'); if (asset.kind === 'video') fail('video-generation-disabled', 'Flow assets may contain still images only.'); validateChecksum(asset.checksum, 'flow_assets.assets[].checksum'); if (asset.path !== undefined) safePath(asset.path, 'flow_assets.assets[].path'); }); }
  if (tool === 'flow_transcribe') { exactKeys(response, ['ok', 'words'], tool); if (!Array.isArray(response.words)) fail('malformed-response', 'flow_transcribe.words must be an array.'); response.words.forEach((word) => { object(word, 'flow_transcribe.words[]'); exactKeys(word, ['text', 'start', 'end'], 'flow_transcribe.words[]'); nonEmptyString(word.text, 'flow_transcribe.words[].text'); finiteNumber(word.start, 'flow_transcribe.words[].start'); if (word.end !== undefined) finiteNumber(word.end, 'flow_transcribe.words[].end'); }); }
  if (tool === 'flow_voices') { exactKeys(response, ['ok', 'gemini_ready', 'voices'], tool); if (typeof response.gemini_ready !== 'boolean' || !Array.isArray(response.voices)) fail('malformed-response', 'flow_voices response is incomplete.'); response.voices.forEach((voice) => { object(voice, 'flow_voices.voices[]'); exactKeys(voice, ['id', 'name'], 'flow_voices.voices[]'); safeId(voice.id, 'flow_voices.voices[].id'); nonEmptyString(voice.name, 'flow_voices.voices[].name'); }); }
  return structuredClone(response);
}

export function validateFlowError(input) {
  const error = object(input, 'Flow error');
  if (!['validation', 'protocol', 'timeout', 'rate-limit', 'partial-output', 'pending', 'provider'].includes(error.kind)) fail('invalid-error', 'Flow error kind is not supported.');
  if (typeof error.retryable !== 'boolean') fail('invalid-error', 'Flow error retryable must be boolean.');
  return { kind: error.kind, retryable: error.retryable, safeMessage: redactSecrets(nonEmptyString(error.safeMessage, 'Flow error safeMessage')) };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function hash(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
export function flowRequestHash(request, composer) {
  const safeFramingHash = composer.safeFramingHash === undefined ? undefined : nonEmptyString(composer.safeFramingHash, 'Flow composer safe-framing hash');
  if (safeFramingHash !== undefined && !/^sha256:[a-f0-9]{64}$/.test(safeFramingHash)) fail('preflight', 'Flow composer safe-framing hash must be a SHA-256 digest.');
  return hash({ request, model: composer.model, aspectRatio: composer.aspectRatio, variants: composer.variants,
    ...(safeFramingHash !== undefined ? { safeFramingHash } : {}),
  });
}
export function flowQuoteHash(quote) { return hash({ currency: quote.currency, perOutput: quote.perOutput, total: quote.total, outputs: quote.outputs }); }

export function preflightFlowGeneration({ status, request, composer, entitlement, quote, approval } = {}) {
  object(status, 'Flow status'); if (status.signedIn !== true) fail('preflight', 'Flow account is not signed in.'); if (status.inProject !== true) fail('preflight', 'Flow project is not active.'); finiteNumber(status.credits, 'Flow status credits');
  validateStillImageGenerationRequest(request);
  validateFlowRequest('flow_generate', request, { tools: { flow_generate: { required: ['project', 'scenes'], optional: ['max_credits', 'acknowledge_cost'] } } });
  safeId(status.project, 'Flow status project'); if (status.project !== request.project) fail('preflight', 'Flow status project does not match the requested project.');
  if (request.acknowledge_cost !== true) fail('preflight', 'Flow generation requires explicit acknowledge_cost=true.');
  validateImageComposer(composer);
  object(entitlement, 'Flow entitlement'); if (entitlement.provider !== 'flow' || entitlement.available !== true) fail('preflight', 'Flow entitlement is unavailable.');
  object(quote, 'Flow quote'); if (quote.currency !== 'flow-credits') fail('preflight', 'Flow quote currency is missing or unsupported.'); for (const field of ['perOutput', 'total', 'outputs']) finiteNumber(quote[field], `Flow quote ${field}`); const expectedOutputs = request.scenes.length * composer.variants;
  if (quote.perOutput < 0 || quote.total < 0 || !Number.isInteger(quote.outputs) || quote.outputs < 1 || quote.outputs !== expectedOutputs || quote.total !== quote.perOutput * quote.outputs) fail('preflight', 'Flow quote must be finite, nonnegative, and exactly match the requested outputs.');
  object(approval, 'Flow approval'); const requestHash = flowRequestHash(request, composer); const quoteHash = flowQuoteHash(quote);
  if (approval.approved !== true || approval.requestHash !== requestHash || approval.quoteHash !== quoteHash) fail('preflight', 'Flow request, quote, or composer consent changed.');
  finiteNumber(request.max_credits, 'flow_generate.max_credits'); if (quote.total > request.max_credits) fail('preflight', 'Flow quote exceeds max_credits.'); if (quote.total > status.credits) fail('preflight', 'Flow account lacks enough credits for the quote.');
  return { provider: 'flow', model: composer.model, aspectRatio: composer.aspectRatio, outputs: expectedOutputs, totalCredits: quote.total, requestHash, quoteHash, ...(composer.safeFramingHash ? { safeFramingHash: composer.safeFramingHash } : {}) };
}

export function prepareFlowRetry({ error, readback, failedShotIds, shotId, consented, previousRetries = [], request } = {}) {
  if (request !== undefined) validateStillImageGenerationRequest(request);
  const normalized = validateFlowError(error); if (normalized.retryable !== true || !['timeout', 'rate-limit', 'partial-output'].includes(normalized.kind)) fail('retry-blocked', 'Flow retry requires a terminal retryable failure.');
  if (!readback?.stateChecked || !readback.assetsChecked || !['failed', 'partial'].includes(readback.jobStatus)) fail('retry-blocked', 'Flow retry requires read-back state and assets.');
  if (consented !== true || !Array.isArray(failedShotIds) || !failedShotIds.includes(shotId)) fail('retry-blocked', 'Flow retry requires explicit consent for a failed shot ID.');
  if (previousRetries.includes(shotId)) fail('retry-blocked', 'Flow retry is already recorded for this shot ID.');
  return { shotId, status: 'retry-authorized' };
}

function validateGeminiInputs({ model, voice, transcript, entitlement, billingApproved }) {
  nonEmptyString(model, 'Gemini TTS model'); if (!GEMINI_TTS_MODELS.has(model)) fail('consent', 'Gemini TTS model is not approved.'); nonEmptyString(voice, 'Gemini TTS voice'); nonEmptyString(transcript, 'Gemini TTS transcript'); object(entitlement, 'Gemini TTS entitlement'); if (entitlement.provider !== 'gemini-tts' || entitlement.available !== true) fail('consent', 'Gemini TTS entitlement is unavailable.'); for (const field of ['accountId', 'source', 'billingAccountId', 'billingProfile']) nonEmptyString(entitlement[field], `Gemini TTS entitlement ${field}`); if (billingApproved !== true) fail('consent', 'Gemini TTS billing approval is required.');
}
function entitlementHash(entitlement) { return hash({ provider: entitlement.provider, accountId: entitlement.accountId, source: entitlement.source, available: entitlement.available, billingAccountId: entitlement.billingAccountId, billingProfile: entitlement.billingProfile }); }
export function createGeminiTtsConsent({ model, voice, transcript, entitlement, billingApproved } = {}) { validateGeminiInputs({ model, voice, transcript, entitlement, billingApproved }); return { schemaVersion: 1, provider: 'gemini-tts', model, voice, transcript, transcriptHash: hash(transcript), entitlement: structuredClone(entitlement), entitlementHash: entitlementHash(entitlement), billingApproved: true, consented: false, network: 'not-called' }; }
export function approveGeminiTtsConsent(state, current) { object(state, 'Gemini TTS consent state'); validateGeminiInputs(current); if (state.model !== current.model || state.voice !== current.voice || state.transcriptHash !== hash(current.transcript) || state.entitlementHash !== entitlementHash(current.entitlement)) fail('consent', 'Gemini TTS consent must be renewed after a model, voice, transcript, entitlement, or billing identity change.'); return { ...structuredClone(state), model: current.model, voice: current.voice, transcript: current.transcript, transcriptHash: hash(current.transcript), entitlement: structuredClone(current.entitlement), entitlementHash: entitlementHash(current.entitlement), consented: true, billingApproved: true, network: 'not-called' }; }

function redactString(value) { return SECRET_VALUE.test(value) ? '[REDACTED]' : value; }
export function redactSecrets(value, key = '') { if (Array.isArray(value)) return value.map((item) => redactSecrets(item)); if (typeof value === 'string') return SECRET_KEY.test(key) || SECRET_VALUE.test(value) ? '[REDACTED]' : redactString(value); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, SECRET_KEY.test(name) ? '[REDACTED]' : redactSecrets(item, name)])); }
