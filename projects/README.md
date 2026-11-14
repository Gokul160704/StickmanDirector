# Local episode folders

Episode folders under this directory are intentionally excluded from Git by default. Use `node scripts/new-series.mjs "Series Name"` to create a local scaffold. See the root repository policy before selecting any project content for publication.

New provider-neutral still workflows may also use `node scripts/producer-cli.mjs
--series-create ...` or `--documentary-create ...`; both are offline-first and
non-overwriting. Flow remains the default provider. Cloudflare Workers AI and
manual imports are opt-in, separately authorized choices with their own
capability, licensing, budget, provenance, and review gates. No scaffold command
generates media, spends credits/neurons, changes Boords, or publishes anything.
