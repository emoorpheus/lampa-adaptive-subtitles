# Contributing

Thank you for helping! The most valuable contribution right now is a **report from a device that has not been tested yet** —
Samsung Tizen, other Android TV boxes, older LG webOS versions — with HDR10, Dolby Vision or HLG video. So far the plugin has been
tested on LG webOS 25 (1.0.0) and one Android TV box, Tanix TX9 (1.1.0-beta.2) — README → Tested devices. See
[docs/tv-checklist.md](docs/tv-checklist.md) (in Russian: [docs/tv-checklist.ru.md](docs/tv-checklist.ru.md)).

## Rules

- The plugin code must stay **ES5** (old TV browsers). `node build.js` rejects newer syntax, `tests/t_compat.js` rejects newer
  built-in APIs (except `Promise`, which Lampa provides) and CSS that old engines do not support.
- The user interface is in Russian and English and follows the Lampa language: every user-visible string goes through `tr()`
  and the table in `src/05_i18n.js` ([Translations](#translations)). Code comments and test names are in Russian; English issues and
  pull requests are welcome.
- Documentation: `README.md`, `docs/*.md` and `CHANGELOG.md` are in English; `README.ru.md` and `docs/*.ru.md` are the Russian
  versions — update both. Release notes `docs/releases/vX.Y.Z.md` have an English and a Russian part.
- No runtime dependencies and no external services. The plugin talks only to the user's TorrServer, the stream that is already
  playing and, on LG webOS, the TV's media service — please keep it that way.
- Keep the public interface compatible: settings keys `adaptive_subs_*`, the `adaptive_subs` event, `window.AdaptiveSubs` and
  `window.__lampa_ffp__` (v1) are used by other plugins (for example Skip Intro).
- **AI coding assistants** (Claude Code, Codex, Gemini CLI, …): the project rules for them are in [AGENTS.md](AGENTS.md);
  [CLAUDE.md](CLAUDE.md) only imports it. Keep these files in sync with this guide when the rules change.
- Do not commit private data. Run `npm run check` before pushing (IP addresses, e-mails, tokens, personal paths). Put your own
  nickname, host names and server paths into `.publish-denylist` (one per line, git-ignored) to have them checked as well.

## Development

```sh
git clone https://github.com/emoorpheus/lampa-adaptive-subtitles.git
cd lampa-adaptive-subtitles
npm test        # build src/ -> dist/adaptive_subs.js + unit tests (Node.js 18+, no npm install)
```

- Sources: `src/NN_*.js` are concatenated in order by `build.js` into `dist/adaptive_subs.js`; the version comes from `package.json`.
- Commit `dist/` together with `src/` — CI rebuilds it and fails if it differs.

### End-to-end tests (Linux or macOS)

```sh
npm install                 # Playwright
npm run e2e:setup           # clones the Lampa web build into ref/ (~30 MB) and generates test videos (needs git and ffmpeg)
CHROMIUM_PATH=/path/to/chromium npm run e2e   # or first: npx playwright install chromium
```

The scenarios (`e2e_player`, `e2e_movie`, `e2e_torrent`, `e2e_screen`, `e2e_settings`, `e2e_i18n`) run the real Lampa web build on `127.0.0.1:8123`
and mock every external request, including TorrServer. Run a single one with `node e2e/run_all.js e2e_player`.

## Translations

The plugin reads the Lampa language (`Lampa.Storage` key `language`): Russian for `ru`, English for every other language.
All interface strings are in one table in `src/05_i18n.js`:

```js
set_mode: { ru: 'Режим', en: 'Mode' },
noty_subs: { ru: 'Субтитры: {state}', en: 'Subtitles: {state}' },
state_hdr: { ru: '{kind} — затемнённые, {pct}%', en: '{kind} — dimmed, {pct}%' },
```

- In code: `tr('set_mode')`, `tr('noty_subs', { state: tr('state_sdr') })` → «Субтитры: SDR — обычные» / “Subtitles: SDR — normal”.
- Placeholders (`{state}`, `{kind}`, …) must be the same in every language. A missing translation falls back to English, then Russian.
- **A new language:** add its code to `I18N_LANGS` and a translation to every string.
- Lampa's own `Lampa.Lang` is not used for the plugin strings: for a missing key it falls back to Russian, not English.
- Log messages (`AdaptiveSubs …`) stay in English and are not translated.
- `tests/t_i18n.js` checks that every string has every language with the same placeholders, that every `tr()` key exists,
  that no string in the table is unused, and that Cyrillic string literals appear only in the table.

## Release (maintainers)

1. Set the new `version` in `package.json` (SemVer; pre-releases like `1.1.0-beta.1`), update `CHANGELOG.md` and write the
   release notes `docs/releases/vX.Y.Z.md`.
2. `npm test && npm run check -- --strict` (and `npm run e2e`, if you can).
3. **Stable versions:** commit and push to `main` — the Pages workflow publishes `dist/adaptive_subs.js` (it refuses pre-release versions).
   **Pre-releases:** push to a separate branch (for example `next`); testers use the jsDelivr URL with the tag.
4. Tag the release: `git tag vX.Y.Z && git push origin vX.Y.Z` (the jsDelivr URL with `@vX.Y.Z` then works).
5. Create the GitHub release from the tag with the notes and both files:

   ```sh
   gh release create vX.Y.Z --verify-tag -t "Adaptive Subtitles X.Y.Z" -F docs/releases/vX.Y.Z.md dist/adaptive_subs.js dist/SHA256SUMS
   ```

   Add `--prerelease` for `-beta` versions ([GitHub CLI manual](https://cli.github.com/manual/gh_release_create)); the web UI works as well.
