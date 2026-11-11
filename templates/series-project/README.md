# Series project template

Copy this structure when starting a new production. The `new-series.mjs` utility creates the same local scaffold.

- `script.md`: current approved script
- `continuity.md`: recurring character, prop, location, and state notes
- `episode.json`: versioned canonical manifest for one renderable episode
- `script/`: episode spoken text and approved script versions
- `continuity/`: character, prop, environment, and state notes
- `episodes/`: legacy episode arcs and shot plans
- `narration/`: verbatim spoken text and generated audio
- `references/characters/`, `references/props/`: approved continuity references
- `references/environments/`: approved environment references
- `scenes/`: scene definitions, prompts, and review notes
- `images/`: approved full-frame still assets referenced by `episode.json`
- `captions/`: caption text and timing
- `exports/`: local renders

The parent `projects/` directory is ignored by Git. Keep credentials and signed links out of all project files.

The canonical renderer reads `episode.json`; older projects can keep using the legacy
`node scripts/render-episode.mjs <projectDir> <part>` command while they are migrated.
