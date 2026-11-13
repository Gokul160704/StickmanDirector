import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SAFE_FRAMING_PROFILE,
  composeImagePrompt,
  normalizeSafeFramingProfile,
  previewImageGeometry,
} from '../scripts/safe-framing.mjs';

test('normalizes the Chief-approved default profile and produces a stable hash', () => {
  const profile = normalizeSafeFramingProfile();

  assert.deepEqual(profile.margins, { left: 0.04, top: 0.04, right: 0.08, bottom: 0.1 });
  assert.deepEqual(profile.protectedRegion, { x: 0.04, y: 0.04, width: 0.88, height: 0.86 });
  assert.equal(profile.targetAspectRatio, '16:9');
  assert.match(profile.hash, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(DEFAULT_SAFE_FRAMING_PROFILE.margins, profile.margins);
});

test('accepts versioned per-shot margins and rejects degenerate profiles', () => {
  const custom = normalizeSafeFramingProfile({ version: 'safe-framing-v2', margins: { left: 0.1, top: 0.05, right: 0.15, bottom: 0.2 } });
  assert.equal(custom.version, 'safe-framing-v2');
  assert.deepEqual(custom.protectedRegion, { x: 0.1, y: 0.05, width: 0.75, height: 0.75 });
  assert.notEqual(custom.hash, normalizeSafeFramingProfile().hash);
  assert.throws(() => normalizeSafeFramingProfile({ margins: { left: -0.1 } }), /left.*0.*1|margin/i);
  assert.throws(() => normalizeSafeFramingProfile({ margins: { left: Number.NaN } }), /left.*finite|margin/i);
  assert.throws(() => normalizeSafeFramingProfile({ margins: { left: 0.6, right: 0.4 } }), /protected.*area|margin/i);
  assert.throws(() => normalizeSafeFramingProfile({ enabled: false }), /optOutReason/i);
  assert.throws(() => normalizeSafeFramingProfile({ enabled: false, optOutReason: 'Close-up conflict' }), /optOutApprovalId/i);
  assert.equal(normalizeSafeFramingProfile({ enabled: false, optOutReason: 'Close-up conflict', optOutApprovalId: 'approval-123' }).enabled, false);
});

test('composes deterministic guidance while preserving scene and reference continuity text', () => {
  const result = composeImagePrompt({
    id: 'scene-01',
    prompt: 'A curious stickman studies a glowing star map.',
    visualStyle: 'clean ink and warm paper texture',
    characters: ['rover'],
    props: ['star-map'],
  }, undefined, { characters: ['references/rover.png'], props: ['references/star-map.png'] });

  assert.match(result.prompt, /A curious stickman studies a glowing star map/);
  assert.match(result.prompt, /Reserve extra negative space toward the right and bottom edges/);
  assert.match(result.prompt, /faces, hands, recurring props, and story-critical details/);
  assert.match(result.prompt, /clean ink and warm paper texture/);
  assert.match(result.prompt, /references\/rover\.png/);
  assert.equal(result.profileHash, result.profile.hash);
  assert.doesNotMatch(result.prompt, /remove|erase|mask|watermark/i);
});

test('previews legal 16:9 geometry and reports unsafe landmarks without claiming semantic detection', () => {
  const preview = previewImageGeometry({
    width: 2000,
    height: 1000,
    landmarks: [
      { id: 'face-safe', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { id: 'prop-unsafe', x: 0.9, y: 0.85, width: 0.08, height: 0.1 },
    ],
  });

  assert.equal(preview.previewOnly, true);
  assert.equal(preview.destructive, false);
  assert.equal(preview.target.aspectRatio, 16 / 9);
  assert.equal(preview.roi.height, 1000);
  assert.ok(Math.abs(preview.roi.width - (1000 * 16 / 9)) < 0.0001);
  assert.ok(preview.warnings.some((warning) => warning.landmarkId === 'prop-unsafe'));
  assert.ok(preview.landmarks.some((landmark) => landmark.id === 'face-safe' && landmark.withinProtectedRegion));
});

test('flags unequal right/bottom trims on an exact 16:9 source instead of applying them', () => {
  const preview = previewImageGeometry({
    width: 1920,
    height: 1080,
    cropMargins: { right: 0.08, bottom: 0.1 },
  });

  assert.equal(preview.cropPreview.maintainsTargetAspect, false);
  assert.ok(preview.warnings.some((warning) => /aspect/i.test(warning.message)));
  assert.equal(preview.cropPreview.applied, false);
  assert.equal(preview.destructive, false);
});

test('rejects invalid source geometry and landmark bounds', () => {
  assert.throws(() => previewImageGeometry({ width: 0, height: 1080 }), /width.*positive/i);
  assert.throws(() => previewImageGeometry({ width: 1920, height: 1080, landmarks: [{ id: 'bad', x: 0.9, y: 0, width: 0.2, height: 0.1 }] }), /landmark.*bounds/i);
  assert.equal(previewImageGeometry({ width: 1920, height: 1080, landmarks: [{ id: 'full', x: 0, y: 0, width: 1, height: 1 }] }).landmarks[0].withinProtectedRegion, false);
  assert.throws(() => previewImageGeometry({ width: 1920, height: 1080, cropMargins: null }), /crop margins.*object/i);
});
