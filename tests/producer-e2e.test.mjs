import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { runOfflineProducerE2E } from '../scripts/producer-e2e.mjs';

test('runs a synthetic guided episode through local render and keeps release human-gated', async () => {
  const result = await runOfflineProducerE2E({
    episodeId: 'offline-e2e',
    sceneCount: 3,
    sceneDurationSeconds: 0.8,
    topic: 'Synthetic offline QA',
  });

  try {
    assert.equal(result.receipts.every((receipt) => receipt.mode === 'offline-synthetic'), true);
    assert.equal(result.receipts.some((receipt) => receipt.billable), false);
    assert.equal(result.output.verification.width, 1920);
    assert.equal(result.output.verification.height, 1080);
    assert.equal(result.output.verification.videoCodec, 'h264');
    assert.equal(result.output.verification.audioCodec, 'aac');
    assert.equal(result.output.verification.frameRate, 30);
    assert.equal(result.output.verification.duration, 2.4);
    const captions = await readFile(result.captions, 'utf8');
    assert.equal((captions.match(/^\d+$/gm) ?? []).length, 3);
    assert.match(captions, /Synthetic offline QA scene 1/);
    assert.match(captions, /Synthetic offline QA scene 2/);
    assert.match(captions, /Synthetic offline QA scene 3/);
    assert.deepEqual(Object.keys(result.guided.approvedStages).sort(), ['approvals', 'entry', 'preferences', 'providers', 'references', 'script', 'storyboard']);
    assert.equal(result.release.approved, false);
    assert.equal(result.release.reason, 'human-creative-approval-required');
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test('recovers a synthetic checkpoint without duplicating receipts after a forced restart', async () => {
  const result = await runOfflineProducerE2E({
    episodeId: 'offline-recovery',
    sceneCount: 2,
    sceneDurationSeconds: 0.9,
    simulateCrashAt: 'after-checkpoint',
  });

  try {
    assert.equal(result.recovered, true);
    assert.equal(new Set(result.checkpoint.attempts.map((attempt) => attempt.idempotencyKey)).size, result.checkpoint.attempts.length);
    assert.equal(result.checkpoint.attempts.filter((attempt) => attempt.stage === 'images').length, 2);
    assert.equal(result.checkpoint.attempts.every((attempt) => attempt.artifactHash || attempt.stage === 'captions' || attempt.stage === 'rendering'), true);
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test('fails closed when a dependency changes before offline release', async () => {
  const result = await runOfflineProducerE2E({
    episodeId: 'offline-invalidation',
    sceneCount: 2,
    sceneDurationSeconds: 0.9,
    dependencyChanged: true,
  });

  try {
    assert.equal(result.release.approved, false);
    assert.equal(result.release.reason, 'dependency-invalidated');
    assert.equal(result.checkpoint.stages.images.status, 'stale');
    assert.equal(result.output, null);
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test('invalidates a synthetic episode when its aspect ratio changes', async () => {
  const result = await runOfflineProducerE2E({ episodeId: 'offline-ratio', sceneCount: 2, sceneDurationSeconds: 0.9, dependencyChanged: 'ratio' });
  try {
    assert.equal(result.release.reason, 'dependency-invalidated');
    assert.equal(result.checkpoint.stages.images.status, 'stale');
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test('retries exactly one failed synthetic shot after receipt and asset read-back', async () => {
  const result = await runOfflineProducerE2E({
    episodeId: 'offline-retry',
    sceneCount: 2,
    sceneDurationSeconds: 0.9,
    retryShot: 2,
  });

  try {
    const attempts = result.checkpoint.attempts.filter((attempt) => attempt.shotId === 'synthetic-scene-02');
    assert.deepEqual(attempts.map((attempt) => attempt.status), ['failed', 'generated']);
    assert.equal(attempts[1].receiptReadback.status, 'failed');
    assert.equal(attempts[1].assetReadback.status, 'missing');
    assert.equal(result.checkpoint.retryRequests[0].consented, true);
    assert.equal(result.receipts.filter((receipt) => receipt.shotId === 'synthetic-scene-02').length, 2);
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test('accepts a separately supplied human creative decision without implying publication', async () => {
  const result = await runOfflineProducerE2E({ episodeId: 'offline-human-gate', sceneCount: 1, sceneDurationSeconds: 0.9, humanCreativeApproval: true });
  try {
    assert.equal(result.release.approved, true);
    assert.equal(result.release.published, false);
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test('rejects an offline run when a synthetic scene asset is missing', async () => {
  await assert.rejects(
    runOfflineProducerE2E({ episodeId: 'offline-missing-asset', sceneCount: 2, sceneDurationSeconds: 0.9, missingScene: 2 }),
    /Missing scene image/,
  );
});
