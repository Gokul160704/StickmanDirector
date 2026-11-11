import { access, realpath } from 'node:fs/promises';
import path from 'node:path';

async function existingAncestor(file) {
  let candidate = path.resolve(file);
  while (true) {
    try { await access(candidate); return candidate; } catch { const parent = path.dirname(candidate); if (parent === candidate) throw new Error(`Unable to resolve path ancestor: ${file}`); candidate = parent; }
  }
}

export async function assertPathInsideRoot(root, target, field = 'path') {
  const realRoot = await realpath(path.resolve(root));
  const resolvedTarget = path.resolve(target);
  const lexicalRelative = path.relative(realRoot, resolvedTarget);
  if (lexicalRelative === '..' || lexicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(lexicalRelative)) throw new Error(`${field} resolves outside the project root.`);
  const realAncestor = await realpath(await existingAncestor(resolvedTarget));
  const relative = path.relative(realRoot, realAncestor);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${field} resolves outside the project root through a symlink.`);
  return resolvedTarget;
}
