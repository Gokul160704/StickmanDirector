import { access, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const defaultFs = { access, rename, rm };
async function exists(file, fsOps) { try { await fsOps.access(file); return true; } catch { return false; } }

export async function replaceOutputPair({ mp4Temp, srtTemp, mp4Target, srtTarget, replace = false, fsOps = defaultFs }) {
  const backups = [];
  const installed = [];
  const moveExisting = async (target) => {
    if (!replace || !(await exists(target, fsOps))) return;
    const backup = `${target}.rollback-${process.pid}-${randomUUID()}`;
    await fsOps.rename(target, backup);
    backups.push({ target, backup });
  };
  try {
    await moveExisting(mp4Target);
    await moveExisting(srtTarget);
    await fsOps.rename(mp4Temp, mp4Target); installed.push(mp4Target);
    await fsOps.rename(srtTemp, srtTarget); installed.push(srtTarget);
  } catch (error) {
    for (const target of installed.reverse()) await fsOps.rm(target, { force: true });
    for (const { target, backup } of backups.reverse()) {
      if (await exists(backup, fsOps)) await fsOps.rename(backup, target);
    }
    throw error;
  }
  for (const { backup } of backups) await fsOps.rm(backup, { force: true }).catch(() => {});
}
