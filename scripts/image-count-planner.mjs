const PACE_HOLD_SECONDS = Object.freeze({
  reflective: 4.5,
  cinematic: 3,
  energetic: 2.2,
});

const PLANNER_VERSION = 'image-count-planner-v1';

function finiteNumber(value, field, { integer = false, positive = false, nonNegative = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value)) || (positive && value <= 0) || (nonNegative && value < 0)) {
    throw new Error(`${field} must be ${integer ? 'a' : 'a finite'} ${positive ? 'positive ' : ''}${integer ? 'integer' : 'number'}.`);
  }
  return value;
}

function validatePace(pace) {
  if (!Object.hasOwn(PACE_HOLD_SECONDS, pace)) throw new Error(`pace must be one of: ${Object.keys(PACE_HOLD_SECONDS).join(', ')}.`);
  return pace;
}

function validateBeat(beat, index, previousEnd) {
  if (!beat || typeof beat !== 'object' || Array.isArray(beat)) throw new Error(`beats[${index}] must be an object.`);
  if (typeof beat.id !== 'string' || !beat.id.trim()) throw new Error(`beats[${index}].id must be a non-empty string.`);
  const id = beat.id.trim();
  const startSeconds = finiteNumber(beat.startSeconds, `beats[${index}].startSeconds`, { nonNegative: true });
  const endSeconds = finiteNumber(beat.endSeconds, `beats[${index}].endSeconds`, { positive: true });
  if (endSeconds <= startSeconds) throw new Error(`beats[${index}].startSeconds must be less than endSeconds.`);
  if (startSeconds < previousEnd) throw new Error(`beats[${index}] overlaps or is out of order.`);
  const complexity = beat.complexity === undefined ? 1 : finiteNumber(beat.complexity, `beats[${index}].complexity`, { positive: true });
  const emotionalHold = beat.emotionalHold === undefined ? 1 : finiteNumber(beat.emotionalHold, `beats[${index}].emotionalHold`, { positive: true });
  const phraseBoundaries = beat.phraseBoundaries === undefined ? [] : beat.phraseBoundaries;
  if (!Array.isArray(phraseBoundaries)) throw new Error(`beats[${index}].phraseBoundaries must be an array.`);
  const boundaries = phraseBoundaries.map((value, boundaryIndex) => {
    const boundary = finiteNumber(value, `beats[${index}].phraseBoundaries[${boundaryIndex}]`);
    if (boundary <= startSeconds || boundary >= endSeconds) throw new Error(`beats[${index}].phraseBoundaries must fall inside the beat.`);
    return boundary;
  }).sort((left, right) => left - right);
  if (new Set(boundaries).size !== boundaries.length) throw new Error(`beats[${index}].phraseBoundaries must be unique.`);
  return {
    id,
    startSeconds,
    endSeconds,
    durationSeconds: endSeconds - startSeconds,
    essential: beat.essential !== false,
    complexity,
    emotionalHold,
    phraseBoundaries: boundaries,
  };
}

function allocationWeight(beat) {
  return Math.max(0.5, Math.min(2.5, 1 + ((beat.complexity - 1) * 0.2) + ((beat.emotionalHold - 1) * 0.2)));
}

function allocateCustomCounts(beats, count) {
  if (count < beats.length) {
    const essentialCount = beats.filter((beat) => beat.essential).length;
    throw new Error(`customImageCount ${count} is too small; at least one shot per beat is required${essentialCount ? ` for ${essentialCount} essential beats` : ''}.`);
  }
  const ideal = beats.map((beat) => beat.durationSeconds * allocationWeight(beat));
  const counts = beats.map(() => 1);
  const capacities = beats.map((beat) => beat.phraseBoundaries.length ? beat.phraseBoundaries.length + 1 : Infinity);
  if (count > capacities.reduce((total, capacity) => total + capacity, 0)) {
    throw new Error(`customImageCount ${count} exceeds the available phrase-boundary slots; add approved boundaries or choose a smaller count.`);
  }
  let remaining = count - counts.length;
  while (remaining > 0) {
    let selected = 0;
    let selectedScore = -Infinity;
    for (let index = 0; index < beats.length; index += 1) {
      if (counts[index] >= capacities[index]) continue;
      const score = ideal[index] / (counts[index] + 1);
      if (score > selectedScore || (score === selectedScore && beats[index].id < beats[selected].id)) {
        selected = index;
        selectedScore = score;
      }
    }
    counts[selected] += 1;
    remaining -= 1;
  }
  return counts;
}

