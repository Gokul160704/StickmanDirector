const FLOW_TOOLS = new Set([
  'flow_status',
  'flow_generate',
  'flow_wait',
  'flow_download',
  'flow_assets',
  'flow_transcribe',
  'flow_voices',
]);

const GEMINI_TTS_MODELS = new Set(['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']);
const SECRET_KEY = /api[-_]?key|authorization|cookie|access[_-]?token|secret/i;

export class ContractValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContractValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ContractValidationError(code, message);
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-type', `${field} must be an object.`);
  return value;
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail('invalid-type', `${field} must be a non-empty string.`);
  return value;
}

function finiteNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('invalid-type', `${field} must be a finite number.`);
  return value;
}

function requiredFields(tool, request, contract) {
  const definition = contract?.tools?.[tool];
  if (!definition) fail('unknown-tool', `No pinned contract exists for ${tool}.`);
  for (const field of definition.required) if (request[field] === undefined || request[field] === null) fail('missing-required', `${tool}.${field} is required.`);
}

export function validateFlowRequest(tool, input, contract) {
  if (!FLOW_TOOLS.has(tool)) fail('unknown-tool', `Unknown Flow MCP tool: ${tool}.`);
  const request = object(input, `${tool} request`);
  requiredFields(tool, request, contract);
  if (tool === 'flow_generate') {
    nonEmptyString(request.project, 'flow_generate.project');
    if (!Array.isArray(request.scenes) || request.scenes.length === 0) fail('invalid-type', 'flow_generate.scenes must be a non-empty array.');
    request.scenes.forEach((scene, index) => {
      object(scene, `flow_generate.scenes[${index}]`);
      nonEmptyString(scene.id, `flow_generate.scenes[${index}].id`);
      nonEmptyString(scene.prompt, `flow_generate.scenes[${index}].prompt`);
    });
    if (request.max_credits !== undefined) { finiteNumber(request.max_credits, 'flow_generate.max_credits'); if (request.max_credits < 0) fail('invalid-value', 'flow_generate.max_credits must not be negative.'); }
    if (request.acknowledge_cost !== undefined && typeof request.acknowledge_cost !== 'boolean') fail('invalid-type', 'flow_generate.acknowledge_cost must be boolean.');
  }
  if (tool === 'flow_download') { if (!Array.isArray(request.assets) || request.assets.length === 0) fail('invalid-type', 'flow_download.assets must be a non-empty array.'); nonEmptyString(request.project, 'flow_download.project'); }
  if (tool === 'flow_transcribe') nonEmptyString(request.video, 'flow_transcribe.video');
  if (request.timeout_seconds !== undefined) { finiteNumber(request.timeout_seconds, `${tool}.timeout_seconds`); if (request.timeout_seconds <= 0) fail('invalid-value', `${tool}.timeout_seconds must be positive.`); }
  return structuredClone(request);
}

export function validateFlowResponse(tool, input, contract) {
  if (!FLOW_TOOLS.has(tool)) fail('unknown-tool', `Unknown Flow MCP tool: ${tool}.`);
  if (!contract?.tools?.[tool]) fail('unknown-tool', `No pinned contract exists for ${tool}.`);
  const response = object(input, `${tool} response`);
  if (response.ok !== true) fail('malformed-response', `${tool} response must have ok=true.`);
  if (tool === 'flow_status') {
    if (typeof response.signedIn !== 'boolean' || typeof response.inProject !== 'boolean') fail('malformed-response', 'flow_status response is missing account state.');
    finiteNumber(response.credits, 'flow_status.credits');
  }
  if (tool === 'flow_generate' || tool === 'flow_wait') {
    if (!Array.isArray(response.jobs)) fail('malformed-response', `${tool}.jobs must be an array.`);
    response.jobs.forEach((job) => { object(job, `${tool}.jobs[]`); nonEmptyString(job.id, `${tool}.jobs[].id`); nonEmptyString(job.status, `${tool}.jobs[].status`); });
    if (tool === 'flow_wait' && typeof response.finished !== 'boolean') fail('malformed-response', 'flow_wait.finished must be boolean.');
  }
  if (tool === 'flow_download') { if (!Array.isArray(response.files)) fail('malformed-response', 'flow_download.files must be an array.'); response.files.forEach((file) => { object(file, 'flow_download.files[]'); nonEmptyString(file.path, 'flow_download.files[].path'); nonEmptyString(file.asset, 'flow_download.files[].asset'); }); }
  if (tool === 'flow_assets') { if (!Array.isArray(response.assets)) fail('malformed-response', 'flow_assets.assets must be an array.'); response.assets.forEach((asset) => { object(asset, 'flow_assets.assets[]'); nonEmptyString(asset.title, 'flow_assets.assets[].title'); nonEmptyString(asset.kind, 'flow_assets.assets[].kind'); }); }
  if (tool === 'flow_transcribe') { if (!Array.isArray(response.words)) fail('malformed-response', 'flow_transcribe.words must be an array.'); response.words.forEach((word) => { object(word, 'flow_transcribe.words[]'); if (typeof word.text !== 'string' || !word.text.trim()) fail('malformed-response', 'flow_transcribe.words[].text must be a non-empty string.'); if (typeof word.start !== 'number' || !Number.isFinite(word.start)) fail('malformed-response', 'flow_transcribe.words[].start must be a finite number.'); if (word.end !== undefined && (typeof word.end !== 'number' || !Number.isFinite(word.end))) fail('malformed-response', 'flow_transcribe.words[].end must be a finite number.'); }); }
  if (tool === 'flow_voices') { if (typeof response.gemini_ready !== 'boolean' || !Array.isArray(response.voices)) fail('malformed-response', 'flow_voices response is incomplete.'); }
  return structuredClone(response);
}

