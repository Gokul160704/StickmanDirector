#!/usr/bin/env node
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { loadEpisodeManifest } from './episode-manifest.mjs';
import { validateImageAssets } from './asset-validation.mjs';
import { assertPathInsideRoot } from './path-safety.mjs';
import { getMediaToolConfig } from './media-tools.mjs';
import { replaceOutputPair } from './atomic-output.mjs';

const SCENES = 5;
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };
const tryRead = async (file) => { try { return await readFile(file, 'utf8'); } catch { return null; } };

function stamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

export function makeCaptionSrt(texts, duration, { displaySeconds = 2.5, offsetSeconds = 0.1, entries } = {}) {
  const items = entries ?? texts.map((text, i) => {
    const slice = duration / texts.length;
    const start = Math.min(offsetSeconds + i * slice, Math.max(0, duration - slice));
    return { startSeconds: start, endSeconds: Math.min(start + displaySeconds, duration), text };
  });
  return items.filter((item) => item.text?.trim()).map((item, i) => `${i + 1}\n${stamp(item.startSeconds)} --> ${stamp(item.endSeconds)}\n${item.text.trim()}\n`).join('\n');
}

async function captionTexts(root, part) {
  const files = await Promise.all(Array.from({ length: SCENES }, (_, i) => tryRead(path.join(root, 'captions', `caption-${i + 1}.txt`))));
  if (files.every((text) => text !== null)) return files.map((text) => text.trim());
  const script = await tryRead(path.join(root, 'script.md'));
  if (script) {
    const texts = [...script.matchAll(/^\d+\. Caption:\s*(.+)$/gm)].map((m) => m[1].trim()).slice((part - 1) * SCENES, part * SCENES);
    if (texts.length === SCENES) return texts;
  }
  throw new Error(`Missing captions for part ${part}: add captions/caption-1..${SCENES}.txt or script.md lines like "1. Caption: ..."`);
}

async function probe(file, entries = 'duration') {
  const out = await sh(getMediaToolConfig().ffprobe, ['-v', 'error', '-show_entries', `format=${entries}`, '-of', 'default=nw=1:nk=1', file]);
  return Number.parseFloat(out);
}

