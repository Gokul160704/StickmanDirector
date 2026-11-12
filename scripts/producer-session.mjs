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
} from './producer-contract.mjs';

export const GUIDED_QUESTIONS = [
  { id: 'source', stage: 'entry', choices: ['topic', 'script', 'article', 'existing-episode'] },
  { id: 'duration', stage: 'preferences', choices: ['short', 'standard', 'long'] },
  { id: 'audience', stage: 'preferences', choices: ['children', 'general', 'professional'] },
  { id: 'tone', stage: 'preferences', choices: ['curious', 'warm', 'dramatic', 'playful'] },
  { id: 'language', stage: 'preferences', choices: ['en', 'hi', 'other'] },
  { id: 'aspectRatio', stage: 'preferences', choices: ['16:9', '9:16', '1:1'] },
  { id: 'visualStyle', stage: 'preferences', choices: ['illustrated-stickman', 'minimal', 'storybook'] },
  { id: 'scriptMode', stage: 'script', choices: ['draft', 'existing-script'] },
  { id: 'referenceMode', stage: 'references', choices: ['new', 'reuse-approved'] },
  { id: 'storyboardMode', stage: 'storyboard', choices: ['manual', 'boords-review'] },
  { id: 'provider.image', stage: 'providers', choices: ['manual', 'flow'] },
  { id: 'provider.voice', stage: 'providers', choices: ['manual', 'gemini-tts'] },
  { id: 'provider.storyboard', stage: 'providers', choices: ['manual', 'boords'] },
];

export const DEFAULT_PROVIDER_CATALOG = [
  { id: 'manual', documented: true, kind: 'offline-fallback' },
  { id: 'flow', documented: true, kind: 'image' },
  { id: 'gemini-tts', documented: true, kind: 'voice' },
  { id: 'boords', documented: true, kind: 'storyboard' },
];

const questionFor = (id) => GUIDED_QUESTIONS.find((question) => question.id === id);

function requireChoice(id, value) {
  const question = questionFor(id);
  if (!question) throw new Error(`Unknown guided question: ${id}.`);
  if (!question.choices.includes(value)) throw new Error(`Invalid choice for ${id}: ${value}.`);
  return question;
}

function requireShotId(shotId) {
  if (typeof shotId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(shotId)) throw new Error('shotId must be a safe identifier.');
}

function withNextHumanAction(session) {
  const question = getNextQuestion(session);
  session.nextHumanAction = question
    ? { type: 'answer-question', questionId: question.id }
    : { type: 'approve-stage', stage: session.stage };
  return session;
}

export function createGuidedProducer({ episodeId, providerCatalog = DEFAULT_PROVIDER_CATALOG, providerEntitlements = [] } = {}) {
  if (!Array.isArray(providerEntitlements)) throw new Error('providerEntitlements must be an array.');
  const session = createProducerSession({ episodeId, providerCatalog });
  session.providerEntitlements = structuredClone(providerEntitlements);
  session.regenerationRequests = [];
  return withNextHumanAction(session);
}

export function getNextQuestion(session) {
  const question = GUIDED_QUESTIONS.find((candidate) => candidate.stage === session.stage && session.answers[candidate.id] === undefined);
  return question ? structuredClone(question) : null;
}

export function answerGuidedChoice(session, questionId, value) {
  const question = requireChoice(questionId, value);
  if (question.stage !== session.stage) throw new Error(`Question ${questionId} is not part of the current stage ${session.stage}.`);
  if (question.stage === 'providers') return selectGuidedProvider(session, questionId, value);
  const next = answerQuestion(session, questionId, value);
  return withNextHumanAction(next);
}

export function advanceGuidedStage(session) {
  const missing = GUIDED_QUESTIONS.filter((question) => question.stage === session.stage && session.answers[question.id] === undefined);
  if (missing.length) throw new Error(`Cannot advance from ${session.stage}; answer ${missing[0].id} first.`);
  const nextStage = STAGES[STAGES.indexOf(session.stage) + 1];
  const next = advanceStage(session, nextStage);
  return withNextHumanAction(next);
}

export function approveGuidedStage(session, stage) {
  const missing = GUIDED_QUESTIONS.filter((question) => question.stage === stage && session.answers[question.id] === undefined);
  if (missing.length) throw new Error(`Cannot approve ${stage}; answer ${missing[0].id} first.`);
  return withNextHumanAction(approveStage(session, stage));
}

export function editGuidedChoice(session, questionId, value) {
  const question = requireChoice(questionId, value);
  if (question.stage !== session.stage) throw new Error(`Question ${questionId} is not part of the current stage ${session.stage}.`);
  if (question.stage === 'providers') return selectGuidedProvider(session, questionId, value);
  return withNextHumanAction(answerQuestion(session, questionId, value));
}

export function goBackGuidedStage(session, targetStage) {
  return withNextHumanAction(goBack(session, targetStage));
}

export function invalidateGuidedStage(session, stage, reason) {
  return withNextHumanAction(invalidateFrom(session, stage, reason));
}

export function saveGuidedProducer(session) {
  return JSON.stringify(session);
}

export function resumeGuidedProducer(saved) {
  const raw = typeof saved === 'string' ? JSON.parse(saved) : saved;
  return resumeProducerSession(raw);
}

export function selectGuidedProvider(session, questionId, providerId, entitlements = session.providerEntitlements) {
  const question = questionFor(questionId);
  if (!question || question.stage !== 'providers') throw new Error(`Unknown provider question: ${questionId}.`);
  if (session.stage !== 'providers') throw new Error(`Provider choices are only available during the providers stage, not ${session.stage}.`);
  if (!question.choices.includes(providerId)) throw new Error(`Invalid choice for ${questionId}: ${providerId}.`);
  const effectiveEntitlements = providerId === 'manual'
    ? [...entitlements, { providerId: 'manual', available: true, source: 'offline' }]
    : entitlements;
  const selected = resolveProviderChoice({ providerId, catalog: session.providerCatalog, entitlements: effectiveEntitlements });
  const next = answerQuestion(session, questionId, selected.providerId);
  next.providerEntitlements = structuredClone(entitlements);
  return withNextHumanAction(next);
}

export function regenerateSelectedShot(session, shotId) {
  requireShotId(shotId);
  const next = structuredClone(session);
  next.regenerationRequests ??= [];
  if (next.regenerationRequests.some((request) => request.shotId === shotId && request.status === 'awaiting-approval')) {
    throw new Error(`Shot ${shotId} already has a regeneration request awaiting approval.`);
  }
  next.regenerationRequests.push({ shotId, status: 'awaiting-approval' });
  next.nextHumanAction = { type: 'approve-shot-regeneration', shotId };
  return next;
}

export function manualFallback() {
  return [
    'Manual Guided Producer fallback (offline; no provider calls).',
    'Choose one entry: topic, script, article, existing-episode.',
    'Record duration, audience, tone, language, aspect ratio, and visual style.',
    'Record provider choices separately from active entitlement: image, voice, storyboard.',
    'Use Back, Edit, Save, Resume, explicit invalidation, and selected-shot regeneration approval.',
    'Unavailable Boords, Flow, or TTS stays manual and incomplete until a human-approved path is available.',
  ].join('\n');
}
