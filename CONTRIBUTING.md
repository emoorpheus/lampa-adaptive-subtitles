# Contributing

Thank you for helping! The most valuable contribution right now is a **report from a device that has not been tested yet** —
Samsung Tizen, Android TV, older LG webOS versions — with HDR10, Dolby Vision or HLG video. So far the plugin has been tested on
LG webOS 25 (README → Tested devices). See [docs/tv-checklist.md](docs/tv-checklist.md).

## Rules

- The plugin code must stay **ES5** (old TV browsers). `node build.js` rejects newer syntax, `tests/t_compat.js` rejects newer
  built-in APIs (except `Promise`, which Lampa provides) and CSS that old engines do not support.
- The user interface is in Russian, like Lampa itself. Code comments and test names are in Russian too; English issues and pull requests are welcome.
- No runtime dependencies and no external services. The plugin talks only to the user's TorrServer, the stream that is already
  playing and, on LG webOS, the TV's media service — please keep it that way.
- Keep the public interface compatible: settings keys `adaptive_subs_*`, the `adaptive_subs` event, `window.AdaptiveSubs` and
  `window.__lampa_ffp__` (v1) are used by other plugins (for example Skip Intro).
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

The scenarios (`e2e_player`, `e2e_movie`, `e2e_torrent`, `e2e_settings`) run the real Lampa web build on `127.0.0.1:8123`
and mock every external request, including TorrServer. Run a single one with `node e2e/run_all.js e2e_player`.

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