export function validateFlowError(input) {
  const error = object(input, 'Flow error');
  const allowedKinds = new Set(['validation', 'protocol', 'timeout', 'rate-limit', 'partial-output', 'provider']);
  if (!allowedKinds.has(error.kind)) fail('invalid-error', 'Flow error kind is not supported.');
  if (typeof error.retryable !== 'boolean') fail('invalid-error', 'Flow error retryable must be boolean.');
  const safeMessage = nonEmptyString(error.safeMessage, 'Flow error safeMessage');
  return { kind: error.kind, retryable: error.retryable, safeMessage };
}

export function preflightFlowGeneration({ status, request, composer, entitlement, quote, approval } = {}) {
  object(status, 'Flow status');
  if (status.signedIn !== true) fail('preflight', 'Flow account is not signed in.');
  if (status.inProject !== true) fail('preflight', 'Flow project is not active.');
  finiteNumber(status.credits, 'Flow status credits');
  validateFlowRequest('flow_generate', request, { tools: { flow_generate: { required: ['project', 'scenes'] } } });
  object(composer, 'Flow composer settings');
  nonEmptyString(composer.model, 'Flow composer model');
  nonEmptyString(composer.aspectRatio, 'Flow composer aspect ratio');
  if (!Number.isInteger(composer.variants) || composer.variants < 1) fail('preflight', 'Flow composer variants must be a positive integer.');
  object(entitlement, 'Flow entitlement');
  if (entitlement.provider !== 'flow' || entitlement.available !== true) fail('preflight', 'Flow entitlement is unavailable.');
  object(quote, 'Flow quote');
  if (quote.currency !== 'flow-credits') fail('preflight', 'Flow quote currency is missing or unsupported.');
  for (const field of ['perOutput', 'total', 'outputs']) finiteNumber(quote[field], `Flow quote ${field}`);
  const expectedOutputs = request.scenes.length * composer.variants;
  if (quote.outputs !== expectedOutputs || quote.total < 0 || quote.perOutput < 0) fail('preflight', 'Flow quote does not match the requested outputs.');
  object(approval, 'Flow approval');
  if (approval.approved !== true || approval.model !== composer.model || approval.aspectRatio !== composer.aspectRatio || approval.totalCredits !== quote.total) fail('preflight', 'Flow composer settings or approved cost changed.');
  if (request.max_credits === undefined) fail('preflight', 'Flow generation requires a maximum credit cap.');
  if (quote.total > request.max_credits) fail('preflight', 'Flow quote exceeds max_credits.');
  if (quote.total > status.credits) fail('preflight', 'Flow account lacks enough credits for the quote.');
  return { provider: 'flow', model: composer.model, aspectRatio: composer.aspectRatio, outputs: expectedOutputs, totalCredits: quote.total };
}

export function createGeminiTtsConsent({ model, voice, transcript } = {}) {
  nonEmptyString(model, 'Gemini TTS model');
  if (!GEMINI_TTS_MODELS.has(model)) fail('consent', 'Gemini TTS model is not approved.');
  nonEmptyString(voice, 'Gemini TTS voice');
  nonEmptyString(transcript, 'Gemini TTS transcript');
  return { schemaVersion: 1, provider: 'gemini-tts', model, voice, transcript, consented: false, network: 'not-called' };
}

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[REDACTED]' : redactSecrets(item)]));
}
