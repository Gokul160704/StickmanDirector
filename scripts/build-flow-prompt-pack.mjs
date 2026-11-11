#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const input = process.argv[2];
if (!input || process.argv.includes('--help')) {
  console.log('Usage: node scripts/build-flow-prompt-pack.mjs <series-folder/flow-prompts.json>');
  console.log('Builds copyable image and image-to-video prompts for the configured Google Flow MCP.');
  process.exit(input ? 0 : 2);
}
const source = path.resolve(input);
const data = JSON.parse(await readFile(source, 'utf8').replace(/^\uFEFF/, ''));
if (!data.series || !Array.isArray(data.scenes)) throw new Error('Expected "series" and a "scenes" array.');
const ratio = data.aspectRatio || '16:9';
const lines = [`# Google Flow prompt pack — ${data.series}`, '', `> Prepare in the configured Google Flow MCP. This file only prepares text; it does not generate media or spend credits. Default aspect ratio: ${ratio}.`, '', '## Shared visual anchor', data.styleAnchor || '(Add the approved style anchor.)', '', '## Character continuity'];
for (const item of data.characterAnchors ?? []) lines.push(`- **${item.name ?? 'Character'}:** ${item.description ?? ''}`);
if (!(data.characterAnchors ?? []).length) lines.push('- (Add approved character anchors and reference links.)');
lines.push('', '## Prop continuity');
for (const item of data.propAnchors ?? []) lines.push(`- **${item.name ?? 'Prop'}:** ${item.description ?? ''}`);
if (!(data.propAnchors ?? []).length) lines.push('- (Add recurring props, owners, starting states, and changes.)');
lines.push('', '## Scene prompts');
for (const scene of data.scenes) {
  const heading = [scene.episode, scene.scene].filter(Boolean).join(' — ') || 'Untitled scene';
  lines.push('', `### ${heading}`, '', '#### Still image', '', `Create one complete, full-frame ${ratio} story illustration. Keep headings, captions, labels, panels, arrows, and explanatory callouts out of the image.`, '', scene.imagePrompt || scene.prompt || '(Add the approved still-image prompt.)', '', '#### Image-to-video', '', 'Use only after the source still is reviewed and approved. Preserve character identity, clothing, props, composition, and art style; keep motion coherent and avoid introducing text or new story elements.', '', scene.videoPrompt || '(Add a per-shot motion prompt after reviewing the still.)');
}
if (!data.scenes.length) lines.push('', '(Add scenes to flow-prompts.json.)');
const output = path.join(path.dirname(source), 'flow-prompt-pack.md');
await writeFile(output, lines.join('\n') + '\n', { flag: 'w' });
console.log(`Wrote ${output}`);
