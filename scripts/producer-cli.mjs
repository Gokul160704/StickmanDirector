#!/usr/bin/env node

import { manualFallback } from './producer-session.mjs';
import { createSeriesProducer, resumeSeriesProducer } from './series-producer.mjs';

if (process.argv.includes('--manual')) {
  process.stdout.write(`${manualFallback()}\n`);
} else if (process.argv.includes('--series')) {
  const root = process.argv[process.argv.indexOf('--series') + 1];
  if (!root) {
    console.error('Usage: node scripts/producer-cli.mjs --series <series-root>');
    process.exitCode = 2;
  } else {
    const session = await resumeSeriesProducer(root);
    process.stdout.write(`${JSON.stringify({ mode: session.mode, root: session.root, seriesId: session.bible.seriesId, episodes: session.episodes.map(({ episodeId, index, approval }) => ({ episodeId, index, approval })) }, null, 2)}\n`);
  }
} else if (process.argv.includes('--series-create')) {
  const index = process.argv.indexOf('--series-create');
  const name = process.argv[index + 1];
  const root = process.argv[index + 2];
  const countIndex = process.argv.indexOf('--episodes');
  const episodeCount = countIndex === -1 ? 3 : Number(process.argv[countIndex + 1]);
  if (!name || !root) {
    console.error('Usage: node scripts/producer-cli.mjs --series-create <name> <series-root> [--episodes N]');
    process.exitCode = 2;
  } else {
    const session = await createSeriesProducer({ name, root, episodeCount });
    process.stdout.write(`${JSON.stringify({ mode: session.mode, root: session.root, seriesId: session.bible.seriesId, episodes: session.episodes.map(({ episodeId, index }) => ({ episodeId, index })) }, null, 2)}\n`);
  }
} else {
  process.stdout.write('Guided Producer is offline-first. Run with --manual for the non-interactive decision guide.\n');
}
