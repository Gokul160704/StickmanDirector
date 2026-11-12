import { readFile } from 'node:fs/promises';
import path from 'node:path';

const RESOLUTION = /^\d+x\d+$/;
const ASPECT_RATIO = /^\d+:\d+$/;
const STAGES = ['research', 'script', 'continuity', 'storyboard', 'references', 'images', 'audio', 'captions', 'rendering', 'QA'];
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function fail(message) {
  throw new Error(`Invalid episode manifest: ${message}`);
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`);
  return value.trim();
}

function positiveNumber(value, field, { zero = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (zero ? value < 0 : value <= 0)) {
    fail(`${field} must be ${zero ? 'zero or a' : 'a'} positive finite number.`);
  }
  return value;
}

export function assertSafeRelativeAssetPath(value, field = 'asset path') {
  requiredString(value, field);
  if (path.isAbsolute(value) || /^[A-Za-z]:/.test(value) || /^[\\/]/.test(value) || /[\0\r\n]/.test(value)) fail(`${field} must be a relative path inside the project root.`);
  let depth = 0;
  for (const segment of value.split(/[\\/]+/)) {
    if (!segment || segment === '.') continue;
    if (segment === '..') { depth -= 1; if (depth < 0) fail(`${field} must resolve inside the project root.`); }
    else depth += 1;
  }
  return value.replaceAll('\\', '/');
}

function validateCaption(caption, sceneIndex, captionIndex) {
  if (!caption || typeof caption !== 'object') fail(`scenes[${sceneIndex}].captions[${captionIndex}] must be an object.`);
  const start = positiveNumber(caption.startSeconds, `scenes[${sceneIndex}].captions[${captionIndex}].startSeconds`, { zero: true });
  const end = positiveNumber(caption.endSeconds, `scenes[${sceneIndex}].captions[${captionIndex}].endSeconds`);
  if (end <= start) fail(`scenes[${sceneIndex}].captions[${captionIndex}].endSeconds must be greater than startSeconds.`);
  return { startSeconds: start, endSeconds: end, text: requiredString(caption.text, `scenes[${sceneIndex}].captions[${captionIndex}].text`) };
}

export function validateEpisodeManifest(input, { root = process.cwd() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('top level must be an object.');
  if (input.schemaVersion !== 1) fail('schemaVersion must be 1.');
  for (const field of ['episodeId', 'title', 'topic', 'description', 'targetAudience']) requiredString(input[field], field);
  if (!SAFE_ID.test(input.episodeId)) fail('episodeId must be a safe identifier using only letters, numbers, hyphens, and underscores (1–64 characters).');
  positiveNumber(input.intendedDurationSeconds, 'intendedDurationSeconds');
  const output = input.output;
  if (!output || typeof output !== 'object') fail('output must be an object.');
  if (!RESOLUTION.test(requiredString(output.resolution, 'output.resolution'))) fail('output.resolution must look like 1920x1080.');
  positiveNumber(output.frameRate, 'output.frameRate');
  if (output.resolution !== '1920x1080') fail('Only output resolution 1920x1080 is supported.');
  if (output.frameRate !== 30) fail('Only frame rate 30 is supported.');
  if (!ASPECT_RATIO.test(requiredString(output.aspectRatio, 'output.aspectRatio'))) fail('output.aspectRatio must look like 16:9.');
  if (output.aspectRatio !== '16:9') fail('Only aspect ratio 16:9 is supported.');

  const references = input.references ?? {};
  for (const kind of ['characters', 'props', 'environments']) {
    if (!Array.isArray(references[kind] ?? [])) fail(`references.${kind} must be an array.`);
    references[kind] = (references[kind] ?? []).map((asset, index) => assertSafeRelativeAssetPath(asset, `references.${kind}[${index}]`));
  }
  const audio = input.audio ?? {};
  if (audio.path !== undefined) audio.path = assertSafeRelativeAssetPath(audio.path, 'audio.path');
  if (audio.backgroundPath !== undefined) audio.backgroundPath = assertSafeRelativeAssetPath(audio.backgroundPath, 'audio.backgroundPath');
  const captions = input.captions ?? {};
  if (captions.timingSource !== undefined && !['manual', 'alignment'].includes(captions.timingSource)) fail('captions.timingSource must be manual or alignment.');
  if (captions.alignmentPath !== undefined) captions.alignmentPath = assertSafeRelativeAssetPath(captions.alignmentPath, 'captions.alignmentPath');
  if (captions.timingSource === 'alignment' && !captions.alignmentPath) fail('captions.alignmentPath is required when timingSource is alignment.');
  if (input.output.path !== undefined) input.output.path = assertSafeRelativeAssetPath(input.output.path, 'output.path');
  const editing = input.editing ?? {};
  for (const field of ['fadeInSeconds', 'fadeOutSeconds']) if (editing[field] !== undefined) positiveNumber(editing[field], `editing.${field}`, { zero: true });
  if (input.scenes !== undefined && !Array.isArray(input.scenes)) fail('scenes must be an array.');
  const production = input.production ?? {};
  if (production.stage !== undefined && !STAGES.includes(production.stage)) fail(`production.stage must be one of: ${STAGES.join(', ')}.`);
  if (production.completedStages !== undefined && (typeof production.completedStages !== 'object' || Array.isArray(production.completedStages))) fail('production.completedStages must be an object.');
  for (const section of ['research', 'script', 'continuity', 'storyboard']) {
    if (input[section] !== undefined && (typeof input[section] !== 'object' || Array.isArray(input[section]))) fail(`${section} must be an object.`);
  }
  const scenes = (input.scenes ?? []).map((scene, index) => {
    if (!scene || typeof scene !== 'object') fail(`scenes[${index}] must be an object.`);
    const id = requiredString(scene.id, `scenes[${index}].id`);
    const order = scene.order ?? index + 1;
    if (!Number.isInteger(order) || order < 1) fail(`scenes[${index}].order must be a positive integer.`);
    const image = assertSafeRelativeAssetPath(scene.image, `scenes[${index}].image`);
    const result = { ...scene, id, order, image };
    if (scene.durationSeconds !== undefined) result.durationSeconds = positiveNumber(scene.durationSeconds, `scenes[${index}].durationSeconds`);
    if (scene.narration !== undefined) result.narration = requiredString(scene.narration, `scenes[${index}].narration`);
    result.captions = (scene.captions ?? []).map((caption, captionIndex) => validateCaption(caption, index, captionIndex));
    return result;
  }).sort((a, b) => a.order - b.order);
  const orders = scenes.map((scene) => scene.order);
  if (new Set(orders).size !== orders.length || orders.some((order, index) => order !== index + 1)) fail('scene order values must be unique and consecutive starting at 1.');
  const ids = scenes.map((scene) => scene.id);
  if (new Set(ids).size !== ids.length) fail('scene ids must be unique.');

  return {
    ...input,
    schemaVersion: 1,
    episodeId: input.episodeId.trim(), title: input.title.trim(), topic: input.topic.trim(),
    description: input.description.trim(), targetAudience: input.targetAudience.trim(),
    output: { ...output, resolution: output.resolution.trim(), aspectRatio: output.aspectRatio.trim() },
    references: { ...references, visualStyle: references.visualStyle ?? '' },
    audio: { ...audio }, captions: { timingSource: 'manual', ...captions }, editing: { ...editing }, production: { stage: 'research', ...production }, scenes,
  };
}

export function importEpisodeManifest(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('top level must be an object.');
  if (input.schemaVersion !== 1) {
    if (input.schemaVersion === undefined) fail('schemaVersion is required; legacy data needs an explicit v1 adapter.');
    fail('schemaVersion must be 1.');
  }
  return validateEpisodeManifest(structuredClone(input), options);
}

export async function loadEpisodeManifest(file, { root = path.dirname(path.resolve(file)) } = {}) {
  const source = path.resolve(file);
  const data = JSON.parse((await readFile(source, 'utf8')).replace(/^\uFEFF/, ''));
  return importEpisodeManifest(data, { root });
}
