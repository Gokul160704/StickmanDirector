import { createHash } from 'node:crypto';
import { access, lstat, mkdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { getMediaToolConfig } from './media-tools.mjs';

const exec = promisify(execFile);
const IMAGE_WIDTH = 1920;
const IMAGE_HEIGHT = 1080;

function clone(value) { return structuredClone(value); }
function hash(value) { return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`; }
async function fileHash(file) { return `sha256:${createHash('sha256').update(await readFile(file)).digest('hex')}`; }
function requiredText(value, name) { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be non-empty.`); return value.trim(); }
function integer(value, name) { if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`); return value; }

export function createSyntheticCrossProviderFixture({ counts = [8, 36], seed = 'synthetic-cross-provider-v1', referenceBundleHash, providers = ['flow', 'cloudflare'], referenceCount = 4 } = {}) {
  if (!Array.isArray(counts) || counts.some((count) => !Number.isInteger(count) || count < 1)) throw new Error('Synthetic benchmark counts must be positive integers.');
  if (!Array.isArray(providers) || !providers.length || providers.some((provider) => !['flow', 'cloudflare'].includes(provider))) throw new Error('Synthetic benchmark providers must be Flow or Cloudflare.');
  if (!Number.isInteger(referenceCount) || referenceCount < 1 || referenceCount > 4) throw new Error('Synthetic benchmark referenceCount must be between 1 and 4.');
  referenceBundleHash = requiredText(referenceBundleHash, 'referenceBundleHash');
  const referenceHashes = ['character-1', 'prop-1', 'environment-1', 'style-1'].slice(0, referenceCount).map((id) => ({ id, contentHash: hash(`${referenceBundleHash}:${id}`) }));
  const batches = counts.map((count) => ({
    count,
    seed,
    referenceBundleHash,
    shots: Array.from({ length: count }, (_, index) => {
      const sceneId = `scene-${String(index + 1).padStart(3, '0')}`;
      const promptHash = hash(`${seed}:${sceneId}:prompt`);
      return {
        sceneId, variant: 0, promptHash, referenceBundleHash,
        referenceIds: referenceHashes.map((reference) => reference.id),
        referenceProvenance: clone(referenceHashes),
        providers: [...providers],
        originalPreserved: true,
        outputs: providers.map((provider) => ({ provider, model: provider === 'flow' ? 'flow-still-synthetic' : 'flux-2-klein-4b-synthetic', contentHash: hash(`${seed}:${provider}:${sceneId}`), originalPreserved: true, license: 'synthetic-fixture', reviewStatus: 'needs-review' })),
        humanReview: { status: 'needs-review', continuity: 'unlabeled', notes: [] },
      };
    }),
  }));
  return { version: 1, mode: 'offline-synthetic', seed, providers: [...providers], referenceBundleHash, batches, networkCalls: false, liveVerification: 'NOT RUN', generatedAt: 'synthetic-deterministic' };
}

export function createCrossProviderAuditReport({ fixture, observations = {} } = {}) {
  if (!fixture || fixture.mode !== 'offline-synthetic' || fixture.networkCalls !== false) throw new Error('Cross-provider report requires a network-free synthetic fixture.');
  const batches = fixture.batches.map((batch) => ({ count: batch.count, referenceBundleHash: batch.referenceBundleHash, shots: batch.shots.map((shot) => ({ ...clone(shot), review: { status: shot.humanReview.status, continuity: shot.humanReview.continuity, humanDecisionRequired: true } })) }));
  const usage = Object.fromEntries(fixture.providers.map((provider) => [provider, { ...(observations[provider] ?? {}), actualUsage: observations[provider]?.actualUsage ?? null, measured: false }]));
  return { version: 1, mode: 'offline-synthetic', providers: [...fixture.providers], providerSubstitution: 'never-automatic', referenceBundleHash: fixture.referenceBundleHash, batches, usage, watermarkPolicy: { preserveOriginals: true, removalOrConcealment: 'forbidden', cropPreviewApplied: false }, limitations: ['Synthetic checksums and timing are reproducible fixtures, not provider quality evidence.', 'Character identity, wardrobe, props, palette, and composition require human labels; deterministic checksums do not prove visual continuity.', 'Real provider latency, quota, credits, and usage are NOT RUN.'], liveVerification: 'NOT RUN' };
}

export function invalidateDownstreamApproval(approval, current) {
  if (!approval || approval.status !== 'approved') return clone(approval);
  const changed = ['provider', 'model', 'referenceBundleHash', 'dependencyHash'].filter((field) => approval[field] !== current?.[field]);
  if (!changed.length) return clone(approval);
  return { ...clone(approval), status: 'needs-review', invalidatedReason: `approved downstream work invalidated after ${changed.join(', ')} changed`, invalidatedFields: changed };
}

async function probe(file) {
  const { ffprobe } = getMediaToolConfig();
  const { stdout } = await exec(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', file], { windowsHide: true });
  const stream = JSON.parse(stdout).streams?.[0];
  if (!stream || stream.codec_type !== 'video' || !Number.isInteger(stream.width) || !Number.isInteger(stream.height)) throw new Error(`ffprobe returned no valid image stream for ${file}.`);
  return { width: stream.width, height: stream.height, codecType: stream.codec_type };
}

export async function auditWatermarkProvenance({ originalPath, visualInputPath, renderedPath, provider, visibleWatermark = false, cropPreview = { applied: false } } = {}) {
  requiredText(originalPath, 'originalPath'); requiredText(visualInputPath, 'visualInputPath'); requiredText(renderedPath, 'renderedPath'); requiredText(provider, 'provider');
  if (cropPreview?.applied === true) throw new Error('Watermark audit cannot accept an applied crop as proof of safe framing.');
  const [originalHash, visualInputHash, renderedHash, original, visualInput, rendered] = await Promise.all([fileHash(originalPath), fileHash(visualInputPath), fileHash(renderedPath), probe(originalPath), probe(visualInputPath), probe(renderedPath)]);
  const modified = originalHash !== renderedHash;
  return { provider, originalPreserved: originalHash === visualInputHash, hashes: { original: originalHash, visualInput: visualInputHash, rendered: renderedHash }, ffprobe: { original, visualInput, rendered }, watermark: { visible: Boolean(visibleWatermark), modified, claim: visibleWatermark ? (modified ? 'changed-output-requires-pixel-level-review' : 'preserved-original-not-removed') : (modified ? 'unwatermarked-transform-recorded' : 'not-present-or-unchanged') }, cropPreview: { applied: false, note: 'safe-framing preview is geometry-only; no crop or watermark concealment was applied.' }, reviewStatus: 'needs-review' };
}

export async function prepareNonDestructiveLetterbox({ sourcePath, outputPath, provider, visibleWatermark = false, rightsApproved = false } = {}) {
  requiredText(sourcePath, 'sourcePath'); requiredText(outputPath, 'outputPath'); requiredText(provider, 'provider');
  if (path.resolve(sourcePath) === path.resolve(outputPath)) throw new Error('Non-destructive transform requires a separate output path.');
  if (visibleWatermark || provider === 'flow') throw new Error('Watermarked Flow originals cannot be cropped, hidden, or transformed for watermark evasion.');
  if (rightsApproved !== true) throw new Error('A separate rights/transform approval is required.');
  try { await access(outputPath); throw new Error('Output path already exists; overwrite is disabled.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const sourceStat = await lstat(sourcePath); if (sourceStat.isSymbolicLink()) throw new Error('Source image cannot be a symlink.');
  await mkdir(path.dirname(outputPath), { recursive: true });
  const { ffmpeg } = getMediaToolConfig();
  await exec(ffmpeg, ['-n', '-i', sourcePath, '-vf', `scale=${IMAGE_WIDTH}:${IMAGE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${IMAGE_WIDTH}:${IMAGE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`, '-frames:v', '1', outputPath], { windowsHide: true });
  const output = await probe(outputPath); if (output.width !== IMAGE_WIDTH || output.height !== IMAGE_HEIGHT) throw new Error('Letterboxed derivative did not validate as 1920x1080.');
  return { provider, transform: 'scale-and-letterbox', originalPath: path.resolve(sourcePath), outputPath: path.resolve(outputPath), originalHash: await fileHash(sourcePath), outputHash: await fileHash(outputPath), originalPreserved: true, output, watermarkModified: false, reviewStatus: 'needs-review', approvalRequired: true };
}
