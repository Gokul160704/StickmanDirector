# Offline Guided Producer

## Choose a route

Use the guided API (`scripts/producer-session.mjs`) when an application supplies
answers programmatically. Use `node scripts/producer-cli.mjs --manual` for the
non-interactive offline decision printout; it is not an interactive wizard and
does not run a provider. For local multi-episode work, use:

```text
node scripts/producer-cli.mjs --series-create "Series name" "projects/series-name" --episodes 3
node scripts/producer-cli.mjs --series "projects/series-name"
node scripts/producer-cli.mjs --documentary-create "Demo Documentary" projects/demo-documentary --episodes 3
```

The documentary command writes a draft metadata package only. It is not the
canonical `episode.json`, does not create Boords frames, and does not imply
editorial, creative, provider, licensing, or publication acceptance.

The end-to-end operator route is: choose Creative or Documentary; research and
write the series bible/script; storyboard in Boords; approve a frozen reference
bundle; select Flow by default, opt-in Cloudflare, or a licensed manual import;
quote and authorize the exact still batch; generate/import and review each image;
run separate Gemini narration and billing approval; add captions; validate and
render the 1920x1080/30fps MP4 and SRT locally; then obtain independent human
creative/release and publication approval. Offline planning and tests do not
authorize any external step.

Related contracts: [documentary direction](documentary-direction.md), [batch
image workflow](batch-image-workflow.md), [stage architecture](stage-architecture.md),
[Cloudflare provider](cloudflare-workers-ai-provider.md), and [portable agent](portable-agent.md).

The portable entry point is `scripts/producer-session.mjs`. It builds on
`scripts/producer-contract.mjs`; `episode.json` remains the canonical
production manifest. The session is a local decision journal and does not
replace that manifest.

## Safe startup and choices

`createGuidedProducer({ episodeId })` performs no file, credential, network,
Boords, Flow, or TTS operation. The first question is the deterministic entry
choice `topic`, `script`, `article`, or `existing-episode`. The preferences
stage then asks for duration, audience, tone, language, aspect ratio, and
visual style. Script, reference, storyboard, and provider questions follow in
fixed order.

The documented provider catalog is stored separately from
`providerEntitlements`. `selectGuidedProvider` accepts a choice only when the
provider is documented and an entitlement record explicitly says it is
available. An unavailable Boords, Flow, or Gemini TTS path throws a safe,
actionable error and leaves the session unchanged; it never probes the
provider or switches silently.

The guided session's provider catalog is deliberately narrower than the
provider-neutral image-batch layer. Cloudflare Workers AI is an opt-in adapter
for separately authorized image batches, with its own capability, neuron,
credential, quote, and live-consent checks; it is not silently selected by the
guided session. Manual imports likewise require licensing and human review.

The preferences stage also asks for an image-count mode (`recommended` or
`custom`) and a pacing profile (`reflective`, `cinematic`, or `energetic`).
Custom counts must be positive integers. `planGuidedImageCount` accepts ordered
narrative beats and produces a deterministic, offline shot plan with unique
image slots, stable scene IDs, story-beat IDs, and integer 30fps timing. The
recommended count uses approximate hold lengths of 4.5 seconds, 3 seconds, and
2.2 seconds respectively, then adjusts allocation for complexity and emotional
holds. These are planning heuristics, not a generation command.

When phrase boundaries are supplied, shot cuts snap to those boundaries. If a
requested custom count cannot fit the available boundaries or would give an
essential beat no shot, planning fails closed rather than silently merging
beats. After full TTS timing is available, replan before any storyboard or
media work and obtain fresh approval; planning never calls Flow, Gemini, or
Boords and never spends credits.

`applyImageCountPlan` adds optional `planning.imageCount` metadata and
`scene.storyBeatId`/duration values to a schema-v1 episode manifest. The
Boords adapter turns each planned scene into one manual-import frame proposal;
it does not mutate Boords. A changed plan dependency invalidates storyboard
and downstream session approvals while retaining existing originals and
receipts.

## Decisions and resumption

- `goBackGuidedStage` changes the current question without removing approvals.
- `editGuidedChoice` changes a recorded answer; use
  `invalidateGuidedStage(stage, reason)` when the edit invalidates approved
  work. The reason is retained in the session.
- `saveGuidedProducer` returns JSON and `resumeGuidedProducer` validates and
  restores it.
- `regenerateSelectedShot` records exactly one `awaiting-approval` request. It
  does not generate media or spend credits.
- `scripts/producer-cli.mjs --manual` prints the non-interactive fallback.

## Demo evidence (offline)

```text
NEW episode-01
entry: topic
preferences: standard / general / curious / en / 16:9 / illustrated-stickman
SAVE -> JSON session at stage preferences
BACK -> entry (approved stages unchanged)
EDIT tone -> dramatic
INVALIDATE script -> "tone changed"
SELECT flow -> unavailable: not currently available
REGENERATE shot-03 -> awaiting human approval; no generation
RESUME -> exact saved stage and choices
```

The automated evidence is `tests/producer-session.test.mjs`. The test suite
stubs `fetch` only to prove that startup does not call it; no provider or
network service is invoked.

## Multi-episode series mode

Series mode is opt-in and defaults to a three-episode proposal. Create or
resume it locally with the additive CLI:

```text
node scripts/producer-cli.mjs --series-create "Series name" "projects/series-name" --episodes 3
node scripts/producer-cli.mjs --series "projects/series-name"
```

Each episode owns `episodes/<episode-id>/episode.json`, its own approval state,
continuity inputs, pinned series-bible revision hash, and manual Boords handoff.
`series-producer.mjs` validates predecessor order, preserves completed episode
files during resume, and invalidates revision-bound downstream approvals when
the bible, references, narrator, style, safe-framing profile, or image plan
changes. The handoff is a local JSON import payload; it never creates,
reorders, deletes, or reviews frames in Boords automatically.

## Offline Producer E2E verification

The no-spend integration harness is `scripts/producer-e2e.mjs` and its focused
suite is `tests/producer-e2e.test.mjs`. Run it with:

```text
node --test tests/producer-e2e.test.mjs
```

It creates temporary synthetic stills and audio, records explicitly
`offline-synthetic` receipts, renders a local 1920x1080 H.264/AAC MP4 and SRT,
and verifies recovery, one-shot retry/read-back, dependency invalidation, and
missing-asset failures. It never calls Flow, Gemini, Boords, or a network
service. Its `release.approved` result remains false until a separate human
creative decision is supplied; passing this suite is not production approval.

## Safe framing for still prompts

New prompt packs use the deterministic `safe-framing-v1` profile: 4% left/top,
8% right and 10% bottom margins, with a protected normalized content area. The
shared composer applies the same guidance to scene and character/prop/environment
reference prompts while retaining the approved story and continuity text. The
prompt pack records the profile hash so an approval can bind to the exact
framing instructions.

The margins are composition heuristics. They do not predict a provider watermark
position or guarantee where a model places story elements. The pure geometry
preview calculates a centered 16:9 region, reports caller-supplied landmark
boxes that fall outside the protected region, and never edits pixels. Landmark
boxes are supplied data; this preview does not detect faces or objects. Any
profile change invalidates storyboard and later approvals in a saved guided
session. Historical sessions and manifests without framing fields remain valid.
Watermark removal, masking, concealment, or destructive cropping is not supported.
