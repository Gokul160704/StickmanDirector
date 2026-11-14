# Portable Stickman Director agent

`agent/SKILL.md` is the single source of truth for identity, governance, stage behavior, safety, and all six role prompts. This document is orientation and installation guidance; it is not a second policy source.

## Safe baseline

The package is offline-first and no-spend by default. Installation, discovery, planning, and tests do not call providers, generate media, spend credits, publish, change credentials, or mutate Trello, GitHub, MCP, or other remote systems. Any proposed external step needs its own provider/model, output count, pinned references and hashes, provenance, cost/budget, authorization owner, and human gate.

The production contract is still-image-only: Google Flow remains the default visual provider, optional Cloudflare Workers AI requires separate approval, and local FFmpeg assembles stills, narration, and captions. Boords remains the storyboard workspace. Preserve existing Boords configuration; these examples are additive configuration overlays, not commands to execute.

## Repository-local discovery

1. Read `agent/SKILL.md`.
2. Select one heading: `director-orchestrator`, `research`, `script`, `image-batch-consistency`, `qa`, or `reviewer`.
3. Start in `offline-plan`, record the local inputs and expected evidence, and run deterministic checks.
4. If authority, references, capability, approval, budget, or evidence is ambiguous, report `BLOCKED` or `NOT VERIFIED`.

Run the offline validation with `node --test tests/portable-agent.test.mjs` or the repository-wide `npm test`.

Copies are the portable installation method. Copy `agent/`, `.opencode/agents/`, `.qoder/rules/`, and this document into the destination repository, preserving paths; then use explicit paths to `agent/SKILL.md`. Symlinks and user-global installation are not required. Do not create `identity.md` or `agent/roles/*.md`.

## Harness capability matrix

| Harness | Discovery and invocation | Boundary |
| --- | --- | --- |
| Codex | Existing root/nested `AGENTS.md` discovery plus an explicit prompt or skill invocation that names `agent/SKILL.md` and a role. | No repository-native subagent wrapper format is established here; do not claim one. |
| OpenCode | `.opencode/agents/<name>.md` wrappers use supported Markdown frontmatter and intentionally use `mode: primary` for owner-controlled manual invocation. | Availability, model, permissions, and exact CLI flags depend on the installed OpenCode version/configuration; these profiles do not authorize child-agent dispatch. |
| Qoder | Project `AGENTS.md` and `.qoder/rules/` provide contextual memory. CLI supports interactive, one-shot, JSON, resume, worktree, and permission-mode usage where installed. | Context is not hard enforcement; strict blocking requires Qoder permissions/hooks. |

Tool versions and discovery rules can drift; treat this as a version drift caveat. Recheck the installed harness documentation and adjust only the thin wrapper when behavior changes; keep policy in `agent/SKILL.md`.

Current official references reviewed for this overlay are [Codex AGENTS.md guidance](https://developers.openai.com/codex/guides/agents-md), [OpenCode instructions](https://opencode.ai/docs/instructions), [OpenCode agents](https://opencode.ai/docs/agents), [Qoder project memory](https://docs.qoder.com/cli/how-memory-works), and [Qoder CLI reference](https://docs.qoder.com/cli/cli-reference). These links document harness behavior; they do not authorize external actions.

## Invocation examples

These examples select local prompts only. They do not authorize provider work or remote mutations.

Codex explicit invocation:

```text
Read agent/SKILL.md. Select ### director-orchestrator. Work in offline-plan and report exact local checks and NOT RUN actions.
```

OpenCode, using the repository wrapper when supported:

```text
opencode --agent stickman-director
```

The wrapper still instructs OpenCode to read `agent/SKILL.md`; verify the installed version's flags before use.

Qoder one-shot example:

```text
qoder -p "Read agent/SKILL.md and select ### reviewer; use offline-plan and review the local diff only."
```

Use the installed Qoder CLI's help output to confirm flags and permission mode. A contextual rule is not a permission boundary.

## MCP configuration overlays

MCP configuration is additive and opt-in. Preserve the repository's existing Boords entry in `opencode.json`; do not replace, rewrite, or execute it as part of installation or tests. A configuration-only shape may document an existing or separately approved server without credentials:

```jsonc
{
  "mcp": {
    "boords": { "inheritExistingConfiguration": true },
    "flow": { "enabled": false, "requiresSeparateApproval": true },
    "cloudflareWorkersAI": { "enabled": false, "requiresSeparateApproval": true }
  }
}
```

The names above are illustrative overlay keys, not a promise that every harness accepts them. Do not add provider credentials or executable provider commands. Before any future provider action, independently verify current model, quota, licensing, references, cost, and approval; otherwise remain `BLOCKED`/`NOT VERIFIED`.

## Handoff and non-authorizations

Record card, run, owner, branch/worktree, baseline and head SHA, files, commands/results, limitations, and `NOT RUN` evidence. A technical pass is not creative acceptance, human approval, or independent Chief review. This package does not automatically launch a Worker, move Trello cards, create a PR, merge, publish, approve, generate media, spend credits, or claim native GitHub review.
