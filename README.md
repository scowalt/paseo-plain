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
paseo plugin add https://github.com/scowalt/paseo-plain.git --ref main
paseo plugin ls --json
```

Require `paseo-plain` to report `running`. If your CLI targets another daemon by default, supply its explicit `--host` option. Do not install a duplicate ID.

The manifest runs a preparation command that installs locked production dependencies with npm lifecycle scripts disabled. Paseo supplies its own client/server SDK modules. The package remains private to prevent accidental npm publication.

Open **Paseo Plain settings** from the Command Center. Enable manual rewriting and save. A managed machine setup can initialize this setting on a fresh installation without replacing existing preferences.

## Use

Select **Plain English > Rewrite** below an answer to request a rewrite. The original remains available while the worker runs and if the request fails.

Finishing turns, viewing messages, opening controls, copying, reconnecting, polling, and switching display modes never start model work. Existing cached rewrites can appear without another request. The settings action **Test Pi rewrite** is a separate, explicitly labeled model request. **Display test (no model)** tests the controls without spending model tokens.

Disabling manual rewriting removes the display transformer within five seconds. Busy agents keep their original display because Paseo 0.8 beta does not reliably identify completed assistant-text fragments during streaming.

## Message display

The plugin renders both original answers and rewrites. Tables keep their columns, alignment, and inline formatting. Small screens scroll wide tables horizontally instead of squeezing the columns.

HTTP and HTTPS links use browser links on web clients and the system URL opener on mobile clients. On iOS, paragraphs with links prioritize taps over text selection. Use the answer's copy control to copy those paragraphs. Local file paths refer to the daemon, not your phone or browser, so the plugin leaves those links inactive. Images show their alternative text without automatic downloads. The plugin never executes embedded HTML.

In Paseo Desktop, right-click a link and select **Open Link in Browser** to use your computer's default browser. Normal clicks can open a Paseo window instead.

Paseo 0.8 does not expose its Markdown renderer or Appearance typography through the [public plugin interface](https://paseo.sh/docs/plugins/v0.8/reference.md#timeline-items). The plugin uses Paseo's default prose size and line spacing, and inherits the surrounding font on web clients. Custom content sizes, native font preferences, and Paseo's file-opening behavior cannot pass through this interface. `client/markdown.tsx` keeps this replacement renderer separate from rewrite controls and model work. A public host renderer is the preferred replacement when Paseo provides one.

For a display check without a model call, select **Display test (no model)** in the plugin settings. The fixed sample includes a table, a formatted link, and a code block. Try the sample in wide and compact clients, with light and dark themes. Make sure that the columns stay aligned and the link opens the Paseo guide. Compare the font with an ordinary message while the plugin is disabled. Automated tests do not establish acceptance in the actual Paseo clients.

## Prompt and preservation

The built-in prompt in `server/prompt.ts` asks for a fresh whole-answer rewrite in English, not sentence-by-sentence word substitutions. It defaults to connected paragraphs and combines related facts across rhetorical sections. Each subject's changes, checks, and limits belong together instead of in separate report categories. Full-answer examples show this regrouping, status reports and recommendations becoming prose, and a useful procedure staying a list. Every substantive fact, condition, permission, comparison, uncertainty, and implication must remain. There is no target word count or compression ratio. See `CONTEXT.md` for the distinction between a rewrite and a summary.

**Voice instructions** is an additional style preference, not the full prompt. It is appended to the built-in prompt. Saved preferences survive updates. Exact-copy rules take precedence over style and compression.

The worker receives one masked answer, not the user's question, conversation history, or project files. Tools, extensions, skills, context files, prompt templates, themes, and session persistence are disabled. Pi's offline startup flag prevents startup downloads, not the requested model call.

Code fences, inline code, recognized commands, paths, URLs, quoted text, and numbers receive protected placeholders. Missing, duplicated, reordered, or invented protected content causes rejection. Meaningful Markdown relationships remain, but redundant headings and paragraphs can disappear.

The completion reader requires a successful final assistant response, matching terminal records, and a zero process exit. It rejects truncation, errors, tool requests, and incomplete or conflicting output. It never returns reasoning or streamed fragments as the rewrite.

These checks cannot prove semantic equivalence. Use **Compare** for important answers. The longer prompt uses more input tokens per requested rewrite, and more restructuring does not always mean fewer words.

An initial six-call comparison on short synthetic answers was inconclusive. After more explicit subject-centered instructions, six additional calls on harder examples showed a structural difference: the old prompt retained three headings and nine bullets in an engineering report, while policy 5 produced four prose paragraphs. A technical explanation changed from seven blocks with two bullets to five prose paragraphs. Both prompts retained the useful table and ordered, nested procedure in the third case. Manual review found the listed facts and conditions retained in the two prose cases; all six outputs passed exact-copy and completion checks.

This is a small synthetic comparison, not proof of reliability on every answer. Both variants used wording in the procedure that could imply who must personally perform a review where the source did not explicitly assign that role. Exact-copy validation cannot detect that kind of ambiguity.

Speaker framing and Markdown protection wording retain attribution to [Claudish v0.9.0](https://github.com/gvzdv/claudish-to-english/tree/bf271f95fd2c1a7d00ea545bbc6de44a1b6a1d3c). Block splitting is adapted from Paseo. See `NOTICE` and `LICENSES/` for the upstream notices.

## Update and recovery

```sh
paseo plugin update paseo-plain
paseo plugin ls --json
```

New installations track `main`. Updates use its latest commit without requiring a new GitHub release or package version. Version tags remain optional fixed points. An installation pinned to a tag or commit does not advance automatically.

[Machine setup](https://github.com/scowalt/machine-setup-scripts#paseo-plain-plugin) migrates matching, enabled `release` installations on their next setup run. Paseo 0.8 cannot change an installed branch in place. Setup makes private recovery copies, uses a one-time remove/add operation under the same ID, and preserves preferences and cache. Failed or interrupted migrations stop for review rather than retry destructively. Directory installations, other sources, pinned revisions, and disabled choices remain unchanged. See the [migration recovery procedure](https://github.com/scowalt/machine-setup-scripts#paseo-plain-migration-recovery).

Git preparation and validation failures leave the existing installation in place. A command timeout does not prove the daemon stopped processing the request. Inspect plugin status before retrying. Do not restart the daemon to update this plugin.

Keep a private backup of configuration and cache files before manual source replacement. An existing directory installation or different source must be handled explicitly, not overwritten by setup. Disabling the plugin restores normal display without deleting those files:

```sh
paseo plugin disable paseo-plain
```

## Storage and limits

Configuration and cache files live in `${PASEO_HOME:-~/.paseo}/plugin-data/paseo-plain/`. Keep this directory private. New POSIX directories use mode `0700` and files use `0600`. On Windows, the plugin restricts its storage to the current user, SYSTEM, and administrators through NTFS permissions. If it cannot prepare private storage, rewriting stays off. Still use a private user-profile location rather than a shared folder. Cached rewrites are not encrypted at rest.

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

Tests use fake external model processes. For a packaging check, set `PASEO_RUNTIME_MODULE` to an installed Paseo 0.8 `server/plugins/runtime.js` module and run `node tests/paseo-install-smoke.mjs /path/to/prepared/checkout`. This loads and reloads the clean checkout through Paseo's real plugin runtime with a temporary home and a fake session host. It starts no daemon listener and makes no model calls.

Native layout and theme acceptance require separate client checks. The live smoke test requires explicit consent and `PASEO_PLAIN_LIVE_TEST=1`; routine tests never run it.

For an explicitly approved, synthetic-only **Test Pi rewrite** comparison, run `PASEO_PLAIN_PROMPT_COMPARISON=1 node --import tsx tests/prompt-comparison.ts`. It makes six sequential model requests, using the same worker and default configuration for policy 4 and the current prompt. Add `PASEO_PLAIN_PROMPT_COMPARISON_SUITE=hard` to select the longer reports, explanation, and mixed reference/procedure instead of the basic cases. Each invocation needs its own six-call authorization.

The tool reads the reviewed policy-4 prompt from commit `77d32ec`, which must be available locally. It does not connect to a daemon, read saved plugin settings, or retry failed calls. It writes a private temporary report with synthetic inputs, outputs, timing, and a fact checklist for manual review. Block and word counts are descriptive, not quality scores. The source fixtures are separate from the prompt's examples and are never instructions to execute. Routine tests only check that this tool refuses to run without consent or with an unknown suite.

`client/` owns native display code, `server/` owns worker and persistence code, and `shared/` owns typed request contracts. Keep those runtime boundaries intact. Changes to prompt or completion rules must advance the prompt policy version.

Lefthook runs a staged secret scan before commits. Mise pins the scanner and development Node version. Run the hook before the first public push. Never publish local operational notes or infrastructure state.

The repository resource is managed by OpenTofu in `infra/`. Supply `GITHUB_TOKEN` through the environment. Its local state is ignored by Git and must remain private and backed up; do not apply this configuration from a fresh checkout without importing the existing repository or restoring its state.