function sh(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = ''; let err = '';
    child.stdout.on('data', (data) => { out += data; }); child.stderr.on('data', (data) => { err += data; });
    child.on('error', (error) => reject(new Error(`${cmd} could not start: ${error.message}`)));
    child.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-3000)}`)));
  });
}

async function createManifestPlan(root) {
  const manifest = await loadEpisodeManifest(path.join(root, 'episode.json'), { root });
  if (!manifest.scenes.length) throw new Error('Manifest contains no scenes. Add at least one approved still scene before rendering.');
  const scenes = manifest.scenes.map((scene) => ({ ...scene, imagePath: path.resolve(root, scene.image) }));
  for (const scene of scenes) if (!(await exists(scene.imagePath))) throw new Error(`Missing scene image for ${scene.id}: ${scene.imagePath}`);
  const audioPath = manifest.audio?.path ? await assertPathInsideRoot(root, path.resolve(root, manifest.audio.path), 'audio.path') : null;
  const backgroundPath = manifest.audio?.backgroundPath ? await assertPathInsideRoot(root, path.resolve(root, manifest.audio.backgroundPath), 'audio.backgroundPath') : null;
  if (audioPath && !(await exists(audioPath))) throw new Error(`Missing narration audio: ${audioPath}`);
  if (backgroundPath && !(await exists(backgroundPath))) throw new Error(`Missing background audio: ${backgroundPath}`);
  let duration = scenes.every((scene) => scene.durationSeconds) ? scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) : null;
  if (audioPath && !duration) {
    const audioDuration = await probe(audioPath);
    if (!Number.isFinite(audioDuration) || audioDuration <= 0) throw new Error(`Could not determine narration duration: ${audioPath}`);
    if (!duration) duration = audioDuration;
  }
  if (!duration) throw new Error('Manifest needs audio.path or durationSeconds on every scene to determine the timeline.');
  const missing = scenes.filter((scene) => !scene.durationSeconds);
  if (missing.length) {
    const fixed = scenes.reduce((sum, scene) => sum + (scene.durationSeconds ?? 0), 0);
    const each = (duration - fixed) / missing.length;
    if (each <= 0) throw new Error('Scene durations exceed the available narration duration.');
    for (const scene of missing) scene.durationSeconds = each;
  }
  let offset = 0; const entries = [];
  for (const scene of scenes) {
    for (const caption of scene.captions ?? []) {
      if (caption.endSeconds > scene.durationSeconds) throw new Error(`Caption for ${scene.id} ends at ${caption.endSeconds}s but the scene ends at ${scene.durationSeconds}s.`);
      entries.push({ startSeconds: offset + caption.startSeconds, endSeconds: offset + caption.endSeconds, text: caption.text });
    }
    offset += scene.durationSeconds;
  }
  let captionEntries = entries;
  if (manifest.captions.alignmentPath) {
    const alignment = JSON.parse(await readFile(path.resolve(root, manifest.captions.alignmentPath), 'utf8'));
    captionEntries = alignment.captions ?? alignment;
    if (!Array.isArray(captionEntries)) throw new Error('Caption alignment file must contain an array or a captions array.');
    captionEntries = captionEntries.map((entry, index) => ({ startSeconds: entry.startSeconds ?? entry.start, endSeconds: entry.endSeconds ?? entry.end, text: entry.text ?? entry.phrase ?? '' }));
  }
  const out = await assertPathInsideRoot(root, path.resolve(root, manifest.output?.path ?? path.join('exports', `${manifest.episodeId}.mp4`)), 'output.path');
  return { mode: 'manifest', root, manifest, scenes, audioPath, backgroundPath, duration: scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0), captionEntries, out };
}

export async function createRenderPlan(root, part) {
  root = path.resolve(root);
  if (await exists(path.join(root, 'episode.json'))) return createManifestPlan(root);
  const audio = path.join(root, 'narration', `part-${part}-v2.wav`);
  const audioPath = (await exists(audio)) ? audio : path.join(root, 'narration', `part-${part}.wav`);
  if (!(await exists(audioPath))) throw new Error(`Missing narration audio: ${audio}`);
  const imagePaths = [];
  for (let i = 1; i <= SCENES; i++) { const file = path.join(root, 'images', `p${part}-s${i}.jpg`); if (!(await exists(file))) throw new Error(`Missing scene image: ${file}`); imagePaths.push(file); }
  return { mode: 'legacy', root, part, audioPath, imagePaths, captionTexts: await captionTexts(root, part) };
}

export function formatConcatPath(file) {
  const normalized = file.replaceAll('\\', '/').replaceAll("'", "'\\''");
  return `file '${normalized}'`;
}

function concatContent(scenes) {
  const lines = [];
  for (const scene of scenes) lines.push(formatConcatPath(scene.imagePath), `duration ${scene.durationSeconds.toFixed(6)}`);
  lines.push(formatConcatPath(scenes.at(-1).imagePath));
  return `${lines.join('\n')}\n`;
}

function validateCaptionEntries(entries, duration) {
  let previousEnd = 0;
  for (const [index, entry] of entries.entries()) {
    if (!Number.isFinite(entry.startSeconds) || !Number.isFinite(entry.endSeconds) || entry.startSeconds < 0 || entry.endSeconds <= entry.startSeconds || entry.endSeconds > duration + 0.001) {
      throw new Error(`Invalid caption timing at entry ${index + 1}; captions must be ordered, positive, and inside the final timeline.`);
    }
    if (entry.startSeconds < previousEnd - 0.001) throw new Error(`Caption timing overlaps or is out of order at entry ${index + 1}.`);
    previousEnd = entry.endSeconds;
  }
}

export async function assertOutputAvailable(file, { replace = false } = {}) {
  if (await exists(file) && !replace) throw new Error(`Refusing to overwrite existing render: ${file}. Re-run with --replace after reviewing the current output.`);
}

async function verifyOutput(file, expectedDuration, { requireAudio = false } = {}) {
  const metadata = JSON.parse(await sh(getMediaToolConfig().ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate', '-of', 'json', file]));
  const video = metadata.streams?.find((stream) => stream.codec_type === 'video');
  const audio = metadata.streams?.find((stream) => stream.codec_type === 'audio');
  if (!video || video.width !== 1920 || video.height !== 1080 || video.codec_name !== 'h264') throw new Error('Rendered output failed video verification (expected 1920x1080 H.264).');
  if (audio && audio.codec_name !== 'aac') throw new Error('Rendered output failed audio verification (expected AAC).');
  if (requireAudio && !audio) throw new Error('Rendered output is missing the required narration audio stream.');
  const duration = Number.parseFloat(metadata.format?.duration);
  if (!Number.isFinite(duration) || Math.abs(duration - expectedDuration) > 0.25) throw new Error(`Rendered output duration ${duration} does not match expected ${expectedDuration}.`);
  return { duration, width: video.width, height: video.height, videoCodec: video.codec_name, audioCodec: audio?.codec_name ?? null };
}

async function renderPlan(plan, { replace = false } = {}) {
  let duration = plan.mode === 'manifest' ? plan.duration : await probe(plan.audioPath);
  if (plan.mode === 'manifest') {
    await validateImageAssets(plan.root, plan.scenes, { aspectRatio: plan.manifest.output.aspectRatio });
    if (plan.audioPath) {
      const audioDuration = await probe(plan.audioPath);
      if (Math.abs(audioDuration - duration) > 0.25) throw new Error(`Narration duration ${audioDuration.toFixed(3)}s does not match the scene timeline ${duration.toFixed(3)}s; adjust scene durations or use alignment metadata.`);
      duration = audioDuration;
    }
  }
  const scenes = plan.mode === 'manifest' ? plan.scenes : plan.imagePaths.map((imagePath) => ({ imagePath, durationSeconds: duration / plan.imagePaths.length }));
  const entries = plan.mode === 'manifest' ? plan.captionEntries : plan.captionTexts.map((text, i) => ({ startSeconds: i * duration / SCENES + 0.1, endSeconds: Math.min((i + 1) * duration / SCENES, i * duration / SCENES + 2.6), text }));
  const out = plan.mode === 'manifest' ? plan.out : path.join(plan.root, 'output', `part-${plan.part}-review.mp4`);
  const captionDir = path.join(plan.root, 'captions'); await mkdir(captionDir, { recursive: true });
  const srtPath = await assertPathInsideRoot(plan.root, path.join(captionDir, plan.mode === 'manifest' ? `${plan.manifest.episodeId}.srt` : `part-${plan.part}.srt`), 'caption output path');
  validateCaptionEntries(entries, duration);
  if (await exists(srtPath) && !replace) throw new Error(`Refusing to overwrite existing caption sidecar: ${srtPath}. Re-run with --replace after reviewing the current output.`);
  const srtTemporary = `${srtPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(srtTemporary, makeCaptionSrt([], duration, { entries }), { flag: 'wx' });
  const tempDir = path.join(os.tmpdir(), `stickman-render-${process.pid}-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  const concatPath = path.join(tempDir, 'images.concat.txt');
  try {
    await writeFile(concatPath, concatContent(scenes)); await mkdir(path.dirname(out), { recursive: true });
    await assertOutputAvailable(out, { replace });
    const temporaryOutput = `${out}.tmp-${process.pid}.mp4`;
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', concatPath];
    if (plan.audioPath) args.push('-i', plan.audioPath);
    if (plan.backgroundPath) args.push('-i', plan.backgroundPath);
    args.push('-map', '0:v:0');
    if (plan.audioPath && plan.backgroundPath) args.push('-filter_complex', '[1:a]apad[narration];[2:a]volume=0.15[bed];[narration][bed]amix=inputs=2:duration=first:dropout_transition=2[aout]', '-map', '[aout]');
    else if (plan.audioPath) args.push('-map', '1:a:0');
    args.push('-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p', '-r', '30', '-t', duration.toFixed(6), '-c:v', 'libx264', '-preset', 'medium');
    if (plan.audioPath && plan.backgroundPath) args.push('-c:a', 'aac', '-b:a', '192k');
    else if (plan.audioPath) args.push('-af', 'apad', '-c:a', 'aac', '-b:a', '192k');
    const editing = plan.mode === 'manifest' ? plan.manifest.editing ?? {} : {};
    const filters = ['scale=1920:1080:force_original_aspect_ratio=decrease', 'pad=1920:1080:(ow-iw)/2:(oh-ih)/2', 'format=yuv420p'];
    if (editing.fadeInSeconds) filters.push(`fade=t=in:st=0:d=${editing.fadeInSeconds}`);
    if (editing.fadeOutSeconds) filters.push(`fade=t=out:st=${Math.max(0, duration - editing.fadeOutSeconds)}:d=${editing.fadeOutSeconds}`);
    args[args.indexOf('-vf') + 1] = filters.join(',');
    args.push('-movflags', '+faststart', temporaryOutput);
    try {
      await sh(getMediaToolConfig().ffmpeg, args);
      const verification = await verifyOutput(temporaryOutput, duration, { requireAudio: Boolean(plan.audioPath) });
      await replaceOutputPair({ mp4Temp: temporaryOutput, srtTemp: srtTemporary, mp4Target: out, srtTarget: srtPath, replace });
      return { out, duration: verification.duration, srtPath, verification, captionTimingSource: plan.mode === 'manifest' ? plan.manifest.captions.timingSource : 'legacy-proportional' };
    } finally { await rm(temporaryOutput, { force: true }); }
  } finally { await rm(srtTemporary, { force: true }); await rm(tempDir, { recursive: true, force: true }); }
}

export async function renderEpisode(root, part, options) { return renderPlan(await createRenderPlan(root, part), options); }

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2); const replace = args.includes('--replace'); const [root, target] = args.filter((arg) => arg !== '--replace');
  if (!root || root === '--help') { console.log('Usage: node scripts/render-episode.mjs <projectDir> [part|all|manifest]'); process.exit(root ? 0 : 1); }
  const parts = target === undefined || target === 'manifest' ? [undefined] : target === 'all' ? [1, 2, 3] : [Number(target)];
  for (const part of parts) { const result = await renderEpisode(root, part, { replace }); console.log(`${result.out}: ${result.duration.toFixed(2)}s, ${result.verification.videoCodec}/${result.verification.audioCodec ?? 'no audio'}, SRT ${result.srtPath}`); }
}
