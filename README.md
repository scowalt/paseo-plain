# Paseo Plain

Rewrite assistant answers in plain English inside Paseo, only when you ask. The coding agent keeps its original conversation.

Paseo Plain adds one **Plain English** button below each resolved, complete answer. It provides original, rewrite, comparison, and copy controls. A separate Pi worker performs the rewrite through your existing OpenAI Codex login.

## Requirements

- Paseo CLI, daemon, and client on the compatible 0.8 release line. The SDK is tested against `0.8.0-beta.1`.
- Node.js >=22.19.0, npm, Git, and the Pi coding agent on the daemon's PATH.
- An existing Pi `openai-codex` login and an available model. The default is `gpt-6-astra` with low thinking.
- Permission to run trusted Paseo plugins on that daemon.

The daemon runs the worker. A compatible Mac or phone client needs no separate plugin installation when connected to that daemon.

The plugin was developed on Linux. Offline CI uses fake workers on Linux, macOS, and Windows. It does not prove actual model access, native client appearance, or ARM runtime compatibility. Windows npm command shims resolve to the installed Pi JavaScript entry without a command shell. Linux ARM and WSL still need platform-specific runtime verification.

## Install

Plugins are trusted, unsandboxed code. Server code and dependency preparation can access the daemon's files, credentials, processes, and network. Client code runs inside Paseo. Enable plugins in **Settings > Plugins** only after accepting that trust decision.

On the daemon machine:

```sh
paseo plugin add https://github.com/scowalt/paseo-plain.git --ref release
paseo plugin ls --json
```

Require `paseo-plain` to report `running`. If your CLI targets another daemon by default, supply its explicit `--host` option. Do not install a duplicate ID.

The manifest runs a preparation command that installs locked production dependencies with npm lifecycle scripts disabled. Paseo supplies its own client/server SDK modules. The package remains private to prevent accidental npm publication.

Open **Paseo Plain settings** from the Command Center. Enable manual rewriting and save. A managed machine setup can initialize this setting on a fresh installation without replacing existing preferences.

## Use

Select **Plain English > Rewrite** below an answer to request a rewrite. The original remains available while the worker runs and if the request fails.

Finishing turns, viewing messages, opening controls, copying, reconnecting, polling, and switching display modes never start model work. Existing cached rewrites can appear without another request. The settings action **Test Pi rewrite** is a separate, explicitly labeled model request. **Display test (no model)** tests the controls without spending model tokens.

Disabling manual rewriting removes the display transformer within five seconds. Busy agents keep their original display because Paseo 0.8 beta does not reliably identify completed assistant-text fragments during streaming.

## Prompt and preservation

The built-in prompt in `server/prompt.ts` rewrites to English. It removes repeated ideas, rhetorical framing, and unnecessary metaphors while retaining substantive facts, conditions, permissions, comparisons, uncertainty, and implications.

**Voice instructions** is an additional style preference, not the full prompt. It is appended to the built-in prompt. Saved preferences survive updates. Exact-copy rules take precedence over style and compression.

The worker receives one masked answer, not the user's question, conversation history, or project files. Tools, extensions, skills, context files, prompt templates, themes, and session persistence are disabled. Pi's offline startup flag prevents startup downloads, not the requested model call.

Code fences, inline code, recognized commands, paths, URLs, quoted text, and numbers receive protected placeholders. Missing, duplicated, reordered, or invented protected content causes rejection. Meaningful Markdown relationships remain, but redundant headings and paragraphs can disappear.

The completion reader requires a successful final assistant response, matching terminal records, and a zero process exit. It rejects truncation, errors, tool requests, and incomplete or conflicting output. It never returns reasoning or streamed fragments as the rewrite.

These checks cannot prove semantic equivalence. Use **Compare** for important answers. The longer prompt uses more input tokens per requested rewrite. No real-model quality comparison was performed for this release.

Speaker framing and Markdown protection wording retain attribution to [Claudish v0.9.0](https://github.com/gvzdv/claudish-to-english/tree/bf271f95fd2c1a7d00ea545bbc6de44a1b6a1d3c). Block splitting is adapted from Paseo. See `NOTICE` and `LICENSES/` for the upstream notices.

## Update and recovery

```sh
paseo plugin update paseo-plain
paseo plugin ls --json
```

The `release` branch moves only for reviewed releases. Version tags identify fixed releases. Paseo follows branches for updates; an installation pinned to a tag or commit does not advance to a newer release automatically.

Git preparation and validation failures leave the existing installation in place. A command timeout does not prove the daemon stopped processing the request. Inspect plugin status before retrying. Do not restart the daemon to update this plugin.

Keep a private backup of configuration and cache files before manual source replacement. An existing directory installation or different source must be handled explicitly, not overwritten by setup. Disabling the plugin restores normal display without deleting those files:

```sh
paseo plugin disable paseo-plain
```

## Storage and limits

Configuration and cache files live in `${PASEO_HOME:-~/.paseo}/plugin-data/paseo-plain/`. Keep this directory private. New POSIX directories use mode `0700` and files use `0600`. Windows inherits NTFS permissions from the containing directory, so use a private user-profile location rather than a shared folder. Cached rewrites are not encrypted at rest.

The worker allows two concurrent requests and twenty waiting requests. Input is limited to 32,000 characters. The default deadline is 45 seconds, followed by termination and a one-second forced-exit fallback. Output limits are 8 MiB of events, 1 MiB per record, and 128,000 bytes of final text.

The cache holds at most 200 entries and four million bytes of rewrite text for 24 hours. Keys include the agent, source hash, model, voice, and prompt policy. Policy changes invalidate older results without automatic regeneration. Clearing the cache cancels pending work.

The plugin never writes agent history, sends agent prompts, answers permissions, or edits project files. It does not log messages, credentials, provider stderr, or authentication files. No authentication data is copied between machines.

Paseo beta splits some answers into Markdown blocks with one message ID and no block index. The plugin resolves the complete answer and places one control at its final block. Missing or ambiguous IDs, repeated indistinguishable final blocks, and unavailable history leave the original visible without controls. History lookup is bounded to five pages of 200 items.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
```

Tests use fake external model processes. Native layout and theme acceptance require separate client checks. The live smoke test requires explicit consent and `PASEO_PLAIN_LIVE_TEST=1`; routine tests never run it.

`client/` owns native display code, `server/` owns worker and persistence code, and `shared/` owns typed request contracts. Keep those runtime boundaries intact. Changes to prompt or completion rules must advance the prompt policy version.

Lefthook runs a staged secret scan before commits. Mise pins the scanner and development Node version. Run the hook before the first public push. Never publish local operational notes or infrastructure state.

The repository resource is managed by OpenTofu in `infra/`. Supply `GITHUB_TOKEN` through the environment. Its local state is ignored by Git and must remain private and backed up; do not apply this configuration from a fresh checkout without importing the existing repository or restoring its state.
