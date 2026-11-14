import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MODEL_RESPONSE_KIND = Object.freeze({
  '@cf/black-forest-labs/flux-1-schnell': 'json-base64',
  '@cf/black-forest-labs/flux-2-klein-4b': 'json-base64',
  '@cf/black-forest-labs/flux-2-klein-9b': 'json-base64',
  '@cf/bytedance/stable-diffusion-xl-base-1.0': 'binary',
  '@cf/bytedance/stable-diffusion-xl-lightning': 'binary',
  '@cf/leonardo/lucid-origin': 'binary',
  '@cf/leonardo/phoenix-1.0': 'binary',
});

function hash(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function asBuffer(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  return null;
}
function decodeBase64(value) {
  if (typeof value !== 'string') throw new Error('Provider image base64 payload must be a string.');
  const encoded = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value;
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Provider image base64 payload is invalid or truncated.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length) throw new Error('Provider image payload is empty.');
  return bytes;
}
async function readStream(stream) {
  const chunks = [];
  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    try { while (true) { const next = await reader.read(); if (next.done) break; chunks.push(Buffer.from(next.value)); } }
    finally { reader.releaseLock?.(); }
  } else if (stream?.[Symbol.asyncIterator]) {
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  } else throw new Error('Unsupported provider binary stream.');
  const bytes = Buffer.concat(chunks);
  if (!bytes.length) throw new Error('Provider image stream was empty.');
  return bytes;
}
function pngDimensions(bytes) { return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }; }
function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]; offset += 2;
    if ([0xd8, 0xd9].includes(marker)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    offset += length;
  }
  throw new Error('JPEG image dimensions are missing or truncated.');
}
function webpDimensions(bytes) {
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && bytes.length >= 30) return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (chunk === 'VP8L' && bytes.length >= 25) return { width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)), height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)) };
  if (chunk === 'VP8 ' && bytes.length >= 30) return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  throw new Error('WebP image dimensions are missing or unsupported.');
}
function identify(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mimeType: 'image/png', extension: '.png', dimensions: pngDimensions(bytes) };
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return { mimeType: 'image/jpeg', extension: '.jpg', dimensions: jpegDimensions(bytes) };
  if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { mimeType: 'image/webp', extension: '.webp', dimensions: webpDimensions(bytes) };
  throw new Error('Provider output is not a recognized PNG, JPEG, or WebP image.');
}
function jsonImage(response) {
  const candidates = [response?.image, response?.result?.image, response?.output?.image];
  const candidate = candidates.find((value) => typeof value === 'string');
  return candidate ? decodeBase64(candidate) : null;
}
async function extractBytes(model, response) {
  const direct = asBuffer(response);
  if (direct) return direct;
  if (typeof Blob !== 'undefined' && response instanceof Blob) return Buffer.from(await response.arrayBuffer());
  if (response?.content && Array.isArray(response.content)) {
    const images = response.content.filter((entry) => entry?.type === 'image');
    if (images.length > 1) throw new Error('MCP image response contains multiple images without an explicit selection.');
    if (images.length === 1 && typeof images[0].data === 'string') return decodeBase64(images[0].data);
    if (images.length === 1) throw new Error('MCP image content is missing base64 data.');
  }
  for (const candidate of [response, response?.result]) if (candidate && typeof candidate.base64 === 'string') { const bytes = decodeBase64(candidate.base64); if (Number.isInteger(candidate.byteLength) && candidate.byteLength !== bytes.length) throw new Error('MCP byte wrapper length does not match decoded bytes.'); return bytes; }
  if (MODEL_RESPONSE_KIND[model] === 'json-base64') {
    const image = jsonImage(response);
    if (image) return image;
    if (response?.bytes !== undefined) { const bytes = asBuffer(response.bytes); if (bytes) return bytes; }
    throw new Error(`Cloudflare model ${model} did not return its documented JSON image payload.`);
  }
  if (response?.bytes !== undefined) { const bytes = asBuffer(response.bytes); if (bytes) return bytes; }
  if (response?.result !== undefined && !response?.result?.usage) {
    const nested = asBuffer(response.result);
    if (nested) return nested;
  }
  if (response && (typeof response.getReader === 'function' || response[Symbol.asyncIterator])) return readStream(response);
  throw new Error(`Cloudflare model ${model} did not return its documented binary image payload.`);
}

export async function normalizeProviderImageResponse({ model, response, expectedDimensions } = {}) {
  if (!MODEL_RESPONSE_KIND[model]) throw new Error(`Unsupported Cloudflare response model: ${model}.`);
  const bytes = await extractBytes(model, response);
  const identified = identify(bytes);
  if (expectedDimensions && (identified.dimensions.width !== expectedDimensions.width || identified.dimensions.height !== expectedDimensions.height)) throw new Error('Provider output dimensions do not match the approved request.');
  return { model, bytes, ...identified, contentHash: hash(bytes) };
}

export async function persistProviderImage({ outputRoot, basename, normalized } = {}) {
  if (!outputRoot || !path.isAbsolute(outputRoot)) throw new Error('Provider output root must be an absolute path.');
  if (!basename || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(basename)) throw new Error('Provider output basename is invalid or escapes the output root.');
  if (!normalized?.bytes || !normalized.extension || normalized.contentHash !== hash(normalized.bytes)) throw new Error('Provider image normalization or content hash is invalid.');
  const root = path.resolve(outputRoot); await mkdir(root, { recursive: true });
  const target = path.join(root, `${basename}${normalized.extension}`);
  try { await access(target); throw new Error(`Provider output already exists: ${target}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, normalized.bytes, { flag: 'wx' });
    const written = await readFile(temporary); if (hash(written) !== normalized.contentHash) throw new Error('Provider output hash changed during persistence.');
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
  return { path: target, contentHash: normalized.contentHash, mimeType: normalized.mimeType, extension: normalized.extension, dimensions: normalized.dimensions };
}

export function createProviderReceipt({ provider, model, attemptId, responseId = null, output, usage, latencyMs = null, requestHash = null, quoteHash = null } = {}) {
  if (!provider || !model || !attemptId || !output?.contentHash) throw new Error('Provider receipt requires provider, model, attempt, and verified output metadata.');
  const reported = Number.isFinite(usage?.neurons);
  return { schemaVersion: 1, provider, model, attemptId, responseId, requestHash, quoteHash, latencyMs, output: { path: output.path, contentHash: output.contentHash, mimeType: output.mimeType, extension: output.extension, dimensions: output.dimensions }, usage: { neurons: reported ? usage.neurons : null, status: reported ? 'reported' : 'unreported' }, createdAt: new Date().toISOString() };
}

export { MODEL_RESPONSE_KIND };
