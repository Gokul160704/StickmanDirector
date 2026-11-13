# Creating a video series

Give StickmanDirector a topic to start a series. The workflow turns it into a reviewed plan and production package, then creates illustrated scenes, narration, and an assembled video.

## 1. Turn the topic into a series plan

Research the topic and collect reliable sources for factual claims. Define the audience, central premise, tone, episode format, and recurring story elements. Use the research to draft a series bible and an episode outline. Keep uncertain or disputed claims marked for review instead of presenting them as fact.

## 2. Write and storyboard an episode

Write the episode as natural, speakable narration with a clear opening, progression, and ending. Track the exact spoken text in the local project. Organize the episode in Boords as ordered frames, with each frame recording its shot, action, narration or sound, art reference, and review status. Resolve feedback and approve the script and storyboard before production.

## 3. Create visual references and scene stills

Use Google Flow through the configured GTAI-1 Flow MCP. Start with `flow_status` to confirm the account and active project. Create and review reusable character and important prop references, then generate full-frame 16:9 scene stills from the storyboard. Check continuity, composition, story clarity, and unwanted text. Attach approved stills to their Boords frames.

## 4. Add voice and captions

Use the established Gemini TTS workflow in [AUDIO.md](../AUDIO.md). Keep the spoken-text file synchronized with the accepted narration. Audition a short passage before producing the full episode, then make captions from the approved narration and timing.

## 5. Assemble and review the video

Use only approved full-frame Flow stills as visual inputs. The local FFmpeg renderer assembles those stills with Gemini narration and captions into the final MP4 and SRT. Review the complete episode for pacing, audio levels, caption timing, continuity, and correct provenance. StickmanDirector does not generate or require Flow video clips.

## Series foundation mode

For an offline, versioned multi-episode foundation, see [series-foundation.md](series-foundation.md). It adds stable continuity metadata and episode scaffolding without changing the existing episode manifest or invoking a provider.

## Start with a topic

Provide a topic and, if known, the intended audience, episode length, number of episodes, narration language, and tone. If those are undecided, start with the topic and review a proposed audience, format, and series outline before generating assets.

See the [production workflow](workflow.md), [Flow MCP setup and findings](google-flow-mcp.md), and [repository README](../README.md).
