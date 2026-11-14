import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCrossProviderAuditReport, createSyntheticCrossProviderFixture, auditWatermarkProvenance, prepareNonDestructiveLetterbox, invalidateDownstreamApproval } from '../scripts/cross-provider-audit.mjs';

const run = promisify(execFile);

async function imageFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-cross-provider-'));
  const source = path.join(root, 'flow-original.png');
  await run(process.env.FFMPEG ?? 'ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360', '-frames:v', '1', source], { windowsHide: true });
  return { root, source };
}

test('creates deterministic offline 8 and 36 shot cross-provider fixtures with pinned provenance', () => {
  const options = { counts: [8, 36], seed: 'audit-seed-1', referenceBundleHash: 'sha256:refs', providers: ['flow', 'cloudflare'] };
  const first = createSyntheticCrossProviderFixture(options); const second = createSyntheticCrossProviderFixture(options);
  assert.deepEqual(first, second);
  assert.equal(first.networkCalls, false);
  assert.equal(first.liveVerification, 'NOT RUN');
  for (const batch of first.batches) {
    assert.equal(batch.shots.length, batch.count);
    assert.equal(batch.shots.every((shot) => shot.referenceBundleHash === 'sha256:refs'), true);
    assert.equal(batch.shots.every((shot) => shot.humanReview.status === 'needs-review'), true);
    assert.equal(batch.shots.every((shot) => shot.originalPreserved === 'synthetic-fixture'), true);
    assert.equal(batch.shots.every((shot) => shot.provenanceStatus === 'synthetic-fixture'), true);
  }
});

test('defaults the fixture to the requested 8, 36, and 100 shot benchmark sizes', () => {
  const fixture = createSyntheticCrossProviderFixture({ seed: 'default-counts', referenceBundleHash: 'sha256:refs' });
  assert.deepEqual(fixture.batches.map((batch) => batch.count), [8, 36, 100]);
});

test('reports per-shot continuity, usage, provenance, and human review without automatic provider substitution', () => {
  const fixture = createSyntheticCrossProviderFixture({ counts: [8, 36], seed: 'audit-seed-2', referenceBundleHash: 'sha256:refs', providers: ['flow', 'cloudflare'] });
  const report = createCrossProviderAuditReport({ fixture, observations: { flow: { imageCount: 8, estimatedUsage: 8, actualUsage: null, latencyMs: [100, 200], wallClockMs: 300, errors: [], approvedBudget: 8 }, cloudflare: { imageCount: 8, estimatedUsage: 1000, actualUsage: 900, latencyMs: [100, 200], wallClockMs: 300, errors: [], approvedBudget: 1000 } } });
  assert.equal(report.mode, 'offline-synthetic');
  assert.equal(report.providerSubstitution, 'never-automatic');
  assert.equal(report.batches.find((batch) => batch.count === 36).shots.length, 36);
  assert.equal(report.batches.every((batch) => batch.shots.every((shot) => shot.referenceProvenance.length === 4)), true);
  assert.equal(report.usage.cloudflare.actualUsage, 900);
  assert.equal(report.usage.cloudflare.measured, true);
  assert.equal(report.usage.cloudflare.throughputPerSecond > 0, true);
  assert.equal(report.usage.cloudflare.withinApprovedBudget, true);
  assert.equal(report.usage.cloudflare.perImageActualUsage, 112.5);
  assert.equal(report.limitations.some((item) => /human/i.test(item)), true);
});

test('covers synthetic batches with one through four pinned references', () => {
  for (const referenceCount of [1, 2, 3, 4]) {
    const fixture = createSyntheticCrossProviderFixture({ counts: [8, 36, 100], referenceCount, seed: `refs-${referenceCount}`, referenceBundleHash: 'sha256:refs', providers: ['flow', 'cloudflare'] });
    assert.equal(fixture.batches.at(-1).shots.length, 100);
    assert.equal(fixture.batches.every((batch) => batch.shots.every((shot) => shot.referenceProvenance.length === referenceCount)), true);
  }
});

