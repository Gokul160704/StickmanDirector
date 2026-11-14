# Documentary Direction Implementation Plan

> **For manually invoked workers:** Follow the repository governance and use the applicable implementation workflow; no automatic subagent launch or dispatch is implied. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, offline documentary research/editorial package workflow that preserves the repository's still-image and approval gates.

**Architecture:** A pure `scripts/documentary-package.mjs` module owns package creation, validation, formatting, adaptation, and safe resume. A thin CLI entry point writes the reviewable local Markdown package and JSON state; it never calls providers or mutates legacy episode manifests. Documentation and a template make the eight-part documentary structure and claim-to-script-to-shot traceability explicit.

**Tech Stack:** Node.js ESM, built-in `node:test`, JSON/Markdown files, existing npm scripts.

**Spec:** Trello card #20 — `[P1][Chief→Worker] Adapt documentary-video-creator editorial direction and fact-check workflow`.

## Global Constraints

- Documentary mode is opt-in; ordinary Creative mode and existing CLI behavior remain unchanged.
- Documentary packages use the eight sections: Opening hook; Subject introduction; Background/context; Main evidence/story; Different perspectives; Challenges/consequences/significance; Conclusion; Sources/further learning.
- Every asserted documentary fact needs a source-backed claim; unresolved claims remain `REQUIRES VERIFICATION` or `CONFLICTING` and cannot be promoted to approved narration.
- Visual coverage is full-frame 16:9 still-image direction; t2v/i2v, clip mixing, paid providers, automatic Boords mutations, and publication are prohibited.
- Canonical schema-v1 episode manifests and existing approval bindings remain unchanged.
- No real-world citations, copyrighted media, generated assets, credentials, or external side effects belong in the repository fixture.

## Review Focus

- Missing or unresolved source evidence must fail closed — covered by package validation tests.
- Contradictory claims must remain `CONFLICTING` and block approval — covered by fact-check tests.
- Source/revision changes must invalidate prior approval — covered by resume tests.
- Reconstruction and visual provenance must be explicit — covered by shot validation tests.
- Legacy Creative/episode behavior must remain untouched — covered by CLI and manifest regression tests.

---

### Task 1: Documentary package contract

**Files:**
- Create: `scripts/documentary-package.mjs`
- Test: `tests/documentary-package.test.mjs`

**Interfaces:**
- Produces `createDocumentaryPackage(input)`, `validateDocumentaryPackage(pkg)`, `formatDocumentaryPackage(pkg)`, `adaptDocumentaryPackage(pkg, changes)`, and `resumeDocumentaryPackage(pkg)`.
- A package contains metadata, researchPlan, episodes, sources, claims, factCheck, youtubeMetadata, and approval; episode segments and shots carry claim/source/provenance links.

- [ ] **Step 1: Write failing tests** for complete single/three-episode packages, all required fields and eight sections, unresolved/contradictory claims, unsupported fact/quote/statistic rejection, 16:9 still provenance, reconstruction labels, approval invalidation on source changes, draft-only YouTube metadata, and no provider calls.
- [ ] **Step 2: Run `node --test tests/documentary-package.test.mjs`** and confirm failure is due to the missing module/exports.
- [ ] **Step 3: Implement the minimal pure package engine** with deterministic revision/dependency hashing, fail-closed validation, and no filesystem/network/provider imports.
- [ ] **Step 4: Run the focused test file** and confirm all documentary contract tests pass.
- [ ] **Step 5: Run the full `npm test` suite** and confirm the legacy suite remains green.
- [ ] **Step 6: Commit** the package engine and tests.

### Task 2: Opt-in producer/CLI and reviewable artifacts

**Files:**
- Modify: `scripts/producer-cli.mjs`
- Create: `templates/documentary-package-template.md`
- Create: `docs/documentary-direction.md`
- Test: `tests/documentary-package.test.mjs`

**Interfaces:**
- CLI command `node scripts/producer-cli.mjs --documentary-create <title> <root> [--episodes N]` writes only `documentary-package.json` and `documentary-package.md` under the requested local package root and reports `mode: "documentary"`.
- The package engine remains reusable without the CLI and does not alter `episode.json`.

- [ ] **Step 1: Extend failing tests** for CLI creation, default three episodes, single-episode creation, template/documentation field coverage, legacy manifest preservation, and no network/provider invocation.
- [ ] **Step 2: Run the focused tests** and confirm the new CLI path/docs assertions fail before implementation.
- [ ] **Step 3: Implement the CLI branch and documentation/template** with explicit still-image, fact-check, approval, reconstruction, disclosure, and no-publication guidance.
- [ ] **Step 4: Run focused and full tests** plus `npm run validate:episode -- templates/series-project/episode.json` and `git diff --check`.
- [ ] **Step 5: Commit** the opt-in integration and documentation.

### Task 3: PR and evidence handoff

**Files:**
- Modify: Trello card #20 comment/state only; no product files beyond Tasks 1–2.

- [ ] **Step 1:** Review the diff against master, confirm pre-existing user changes were not included, and record exact branch/SHA.
- [ ] **Step 2:** Push the feature branch and open a PR targeting `master`; do not merge or approve it.
- [ ] **Step 3:** Read back exact-head CI and PR status; document commands, results, limitations, and preserved approval gates in Trello.
- [ ] **Step 4:** Move the card to `In Review` for independent Chief review.
