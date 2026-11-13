# Documentary direction

Documentary mode is an opt-in, offline-first editorial workflow alongside the existing Creative/Storytelling Producer. Start with a subject, build a source ledger, write a complete speakable script, and produce a reviewable local package before any production action.

The package preserves eight parts: opening hook; subject introduction; background/context; main evidence/story; different perspectives; challenges/consequences/significance; conclusion; and sources/further learning. Keep FACT, ANALYSIS, and OPINION visibly separate. Unsupported or conflicting material stays `REQUIRES VERIFICATION` or `CONFLICTING`; it cannot become asserted narration or an approved release.

Use `source → claim → narration → shot` IDs. Record original URLs, publisher/author, publication and access dates, exact supported claims, evidence quality, status, and licensing/provenance. Interview questions are plans, never testimony. Treat vulnerable people, allegations, tragedies, private data, reconstructions, and archival material with care; label AI-generated reconstructions clearly and do not imply that credit alone grants permission.

The repository adaptation is still-image-first: B-roll means full-frame 16:9 visual coverage directions for Google Flow stills, maps, charts, archival-inspired illustrations, or labeled reconstructions. It does not request t2v/i2v, clip mixing, or generated video. Existing AUDIO.md Gemini TTS, Flow, Boords, and FFmpeg workflows retain their own consent and approval gates. The documentary package is metadata and does not replace canonical schema-v1 `episode.json`.

Create a local draft with:

```text
node scripts/producer-cli.mjs --documentary-create "Demo Documentary" projects/demo-documentary --episodes 3
```

This writes `documentary-package.json` and `documentary-package.md` only. It makes no provider calls, spends no credits, mutates no Boords project, and publishes nothing. Replace the pending research placeholders with source-backed material and obtain independent editorial, creative, provider, licensing, and publication approvals as applicable.