function choosePhraseCuts(beat, count) {
  const startFrame = Math.round(beat.startSeconds * 30);
  const endFrame = Math.round(beat.endSeconds * 30);
  const durationFrames = endFrame - startFrame;
  if (count === 1) return [startFrame, endFrame];
  const phraseFrames = [...new Set(beat.phraseBoundaries.map((value) => Math.round(value * 30)))].filter((value) => value > startFrame && value < endFrame);
  if (beat.phraseBoundaries.length && phraseFrames.length < count - 1) throw new Error(`Beat ${beat.id} does not have enough phrase boundaries for ${count} shots; add boundaries or choose a smaller count.`);
  const cuts = [startFrame];
  for (let split = 1; split < count; split += 1) {
    const desired = startFrame + Math.round((durationFrames * split) / count);
    const remainingSplits = count - split - 1;
    const candidates = phraseFrames.length ? phraseFrames : [desired];
    const available = candidates.filter((candidate) => candidate > cuts.at(-1) && endFrame - candidate >= remainingSplits);
    if (!available.length) throw new Error(`Beat ${beat.id} cannot fit ${count} positive-duration shots at 30fps.`);
    const selected = available.reduce((best, candidate) => Math.abs(candidate - desired) < Math.abs(best - desired) ? candidate : best);
    cuts.push(selected);
  }
  cuts.push(endFrame);
  return cuts;
}

function buildShots(beats, counts) {
  const shots = [];
  let sceneNumber = 1;
  beats.forEach((beat, beatIndex) => {
    const cuts = choosePhraseCuts(beat, counts[beatIndex]);
    for (let index = 0; index < counts[beatIndex]; index += 1) {
      const startFrame = cuts[index];
      const endFrame = cuts[index + 1];
      shots.push({
        sceneId: `scene-${String(sceneNumber).padStart(2, '0')}`,
        storyBeatId: beat.id,
        imageSlot: `${beat.id}-image-${index + 1}`,
        order: sceneNumber,
        startFrame,
        endFrame,
        durationFrames: endFrame - startFrame,
        startSeconds: startFrame / 30,
        endSeconds: endFrame / 30,
      });
      sceneNumber += 1;
    }
  });
  return shots;
}

export function planImageCount({ beats, pace = 'cinematic', customImageCount, durationSeconds, narrationDurationSeconds, timingSource = 'estimate' } = {}) {
  validatePace(pace);
  if (!Array.isArray(beats) || beats.length === 0) throw new Error('beats must contain at least one beat.');
  const normalizedBeats = [];
  let previousEnd = 0;
  for (let index = 0; index < beats.length; index += 1) {
    const normalized = validateBeat(beats[index], index, previousEnd);
    normalizedBeats.push(normalized);
    previousEnd = normalized.endSeconds;
  }
  if (new Set(normalizedBeats.map((beat) => beat.id)).size !== normalizedBeats.length) throw new Error('beat ids must be unique.');
  if (durationSeconds !== undefined) finiteNumber(durationSeconds, 'durationSeconds', { positive: true });
  if (narrationDurationSeconds !== undefined) finiteNumber(narrationDurationSeconds, 'narrationDurationSeconds', { positive: true });
  const declaredDuration = narrationDurationSeconds ?? durationSeconds;
  if (declaredDuration !== undefined && Math.abs(declaredDuration - previousEnd) > (1 / 30) + 1e-9) throw new Error('Declared narration duration must match the beat timeline within one frame.');
  if (customImageCount !== undefined) finiteNumber(customImageCount, 'customImageCount', { integer: true, positive: true });
  const idealCounts = normalizedBeats.map((beat) => Math.max(1, Math.round((beat.durationSeconds * allocationWeight(beat)) / PACE_HOLD_SECONDS[pace])));
  const recommendedCount = idealCounts.reduce((total, value) => total + value, 0);
  const mode = customImageCount === undefined ? 'recommended' : 'custom';
  const requestedCount = customImageCount ?? recommendedCount;
  const counts = mode === 'custom' ? allocateCustomCounts(normalizedBeats, requestedCount) : idealCounts;
  const shots = buildShots(normalizedBeats, counts);
  const hold = PACE_HOLD_SECONDS[pace];
  const rationale = mode === 'custom'
    ? `Custom request: ${requestedCount} unique still-image slots allocated across ${normalizedBeats.length} narrative beats using ${pace} pacing (approximately ${hold}s target holds).`
    : `Recommended ${recommendedCount} still-image slots from ${normalizedBeats.length} narrative beats using ${pace} pacing and approximately ${hold}s target holds; complexity and emotional holds influence allocation.`;
  return {
    version: PLANNER_VERSION,
    mode,
    pace,
    recommendedCount,
    requestedCount,
    timingSource,
    rationale,
    shots,
  };
}

export { PACE_HOLD_SECONDS, PLANNER_VERSION };
