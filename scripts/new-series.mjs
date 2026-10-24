#!/usr/bin/env node
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Usage: node scripts/new-series.mjs "Series Name"');
  process.exit(2);
}
const slug = title.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
if (!slug) throw new Error('Series name must contain at least one letter or number.');
const root = path.resolve('projects', slug);
try { await access(root); throw new Error(`Refusing to overwrite existing folder: ${root}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const dirs = ['episodes', 'narration', 'references/characters', 'references/props', 'scenes', 'captions', 'exports'];
await mkdir(root, { recursive: true });
for (const dir of dirs) await mkdir(path.join(root, dir), { recursive: true });
const files = {
  'README.md': `# ${title}\n\nLocal series workspace. Keep this folder current; it is ignored by Git by default.\n\n## Production state\n- Stage: development\n- Source storyboard: Boords\n- Visual tool: signed-in Google Flow browser tab\n- Aspect ratio: vertical 9:16\n`,
  'script.md': `# ${title} — current script\n\n> Keep this synchronized with the version used for narration and rendering.\n\n## Series premise\n\n## Character and prop continuity\nSee [continuity.md](continuity.md).\n\n## Episodes\n`,
  'continuity.md': `# ${title} — continuity notes\n\n## Characters\n| Name | Stable design | Ownership / relationships | State changes | Reference |\n|---|---|---|---|---|\n\n## Props\n| Prop | Stable design | Owner | Starting state | Changes by episode/scene | Reference |\n|---|---|---|---|---|---|\n\n## Locations\n`,
  'flow-prompts.json': JSON.stringify({ series: title, styleAnchor: '', characterAnchors: [], propAnchors: [], scenes: [] }, null, 2) + '\n'
};
for (const [name, content] of Object.entries(files)) await writeFile(path.join(root, name), content, { flag: 'wx' });
console.log(`Created local series scaffold: ${root}`);
console.log('Next: fill script.md and continuity.md, plan Boords frames, establish references in Flow, then build a prompt pack.');
