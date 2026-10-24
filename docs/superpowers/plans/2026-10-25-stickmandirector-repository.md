# Repository plan: reusable StickmanDirector toolkit

## Goal
Prepare this workspace as a shareable GitHub repository for repeatable stickman-series planning and production.

## Decisions
- Keep reusable workflow instructions, documentation, scripts, and an empty template in Git.
- Ignore episode project contents and generated media by default; leave the current `projects/` and `output/` intact locally.
- Make Google Flow's signed-in browser tab the required visual-production interface. Prompt-pack utilities are offline helpers only and never call image-generation APIs.
- Add small scripts for scaffolding a series and compiling a Flow prompt pack from structured input.

## Acceptance
- Repository boundary is explicit in `.gitignore` and documentation.
- Docs consistently describe Boords, browser-tab Flow, narration, review, and credit approval.
- Utilities create only local files and do not overwrite or generate paid media.
- Existing episode folders remain unchanged and untracked.
