# Creating a video series

Give StickmanDirector a topic to start a Creative series, or use the [documentary workflow](documentary-direction.md) for source-led nonfiction. The workflow turns it into a reviewed plan and production package; many planning stages are offline and no provider action is implied.

## 1. Turn the topic into a series plan

Research the topic and collect reliable sources for factual claims. Define the audience, central premise, tone, episode format, and recurring story elements. Use the research to draft a series bible and an episode outline. Keep uncertain or disputed claims marked for review instead of presenting them as fact.

## 2. Write and storyboard an episode

Write the episode as natural, speakable narration with a clear opening, progression, and ending. Track the exact spoken text in the local project. Organize the episode in Boords as ordered frames, with each frame recording its shot, action, narration or sound, art reference, and review status. Resolve feedback and approve the script and storyboard before production.

## 3. Freeze references and select a provider

Create and review reusable character, prop, environment, and style references, then freeze their SHA-256 bundle and record the bundle revision in continuity notes. Plan stable `episodeId`/`sceneId`/variant items for the intended 8/36/100+ batch.

Google Flow through the configured GTAI-1 Flow MCP is the default. Start with `flow_status`, confirm the active project, model, aspect ratio, credits, and displayed per-output cost, show the exact batch, and wait for fresh authorization. An owner-approved Cloudflare Workers AI batch or suitably licensed manual still import is a separate provider choice, not a fallback. The current Cloudflare adapter and tests are offline/mock verified; live quality, quota, neuron, and account claims remain `NOT RUN` unless separately evidenced.

After the provider-specific capability, licensing, quote, and consent checks pass, generate or import full-frame 16:9 stills. Record per-image provenance, output hashes, receipts, known/unknown outcomes, and selected retries; review continuity, composition, story clarity, and unwanted text before attaching approved stills to Boords frames. Preserve original files and visible watermarks. Do not crop, mask, conceal, or otherwise alter a watermark.

## 4. Add voice and captions

Use the established Gemini TTS workflow in [AUDIO.md](../AUDIO.md). Keep the spoken-text file synchronized with the accepted narration. Audition a short passage before producing the full episode, then make captions from the approved narration and timing.

## 5. Assemble and review the video

Use only approved full-frame stills from the selected provider as visual inputs. The local FFmpeg renderer assembles those stills with Gemini narration and captions into the final MP4 and SRT. Review the complete episode for pacing, audio levels, caption timing, continuity, and correct provenance. StickmanDirector does not generate or require Flow video clips.

## Series foundation mode

For an offline, versioned multi-episode foundation, see [series-foundation.md](series-foundation.md). It adds stable continuity metadata and episode scaffolding without changing the existing episode manifest or invoking a provider.

## Start with a topic

Provide a topic and, if known, the intended audience, episode length, number of episodes, narration language, and tone. If those are undecided, start with the topic and review a proposed audience, format, and series outline before generating assets.

See the [production workflow](workflow.md), [batch image workflow](batch-image-workflow.md), [stage architecture](stage-architecture.md), [Flow MCP setup and findings](google-flow-mcp.md), and [repository README](../README.md).
