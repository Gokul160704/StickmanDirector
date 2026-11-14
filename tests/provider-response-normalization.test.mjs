import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeProviderImageResponse,
  persistProviderImage,
  createProviderReceipt,
} from '../scripts/provider-response-normalization.mjs';

function png(width = 2, height = 1) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpeg(width = 2, height = 1) {
  const bytes = Buffer.alloc(23, 0);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, height, 0x00, width, 0x03, 0x01, 0x11, 0x00]).copy(bytes);
  bytes[21] = 0xff; bytes[22] = 0xd9;
  return bytes;
}

const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('normalizes a model-specific base64 JSON response and verifies image metadata', async () => {
  const bytes = png();
  const normalized = await normalizeProviderImageResponse({ model: '@cf/black-forest-labs/flux-1-schnell', response: { image: bytes.toString('base64') }, expectedDimensions: { width: 2, height: 1 } });
  assert.equal(normalized.mimeType, 'image/png');
  assert.equal(normalized.extension, '.png');
  assert.equal(normalized.contentHash, hash(bytes));
  assert.deepEqual(normalized.dimensions, { width: 2, height: 1 });
});

test('normalizes raw binary streams and MCP image content without coercing bytes to text', async () => {
  const bytes = jpeg();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); } });
  const fromStream = await normalizeProviderImageResponse({ model: '@cf/bytedance/stable-diffusion-xl-base-1.0', response: stream, expectedDimensions: { width: 2, height: 1 } });
  const fromMcp = await normalizeProviderImageResponse({ model: '@cf/leonardo/lucid-origin', response: { content: [{ type: 'image', data: bytes.toString('base64'), mimeType: 'image/jpeg' }] }, expectedDimensions: { width: 2, height: 1 } });
  assert.deepEqual(fromStream.bytes, bytes);
  assert.deepEqual(fromMcp.bytes, bytes);
  assert.equal(fromStream.extension, '.jpg');
  assert.equal(fromMcp.mimeType, 'image/jpeg');
  const wrapped = await normalizeProviderImageResponse({ model: '@cf/leonardo/lucid-origin', response: { base64: bytes.toString('base64'), byteLength: bytes.length }, expectedDimensions: { width: 2, height: 1 } });
  assert.deepEqual(wrapped.bytes, bytes);
});

test('rejects empty, truncated, unknown, and plain-text payloads before persistence', async () => {
  for (const response of [Buffer.alloc(0), Buffer.from('plain text'), { image: 'not-base64' }, { content: [] }]) {
    await assert.rejects(() => normalizeProviderImageResponse({ model: '@cf/black-forest-labs/flux-1-schnell', response }), /image|payload|base64|empty|recognized/i);
  }
});

test('rejects ambiguous or mismatched MCP byte envelopes', async () => {
  const bytes = png();
  await assert.rejects(() => normalizeProviderImageResponse({ model: '@cf/leonardo/lucid-origin', response: { content: [{ type: 'image', data: bytes.toString('base64') }, { type: 'image', data: bytes.toString('base64') }] } }), /multiple/i);
  await assert.rejects(() => normalizeProviderImageResponse({ model: '@cf/leonardo/lucid-origin', response: { base64: bytes.toString('base64'), byteLength: bytes.length + 1 } }), /length/i);
});

test('persists bytes atomically with a magic-byte-derived extension and receipt', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'provider-image-'));
  const bytes = jpeg(2, 1);
  const normalized = await normalizeProviderImageResponse({ model: '@cf/leonardo/phoenix-1.0', response: bytes, expectedDimensions: { width: 2, height: 1 } });
  const saved = await persistProviderImage({ outputRoot: root, basename: 'scene-01', normalized });
  assert.equal(saved.path.endsWith('.jpg'), true);
  assert.deepEqual(await readFile(saved.path), bytes);
  assert.equal(saved.contentHash, hash(bytes));
  await assert.rejects(() => persistProviderImage({ outputRoot: root, basename: 'scene-01', normalized }), /exists|collision/i);
  const receipt = createProviderReceipt({ provider: 'cloudflare-workers-ai', model: normalized.model, attemptId: 'attempt-1', output: saved, usage: { neurons: null, status: 'unreported' } });
  assert.equal(receipt.usage.status, 'unreported');
  assert.equal(receipt.output.contentHash, hash(bytes));
  assert.equal(JSON.stringify(receipt).includes('base64'), false);
});

test('preserves unknown outcome semantics when persistence fails after dispatch', async () => {
  const bytes = png();
  const normalized = await normalizeProviderImageResponse({ model: '@cf/black-forest-labs/flux-2-klein-9b', response: { result: { image: bytes.toString('base64') } } });
  await assert.rejects(() => persistProviderImage({ outputRoot: path.join(os.tmpdir(), 'missing-parent', 'not-a-directory'), basename: '../escape', normalized }), /path|outside|invalid/i);
});
