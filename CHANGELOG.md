# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0-beta.2] - 2026-11-03

Pre-release for testing: subtitles are dimmed only when HDR is really shown, and color keys work on Android TV boxes.
Tested on an Android TV box (Tanix TX9); not tested on an LG OLED TV.

### Added

- Setting **Display** (`adaptive_subs_screen`): Auto (default) / HDR display: dim for HDR / SDR only: do not dim. In Auto the
  subtitles of HDR video are not dimmed if the browser reports a display without HDR (CSS `dynamic-range: standard`) or if the
  built-in player cannot decode HDR video (HEVC Main 10 and Dolby Vision, checked with `canPlayType` and
  `MediaSource.isTypeSupported`). On LG webOS and Samsung Tizen, Auto keeps the 1.0 behaviour. A manual choice (Mode, HDR/SDR key)
  is not overridden.
- The notification names the reason, for example “Subtitles: SDR — normal (Dolby Vision by name; the player cannot play HDR)”.
- For other plugins: the `adaptive_subs` event has an extra field `screen: 'display' | 'player' | 'screen'` when HDR video is shown
  as SDR (`profile: 'sdr'`, `kind` keeps the HDR type); `window.AdaptiveSubs.screen()` returns what the check sees.
- The start log line tells what the plugin knows about the display: `display: high | standard | unknown`,
  `HDR decoder: yes | no | unknown` and, if dimming is off for that reason, `HDR shown as SDR (…)`.

### Changed

- The experimental option **Respect the display HDR state** (`adaptive_subs_display`) is replaced by **Display**; its saved value
  is no longer used.

### Fixed

- On an Android TV box with an SDR picture (Tanix TX9, WebView 84) an SDR video whose name contained `DV` / `HDR` got subtitles
  dimmed to 48 %. Now Auto keeps them normal there (the WebView reports no HDR decoder).
- Color keys (HDR/SDR key) did nothing on Android TV boxes whose WebView sends them with key code 0 and the key name
  `ColorF0Red` … `ColorF3Blue` (seen on the Tanix TX9).

### Tested

- Unit tests on Node.js 22 and 24 (32 tests) and end-to-end tests in the Lampa 3.4.4 web build in Chromium (34 checks), including the
  display check with Chromium reporting a standard display and a simulated Android box without an HDR decoder.
- **Tanix TX9** (Android 11, Lampa Android app 1.12.4, WebView 84, Lampa 3.4.4), a test plan run over `adb` and the WebView developer
  tools: the start line `display: unknown | HDR decoder: no | HDR shown as SDR (player)`; an SDR test video named
  `…2160p.WEB-DL.DV.HDR.mkv` with SRT and with ASS subtitles — not dimmed (no CSS filter, full white); the notification text above;
  the red key sent with `adb` (`KEYCODE_PROG_RED`) switches HDR ↔ SDR; the **Display** item in the settings in Russian.
- **Not tested on an LG OLED TV** (webOS behaviour in Auto is unchanged; covered by automated tests only).

### Known issues

- On the Tanix TX9 the built-in player could not play an HEVC 10-bit HDR10 test file (`DEMUXER_ERROR_NO_SUPPORTED_STREAMS`), and
  torrents were opened in an external Android player, where the plugin does not run.
- The plugin cannot see whether a TV or box converts HDR to SDR by itself; then choose **Display → SDR only: do not dim**.

## [1.1.0-beta.1] - 2026-11-01

Pre-release for testing: an English interface. Not tested on a TV yet.

### Added

- English interface. The plugin follows the Lampa language (Settings → Interface → Interface language): Russian for Russian,
  English for every other language — settings, values and notifications (for example “Subtitles: HDR — dimmed, 48% (by name)”).
  All interface strings are in one table, `src/05_i18n.js` (88 strings).

### Changed

- Log messages are in English.
- CI also runs on the `next` branch (pre-releases).

### Tested

- Unit tests on Node.js 18 and 24 (30 tests), end-to-end tests in the Lampa 3.4.4 web build in Chromium (28 checks), including the
  English interface in a real Lampa set to English.
- **Not tested on a TV.** Detection and dimming are unchanged since 1.0.0.

## [1.0.0] - 2026-11-01

First public release.

### Added

- Subtitle profiles: HDR / Dolby Vision / HLG → dimmed subtitles (brightness 48 % by default), SDR → unchanged Lampa style.
- HDR detection by priority: manual choice → ffprobe data (TorrServer `/ffp` or the torrent parser; HDR10, Dolby Vision, HLG) →
  HLS `VIDEO-RANGE` → TorrServer torrent title → keywords in the file name (no false hits on "DVDRip" or "HDRezka").
- Dimming by brightness (colours and ASS styling kept) or by recolouring to grey; optional separate levels for HDR10, Dolby Vision and HLG.
- External SRT/VTT and ASS subtitles (Lampa's simple renderer and JASSUB).
- LG webOS embedded subtitles: character opacity through `luna://com.webos.media` (`setSubtitleCharacterOpacity`), relative to the opacity chosen in Lampa.
- HDR/SDR key in the player with memory per torrent or per show (at most 300 choices) and **Forget manual HDR/SDR choices**.
- SDR colour and size of external subtitles; size of embedded subtitles on LG webOS.
- Start notification with the chosen profile and its reason, and a second one only if a more exact check changes the profile.
- For other plugins: the `adaptive_subs` Lampa event, the `adaptive_subs:profile` DOM event, `window.AdaptiveSubs`, and the shared
  ffprobe cache `window.__lampa_ffp__` (v1, one `/ffp` request per file for all plugins).
- Experimental options (off by default): take the display's dynamic range into account; log what webOS reports about the video.
- Compatibility with old TV engines: ES5 + `Promise`, `filter` together with `-webkit-filter`.

### Tested

- Unit tests on Node.js 18 and 24; end-to-end tests in the Lampa 3.4.4 web build in Chromium.
- Manual test by the maintainer on 2026-11-01 (internal build 4.0, same code as 1.0.0): **LG OLED65M59LA, webOS 25**
  (Lampa web app served by Lampac) — subtitles dimmed in HDR and Dolby Vision video.

### Known issues

- Embedded subtitles on LG webOS have not been checked separately on a real TV.
- Android TV and Samsung Tizen have not been reported yet.

### Notes

- Earlier non-public builds used the internal version number 4.0. The public version line starts at 1.0.0;
  settings and manual HDR/SDR choices of those builds are kept (same storage keys).
- Self-hosted by IP address: Lampa does not add its cache-busting parameter to such URLs, so add `?v=1.0.0` to the plugin URL.

[Unreleased]: https://github.com/emoorpheus/lampa-adaptive-subtitles/compare/v1.1.0-beta.2...HEAD
[1.1.0-beta.2]: https://github.com/emoorpheus/lampa-adaptive-subtitles/compare/v1.1.0-beta.1...v1.1.0-beta.2
[1.1.0-beta.1]: https://github.com/emoorpheus/lampa-adaptive-subtitles/compare/v1.0.0...v1.1.0-beta.1
[1.0.0]: https://github.com/emoorpheus/lampa-adaptive-subtitles/releases/tag/v1.0.0
