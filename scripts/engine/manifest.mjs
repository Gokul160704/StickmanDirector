import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const fail = (where, message) => { throw new Error(`${where}: ${message}`); };

export async function loadEpisodeManifest(filePath) {
  const absolute = path.resolve(filePath);
  let data;
  try { data = JSON.parse(await readFile(absolute, 'utf8')); }
  catch (error) { throw new Error(`Cannot read episode manifest ${absolute}: ${error.message}`); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('manifest', 'top-level JSON value must be an object');
  const root = path.dirname(absolute);
  if (data.version !== 1) fail('version', 'only version 1 is supported');
  if (!Number.isInteger(data.width) || !Number.isInteger(data.height) || data.width < 100 || data.height < 100 || Math.abs(data.width / data.height - 9 / 16) > 0.002) fail('width/height', 'must describe a vertical 9:16 canvas');
  if (!finite(data.fps) || data.fps < 1 || data.fps > 60) fail('fps', 'must be between 1 and 60');
  if (!data.audio?.narration) fail('audio.narration', 'required WAV path is missing');
  const resolveExisting = async (value, field) => {
    if (typeof value !== 'string' || !value.trim()) fail(field, 'path is required');
    const resolved = path.resolve(root, value);
    try { await access(resolved); } catch { fail(field, `file not found: ${resolved}`); }
    return resolved;
  };
  data.audio.narration = await resolveExisting(data.audio.narration, 'audio.narration');
  if (!Array.isArray(data.shots) || !data.shots.length) fail('shots', 'at least one shot is required');
  if (!data.character || !data.character.id) fail('character.id', 'required');
  for (const key of ['headRadius','torsoLength','upperArmLength','lowerArmLength','upperLegLength','lowerLegLength','strokeWidth']) if (!finite(data.character[key]) || data.character[key] <= 0) fail(`character.${key}`, 'must be a positive number');
  let end = 0;
  for (const [i, shot] of data.shots.entries()) {
    const where = `shots[${i}]`;
    if (!shot || typeof shot !== 'object' || Array.isArray(shot)) fail(where, 'must be an object');
    if (!finite(shot.start) || !finite(shot.end) || shot.start < 0 || shot.end <= shot.start) fail(where, 'requires valid start/end seconds');
    if (Math.abs(shot.start - end) > 1e-4) fail(`${where}.start`, 'shots must be contiguous, with no gaps or overlaps');
    end = shot.end;
    shot.background = await resolveExisting(shot.background, `${where}.background`);
    if (!Array.isArray(shot.keyframes) || !shot.keyframes.length) fail(`${where}.keyframes`, 'at least one keyframe is required');
    let prior = -1;
    for (const [j, k] of shot.keyframes.entries()) {
      const kp = `${where}.keyframes[${j}]`;
      if (!k || typeof k !== 'object' || Array.isArray(k)) fail(kp, 'must be an object');
      if (!finite(k.t) || k.t < 0 || k.t > shot.end - shot.start || k.t <= prior) fail(`${kp}.t`, 'must be strictly increasing and within the shot duration');
      prior = k.t;
      if (!finite(k.root?.x) || !finite(k.root?.y)) fail(`${kp}.root`, 'x and y must be finite numbers');
      for (const joint of ['head','torso','shoulderL','elbowL','shoulderR','elbowR','hipL','kneeL','hipR','kneeR']) if (!finite(k[joint])) fail(`${kp}.${joint}`, 'must be a finite angle in radians');
    }
  }
  const duration = end;
  if (data.captions !== undefined && !Array.isArray(data.captions)) fail('captions', 'must be an array');
  for (const [i, cue] of (data.captions ?? []).entries()) {
    if (!cue || typeof cue !== 'object' || Array.isArray(cue)) fail(`captions[${i}]`, 'must be an object');
    if (!finite(cue.start) || !finite(cue.end) || cue.start < 0 || cue.end <= cue.start || cue.end > duration || typeof cue.text !== 'string' || !cue.text.trim()) fail(`captions[${i}]`, 'requires nonempty text and valid times within the episode');
  }
  data.duration = duration;
  data.manifestDirectory = root;
  return data;
}
