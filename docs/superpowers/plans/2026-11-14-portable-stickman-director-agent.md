# Portable Stickman Director Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repository-managed Stickman Director agent whose single source of truth is `agent/SKILL.md`, with truthful Codex, OpenCode, and Qoder overlays and offline validation.

**Architecture:** `agent/SKILL.md` owns identity, governance, stage contract, safety defaults, and all six named role prompts. `agent/harnesses/*.md`, `.opencode/agents/*.md`, and `.qoder/rules/*.md` are thin pointers/selectors only; they must not duplicate policy. Documentation explains copy-based installation, discovery, invocation, and optional MCP overlays without changing existing product configuration.

**Tech Stack:** Markdown, JSON/JSONC configuration examples, Node.js ESM, built-in `node:test`, existing npm test runner.

**Spec:** `docs/superpowers/specs/2026-11-14-portable-stickman-director-agent-design.md`

## Global Constraints

- `agent/SKILL.md` is the single source of truth for all policy, identity, stage behavior, and role prompts.
- Trello is authoritative; Worker implementation requires card #26 to be manually moved to `Ready` and manually invoked by the owner.
- No automatic dispatch, provider calls, media generation, credits, publication, credential changes, or remote mutations.
- Still-image-only production path; Google Flow remains default and Cloudflare Workers AI remains optional and separately approved.
- Reference hashes, provenance, per-provider budgets/approvals, human creative acceptance, and independent Chief review remain separate gates.
- Do not silently modify root `AGENTS.md`, existing `opencode.json` Boords configuration, repository protections, or secrets.
- Preserve the unrelated dirty checkout; implementation occurs only in the isolated Chief branch after governance clearance.

## Review Focus

- A wrapper accidentally becomes a second policy source — test that wrappers point to `agent/SKILL.md` and contain no copied safeguard text.
- A role can be invoked without offline/no-spend defaults — test all six role sections contain the safe preamble and stop conditions.
- A harness capability is overstated — test/document Codex’s explicit invocation boundary, OpenCode’s native subagent mode, and Qoder’s contextual-memory limitation.
- Provider selection silently falls back or loses reference provenance — test the canonical contract contains fail-closed, pinned-reference, no-fallback, and provenance requirements.
- MCP examples look executable but authorize spending — test examples are configuration-only and explicitly require separate approval.

### Task 1: Create the canonical single-source skill

**Files:**
- Create: `agent/SKILL.md`
- Create: `agent/README.md`
- Test: `tests/portable-agent.test.mjs`

**Interfaces:**
- Produces named Markdown sections for `director-orchestrator`, `research`, `script`, `image-batch-consistency`, `qa`, and `reviewer`.
- Produces canonical terms for `offline-plan`, `BLOCKED`, `NOT VERIFIED`, manual Chief/Worker invocation, still-image-only production, pinned references, provenance, approval/budget gates, and independent review.

- [ ] **Step 1: Write failing structural tests** asserting `agent/SKILL.md` exists, contains one canonical identity/safety contract, contains all six role headings, and contains every required safeguard phrase.
- [ ] **Step 2: Run the focused test** with `node --test tests/portable-agent.test.mjs`; expected failure because the canonical file does not exist.
- [ ] **Step 3: Implement `agent/SKILL.md`** with frontmatter identifying the skill and sections for identity, operating modes, stage contract, universal safety, role selection, six role prompts, handoff evidence, and explicit stop conditions. Put all role policy here; do not create separate role prompt files.
- [ ] **Step 4: Add `agent/README.md`** as non-authoritative orientation that points to `SKILL.md` and warns that wrappers must not be treated as policy sources.
- [ ] **Step 5: Run the focused tests** and confirm PASS.

### Task 2: Add truthful harness overlays

