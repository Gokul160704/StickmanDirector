#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { loadEpisodeManifest } from './episode-manifest.mjs';

const input = process.argv[2];
if (!input || process.argv.includes('--help')) {
  console.log('Usage: node scripts/validate-episode.mjs <episode.json>');
  process.exit(input ? 0 : 2);
}
try {
  const manifest = await loadEpisodeManifest(input, { root: path.dirname(path.resolve(input)) });
  console.log(JSON.stringify({ valid: true, episodeId: manifest.episodeId, scenes: manifest.scenes.length }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
