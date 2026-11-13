import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { answerGuidedChoice, advanceGuidedStage, approveGuidedStage, createGuidedProducer } from './producer-session.mjs';
import { createProductionState, dependencyHash, loadProductionState, recordProductionAttempt, reconcileProductionState, requestSafeShotRetry, saveProductionState } from './production-state.mjs';
import { renderEpisode } from './render-episode.mjs';

const run = promisify(execFile);

async function fileHash(file) {
  return `sha256:${createHash('sha256').update(await readFile(file)).digest('hex')}`;
}

async function fileHashIfPresent(file) {
  try { return await fileHash(file); } catch { return null; }
}

async function videoFrameRate(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'json', file]);
  const value = JSON.parse(stdout).streams?.[0]?.r_frame_rate;
  const [numerator, denominator] = String(value).split('/').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) throw new Error('Synthetic output has no valid video frame rate.');
  return numerator / denominator;
}

function completeOfflineGuidedSession(session) {
  const stages = [
    ['entry', [['source', 'topic']]],
    ['preferences', [['duration', 'standard'], ['audience', 'general'], ['tone', 'curious'], ['language', 'en'], ['aspectRatio', '16:9'], ['visualStyle', 'illustrated-stickman'], ['imageCountMode', 'recommended'], ['pace', 'cinematic']]],
    ['script', [['scriptMode', 'draft']]],
    ['references', [['referenceMode', 'reuse-approved']]],
    ['storyboard', [['storyboardMode', 'manual']]],
    ['providers', [['provider.image', 'manual'], ['provider.voice', 'manual'], ['provider.storyboard', 'manual']]],
    ['approvals', []],
  ];
  let next = session;
  for (const [stage, answers] of stages) {
    for (const [questionId, value] of answers) next = answerGuidedChoice(next, questionId, value);
    next = approveGuidedStage(next, stage);
    if (stage !== 'approvals') next = advanceGuidedStage(next);
  }
  return next;
}

export function evaluateOfflineRelease({ humanCreativeApproval = false, dependencyInvalidated = false, assetsReady = true } = {}) {
  if (dependencyInvalidated) return { approved: false, reason: 'dependency-invalidated', published: false };
  if (!assetsReady) return { approved: false, reason: 'missing-assets', published: false };
  if (humanCreativeApproval !== true) return { approved: false, reason: 'human-creative-approval-required', published: false };
  return { approved: true, reason: 'human-creative-approved', published: false };
}

async function createSyntheticAssets(root, sceneCount, sceneDurationSeconds) {
  const imageDir = path.join(root, 'images');
  const narrationDir = path.join(root, 'narration');
  await mkdir(imageDir, { recursive: true });
  await mkdir(narrationDir, { recursive: true });
  const colors = ['darkgreen', 'midnightblue', 'darkslategray', 'indigo', 'teal'];
  const images = [];
  for (let index = 0; index < sceneCount; index += 1) {
    const file = path.join(imageDir, `scene-${String(index + 1).padStart(2, '0')}.png`);
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${colors[index % colors.length]}:s=640x360:d=${sceneDurationSeconds}`, '-frames:v', '1', file]);
    images.push(file);
  }
  const duration = sceneCount * sceneDurationSeconds;
  const audio = path.join(narrationDir, 'episode.wav');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${duration}`, '-ar', '48000', '-ac', '1', audio]);
  return { images, audio, duration };
}

function buildManifest({ episodeId, topic, images, audio, sceneDurationSeconds }) {
  const root = path.dirname(path.dirname(images[0]));
  return {
    schemaVersion: 1,
    episodeId,
    title: topic,
    topic,
    description: 'Synthetic offline Producer E2E fixture.',
    targetAudience: 'Test',
    intendedDurationSeconds: images.length * sceneDurationSeconds,
    output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9', path: 'exports/offline-e2e.mp4' },
    references: { characters: [], props: [], environments: [] },
    audio: { path: path.relative(root, audio).replaceAll(path.sep, '/') },
    captions: { timingSource: 'manual' },
    scenes: images.map((image, index) => ({
      id: `synthetic-scene-${String(index + 1).padStart(2, '0')}`,
      order: index + 1,
      image: path.relative(root, image).replaceAll(path.sep, '/'),
      durationSeconds: sceneDurationSeconds,
      narration: `${topic} scene ${index + 1}`,
      captions: [{ startSeconds: 0.1, endSeconds: Math.min(0.6, sceneDurationSeconds - 0.1), text: `${topic} scene ${index + 1}` }],
      references: [],
      generationStatus: 'generated-offline-synthetic',
      reviewStatus: 'not-reviewed',
      model: 'offline-synthetic',
      provenance: { mode: 'offline-synthetic', billable: false },
    })),
  };
}

