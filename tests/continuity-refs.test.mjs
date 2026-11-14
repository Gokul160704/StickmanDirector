import test from 'node:test';
import assert from 'node:assert/strict';
import { createContinuityReferenceRegistry, freezeReferenceBundle } from '../scripts/continuity-refs.mjs';

test('pins approved character, prop, environment, style and bible hashes into an immutable bundle', () => {
  const registry = createContinuityReferenceRegistry({ seriesId: 'series-1', bibleRevisionHash: 'sha256:bible' });
  registry.add({ id: 'char-1', kind: 'character', path: 'refs/hero.png', contentHash: `sha256:${'a'.repeat(64)}`, approved: true });
  registry.add({ id: 'prop-1', kind: 'prop', path: 'refs/lantern.png', contentHash: `sha256:${'b'.repeat(64)}`, approved: true });
  registry.add({ id: 'env-1', kind: 'environment', path: 'refs/city.png', contentHash: `sha256:${'c'.repeat(64)}`, approved: true });
  registry.add({ id: 'style-1', kind: 'style', path: 'refs/style.png', contentHash: `sha256:${'d'.repeat(64)}`, approved: true });
  const bundle = freezeReferenceBundle(registry, ['char-1', 'prop-1', 'env-1', 'style-1']);
  assert.equal(bundle.references.length, 4);
  assert.match(bundle.bundleHash, /^sha256:/);
  assert.throws(() => registry.add({ id: 'bad', kind: 'character', path: '../secret', contentHash: 'sha256:x', approved: true }), /path/i);
  assert.throws(() => freezeReferenceBundle(registry, ['char-1']), /complete|style|environment|prop/i);
});

test('changed reference hash invalidates a prior frozen bundle', () => {
  const registry = createContinuityReferenceRegistry({ seriesId: 'series-1', bibleRevisionHash: 'sha256:bible' });
  registry.add({ id: 'char-1', kind: 'character', path: 'refs/hero.png', contentHash: `sha256:${'a'.repeat(64)}`, approved: true });
  registry.add({ id: 'prop-1', kind: 'prop', path: 'refs/lantern.png', contentHash: `sha256:${'b'.repeat(64)}`, approved: true });
  registry.add({ id: 'env-1', kind: 'environment', path: 'refs/city.png', contentHash: `sha256:${'c'.repeat(64)}`, approved: true });
  registry.add({ id: 'style-1', kind: 'style', path: 'refs/style.png', contentHash: `sha256:${'d'.repeat(64)}`, approved: true });
  const bundle = freezeReferenceBundle(registry, ['char-1', 'prop-1', 'env-1', 'style-1']);
  registry.replace({ id: 'char-1', kind: 'character', path: 'refs/hero.png', contentHash: `sha256:${'e'.repeat(64)}`, approved: true });
  assert.throws(() => registry.assertCurrent(bundle), /stale|changed/i);
});