test('invalidates only downstream approval when provider or references change', () => {
  const approval = { status: 'approved', provider: 'flow', model: 'flow-still', referenceBundleHash: 'sha256:old', dependencyHash: 'sha256:dep', sceneImageHash: 'sha256:scene-old', revisionHash: 'sha256:revision-old', outputHash: 'sha256:image' };
  const changed = invalidateDownstreamApproval(approval, { provider: 'cloudflare', model: 'flux-2-klein-4b', referenceBundleHash: 'sha256:new', dependencyHash: 'sha256:dep', sceneImageHash: 'sha256:scene-new', revisionHash: 'sha256:revision-new' });
  assert.equal(changed.status, 'needs-review');
  assert.equal(changed.outputHash, 'sha256:image');
  assert.match(changed.invalidatedReason, /provider|reference/i);
  assert.equal(approval.status, 'approved');
});

test('audits Flow watermark provenance and never claims preview cropping was applied', async () => {
  const { source } = await imageFixture();
  const report = await auditWatermarkProvenance({ originalPath: source, visualInputPath: source, renderedPath: source, provider: 'flow', watermarkEvidence: { visible: true, region: { x: 0.8, y: 0.8, width: 0.2, height: 0.2 } }, cropPreview: { applied: false } });
  assert.equal(report.originalPreserved, true);
  assert.equal(report.watermark.modified, false);
  assert.equal(report.watermark.claim, 'preserved-original-not-removed');
  assert.equal(report.cropPreview.applied, false);
  assert.equal(report.ffprobe.original.width, 640);
  assert.equal(report.ffprobe.rendered.height, 360);
});

test('reports changed render bytes without claiming watermark removal and requires evidence', async () => {
  const { root, source } = await imageFixture(); const changed = path.join(root, 'changed.png');
  await run(process.env.FFMPEG ?? 'ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=640x360', '-frames:v', '1', changed], { windowsHide: true });
  const report = await auditWatermarkProvenance({ originalPath: source, visualInputPath: source, renderedPath: changed, provider: 'flow', watermarkEvidence: { visible: true, region: { x: 0.8, y: 0.8, width: 0.2, height: 0.2 } }, cropPreview: { applied: false } });
  assert.equal(report.watermark.modified, true); assert.equal(report.watermark.claim, 'changed-output-not-classified'); assert.equal(report.pixelDiff.changedBytes > 0, true);
  await assert.rejects(() => auditWatermarkProvenance({ originalPath: source, visualInputPath: source, renderedPath: changed, provider: 'flow', cropPreview: { applied: false } }), /evidence/i);
});

test('creates a separate 1920x1080 letterboxed derivative only for an approved unwatermarked source', async () => {
  const { root, source } = await imageFixture();
  const output = path.join(root, 'cloudflare-letterboxed.png');
  const before = await readFile(source);
  const receipt = await prepareNonDestructiveLetterbox({ sourcePath: source, outputPath: output, rootDir: root, provider: 'cloudflare', visibleWatermark: false, rightsApproved: true });
  assert.deepEqual(await readFile(source), before);
  assert.equal(receipt.output.width, 1920); assert.equal(receipt.output.height, 1080);
  assert.equal(receipt.originalPreserved, true);
  assert.equal(receipt.transform, 'scale-and-letterbox');
  assert.equal(receipt.watermarkModified, false);
  await assert.rejects(() => prepareNonDestructiveLetterbox({ sourcePath: source, outputPath: path.join(root, 'flow-derived.png'), rootDir: root, provider: 'flow', visibleWatermark: true, rightsApproved: true }), /watermark|original|not permitted/i);
  await assert.rejects(() => prepareNonDestructiveLetterbox({ sourcePath: source, outputPath: path.join(root, '..', 'outside.png'), rootDir: root, provider: 'cloudflare', visibleWatermark: false, rightsApproved: true }), /root|inside|path/i);
});
