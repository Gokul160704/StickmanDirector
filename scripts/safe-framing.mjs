import { createHash } from 'node:crypto';

const TARGET_ASPECT_RATIO = 16 / 9;
const MARGIN_KEYS = ['left', 'top', 'right', 'bottom'];

export const DEFAULT_SAFE_FRAMING_PROFILE = Object.freeze({
  version: 'safe-framing-v1',
  enabled: true,
  targetAspectRatio: '16:9',
  margins: Object.freeze({ left: 0.04, top: 0.04, right: 0.08, bottom: 0.10 }),
});

function canonical(value) {
  return JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
    : item);
}

function hash(value) {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
}

function requireFinite(value, field, { positive = false, normalized = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0) || (normalized && (value < 0 || value > 1))) {
    throw new Error(`${field} must be a ${positive ? 'positive ' : ''}${normalized ? 'normalized ' : ''}finite number.`);
  }
  return value;
}

function normalizeMargins(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('safe-framing margins must be an object.');
  const margins = Object.fromEntries(MARGIN_KEYS.map((key) => [key, input[key] ?? DEFAULT_SAFE_FRAMING_PROFILE.margins[key]]));
  for (const key of MARGIN_KEYS) requireFinite(margins[key], `safe-framing margin ${key}`, { normalized: true });
  if (margins.left + margins.right >= 1 || margins.top + margins.bottom >= 1) throw new Error('safe-framing margins leave no protected content area.');
  return margins;
}

function normalizeProtectedRegion(region, margins) {
  const expected = { x: margins.left, y: margins.top, width: 1 - margins.left - margins.right, height: 1 - margins.top - margins.bottom };
  if (region === undefined) return expected;
  if (!region || typeof region !== 'object' || Array.isArray(region)) throw new Error('safe-framing protectedRegion must be an object.');
  for (const key of ['x', 'y', 'width', 'height']) requireFinite(region[key], `safe-framing protectedRegion ${key}`, { normalized: true, positive: key === 'width' || key === 'height' });
  if (region.x + region.width > 1 || region.y + region.height > 1) throw new Error('safe-framing protectedRegion must remain inside normalized frame bounds.');
  if (region.x < margins.left || region.y < margins.top || region.x + region.width > 1 - margins.right || region.y + region.height > 1 - margins.bottom) throw new Error('safe-framing protectedRegion conflicts with margins.');
  return { x: region.x, y: region.y, width: region.width, height: region.height };
}

export function normalizeSafeFramingProfile(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('safe-framing profile must be an object.');
  const version = input.version ?? DEFAULT_SAFE_FRAMING_PROFILE.version;
  if (typeof version !== 'string' || !version.trim()) throw new Error('safe-framing profile version must be non-empty.');
  const targetAspectRatio = input.targetAspectRatio ?? DEFAULT_SAFE_FRAMING_PROFILE.targetAspectRatio;
  if (targetAspectRatio !== '16:9') throw new Error('safe-framing targetAspectRatio must be 16:9.');
  const margins = normalizeMargins(input.margins);
  const profile = {
    version: version.trim(),
    enabled: input.enabled ?? true,
    targetAspectRatio,
    margins,
    protectedRegion: normalizeProtectedRegion(input.protectedRegion, margins),
  };
  if (typeof profile.enabled !== 'boolean') throw new Error('safe-framing profile enabled must be boolean.');
  if (input.enabled === false) {
    if (typeof input.optOutReason !== 'string' || !input.optOutReason.trim()) throw new Error('disabled safe-framing profile requires optOutReason.');
    if (typeof input.optOutApprovalId !== 'string' || !input.optOutApprovalId.trim()) throw new Error('disabled safe-framing profile requires optOutApprovalId.');
    profile.optOutReason = input.optOutReason.trim();
    profile.optOutApprovalId = input.optOutApprovalId.trim();
  }
  return { ...profile, hash: hash(profile) };
}

function listText(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).join(', ') : '';
}

export function composeImagePrompt(scene = {}, profileInput, references = {}, kind = 'scene') {
  const profile = normalizeSafeFramingProfile(profileInput);
  const sceneText = scene.prompt ?? scene.imagePrompt ?? scene.visualDescription ?? scene.description ?? '';
  const style = scene.visualStyle ?? references.visualStyle ?? '';
  const characterText = listText(scene.characters) || listText(references.characters) || 'the approved recurring character references';
  const propText = listText(scene.props) || listText(references.props) || 'the approved recurring prop references';
  const referenceText = [...(references.characters ?? []), ...(references.props ?? []), ...(references.environments ?? [])].filter((item) => typeof item === 'string' && item.trim()).join(', ');
  const prompt = [
    ...(profile.enabled ? [
    'Create one cinematic 16:9 story illustration.',
    'Reserve extra negative space toward the right and bottom edges.',
    'Keep important characters, faces, hands, recurring props, and story-critical details inside the protected inner framing area.',
    `Protected area: x=${Math.round(profile.protectedRegion.x * 100)}–${Math.round((profile.protectedRegion.x + profile.protectedRegion.width) * 100)}%, y=${Math.round(profile.protectedRegion.y * 100)}–${Math.round((profile.protectedRegion.y + profile.protectedRegion.height) * 100)}%.`,
    'Preserve approved character and prop designs, visual direction, and natural cinematic composition.',
    'Leave the lower-right area free of story-critical content.',
    'Keep headings, captions, labels, arrows, storyboard panels, and explanatory callouts out of the image.',
    ] : []),
    style ? `Visual direction: ${style}.` : '',
    sceneText ? `Story moment: ${sceneText}` : '',
    `Character references: ${characterText}.`,
    `Prop references: ${propText}.`,
    referenceText ? `Reference assets: ${referenceText}.` : '',
  ].filter(Boolean).join(' ');
  return { prompt, profile, profileHash: profile.hash, protectedRegion: profile.protectedRegion, kind };
}

