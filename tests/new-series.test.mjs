import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = path.resolve('scripts/new-series.mjs');

test('multi-episode CLI honors 1, 3, and 5 without provider calls', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'stickman-cli-'));
  try {
    for (const [title, count] of [['One', 1], ['Three', 3], ['Five', 5]]) {
      await run(process.execPath, [script, '--multi-episode', title, '--episodes', String(count)], { cwd: parent });
      const slug = title.toLowerCase();
      const bible = JSON.parse(await readFile(path.join(parent, 'projects', slug, 'series-bible.json'), 'utf8'));
      assert.equal(bible.episodes.length, count);
    }
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('multi-episode CLI refuses to overwrite the original scaffold', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'stickman-cli-overwrite-'));
  try {
    const args = [script, '--multi-episode', 'Repeat', '--episodes', '3'];
    await run(process.execPath, args, { cwd: parent });
    await assert.rejects(run(process.execPath, args, { cwd: parent }), /refusing to overwrite|already exists/i);
  } finally { await rm(parent, { recursive: true, force: true }); }
});
