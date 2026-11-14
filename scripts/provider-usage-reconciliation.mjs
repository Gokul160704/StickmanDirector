function numeric(value) { return Number.isFinite(value) ? value : null; }

export function classifyCloudflareFailure(error = {}) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? 0);
  const code = Number(error?.code ?? error?.providerCode ?? error?.response?.code ?? 0);
  if (status === 429 && code === 3040) return { classification: 'capacity-blocked', retry: false, unknownOutcome: false };
  if (status === 429) return { classification: 'quota-blocked', retry: false, unknownOutcome: false };
  if (status === 410 || code === 5028) return { classification: 'model-retired', retry: false, unknownOutcome: false };
  if (status >= 500 || status === 408 || /timeout|network|connection/i.test(String(error?.message ?? error))) return { classification: 'unknown-after-dispatch', retry: false, unknownOutcome: true };
  if (status >= 400) return { classification: 'provider-rejected', retry: false, unknownOutcome: false };
  return { classification: 'unknown-after-dispatch', retry: false, unknownOutcome: true };
}

export function reconcileProviderUsage({ quotedNeurons, reportedNeurons, dashboardAggregate } = {}) {
  if (!Number.isFinite(quotedNeurons) || quotedNeurons < 0) throw new Error('Quoted neurons must be a finite non-negative number.');
  const actual = numeric(reportedNeurons);
  if (Number.isFinite(dashboardAggregate) && actual === null) return { status: 'unknown', actualNeurons: null, estimatedNeurons: quotedNeurons, overQuote: false, attribution: 'aggregate-only' };
  if (actual === null) return { status: 'unreported', actualNeurons: null, estimatedNeurons: quotedNeurons, overQuote: false, attribution: 'per-request-unreported' };
  return { status: 'reported', actualNeurons: actual, estimatedNeurons: quotedNeurons, overQuote: actual > quotedNeurons, attribution: 'per-request-reported' };
}

export function assertCloudflarePreflight({ estimatedNeurons, remainingNeurons, paidOverageAllowed, approvalId, quoteHash } = {}) {
  if (!Number.isFinite(estimatedNeurons) || estimatedNeurons < 0) throw new Error('Cloudflare preflight requires a finite neuron estimate.');
  if (!Number.isFinite(remainingNeurons) || remainingNeurons < estimatedNeurons) throw new Error('Cloudflare preflight quota is insufficient or unverified.');
  if (paidOverageAllowed !== false) throw new Error('Cloudflare preflight requires paid overage to be prohibited.');
  if (typeof approvalId !== 'string' || !approvalId.trim()) throw new Error('Cloudflare preflight requires exact approval provenance.');
  if (typeof quoteHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(quoteHash)) throw new Error('Cloudflare preflight requires a verified quote hash.');
  return true;
}
