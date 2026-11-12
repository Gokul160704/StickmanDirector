import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createGuidedProducer } from './producer-session.mjs';
import { createProductionState, dependencyHash, loadProductionState, recordProductionAttempt, reconcileProductionState, saveProductionState } from './production-state.mjs';
import { renderEpisode } from './render-episode.mjs';

const run = promisify(execFile);

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

export async function runOfflineProducerE2E({ episodeId = 'offline-e2e', sceneCount = 3, sceneDurationSeconds = 0.8, topic = 'Synthetic offline QA', simulateCrashAt, dependencyChanged, missingScene, retryShot } = {}) {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) throw new Error('sceneCount must be a positive integer.');
  if (!Number.isFinite(sceneDurationSeconds) || sceneDurationSeconds <= 0.2) throw new Error('sceneDurationSeconds must be greater than 0.2.');
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-producer-e2e-'));
  try {
    const { images, audio, duration } = await createSyntheticAssets(root, sceneCount, sceneDurationSeconds);
    const manifest = buildManifest({ episodeId, topic, images, audio, sceneDurationSeconds });
    await writeFile(path.join(root, 'episode.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    if (missingScene !== undefined) await rm(images[missingScene - 1], { force: true });

    const guided = createGuidedProducer({ episodeId, providerEntitlements: [{ providerId: 'manual', available: true, source: 'offline' }] });
    let checkpoint = createProductionState(episodeId);
    const imageDependencyHash = dependencyHash({ model: 'offline-synthetic', aspectRatio: '16:9', sceneCount });
    const receipts = images.map((image, index) => ({
      idempotencyKey: `${episodeId}:image:${index + 1}`,
      stage: 'images',
      shotId: manifest.scenes[index].id,
      mode: 'offline-synthetic',
      provider: 'manual',
      model: 'offline-synthetic',
      path: image,
      billable: false,
      dependencyHash: imageDependencyHash,
    }));
    receipts.push({ idempotencyKey: `${episodeId}:audio`, stage: 'audio', mode: 'offline-synthetic', provider: 'manual', model: 'offline-synthetic', path: audio, billable: false });
    const receiptRecords = [];
    for (const receipt of receipts) {
      if (receipt.shotId === manifest.scenes[retryShot - 1]?.id) {
        checkpoint = recordProductionAttempt(checkpoint, receipt.stage, { ...receipt, status: 'failed', error: 'synthetic timeout', artifact: receipt.path });
        receiptRecords.push({ ...receipt, status: 'failed', error: 'synthetic timeout' });
        const retry = { ...receipt, idempotencyKey: `${receipt.idempotencyKey}:retry`, status: 'generated', retryOf: receipt.idempotencyKey, receiptReadback: { status: 'failed' }, assetReadback: { status: 'missing' } };
        checkpoint = recordProductionAttempt(checkpoint, receipt.stage, { ...retry, artifact: receipt.path });
        receiptRecords.push(retry);
      } else {
        checkpoint = recordProductionAttempt(checkpoint, receipt.stage, { ...receipt, status: 'generated', artifact: receipt.path });
        receiptRecords.push({ ...receipt, status: 'generated' });
      }
    }
    if (dependencyChanged) checkpoint = reconcileProductionState(checkpoint, { images: dependencyHash({ model: 'changed-offline-synthetic', aspectRatio: '16:9', sceneCount }) });
    checkpoint = recordProductionAttempt(checkpoint, 'captions', { idempotencyKey: `${episodeId}:captions`, status: 'generated', artifact: path.join(root, 'captions', `${episodeId}.srt`), mode: 'offline-synthetic', billable: false });
    const statePath = path.join(root, 'production-state.json');
    await saveProductionState(statePath, checkpoint);
    let recovered = false;
    if (simulateCrashAt === 'after-checkpoint') {
      checkpoint = await loadProductionState(statePath);
      recovered = true;
    }
    const output = await renderEpisode(root, undefined);
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
      release: { approved: false, reason: dependencyChanged ? 'dependency-invalidated' : 'human-creative-approval-required' },
    };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
