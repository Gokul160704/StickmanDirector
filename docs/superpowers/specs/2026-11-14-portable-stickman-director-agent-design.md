# Portable Stickman Director Agent Design

## Intent

Create a repository-managed Stickman Director agent contract that can be used from Codex, OpenCode, Qoder, and other harnesses without pretending that their discovery rules or subagent systems are identical. The package should make the existing Trello Chief/Worker governance and still-image production safeguards easy to invoke, while remaining offline and no-spend by default. `agent/SKILL.md` is the single source of truth for all policy, identity, stage behavior, and role prompts.

## Goals

- Define one canonical Stickman Director identity, operating contract, stage model, and role vocabulary in one file.
- Provide one reusable portable `SKILL.md` whose named sections are the director/orchestrator, research, script, image-batch/consistency, QA, and reviewer prompts.
- Provide capability-specific sections with explicit inputs, outputs, stop conditions, and handoff evidence.
- Add minimal native overlays for Codex, OpenCode, and Qoder based on verified current documentation.
- Document discovery, installation, CLI invocation, MCP configuration, and unsupported assumptions per harness.
- Validate the package offline with deterministic structure, forbidden-action, and cross-wrapper consistency checks.

## Non-goals and anti-goals

- No automatic Worker/Chief dispatch, Trello movement, GitHub mutation, PR merge, or native independent review claim.
- No provider calls, media generation, credit spending, publication, or credential changes during installation, discovery, planning, or tests.
- No replacement of Google Flow; Cloudflare Workers AI remains optional and separately approved.
- No image-to-video workflow; the approved production path remains still images, narration, captions, and local FFmpeg assembly.
- No broad rewrite of the existing root `AGENTS.md` or governance policy.
- No claim that Codex, OpenCode, Qoder, or other harnesses load the same files or expose equivalent subagents.
- No symlink-dependent installation; copies and explicit paths are the portable baseline.

## Constraints

- Trello is the authoritative development queue. A Worker may implement only a card explicitly handed off by Chief and currently in `Ready`.
- The canonical baseline for the feature is `origin/master` at `66f132d65e1e57ce382c6a305411e90dcf5f3e07`.
- Existing user modifications in the other checkout are unrelated and must remain untouched.
- Reference-hash-pinned batches, per-provider approvals/budgets, provenance, human review, and fail-closed behavior remain mandatory.
- Secrets must stay outside the repository and tests must not read or print credentials.

## Verified harness model

| Harness | Verified repository behavior | Overlay strategy | Boundary |
| --- | --- | --- | --- |
| Codex | Root and nested `AGENTS.md` files are discovered by directory scope; deeper files override broader ones. MCP is configured in user/project config, and the retrieved official material does not establish a portable repository-native subagent file format. | Keep the existing root `AGENTS.md` authoritative; add a documented explicit invocation overlay and portable prompts. | Do not claim native subagent discovery from this repository package. |
| OpenCode | `AGENTS.md` is discovered during workspace exploration; `instructions` can add files/globs/URLs; `.opencode/agents/<name>.md` is the preferred v2 agent location and supports `mode: subagent`. | Add thin `.opencode/agents/*.md` wrappers that point to canonical role prompts; preserve existing Boords MCP configuration and document additive MCP setup. | Native agent availability, model, permissions, and invocation still depend on local OpenCode version/configuration. |
| Qoder | Project `AGENTS.md` is loaded as contextual memory; `.qoder/rules/` supports topic rules; CLI supports interactive, one-shot, JSON, resume, worktree, and permission-mode invocations; MCP is configured by CLI/SDK settings. | Add scoped `.qoder/rules/` overlays and portable role-prompt invocation examples. | Context files are not hard enforcement; use Qoder permissions/hooks for strict blocking, outside this repository feature. |

## Approaches considered

1. **Canonical package plus thin native overlays — selected.** One portable skill and role prompt set is the source of truth; each harness receives only the smallest supported wrapper. This minimizes drift and avoids inventing unsupported formats.
2. **Generated wrappers.** A manifest and generator could emit harness files. This may reduce long-term drift but introduces a generator, templates, and another runtime before the basic contract is proven.
3. **One expanded root `AGENTS.md`.** This would be simple for Codex but would overclaim portability, overload project-wide rules, and provide no native OpenCode/Qoder role entry points.

## Proposed repository shape

```text
agent/
  README.md
  SKILL.md                 # single source of truth
  harnesses/
    codex.md               # pointer/overlay only
    opencode.md             # pointer/overlay only
    qoder.md                # pointer/overlay only
.opencode/
  agents/
    stickman-director.md
    stickman-reviewer.md
.qoder/
  rules/
    stickman-director.md
    stickman-reviewer.md
docs/portable-agent.md
tests/portable-agent.test.mjs
```

`agent/SKILL.md` contains the complete behavior and all role prompts. Native wrappers and `agent/harnesses/*.md` contain only discovery metadata, role-selection instructions, and a reference to that file; they must not introduce or duplicate policy. `agent/README.md` and `docs/portable-agent.md` explain usage and installation but are non-authoritative. Tests must fail if a wrapper embeds policy text or if a second canonical prompt file is introduced.

## Runtime and safety contract

Every role begins in `offline-plan` mode. Planning and validation are side-effect-free. A provider or external mutation may be proposed only as an explicit next step with provider, model, output count, references and hashes, estimated cost/credits, authorization owner, and human gate. Missing approval, stale hashes, unsupported capability, ambiguous Trello claim, missing baseline, or uncertain receipt causes `BLOCKED`/`NOT VERIFIED` rather than fallback or retry.

The reviewer role is a review prompt, not a native GitHub approval. A shared assistant or subagent may produce evidence, but only an independently invoked Chief or human can satisfy the repository's independent-review or creative-acceptance gates.

## Acceptance shape

- The single canonical `agent/SKILL.md` and all wrappers are present with deterministic names and no secrets.
- Tests prove every wrapper points to `agent/SKILL.md`, contains no duplicated policy, and selects only a named section.
- Tests prove the forbidden-action vocabulary is present in the canonical contract: no automatic dispatch, no provider calls by default, still-image-only, no silent fallback, preserve originals/provenance, pinned references, per-provider approval/budget, and independent review.
- Documentation gives truthful per-harness discovery, installation, invocation, and MCP configuration guidance.
- `npm test` and `git diff --check` pass; provider, media, credit, publication, and Trello write actions are `NOT RUN` unless separately authorized.

## Open governance gate

This design is prepared on an isolated Chief branch from current `origin/master`. The feature requires a canonical Trello card with complete Chief DoR and a manual owner-invoked Worker handoff. Until the card is in `Ready`, implementation remains blocked by repository policy; no Worker is launched automatically.

## Builder-check decisions

- The canonical Trello card is #26, `[P1][Chief→Worker] Portable Stickman Director agent contract and harness overlays`, currently in `Backlog`; it is not a Worker authorization.
- Implementation is limited to `agent/SKILL.md`, thin native wrappers, portable-agent documentation, and focused validation. Existing product prompts, root governance rules, and current MCP semantics are not rewritten.
- Support is capability-based against the current official documentation reviewed on 2026-11-14, not a promise for every historical or future harness version. The docs must state that wrappers may require adjustment after tool upgrades.
- The package is repository-managed and must work when copied to another repository using explicit copy instructions. It must not require symlinks or user-global installation for the baseline path.
- MCP documentation covers the existing Boords configuration and shows separate opt-in overlay examples for Google Flow and optional Cloudflare Workers AI. Tests and installation never invoke any provider.
