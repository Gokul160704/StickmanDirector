# Flow MCP Schema Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the audited GTAI-1 Flow MCP tool surface in deterministic repository fixtures and tests without invoking Flow or any network service.

**Architecture:** Store a sanitized JSON contract fixture containing the seven audited tool names, required input fields, and representative output/error envelopes. A focused Node test suite loads only those fixtures, asserts the contract and edge cases, and installs a throwing network guard so accidental network access fails immediately.

**Tech Stack:** Node.js 20+, built-in `node:test`, JSON fixtures, no new dependencies.

**Spec:** Trello card `[P1][Worker] Add offline Flow MCP schema contract fixtures and assertions` on the Stickman Director board.

## Global Constraints

- No Flow or Gemini calls, credits, billing, media generation, publication, or remote networking.
- Required tools are exactly `flow_status`, `flow_generate`, `flow_wait`, `flow_download`, `flow_assets`, `flow_transcribe`, and `flow_voices`.
- The audited source/runtime revision is GTAI-1 `flow-mcp@84b548f3aa72b749b82cdbfbb6f91cadebae8642`.
- Fixtures must contain no credentials, cookies, API keys, browser data, or local absolute paths.
- Do not modify provider adapters, manifest behavior, or the broader runtime card.

## Review Focus

- A new or missing required field must fail contract validation rather than being silently accepted.
- Provider failures must preserve safe classifications for timeout, rate-limit, and partial output.
- Success fixtures must distinguish queued jobs, completed assets, downloads, and word timings.
- Secret-looking values must be redacted before any fixture or diagnostic is serialized.
- Test execution must remain offline even if a future helper accidentally attempts `fetch`.

---

### Task 1: Add the pinned tool contract and representative fixtures

**Files:**
- Create: `tests/flow-mcp-contract.test.mjs`
- Create: `tests/fixtures/flow-mcp/contract.json`
- Create: `tests/fixtures/flow-mcp/responses.json`

**Interfaces:**
- Produces fixture objects with `revision`, `tools`, `success`, and `errors` keys.
- `tools` entries expose `name`, `required`, and `optional` arrays.

- [ ] **Step 1: Write the failing contract test**

  Add tests that load the two JSON fixtures, assert the exact seven-tool set and required fields (`flow_generate.project/scenes`, `flow_download.assets/project`, `flow_transcribe.video`), and assert the representative success envelope for each tool.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `node --test tests/flow-mcp-contract.test.mjs`

  Expected: FAIL because the new fixture files do not yet exist.

- [ ] **Step 3: Add sanitized contract and success fixtures**

  Record the audited revision and the seven tool entries. Use synthetic IDs, titles, paths, and timings only. Keep optional fields separate from required fields.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `node --test tests/flow-mcp-contract.test.mjs`

  Expected: PASS for tool names, required/optional fields, revision, and success envelopes.

- [ ] **Step 5: Commit**

  `git add tests/flow-mcp-contract.test.mjs tests/fixtures/flow-mcp && git commit -m "test: pin Flow MCP tool contract"`

### Task 2: Pin safe failure and no-network behavior

**Files:**
- Modify: `tests/flow-mcp-contract.test.mjs`
- Modify: `tests/fixtures/flow-mcp/responses.json`

**Interfaces:**
- Error fixtures expose `kind`, `retryable`, and `safeMessage`.
- The test suite installs a throwing `globalThis.fetch` guard and restores it after each test.

- [ ] **Step 1: Write the failing edge-case assertions**

  Add assertions for missing required fields, malformed success data, timeout, rate-limit, partial output, and redaction of `apiKey`, `authorization`, `cookie`, and `access_token` values. Add a test that would fail if the fixture loader performs network I/O.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `node --test tests/flow-mcp-contract.test.mjs`

  Expected: FAIL because the error fixtures and redaction/no-network assertions are not present.

- [ ] **Step 3: Add the sanitized failure fixtures and assertions**

  Add deterministic synthetic errors and a small test-local redaction function. Do not add runtime networking or provider behavior.

- [ ] **Step 4: Run the full suite**

  Run: `npm test`

  Expected: all existing tests plus the new contract tests pass with zero failures.

- [ ] **Step 5: Run repository safety checks**

  Run: `npm run validate:episode -- projects/why-do-we-dream/episode.json; git diff --check`

  Expected: valid 36-scene manifest and no whitespace errors.

- [ ] **Step 6: Commit**

  `git add tests/flow-mcp-contract.test.mjs tests/fixtures/flow-mcp/responses.json && git commit -m "test: cover Flow MCP failure envelopes offline"`

