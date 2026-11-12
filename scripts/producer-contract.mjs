export const STAGES = [
  'entry',
  'preferences',
  'script',
  'references',
  'storyboard',
  'providers',
  'approvals',
];

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function copy(value) {
  return structuredClone(value);
}

function assertStage(stage) {
  if (!STAGES.includes(stage)) throw new Error(`Unknown producer stage: ${stage}`);
}

function assertSession(session) {
  if (!session || typeof session !== 'object' || Array.isArray(session)) throw new Error('Producer session must be an object.');
  if (session.schemaVersion !== 1) throw new Error('Producer session schemaVersion must be 1.');
  if (typeof session.episodeId !== 'string' || !SAFE_ID.test(session.episodeId)) throw new Error('Producer session episodeId must be a safe identifier.');
  assertStage(session.stage);
  if (!session.answers || typeof session.answers !== 'object' || Array.isArray(session.answers)) throw new Error('Producer session answers must be an object.');
  if (!session.approvedStages || typeof session.approvedStages !== 'object' || Array.isArray(session.approvedStages)) throw new Error('Producer session approvedStages must be an object.');
  if (!Array.isArray(session.invalidations)) throw new Error('Producer session invalidations must be an array.');
}

export function createProducerSession({ episodeId, providerCatalog = [] } = {}) {
  if (typeof episodeId !== 'string' || !SAFE_ID.test(episodeId)) throw new Error('episodeId must be a safe identifier.');
  if (!Array.isArray(providerCatalog)) throw new Error('providerCatalog must be an array.');
  return {
    schemaVersion: 1,
    episodeId,
    stage: STAGES[0],
    revision: 0,
    answers: {},
    approvedStages: {},
    invalidations: [],
    providerCatalog: copy(providerCatalog),
    providerEntitlements: [],
  };
}

export function answerQuestion(session, questionId, value) {
  assertSession(session);
  if (typeof questionId !== 'string' || !questionId.trim()) throw new Error('questionId must be non-empty.');
  if (value === undefined) throw new Error('answer value is required.');
  const next = copy(session);
  next.answers[questionId.trim()] = copy(value);
  next.revision += 1;
  return next;
}

export function advanceStage(session, nextStage) {
  assertSession(session);
  assertStage(nextStage);
  const currentIndex = STAGES.indexOf(session.stage);
  if (STAGES.indexOf(nextStage) !== currentIndex + 1) throw new Error(`Cannot advance from ${session.stage} to ${nextStage}; transitions must move forward exactly one step.`);
  const next = copy(session);
  next.stage = nextStage;
  next.revision += 1;
  return next;
}

export function approveStage(session, stage) {
  assertSession(session);
  assertStage(stage);
  if (stage !== session.stage) throw new Error(`Cannot approve ${stage} while the current stage is ${session.stage}.`);
  const next = copy(session);
  next.approvedStages[stage] = { revision: next.revision + 1 };
  next.revision += 1;
  return next;
}

export function goBack(session, targetStage) {
  assertSession(session);
  assertStage(targetStage);
  if (STAGES.indexOf(targetStage) >= STAGES.indexOf(session.stage)) throw new Error(`Cannot go back from ${session.stage} to ${targetStage}.`);
  const next = copy(session);
  next.stage = targetStage;
  next.revision += 1;
  return next;
}

export function invalidateFrom(session, stage, reason) {
  assertSession(session);
  assertStage(stage);
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('Invalidation reason must be non-empty.');
  const next = copy(session);
  const from = STAGES.indexOf(stage);
  for (const approved of Object.keys(next.approvedStages)) {
    if (STAGES.indexOf(approved) >= from) delete next.approvedStages[approved];
  }
  next.stage = stage;
  next.revision += 1;
  next.invalidations.push({ stage, reason: reason.trim(), revision: next.revision });
  return next;
}

export function resumeProducerSession(raw) {
  const session = copy(raw);
  assertSession(session);
  if (!Array.isArray(session.providerCatalog) || !Array.isArray(session.providerEntitlements)) throw new Error('Producer session provider records must be arrays.');
  return session;
}

export function resolveProviderChoice({ providerId, catalog, entitlements } = {}) {
  if (typeof providerId !== 'string' || !providerId.trim()) throw new Error('providerId must be non-empty.');
  if (!Array.isArray(catalog) || !Array.isArray(entitlements)) throw new Error('Provider catalog and entitlements must be arrays.');
  const documented = catalog.find((provider) => provider?.id === providerId);
  if (!documented?.documented) throw new Error(`Provider ${providerId} is not documented.`);
  const entitlement = entitlements.find((item) => item?.providerId === providerId);
  if (!entitlement?.available) throw new Error(`Provider ${providerId} is not currently available.`);
  return {
    providerId,
    documented: true,
    available: true,
    entitlementSource: entitlement.source ?? 'account',
  };
}
