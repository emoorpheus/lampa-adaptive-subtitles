# AGENTS.md

Instructions for AI coding assistants (Claude Code, Codex, Gemini CLI and others) working on this repository.
Humans: the same rules are in [CONTRIBUTING.md](CONTRIBUTING.md). Keep both files in sync.

## Project

**Adaptive Subtitles for Lampa** — a plugin for [Lampa](https://github.com/yumata/lampa) (a media app for Smart TVs, Android TV and
browsers). It detects HDR10, Dolby Vision and HLG video (file name, torrent title, ffprobe via TorrServer `/ffp`, HLS `VIDEO-RANGE`)
and dims the subtitles while HDR is really shown, so they do not glare on OLED screens; SDR video keeps Lampa's subtitles.
The result is one file, `dist/adaptive_subs.js`, that runs inside Lampa on old TV browser engines.

| Path | What it is |
|---|---|
| `src/NN_*.js` | Sources. `build.js` concatenates them in name order into `dist/adaptive_subs.js` and writes `dist/SHA256SUMS`. |
| `src/05_i18n.js` | All user-visible strings (`ru` and `en`) and the language choice. |
| `src/10_detect.js` | Pure detection logic: HDR words in text, ffprobe streams, HLS `VIDEO-RANGE` and `CODECS`. |
| `src/20_net.js` … `src/90_boot.js` | TorrServer and HLS requests, LG webOS embedded subtitles, styles, profile and display check, settings, boot. |
| `tests/` | Unit tests (Node.js 18+, no dependencies) with a fake Lampa and browser in `tests/lib/`. |
| `e2e/` | Playwright scenarios in the real Lampa web build (`ref/`, git-ignored, created by `e2e/setup.sh`). |
| `tools/check-publish.js` | Scan for private data before publishing; `tools/vendor/acorn.js` is used by the build for the ES5 check. |
| `docs/` | English docs; `*.ru.md` are the Russian versions. |

## Commands

```sh
node build.js                 # build dist/ (version from package.json), fails on non-ES5 syntax
npm test                      # build + unit tests (node tests/run_all.js)
npm run check -- --strict     # private data scan + unreplaced placeholders
npm install && npm run e2e:setup && CHROMIUM_PATH=/path/to/chromium npm run e2e   # end-to-end tests
```

Run `npm test` after every change. Run the end-to-end tests for changes in the player, settings, styles or Lampa integration.

## Rules

- **ES5 only** in `src/` (no `let`/`const`, arrow functions, classes, template strings, …) and no built-in APIs newer than ES5
  except `Promise` (Lampa provides it). `build.js` and `tests/t_compat.js` enforce this — old webOS and Tizen engines must run the file.
- **No runtime dependencies and no external services.** The plugin talks only to the user's TorrServer, the stream that is already
  playing and, on LG webOS, the TV's media service.
- **Strings:** every user-visible string goes through `tr()` and the table in `src/05_i18n.js`, in every language, with the same
  placeholders. Cyrillic string literals only in that table (`tests/t_i18n.js` checks it). Log messages (`[AdaptiveSubs] …`) are in English.
- **Conventions:** code comments and test names are in Russian; README, docs and CHANGELOG are in English, with Russian versions in
  `README.ru.md` and `docs/*.ru.md` — update both. Release notes (`docs/releases/vX.Y.Z.md`) have an English and a Russian part.
- **Keep the public interface compatible:** storage keys `adaptive_subs_*` (users keep settings and manual choices across updates),
  the `adaptive_subs` event, `window.AdaptiveSubs` and `window.__lampa_ffp__` (v1) are used by other plugins (for example Skip Intro).
- **Dim only when HDR is really shown.** Dimmed subtitles on an SDR picture look wrong; keep the display check (setting **Display**)
  and do not let it override the user's manual choice.
- **Commit `dist/` together with `src/`.** CI rebuilds it and fails if it differs.
- **No private data** in committed files: IP addresses (except `127.0.0.1` and RFC 5737 examples), e-mails, tokens, home paths, host
  names, server paths. Use placeholders such as `<YOUR_SERVER_IP>` and `<PORT>`. `npm run check` scans for them; personal words go
  into `.publish-denylist` (git-ignored).

## Evidence

- State only what is verified. Back claims about Lampa's behaviour with links to `app.min.js` of the pinned Lampa 3.4.4 web build:
  `https://github.com/yumata/lampa/blob/4294a571aad8883116e57d975ad05519f84be13e/app.min.js#L…` (the same commit `e2e/setup.sh` uses).
- Back claims about devices with a log line, a test or the maintainer's report. If a change is checked only by automated tests,
  write “not tested on a TV”. Do not list a device as tested without a report.

## Release

See [CONTRIBUTING.md → Release](CONTRIBUTING.md#release-maintainers): version in `package.json`, `CHANGELOG.md`,
`docs/releases/vX.Y.Z.md`, `npm test && npm run check -- --strict`, push (stable to `main`, pre-releases to `next`), tag,
GitHub release with `dist/adaptive_subs.js` and `dist/SHA256SUMS`. Do not push, tag or publish without the maintainer's confirmation.

The plugin was developed with the help of AI models: Opus 5.5 and Gemini 3.8 Flash.
