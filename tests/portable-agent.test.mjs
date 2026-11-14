import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

test('canonical skill exists and contains the complete safety contract', () => {
  assert.equal(existsSync(resolve(root, 'agent/SKILL.md')), true);
  const skill = read('agent/SKILL.md');
  for (const heading of [
    '## Identity and authority',
    '## Operating modes',
    '## Stage contract',
    '## Universal safety contract',
    '## Role prompts',
    '### director-orchestrator',
    '### research',
    '### script',
    '### image-batch-consistency',
    '### qa',
    '### reviewer',
    '## Handoff evidence',
    '## Stop conditions',
  ]) {
    assert.match(skill, new RegExp(`^${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'm'));
  }
  for (const phrase of [
    'offline-plan',
    'BLOCKED',
    'NOT VERIFIED',
    'manual Chief/Worker invocation',
    'still-image-only',
    'pinned references',
    'provenance',
    'approval',
    'budget',
    'independent review',
  ]) {
    assert.match(skill, new RegExp(phrase, 'i'));
  }
});

test('README identifies the canonical skill without becoming a policy source', () => {
  const readme = read('agent/README.md');
  assert.match(readme, /agent\/SKILL\.md/);
  assert.match(readme, /single source of truth/i);
  assert.match(readme, /non-authoritative|not authoritative/i);
});

const wrappers = [
  ['agent/harnesses/codex.md', 'director-orchestrator'],
  ['agent/harnesses/opencode.md', 'director-orchestrator'],
  ['agent/harnesses/qoder.md', 'director-orchestrator'],
  ['.opencode/agents/stickman-director.md', 'director-orchestrator'],
  ['.opencode/agents/stickman-reviewer.md', 'reviewer'],
  ['.qoder/rules/stickman-director.md', 'director-orchestrator'],
  ['.qoder/rules/stickman-reviewer.md', 'reviewer'],
];

test('every harness overlay selects a canonical role without copying policy', () => {
  for (const [relativePath, role] of wrappers) {
    assert.equal(existsSync(resolve(root, relativePath)), true, relativePath);
    const content = read(relativePath);
    assert.match(content, /agent\/SKILL\.md/);
    assert.match(content, /director-orchestrator|reviewer/);
    assert.doesNotMatch(content, /offline-plan|still-image-only|provider calls|pinned references|provenance|approval gates/i);
  }
});

test('harness overlays state truthful capability boundaries', () => {
  const codex = read('agent/harnesses/codex.md');
  assert.match(codex, /explicit/i);
  assert.match(codex, /no .*native.*subagent|does not establish.*subagent/i);

  const opencode = read('.opencode/agents/stickman-director.md');
  assert.match(opencode, /^mode:\s*primary$/m);
  assert.match(opencode, /Manual profile only/i);

  const qoder = read('agent/harnesses/qoder.md');
  assert.match(qoder, /contextual/i);
  assert.match(qoder, /permissions|hooks/i);
  assert.match(read('.qoder/rules/stickman-director.md'), /not an automatic role selection/i);
  assert.match(read('.qoder/rules/stickman-reviewer.md'), /not an automatic role selection/i);
});

test('role selectors map exactly to their named canonical sections', () => {
  const expected = new Map([
    ['agent/harnesses/codex.md', 'director-orchestrator'],
    ['.opencode/agents/stickman-director.md', 'director-orchestrator'],
    ['.opencode/agents/stickman-reviewer.md', 'reviewer'],
    ['.qoder/rules/stickman-director.md', 'director-orchestrator'],
    ['.qoder/rules/stickman-reviewer.md', 'reviewer'],
  ]);
  for (const [relativePath, role] of expected) {
    const content = read(relativePath);
    const selectedRole = content.match(/select(?:s)?\s+[`']?###\s*([a-z0-9-]+)/i)?.[1];
    assert.equal(selectedRole, role, `${relativePath} must select the exact canonical heading`);
  }
});

test('portable-agent documentation covers installation, invocation, and opt-in integrations', () => {
  const docs = read('docs/portable-agent.md');
  for (const phrase of [
    'agent/SKILL.md',
    'single source of truth',
    'copy',
    'Codex',
    'OpenCode',
    'Qoder',
    'npm test',
    'CLI',
    'Boords',
    'Flow',
    'Cloudflare',
    'no-spend',
    'version drift',
  ]) {
    assert.match(docs, new RegExp(phrase, 'i'));
  }
});

test('new package scope has one canonical source and no secret or executable mutation leakage', () => {
  const scopedFiles = [
    'agent/README.md', 'agent/SKILL.md',
    ...wrappers.map(([file]) => file),
    'docs/portable-agent.md',
  ];
  for (const relativePath of scopedFiles) {
    const content = read(relativePath);
    assert.doesNotMatch(content, /(?:sk-[A-Za-z0-9]{12,}|AIza[\w-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})/);
    assert.doesNotMatch(content, /(?:api[_-]?key|token|password|secret)\s*[:=]\s*['"][^'"]+['"]/i);
    assert.doesNotMatch(content, /(?:curl|Invoke-WebRequest|wget)\s+https?:\/\//i);
    assert.doesNotMatch(content, /(?:webhook|watcher|event)\b[^\n]*(?:launch|spawn|dispatch)/i);
  }
  assert.deepEqual(existsSync(resolve(root, 'agent/identity.md')), false);
  assert.deepEqual(existsSync(resolve(root, 'agent/roles')), false);
  assert.match(read('agent/SKILL.md'), /fail(?:s|ure)?[- ]closed/i);
});
