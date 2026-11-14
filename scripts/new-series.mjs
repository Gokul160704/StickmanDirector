#!/usr/bin/env node
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { scaffoldSeries } from './series-bible.mjs';

const args = process.argv.slice(2);
const multiIndex = args.indexOf('--multi-episode');
if (multiIndex !== -1) {
  const countIndex = args.indexOf('--episodes');
  const titleParts = args.slice(multiIndex + 1, countIndex === -1 ? args.length : countIndex);
  const title = titleParts.join(' ').trim();
  const episodeCount = countIndex === -1 ? 3 : Number(args[countIndex + 1]);
  if (!title) {
    console.error('Usage: node scripts/new-series.mjs --multi-episode "Series Name" [--episodes N]');
    process.exit(2);
  }
  try {
    const result = await scaffoldSeries(path.resolve('projects', title.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')), { name: title, topic: title, episodeCount });
    console.log(`Created multi-episode series scaffold: ${result.root}`);
    console.log(`Episodes: ${result.episodes.length}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
  // The legacy positional branch below is intentionally unchanged.
} else {
const title = args.join(' ').trim();
if (!title) {
  console.error('Usage: node scripts/new-series.mjs "Series Name"');
  process.exit(2);
}
const slug = title.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
if (!slug) throw new Error('Series name must contain at least one letter or number.');
const root = path.resolve('projects', slug);
try { await access(root); throw new Error(`Refusing to overwrite existing folder: ${root}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const dirs = [
  'script', 'continuity', 'references/characters', 'references/props', 'references/environments',
  'scenes', 'images', 'narration', 'captions', 'exports',
  // Retained for older tooling that stores part-level planning here.
  'episodes',
];
await mkdir(root, { recursive: true });
for (const dir of dirs) await mkdir(path.join(root, dir), { recursive: true });
const files = {
  'README.md': `# ${title}\n\nLocal series workspace. Keep this folder current; it is ignored by Git by default.\n\n## Production state\n- Stage: development\n- Source storyboard: Boords\n- Visual inputs: approved provider-neutral 16:9 stills\n- Default visual tool: configured GTAI-1 Google Flow MCP\n- Alternatives: separately authorized Cloudflare Workers AI or suitably licensed manual imports; no silent fallback\n- Continuity: freeze and record the SHA-256 reference bundle before each batch\n- Aspect ratio: 16:9\n- Motion: still-image assembly only; no Flow video clips required\n- Approval: provider quote/consent, per-image review, creative acceptance, and publication remain separate gates\n`,
  'episode.json': JSON.stringify({
    schemaVersion: 1,
    episodeId: `${slug}-episode-01`,
    title: `${title} — Episode 1`,
    topic: title,
    description: 'Add the approved episode description.',
    targetAudience: 'General audience',
    intendedDurationSeconds: 60,
    output: { resolution: '1920x1080', frameRate: 30, aspectRatio: '16:9' },
    references: { characters: [], props: [], environments: [], visualStyle: '' },
    research: { questions: [], sources: [], verifiedClaims: [], uncertaintyNotes: '' },
    script: { approvalStatus: 'draft', revision: 1 },
    continuity: { characters: [], props: [], environments: [] },
    storyboard: { source: 'Boords', handoffFormat: 'stickmandirector-boords-handoff-v1' },
    audio: { path: 'narration/episode-01.wav' },
    scenes: [],
    production: { status: 'planning', provenance: { source: 'manual', approved: false } },
  }, null, 2) + '\n',
  'script.md': `# ${title} — current script\n\n> Keep this synchronized with the version used for narration and rendering.\n\n## Series premise\n\n## Character and prop continuity\nSee [continuity.md](continuity.md).\n\n## Episodes\n`,
  'continuity.md': `# ${title} — continuity notes\n\n## Characters\n| Name | Stable design | Ownership / relationships | State changes | Reference |\n|---|---|---|---|---|\n\n## Props\n| Prop | Stable design | Owner | Starting state | Changes by episode/scene | Reference |\n|---|---|---|---|---|---|\n\n## Locations\n`,
  'flow-prompts.json': JSON.stringify({ series: title, aspectRatio: '16:9', styleAnchor: '', characterAnchors: [], propAnchors: [], scenes: [] }, null, 2) + '\n'
};
for (const [name, content] of Object.entries(files)) await writeFile(path.join(root, name), content, { flag: 'wx' });
console.log(`Created local series scaffold: ${root}`);
console.log('Next: fill script.md and continuity.md, plan Boords frames, establish references in Flow, then build a prompt pack.');
}
