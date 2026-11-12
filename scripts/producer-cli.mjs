#!/usr/bin/env node

import { manualFallback } from './producer-session.mjs';

if (process.argv.includes('--manual')) {
  process.stdout.write(`${manualFallback()}\n`);
} else {
  process.stdout.write('Guided Producer is offline-first. Run with --manual for the non-interactive decision guide.\n');
}
