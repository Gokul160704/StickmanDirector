#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function createBoordsHandoff(manifest) {
  return {
    format: 'stickmandirector-boords-handoff-v1',
    episodeId: manifest.episodeId,
    title: manifest.title,
    topic: manifest.topic,
    frames: (manifest.scenes ?? []).map((scene) => ({
      sceneId: scene.id,
      ...(scene.storyBeatId !== undefined ? { storyBeatId: scene.storyBeatId } : {}),
      order: scene.order,
      shot: scene.camera ?? 'medium-wide composition',
      action: scene.visualDescription ?? scene.description ?? '',
      characters: scene.characters ?? [],
      props: scene.props ?? [],
      narration: scene.narration ?? '',
      durationSeconds: scene.durationSeconds,
      imagePath: scene.image,
      continuityNotes: scene.continuityNotes ?? '',
      reviewStatus: scene.reviewStatus ?? 'pending',
    })),
    integration: { mode: 'manual-import', liveBoordsAccessVerified: false, instructions: 'Create or open the Boords project, add frames in order, paste each frame record into its shot/action, narration, reference, duration, and review fields, then resolve comments in Boords.' },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const input = process.argv[2];
  if (!input) { console.error('Usage: node scripts/boords-handoff.mjs <episode.json>'); process.exit(2); }
  const source = path.resolve(input);
  const manifest = JSON.parse(await readFile(source, 'utf8'));
  const output = path.join(path.dirname(source), 'boords-handoff.json');
  await writeFile(output, `${JSON.stringify(createBoordsHandoff(manifest), null, 2)}\n`, { flag: 'wx' });
  console.log(`Wrote ${output}`);
}
