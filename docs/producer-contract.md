# Guided Producer offline contract

This contract is the persistence and decision boundary for the future guided Producer. It is intentionally pure and offline: creating, answering, resuming, navigating, approving, invalidating, or selecting a provider does not read files, call a provider, inspect account state, spend credits, or publish media.

## State

`createProducerSession({ episodeId, providerCatalog })` returns a JSON-safe session with the ordered stages `entry`, `preferences`, `script`, `references`, `storyboard`, `providers`, and `approvals`. The session records answers, approved stages, explicit invalidations, documented provider catalog entries, and separately supplied account entitlements.

`advanceStage` permits exactly one forward stage at a time. `goBack` changes the current question stage without silently removing approvals. `invalidateFrom(stage, reason)` is the only operation that removes approvals from a stage and its later stages; it requires a non-empty reason. `resumeProducerSession` validates and clones a saved JSON value.

## Provider choices

The documented catalog says what a provider/model is known to support. Account entitlements say what is available for the current account. A choice is accepted only when both records agree; this contract does not discover or infer entitlement.

## Scope boundary

This module does not implement the interactive conversational UI, Flow/Boords/Gemini adapters, generation, billing, or publication. Those operations require later cards, explicit provider preflight, and human approval gates.
