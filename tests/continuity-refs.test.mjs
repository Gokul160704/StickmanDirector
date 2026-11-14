import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createContinuityReferenceRegistry, freezeReferenceBundle } from '../scripts/continuity-refs.mjs';

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function refs() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stickman-refs-'));
  await mkdir(path.join(root, 'refs'));
  const values = [['char-1', 'character', 'hero'], ['prop-1', 'prop', 'lantern'], ['env-1', 'environment', 'city'], ['style-1', 'style', 'style']];
  for (const [id, , value] of values) await writeFile(path.join(root, 'refs', `${id}.bin`), value);
  const registry = createContinuityReferenceRegistry({ rootDir: root, seriesId: 'series-1', bibleRevisionHash: hash('bible') });
  for (const [id, kind, value] of values) registry.add({ id, kind, path: `refs/${id}.bin`, contentHash: hash(value), approved: true });
  return { root, registry };
}

test('unchanged approved references validate and frozen nested data cannot be mutated', async () => {
  const { registry } = await refs();
  const bundle = freezeReferenceBundle(registry, ['char-1', 'prop-1', 'env-1', 'style-1']);
  assert.equal(bundle.references.length, 4);
  assert.equal(registry.assertCurrent(bundle), true);
  assert.throws(() => { bundle.references[0].approved = false; }, TypeError);
  assert.throws(() => registry.add({ id: 'bad', kind: 'character', path: '../secret', contentHash: hash('bad'), approved: true }), /path/i);
  assert.throws(() => freezeReferenceBundle(registry, ['char-1']), /complete|style|environment|prop/i);
});

test('changed references fail validation and invalid replacement preserves the prior reference', async () => {
  const { root, registry } = await refs();
  const bundle = freezeReferenceBundle(registry, ['char-1', 'prop-1', 'env-1', 'style-1']);
  assert.throws(() => registry.replace({ id: 'char-1', kind: 'character', path: 'refs/missing.bin', contentHash: hash('missing'), approved: true }), /exist|file|reference/i);
  assert.equal(registry.get('char-1').contentHash, hash('hero'));
  await writeFile(path.join(root, 'refs', 'char-1.bin'), 'changed');
  assert.throws(() => registry.assertCurrent(bundle), /stale|changed|bytes/i);
});

test('requires exact lowercase SHA-256 and rejects symlinked reference paths', async () => {
  const { root, registry } = await refs();
  assert.throws(() => registry.add({ id: 'short', kind: 'character', path: 'refs/char-1.bin', contentHash: `sha256:${'a'.repeat(63)}`, approved: true }), /64|sha/i);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'stickman-outside-'));
  await writeFile(path.join(outside, 'secret.bin'), 'secret');
  await symlink(path.join(outside, 'secret.bin'), path.join(root, 'refs', 'link.bin'));
  assert.throws(() => registry.add({ id: 'link', kind: 'character', path: 'refs/link.bin', contentHash: hash('secret'), approved: true }), /symlink|real|path/i);
});