export async function runOfflineProducerE2E({ episodeId = 'offline-e2e', sceneCount = 3, sceneDurationSeconds = 0.8, topic = 'Synthetic offline QA', simulateCrashAt, dependencyChanged, missingScene, retryShot, humanCreativeApproval = false } = {}) {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) throw new Error('sceneCount must be a positive integer.');
  if (!Number.isFinite(sceneDurationSeconds) || sceneDurationSeconds <= 0.2) throw new Error('sceneDurationSeconds must be greater than 0.2.');
  if (retryShot !== undefined && (!Number.isInteger(retryShot) || retryShot < 1 || retryShot > sceneCount)) throw new Error('retryShot must identify an existing scene.');
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-producer-e2e-'));
  try {
    const { images, audio, duration } = await createSyntheticAssets(root, sceneCount, sceneDurationSeconds);
    const manifest = buildManifest({ episodeId, topic, images, audio, sceneDurationSeconds });
    await writeFile(path.join(root, 'episode.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    if (missingScene !== undefined) await rm(images[missingScene - 1], { force: true });

    const guided = completeOfflineGuidedSession(createGuidedProducer({ episodeId, providerEntitlements: [{ providerId: 'manual', available: true, source: 'offline' }] }));
    let checkpoint = createProductionState(episodeId);
    const imageDependencyHash = dependencyHash({ model: 'offline-synthetic', aspectRatio: '16:9', sceneCount });
    const receipts = [];
    for (let index = 0; index < images.length; index += 1) receipts.push({
      idempotencyKey: `${episodeId}:image:${index + 1}`,
      stage: 'images',
      shotId: manifest.scenes[index].id,
      mode: 'offline-synthetic',
      provider: 'manual',
      model: 'offline-synthetic',
      path: images[index],
      artifactHash: await fileHashIfPresent(images[index]),
      billable: false,
      dependencyHash: imageDependencyHash,
    });
    receipts.push({ idempotencyKey: `${episodeId}:audio`, stage: 'audio', mode: 'offline-synthetic', provider: 'manual', model: 'offline-synthetic', path: audio, artifactHash: await fileHash(audio), billable: false });
    const receiptRecords = [];
    for (const receipt of receipts) {
      if (retryShot !== undefined && receipt.shotId === manifest.scenes[retryShot - 1]?.id) {
        checkpoint = recordProductionAttempt(checkpoint, receipt.stage, { ...receipt, status: 'failed', error: 'synthetic timeout', artifact: receipt.path });
        receiptRecords.push({ ...receipt, status: 'failed', error: 'synthetic timeout' });
        checkpoint.shots = { ...(checkpoint.shots ?? {}), [receipt.shotId]: { status: 'failed', artifactHash: receipt.artifactHash } };
        checkpoint = requestSafeShotRetry(checkpoint, { shotId: receipt.shotId, consented: true, receiptReadback: { status: 'failed', idempotencyKey: receipt.idempotencyKey }, assetReadback: { status: 'missing', path: receipt.path } });
        const retry = { ...receipt, idempotencyKey: `${receipt.idempotencyKey}:retry`, status: 'generated', retryOf: receipt.idempotencyKey, receiptReadback: { status: 'failed', idempotencyKey: receipt.idempotencyKey }, assetReadback: { status: 'missing', path: receipt.path } };
        checkpoint = recordProductionAttempt(checkpoint, receipt.stage, { ...retry, artifact: receipt.path });
        receiptRecords.push(retry);
      } else {
        checkpoint = recordProductionAttempt(checkpoint, receipt.stage, { ...receipt, status: 'generated', artifact: receipt.path });
        receiptRecords.push({ ...receipt, status: 'generated' });
      }
    }
    if (dependencyChanged) checkpoint = reconcileProductionState(checkpoint, { images: dependencyHash({ model: dependencyChanged === 'ratio' ? 'offline-synthetic' : 'changed-offline-synthetic', aspectRatio: dependencyChanged === 'ratio' ? '9:16' : '16:9', sceneCount }) });
    checkpoint = recordProductionAttempt(checkpoint, 'captions', { idempotencyKey: `${episodeId}:captions`, status: 'generated', artifact: path.join(root, 'captions', `${episodeId}.srt`), mode: 'offline-synthetic', billable: false });
    const statePath = path.join(root, 'production-state.json');
    await saveProductionState(statePath, checkpoint);
    let recovered = false;
    if (simulateCrashAt === 'after-checkpoint') {
      await saveProductionState(statePath, checkpoint);
      await writeFile(statePath, '{ interrupted checkpoint');
      checkpoint = await loadProductionState(statePath);
      recovered = true;
    }
    const release = evaluateOfflineRelease({ humanCreativeApproval, dependencyInvalidated: Boolean(dependencyChanged) });
    if (dependencyChanged) {
      await saveProductionState(statePath, checkpoint);
      return { root, guided, checkpoint: JSON.parse(await readFile(statePath, 'utf8')), output: null, captions: null, receipts: receiptRecords, duration, recovered, release };
    }
    const output = await renderEpisode(root, undefined);
    output.verification.frameRate = await videoFrameRate(output.out);
    checkpoint = recordProductionAttempt(checkpoint, 'rendering', { idempotencyKey: `${episodeId}:render`, status: 'generated', artifact: output.out, mode: 'offline-synthetic', billable: false });
    await saveProductionState(statePath, checkpoint);
    return {
      root,
      guided,
      checkpoint: JSON.parse(await readFile(statePath, 'utf8')),
      output,
      captions: output.srtPath,
      receipts: receiptRecords,
      duration,
      recovered,
      release,
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
