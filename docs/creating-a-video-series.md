# Creating a video series

Give StickmanDirector a topic to start a series. The workflow turns it into a reviewed plan and production package, then creates illustrated scenes, narration, and an assembled video.

## 1. Turn the topic into a series plan

Research the topic and collect reliable sources for factual claims. Define the audience, central premise, tone, episode format, and recurring story elements. Use the research to draft a series bible and an episode outline. Keep uncertain or disputed claims marked for review instead of presenting them as fact.

## 2. Write and storyboard an episode

Write the episode as natural, speakable narration with a clear opening, progression, and ending. Track the exact spoken text in the local project. Organize the episode in Boords as ordered frames, with each frame recording its shot, action, narration or sound, art reference, and review status. Resolve feedback and approve the script and storyboard before production.

## 3. Create visual references and scene stills

Use Google Flow through the configured GTAI-1 Flow MCP. Start with `flow_status` to confirm the account and active project. Create and review reusable character and important prop references, then generate full-frame 16:9 scene stills from the storyboard. Check continuity, composition, story clarity, and unwanted text. Attach approved stills to their Boords frames.

## 4. Animate selected scenes

Use Flow image-to-video on approved stills where motion improves the story. Prompt for one clear action and restrained camera movement while preserving the approved character, props, composition, and style. Review each clip for drift and artifacts before accepting it. Check the live model, credit balance, and per-output cost, then show the proposed batch and wait for approval before generation.

## 5. Add voice and captions

Use the established Gemini TTS workflow in [AUDIO.md](../AUDIO.md). Keep the spoken-text file synchronized with the accepted narration. Audition a short passage before producing the full episode, then make captions from the approved narration and timing.

## 6. Assemble and review the video

Combine approved Flow clips and stills with narration, captions, and sound in a video editor. Review the complete episode for pacing, audio levels, caption timing, continuity, and correct credits. The local `render:stills` command can make a simple narrated still-image review cut; it does not assemble Flow video clips or animate characters.

## Start with a topic

Provide a topic and, if known, the intended audience, episode length, number of episodes, narration language, and tone. If those are undecided, start with the topic and review a proposed audience, format, and series outline before generating assets.

See the [production workflow](workflow.md), [image-to-video guide](image-to-video-workflow.md), [Flow MCP setup and findings](google-flow-mcp.md), and [repository README](../README.md).
