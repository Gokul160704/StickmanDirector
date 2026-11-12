# Trello Chief/Worker Development Governance

This document is retained at its historical path because existing links and handoffs reference `docs/GITHUB_AGENT_GOVERNANCE.md`. For `Gokul160704/StickmanDirector`, Trello is authoritative for development queue state; GitHub remains the repository and technical-evidence system.

## Authority and scope

Canonical development board: <https://trello.com/b/Xg8JRBPu/stickman-director>

Trello board lists, card descriptions, checklists, labels, comments, and movement history are the authoritative task queue and workflow status. GitHub Issues, pull requests, commits, branches, CI, and versioned documents provide code specifications and evidence, but do not form a second status queue. GitHub Projects v2 is not required, not authoritative, and must not be configured or treated as a source of readiness.

This policy governs development coordination only. Product architecture, tests, security, privacy, licensing, Boords review, Google Flow controls, narration requirements, repository hygiene, and all production safeguards in `AGENTS.md` remain binding.

## Roles and manual invocation

- Chief researches, decides within approved scope, writes complete card specifications, resolves dependencies and blockers, and performs independent review.
- Worker implements only a self-contained card explicitly handed off by Chief, runs the required checks, records evidence, and opens or updates the scoped PR.
- The owner manually invokes or schedules each Chief or Worker session. No Trello card movement, label, comment, GitHub event, webhook, or Actions workflow may launch an agent or dispatcher.
- A Trello card is not implementation-ready because it exists, is labeled, or appears plausible. Only Chief may certify readiness by recording a complete handoff and moving the card to `Ready`.
- Human approval is never inferred from a green test, a merged PR, a card label, a prior conversation, or a technical review. Human-only gates remain visibly blocked until verified.

## Trello status contract

Use these canonical lists when present: `Backlog` → `Ready` → `In Progress` → `Blocked` / `In Review` → `Done` or `Canceled`.

| Transition | Required evidence and owner |
| --- | --- |
| Backlog → Ready | Chief records Definition of Ready, exact scope, dependencies, baseline, acceptance, test commands, risk, and approval gates; Worker route is explicit. |
| Ready → In Progress | Worker posts a unique claim with card, run, owner, baseline SHA, plan, risks, and tests; reads it back before changing code. |
| In Progress → Blocked | Current owner records the blocker, evidence, responsible party, and precise unblock condition. |
| In Progress → In Review | Worker links the PR, exact head SHA, tests and limitations; hands the card to Chief. |
| In Review → Ready / In Progress | Chief records precise requested changes and returns the card to Worker. |
| In Review → Done | Chief verifies the exact PR/CI evidence, review separation, authorized merge, acceptance gates, and read-back. |
| Any nonterminal → Canceled | Chief records the rationale, replacement or duplicate, and owner approval when consequential. |

If the board does not yet have these lists, do not silently invent readiness semantics. Chief must create or document the minimum list mapping in a scoped governance change and read it back before moving implementation cards.

## Definition of Ready

Chief may move a card to `Ready` only when the card contains all of the following:

1. Exact outcome, user impact, in-scope and out-of-scope files/components.
2. Repository, branch, observed baseline SHA, dependencies, and relevant current contracts.
3. Concrete implementation approach, edge cases, failure behavior, and negative tests.
4. Given/When/Then acceptance criteria and exact runnable checks.
5. Security, consent, data, licensing, rollback, migration, and observability considerations where relevant.
6. Required PR destination, risk tier, review/approval gate, and expected evidence.
7. No unresolved dependency or hidden human-only gate. If a human gate remains, keep the card with Chief in `Blocked` and explain it.

Cards for research, governance, creative review, or human approval may be actionable without being Worker-ready; they must not be moved to `Ready` unless the card's actual role and work type meet the same explicit handoff standard.

## Claim, handoff, and conflict safety

Before non-trivial work, Worker re-reads the card, its comments/checklist, linked PRs, current list, and relevant repository state. It posts one unique `START`/claim comment containing a run identifier and expected expiry, then reads the comment back. Only one active or ambiguous claim is allowed. If another claim, stale ownership, duplicate card, missing dependency, or ambiguous write is observed, stop without relabeling, moving, editing code, or launching another agent; record `BLOCKED` or `RECONCILIATION REQUIRED` for Chief.

At handoff, record the exact next owner, reason, branch/SHA, PR, checks, evidence links, and anything not run. Read back the card list, labels, comment, and linked GitHub state. A failed or timed-out write is not treated as successful; re-read before retrying. Release claims explicitly with the matching run identifier.

## GitHub evidence and review

Use short-lived branches and isolated worktrees where possible. Worker must not push directly to the default branch, force-push another owner’s branch, add secrets or generated media, or merge its own unreviewed work. Every PR must link the Trello card and report exact head SHA, checks, limitations, and unrun checks. Chief reviews the exact diff independently; same-account comments are not a native independent GitHub approval. Merge, release, and physical or creative acceptance remain separate gates.

## Production and spending safeguards

- Do not launch agents, generate media, spend Flow credits, incur Gemini/API billing, or publish media as part of queue maintenance or governance work.
- Before any future Flow generation, live-check signed-in project, model, aspect ratio, references, credit balance, and per-output cost. Show the exact batch and obtain fresh explicit approval; revised prompts, models, ratios, and additional outputs require new approval.
- Keep Flow still generation, Gemini narration billing, Boords limits, local FFmpeg rendering, and publication approval distinct. A prior pilot or prior approval does not carry forward to a changed batch.
- Boords technical presence and `Review Needed`/similar status do not equal human creative approval. Record the human decision and any scene-level follow-up before calling an episode creatively accepted.
- Preserve original assets, manifests, receipts, secrets exclusion, and local ignored output policy. Never silently rewrite manifest status to imply review or approval.

## Required evidence vocabulary

Use precise terms in cards and PRs: `VERIFIED`, `NOT VERIFIED`, `BLOCKED`, `NOT RUN`, `HUMAN APPROVAL REQUIRED`, `TECHNICAL PASS`, and `CREATIVE ACCEPTANCE`. Do not claim a test, review, approval, generation, publication, or read-back that was not observed.

The pilot report at `docs/production-evidence-why-do-we-dream.md` is evidence of the reported local run, not proof that a guided producer exists or that human creative approval was granted. Its documented model/aspect-ratio drift and manifest-status gaps remain gates for future production work.