function normalizeLandmark(landmark, index) {
  if (!landmark || typeof landmark !== 'object' || Array.isArray(landmark) || typeof landmark.id !== 'string' || !landmark.id.trim()) throw new Error(`landmark[${index}] must have a non-empty id.`);
  for (const key of ['x', 'y', 'width', 'height']) requireFinite(landmark[key], `landmark ${landmark.id} ${key}`, { normalized: true, positive: key === 'width' || key === 'height' });
  if (landmark.x + landmark.width > 1 || landmark.y + landmark.height > 1) throw new Error(`landmark ${landmark.id} bounds exceed the normalized frame.`);
  return { id: landmark.id.trim(), x: landmark.x, y: landmark.y, width: landmark.width, height: landmark.height };
}

function inside(landmark, region) {
  return landmark.x >= region.x && landmark.y >= region.y
    && landmark.x + landmark.width <= region.x + region.width
    && landmark.y + landmark.height <= region.y + region.height;
}

function normalizeCropMargins(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('crop margins must be an object.');
  const margins = Object.fromEntries(MARGIN_KEYS.map((key) => [key, input[key] ?? 0]));
  for (const key of MARGIN_KEYS) requireFinite(margins[key], `crop margin ${key}`, { normalized: true });
  if (margins.left + margins.right >= 1 || margins.top + margins.bottom >= 1) throw new Error('crop margins leave no source image.');
  return margins;
}

export function previewImageGeometry({ width, height, profile: profileInput, landmarks = [], cropMargins } = {}) {
  requireFinite(width, 'source width', { positive: true });
  requireFinite(height, 'source height', { positive: true });
  if (!Array.isArray(landmarks)) throw new Error('landmarks must be an array.');
  const profile = normalizeSafeFramingProfile(profileInput);
  const sourceAspectRatio = width / height;
  const roi = sourceAspectRatio > TARGET_ASPECT_RATIO
    ? { x: (width - (height * TARGET_ASPECT_RATIO)) / 2, y: 0, width: height * TARGET_ASPECT_RATIO, height }
    : { x: 0, y: (height - (width / TARGET_ASPECT_RATIO)) / 2, width, height: width / TARGET_ASPECT_RATIO };
  const protectedPixels = {
    x: roi.x + roi.width * profile.protectedRegion.x,
    y: roi.y + roi.height * profile.protectedRegion.y,
    width: roi.width * profile.protectedRegion.width,
    height: roi.height * profile.protectedRegion.height,
  };
  const normalizedLandmarks = landmarks.map(normalizeLandmark);
  const targetLandmarks = normalizedLandmarks.map((landmark) => ({
    ...landmark,
    x: (landmark.x * width - roi.x) / roi.width,
    y: (landmark.y * height - roi.y) / roi.height,
    width: (landmark.width * width) / roi.width,
    height: (landmark.height * height) / roi.height,
  }));
  const warnings = targetLandmarks.filter((landmark) => !inside(landmark, profile.protectedRegion)).map((landmark) => ({
    code: 'landmark-outside-protected-region',
    landmarkId: landmark.id,
    message: `Supplied landmark ${landmark.id} extends outside the protected region; semantic content was not detected automatically.`,
  }));
  const crop = normalizeCropMargins(cropMargins);
  const croppedWidth = width * (1 - crop.left - crop.right);
  const croppedHeight = height * (1 - crop.top - crop.bottom);
  const croppedAspect = croppedWidth / croppedHeight;
  const maintainsTargetAspect = Math.abs(croppedAspect - TARGET_ASPECT_RATIO) <= 1e-9;
  if (cropMargins && !maintainsTargetAspect) warnings.push({ code: 'crop-aspect-mismatch', message: `Requested source trim produces aspect ${croppedAspect}; it does not preserve 16:9.` });
  return {
    previewOnly: true,
    destructive: false,
    interpretation: 'supplied-normalized-boxes-only',
    profileHash: profile.hash,
    source: { width, height, aspectRatio: sourceAspectRatio, aspectError: Math.abs(sourceAspectRatio - TARGET_ASPECT_RATIO) },
    target: { aspectRatio: TARGET_ASPECT_RATIO, width: roi.width, height: roi.height },
    roi,
    protectedRegion: { normalized: profile.protectedRegion, pixels: protectedPixels },
    landmarks: normalizedLandmarks.map((landmark, index) => ({ ...landmark, targetNormalized: targetLandmarks[index], withinProtectedRegion: inside(targetLandmarks[index], profile.protectedRegion) })),
    warnings,
    cropPreview: { requestedMargins: crop, width: croppedWidth, height: croppedHeight, aspectRatio: croppedAspect, maintainsTargetAspect, applied: false },
  };
}

export { TARGET_ASPECT_RATIO };
