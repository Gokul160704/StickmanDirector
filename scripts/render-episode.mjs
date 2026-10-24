#!/usr/bin/env node
// Build caption sidecar + review MP4 for one episode: five stills, narration audio.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCENES = 5;

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function tryRead(file) {
  try { return await readFile(file, 'utf8'); } catch { return null; }
}

async function captionTexts(root, part) {
  const files = await Promise.all(
    Array.from({ length: SCENES }, (_, i) => tryRead(path.join(root, 'captions', `caption-${i + 1}.txt`))),
  );
  if (files.every((text) => text !== null)) return files.map((text) => text.trim());

  const script = await tryRead(path.join(root, 'script.md'));
  if (script) {
    const texts = [...script.matchAll(/^\d+\. Caption:\s*(.+)$/gm)].map((m) => m[1].trim());
    const slice = texts.slice((part - 1) * SCENES, part * SCENES);
    if (slice.length === SCENES) return slice;
  }
  throw new Error(
    `Missing captions for part ${part}: add captions/caption-1..${SCENES}.txt or script.md lines like "1. Caption: ..."`,
  );
}

export async function createRenderPlan(root, part) {
  // concat demuxer resolves entries relative to its own file, so plan with absolute paths
  root = path.resolve(root);
  const revised = path.join(root, 'narration', `part-${part}-v2.wav`);
  const audioPath = (await exists(revised)) ? revised : path.join(root, 'narration', `part-${part}.wav`);
  if (!(await exists(audioPath))) throw new Error(`Missing narration audio: ${revised}`);

  const imagePaths = [];
  for (let i = 1; i <= SCENES; i++) {
    const file = path.join(root, 'images', `p${part}-s${i}.jpg`);
    if (!(await exists(file))) throw new Error(`Missing scene image: ${file}`);
    imagePaths.push(file);
  }
  return { audioPath, imagePaths, captionTexts: await captionTexts(root, part) };
}

function stamp(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

export function makeCaptionSrt(texts, duration, { displaySeconds = 2.5, offsetSeconds = 0.1 } = {}) {
  const slice = duration / texts.length;
  return texts
    .map((text, i) => {
      // shortcut: start clamped one scene before the audio end so the last caption fits its scene window; drop the clamp if captions must sit at exact scene offsets
      const start = Math.min(offsetSeconds + i * slice, Math.max(0, duration - slice));
      const end = Math.min(start + displaySeconds, duration);
      return `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${text}\n`;
    })
    .join('\n');
}

function sh(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`)),
    );
  });
}

async function probeDuration(file) {
  const out = await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(out);
}

export async function renderEpisode(root, part) {
  const plan = await createRenderPlan(root, part);
  const duration = await probeDuration(plan.audioPath);

  const srtPath = path.join(root, 'captions', `part-${part}.srt`);
  await writeFile(srtPath, makeCaptionSrt(plan.captionTexts, duration));

  const concatPath = path.join(root, 'captions', `part-${part}.concat.txt`);
  const slice = duration / plan.imagePaths.length;
  const toUrl = (file) => file.replaceAll('\\', '/');
  const last = plan.imagePaths.at(-1);
  const entries = plan.imagePaths.map((file) => `file '${toUrl(file)}'\nduration ${slice.toFixed(2)}`);
  // concat demuxer ignores the final entry's duration, so repeat the last still
  entries.push(`file '${toUrl(last)}'\nduration ${slice.toFixed(2)}`);
  await writeFile(concatPath, `${entries.join('\n')}\n`);

  const out = path.join(root, 'output', `part-${part}-review.mp4`);
  await mkdir(path.dirname(out), { recursive: true });
  await sh('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-i', plan.audioPath,
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
    '-r', '30', '-frames:v', String(Math.ceil(duration * 30)),
    '-c:v', 'libx264', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', out,
  ]);
  return { out, duration, srtPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, target] = process.argv.slice(2);
  if (!root || !target) {
    console.error('Usage: node scripts/render-episode.mjs <projectDir> <part|all>');
    process.exit(1);
  }
  const parts = target === 'all' ? [1, 2, 3] : [Number(target)];
  for (const part of parts) {
    const result = await renderEpisode(root, part);
    console.log(`part-${part}: ${result.duration.toFixed(2)}s audio, captions + review video written`);
  }
}
