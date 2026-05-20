# Codex++ List Pagebuster

A third-party user script for [Codex++](https://github.com/BigPizzaV3/CodexPlusPlus). It attempts to surface more local Codex Desktop history entries in the native sidebar, and adds an `Extra history` fallback section for sessions that Codex Desktop does not include in its native recent list.

It complements [Dailin521/codex-provider-sync](https://github.com/Dailin521/codex-provider-sync): that project fixes provider metadata synchronization across Codex local state and rollout files, while this script targets Codex Desktop's frontend sidebar loading and old-session resume/open behavior.

The script only auto-expands project lists during a short startup window. If the user manually collapses or expands a project, the script stops auto-expanding so it does not fight the native sidebar. `Extra history` is reserved for sessions without a visible matching project, not merely sessions hidden by a collapsed project.

This is not an official OpenAI Codex feature and is not bundled with Codex++. It relies on Codex Desktop internal frontend APIs and may break after app updates.

See [README.md](README.md) for the full Chinese documentation.