**Files:**
- Create: `agent/harnesses/codex.md`
- Create: `agent/harnesses/opencode.md`
- Create: `agent/harnesses/qoder.md`
- Create: `.opencode/agents/stickman-director.md`
- Create: `.opencode/agents/stickman-reviewer.md`
- Create: `.qoder/rules/stickman-director.md`
- Create: `.qoder/rules/stickman-reviewer.md`
- Modify: `tests/portable-agent.test.mjs`

**Interfaces:**
- Every overlay points to `agent/SKILL.md` and names the role section it selects.
- OpenCode wrappers use supported Markdown agent frontmatter and `mode: subagent` only where appropriate.
- Codex overlay describes explicit prompt/skill invocation and does not claim a native repository subagent format.
- Qoder overlay states that `AGENTS.md`/rules are contextual and strict enforcement requires Qoder permissions/hooks.

- [ ] **Step 1: Add failing tests** for exact wrapper paths, canonical references, selected role headings, absence of duplicate role-policy paragraphs, and truthful capability markers.
- [ ] **Step 2: Run the focused test** and confirm the wrapper assertions fail.
- [ ] **Step 3: Implement the overlays** as minimal pointers/selectors with no new policy, no provider commands, no auto-dispatch language, and no symlink requirement.
- [ ] **Step 4: Run focused tests** and confirm PASS.

### Task 3: Document install, discovery, invocation, and MCP overlays

**Files:**
- Create: `docs/portable-agent.md`
- Modify: `tests/portable-agent.test.mjs`

**Interfaces:**
- Documentation identifies `agent/SKILL.md` as the only source of truth.
- Documentation covers repository-local use and copy-based installation into another repository.
- Documentation gives current capability-qualified examples for Codex, OpenCode, and Qoder CLI invocation.
- MCP examples preserve existing Boords configuration and show Flow/Cloudflare as opt-in configuration overlays only.

- [ ] **Step 1: Add failing documentation assertions** for single-source wording, copy-based installation, all three harnesses, `npm`/CLI examples, Boords, Flow, Cloudflare, no-spend defaults, and version-drift caveat.
- [ ] **Step 2: Implement `docs/portable-agent.md`** with a capability matrix, discovery checks, invocation examples, MCP overlay examples, role selection guidance, and explicit non-authorizations.
- [ ] **Step 3: Run focused tests** and confirm PASS.

### Task 4: Enforce single-source and secret-safety invariants

**Files:**
- Modify: `tests/portable-agent.test.mjs`

**Interfaces:**
- Tests scan only the new agent/wrapper/docs scope and fail if a second role prompt/identity source appears.
- Tests reject common secret patterns and executable provider/dispatch commands in wrappers and docs.

- [ ] **Step 1: Add tests** for no duplicate canonical prompt files, no symlink-dependent path, no API-key/token literals, no provider execution command, and no automatic dispatch trigger.
- [ ] **Step 2: Run `node --test tests/portable-agent.test.mjs`** and confirm PASS.
- [ ] **Step 3: Run `npm test`** and confirm the existing suite plus portable tests pass without network calls.

### Task 5: Validate and hand off without merging

**Files:**
- Modify: `docs/superpowers/specs/2026-11-14-portable-stickman-director-agent-design.md` only if evidence requires clarification.
- Modify: Trello card #26 via Chief handoff comment; no repository file required for the comment.

- [ ] **Step 1: Run `npm test`, focused portable-agent tests, `git diff --check`, and the existing episode/schema validation relevant to the branch.** Record exact counts and commands.
- [ ] **Step 2: Confirm provider calls, media generation, credit spend, publication, and external MCP writes are `NOT RUN`.** Confirm no secrets or generated media are in the diff.
- [ ] **Step 3: Review the exact diff against `origin/master`** and confirm only the scoped package/docs/tests changed.
- [ ] **Step 4: Update Trello #26 with branch/SHA, tests, limitations, and explicit handoff to Chief.** Do not move to `Done`, merge, or claim independent acceptance.
- [ ] **Step 5: Stop if the card is not manually moved to `Ready`; do not launch a Worker automatically.**

