# Paseo Plain

This is a Paseo-only display rewriter. Preserve the coding agent's conversation and all non-assistant timeline items.

## Development rules

- Pin the tested Paseo SDK and keep manifest requirements correct for beta releases.
- Keep client code native, theme-aware, and free of Node imports.
- Keep model calls, credentials, cancellation, and persistence on the daemon.
- Never log message contents, provider stderr, credentials, or authentication files.
- Never add agent prompt, permission, file-editing, or timeline-writing operations.
- Use an isolated Pi worker with tools and contextual resources disabled.
- Use Scott's detailed Claudish-to-English baseline in `server/prompt.ts`. Remove repeated rhetoric without dropping substantive meaning or strengthening logical scope. Do not require one output sentence or heading for every input sentence or heading.
- Preserve speaker roles, meaningful Markdown relationships, and the stronger local exact-copy rules. Protected tokens take precedence over compression. Keep the MIT notice for retained upstream wording in `LICENSES/Claudish-MIT.txt`.
- Preserve saved custom voice settings. Do not add user-question or conversation context without approval.
- Require a successful, matching terminal response from Pi's JSON events and a zero process exit. Reject truncation, errors, and incomplete streams; never use deltas or reasoning as a rewrite.
- Advance the prompt policy version when prompt or completion-validity rules change. Older cached results must not bypass new rules or trigger automatic regeneration.
- Keep rewriting manual-only. Only explicit Rewrite and labeled model-preview requests may start model work. Never enqueue on lifecycle events, rendering, lookups, reconnects, or polling.
- Test public display and daemon boundaries with fake external models.
- Run `npm test` and `npm run typecheck` before installation or reload.
- Require explicit opt-in for `tests/live-smoke.ts`. It uses an actual model account.
- Do not claim client acceptance from component tests. Ask for actual wide and compact client verification.
- Use Backlog CLI for task metadata. Never edit task Markdown directly.
- Do not publish a remote repository or roll out to other daemons without permission.
