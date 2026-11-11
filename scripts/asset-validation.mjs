import { access, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

async function exists(file) { try { await access(file); return true; } catch { return false; } }

function probeImage(file) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', file], { windowsHide: true });
    let out = ''; let err = '';
    child.stdout.on('data', (data) => { out += data; }); child.stderr.on('data', (data) => { err += data; });
    child.on('error', (error) => reject(new Error(`ffprobe could not start for ${file}: ${error.message}`)));
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Invalid image asset ${file}: ffprobe failed (${err.trim().slice(-500) || code}).`));
      try {
        const stream = JSON.parse(out).streams?.[0];
        if (!stream || stream.codec_type !== 'video' || !Number.isInteger(stream.width) || !Number.isInteger(stream.height) || stream.width <= 0 || stream.height <= 0) throw new Error('no valid image stream');
        resolve({ width: stream.width, height: stream.height, codecType: stream.codec_type });
      } catch { reject(new Error(`Invalid image asset ${file}: ffprobe returned no usable image dimensions.`)); }
    });
  });
}

export async function validateImageAssets(root, scenes, { aspectRatio = '16:9' } = {}) {
  const resolvedRoot = await realpath(root);
  const [expectedWidth, expectedHeight] = aspectRatio.split(':').map(Number);
  const expected = expectedWidth / expectedHeight;
  const results = [];
  for (const scene of scenes) {
    const file = path.resolve(root, scene.imagePath ?? scene.image);
    if (!(await exists(file))) throw new Error(`Missing image asset for ${scene.id}: ${file}`);
    const resolvedFile = await realpath(file);
    const relative = path.relative(resolvedRoot, resolvedFile);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Image asset for ${scene.id} resolves outside the project root.`);
    const metadata = await probeImage(resolvedFile);
    const actual = metadata.width / metadata.height;
    if (Math.abs(actual - expected) > 0.03) throw new Error(`Image asset for ${scene.id} has aspect ratio ${metadata.width}:${metadata.height}; expected ${aspectRatio}.`);
    results.push({ sceneId: scene.id, path: resolvedFile, ...metadata });
  }
  return results;
}
