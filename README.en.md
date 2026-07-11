> [!IMPORTANT]
> Maintenance status: Codex now natively supports showing more than 50 history sessions, so this project is no longer maintained.
>
> This repository is kept only as a historical implementation reference. It will not be adapted for newer Codex Desktop / Codex++ releases, and continued installation is no longer recommended.

# Codex++ List Pagebuster

A third-party user script for [Codex++](https://github.com/BigPizzaV3/CodexPlusPlus). It attempts to surface more local Codex Desktop history entries in the native sidebar, and adds an `Extra history` fallback section for sessions that Codex Desktop does not include in its native recent list.

It complements history-session repair tools such as the built-in Codex++ history repair feature. Those tools make old sessions recognizable again under the current mode/API metadata, while this script targets the separate Codex Desktop frontend sidebar loading limit and old-session resume/open behavior.

The script only auto-expands project lists during a short startup window. If the user manually collapses or expands a project, the script stops auto-expanding so it does not fight the native sidebar. `Extra history` is reserved for sessions without a visible matching project, not merely sessions hidden by a collapsed project.

This is not an official OpenAI Codex feature and is not bundled with Codex++. It relies on Codex Desktop internal frontend APIs and may break after app updates.

See [README.md](README.md) for the full Chinese documentation.
