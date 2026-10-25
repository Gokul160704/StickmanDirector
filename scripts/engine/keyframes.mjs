const numeric = ['x','y','head','torso','shoulderL','elbowL','shoulderR','elbowR','hipL','kneeL','hipR','kneeR'];
const smooth = (t) => t * t * (3 - 2 * t);

export function interpolateKeyframes(keys, time) {
  if (!keys?.length) throw new Error('At least one keyframe is required');
  if (time <= keys[0].t) return poseAt(keys[0]);
  if (time >= keys.at(-1).t) return poseAt(keys.at(-1));
  let i = 0;
  while (keys[i + 1].t < time) i++;
  const a = keys[i], b = keys[i + 1];
  const linear = (time - a.t) / (b.t - a.t), t = smooth(linear);
  const pose = { root: {}, expression: a.expression ?? {} };
  for (const key of numeric) {
    const av = key === 'x' || key === 'y' ? a.root[key] : a[key];
    const bv = key === 'x' || key === 'y' ? b.root[key] : b[key];
    const value = av + (bv - av) * t;
    if (key === 'x' || key === 'y') pose.root[key] = value; else pose[key] = value;
  }
  return pose;
}

function poseAt(k) {
  const pose = { root: { ...k.root }, expression: { ...(k.expression ?? {}) } };
  for (const key of numeric.slice(2)) pose[key] = k[key];
  return pose;
}
