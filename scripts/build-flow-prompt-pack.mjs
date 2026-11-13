#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadEpisodeManifest } from './episode-manifest.mjs';
import { DEFAULT_SAFE_FRAMING_PROFILE, composeImagePrompt } from './safe-framing.mjs';

function framingMetadata(profileInput) {
  const { profile, profileHash, protectedRegion } = composeImagePrompt({}, profileInput);
  return `<!-- safe-framing profile=${profile.version} hash=${profileHash} margins=${JSON.stringify(profile.margins)} protected=${JSON.stringify(protectedRegion)}${profile.enabled ? '' : ` optOutReason=${JSON.stringify(profile.optOutReason)} optOutApprovalId=${profile.optOutApprovalId}`} -->`;
}

function legacyPack(data) {
  if (!data.series || !Array.isArray(data.scenes)) throw new Error('Expected canonical episode.json or legacy "series" and "scenes" fields.');
  const ratio = data.aspectRatio || '16:9';
  const profile = DEFAULT_SAFE_FRAMING_PROFILE;
  const lines = [`# Google Flow prompt pack — ${data.series}`, '', '> Text only; prepare in the configured Google Flow MCP. This script does not generate media or spend credits.', framingMetadata(profile), '', '## Shared visual anchor', data.styleAnchor || '(Add the approved style anchor.)', '', '## Character continuity'];
  for (const item of data.characterAnchors ?? []) lines.push(`- **${item.name ?? 'Character'}:** ${item.description ?? ''}`);
  if (!(data.characterAnchors ?? []).length) lines.push('- (Add approved character anchors and reference links.)');
  lines.push('', '## Prop continuity');
  for (const item of data.propAnchors ?? []) lines.push(`- **${item.name ?? 'Prop'}:** ${item.description ?? ''}`);
  if (!(data.propAnchors ?? []).length) lines.push('- (Add recurring props, owners, starting states, and changes.)');
  const referenceGroups = [
    ['character', data.characterAnchors ?? []],
    ['prop', data.propAnchors ?? []],
    ['environment', data.environmentAnchors ?? []],
  ];
  if (referenceGroups.some(([, anchors]) => anchors.length)) lines.push('', '## Reference image prompts');
  for (const [kind, anchors] of referenceGroups) for (const anchor of anchors) {
    const descriptor = [anchor.name, anchor.description, anchor.reference, anchor.referenceImage].filter((value) => typeof value === 'string' && value.trim()).join('. ');
    const composed = composeImagePrompt({ prompt: `Create a clean reference image for this recurring ${kind}: ${descriptor || 'preserve its approved design and continuity.'}`, visualStyle: data.styleAnchor }, profile, {}, `${kind}-reference`);
    lines.push('', `### ${kind} reference — ${anchor.name ?? 'Unnamed'}`, '', composed.prompt);
  }
  lines.push('', '## Scene prompts');
  for (const scene of data.scenes) {
    const heading = [scene.episode, scene.scene].filter(Boolean).join(' — ') || 'Untitled scene';
    const composed = composeImagePrompt({ ...scene, prompt: scene.imagePrompt || scene.prompt || '(Add the approved still-image prompt.)', visualStyle: data.styleAnchor, characters: data.characterAnchors?.map((item) => item.name ?? item.description), props: data.propAnchors?.map((item) => item.name ?? item.description) }, DEFAULT_SAFE_FRAMING_PROFILE, data, 'scene');
    lines.push('', `### ${heading}`, '', '#### Still image', '', `Create one complete, full-frame ${ratio} story illustration. Keep headings, captions, labels, panels, arrows, and explanatory callouts out of the image.`, '', composed.prompt);
  }
  return lines.join('\n') + '\n';
}

function canonicalPack(manifest) {
  const profile = manifest.safeFraming ?? DEFAULT_SAFE_FRAMING_PROFILE;
  const lines = [`# Google Flow still-image prompt pack — ${manifest.title}`, '', '> Text only; prepare in the configured Google Flow MCP. This script does not generate media or spend credits.', framingMetadata(profile), '', '## Shared visual anchor', manifest.references.visualStyle || '(Add the approved visual style anchor.)', '', '## Reference image prompts'];
  for (const type of ['characters', 'props', 'environments']) {
    for (const reference of manifest.references[type] ?? []) {
      const referencePrompt = `Create a clean reference sheet for the recurring ${type.slice(0, -1)} represented by ${reference}. Preserve the approved stickman visual style, stable proportions, distinctive design, and a plain uncluttered background. No labels, captions, arrows, panels, or explanatory text.`;
      const composed = composeImagePrompt({ prompt: referencePrompt, visualStyle: manifest.references.visualStyle }, manifest.safeFraming ?? DEFAULT_SAFE_FRAMING_PROFILE, manifest.references, `${type.slice(0, -1)}-reference`);
      lines.push('', `### ${type.slice(0, -1)} reference — ${reference}`, '', composed.prompt);
    }
  }
  lines.push('', '## Final storyboard image prompts');
  for (const scene of manifest.scenes) {
    const composed = composeImagePrompt({ ...scene, prompt: [`Visual description: ${scene.visualDescription ?? scene.description ?? ''}`, `Character references: ${(scene.characters ?? []).join(', ') || 'use the approved recurring character references'}`, `Prop references: ${(scene.props ?? []).join(', ') || 'preserve approved prop continuity'}`, `Camera framing: ${scene.camera ?? 'cinematic medium-wide composition'}`, 'Output intent: 16:9 illustration with clear caption-safe negative space and no visible words, letters, numbers, or interface copy.'].join(' '), visualStyle: manifest.references.visualStyle }, scene.safeFraming ?? manifest.safeFraming ?? DEFAULT_SAFE_FRAMING_PROFILE, manifest.references, 'scene');
    lines.push('', `### ${scene.order}. ${scene.id}`, '', framingMetadata(composed.profile), '', 'Create one complete, full-frame 16:9 story illustration. Keep headings, captions, labels, panels, arrows, and explanatory callouts out of the image.', '', composed.prompt);
  }
  return lines.join('\n') + '\n';
}

export async function buildPromptPack(input) {
  const source = path.resolve(input);
  const raw = JSON.parse((await readFile(source, 'utf8')).replace(/^\uFEFF/, ''));
  const text = raw.schemaVersion === 1 ? canonicalPack(await loadEpisodeManifest(source)) : legacyPack(raw);
  const output = path.join(path.dirname(source), 'flow-prompt-pack.md');
  await writeFile(output, text, { flag: 'w' });
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const input = process.argv[2];
  if (!input || process.argv.includes('--help')) {
    console.log('Usage: node scripts/build-flow-prompt-pack.mjs <episode.json|flow-prompts.json>');
    process.exit(input ? 0 : 2);
  }
  buildPromptPack(input).then((output) => console.log(`Wrote ${output}`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
