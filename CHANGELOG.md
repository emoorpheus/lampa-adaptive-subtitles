# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-11-04

A **Report for the developer** screen, and on LG webOS the HDR/SDR key no longer changes the subtitles drawn by the TV as well.
The report was tested on a Tanix TX9 (Android TV); the LG webOS fix was checked by the maintainer on an LG OLED TV.

### Added

- Settings → Adaptive Subtitles → **Report for the developer** (the last item). The window (Lampa's own `Lampa.Modal`, text 1.35
  times larger than the settings) shows:
  - the plugin version, the Lampa version, the platform, the Android or Tizen version, the browser engine and the screen size;
  - the display and the player: what the browser reports about the screen (`display: high | standard | unknown`), whether the
    built-in player can play HDR (`HDR decoder`), the **Display** setting and, when HDR is shown as SDR, why; on LG webOS also the
    subtitle opacity chosen in Lampa and the one set by the plugin;
  - the last video: profile, HDR type, subtitle brightness, where the type came from, the manual HDR/SDR choice and the time;
  - the settings changed from the defaults;
  - the last 30 lines of the plugin's log.
  Up and Down scroll the window, Back closes it and returns to the settings. Nothing is sent anywhere: the user takes a photo and
  attaches it to an issue. Before a line is shown or stored, addresses (`<url>`), IPv4/IPv6 addresses (`<ip>`), local host names
  (`<host>`), e-mail addresses (`<email>`), video and subtitle file names (`<file>`), paths (`<path>`), keys, tokens and passwords
  (`<hidden>`) and long hashes or IDs (`<hash>`, `<id>`) are replaced; a line is cut at 300 characters. Lampa builds without
  `Lampa.Modal` show the notice “The report window is not available in this Lampa version”.
- The plugin's log is kept between Lampa restarts: the last 40 lines (already cleaned) are stored in `localStorage`
  (`adaptive_subs_journal`, written at most every 3 s).
- Log lines: `Playback start | TorrServer | HLS | video | mode …`, `Detected <type> from <source>`, `<source>: nothing found` or
  `<source>: failed …`, `Profile hdr 48% | kind dv | source ffprobe`, `Notice: …` (the text of the notification),
  `HDR/SDR key: hdr (remembered for the title)` and on LG webOS `webOS setSubtitleCharacterOpacity charOpacity …`.

### Fixed

- **LG webOS: the HDR/SDR key also changed the subtitles drawn by the TV.** In the player on webOS Lampa itself listens to all four
  color keys and changes the embedded subtitles: red — size, green — position, yellow — color, blue — background
  ([app.min.js](https://github.com/yumata/lampa/blob/4294a571aad8883116e57d975ad05519f84be13e/app.min.js#L7529-L7536)). `preventDefault` does not stop it. Now, on webOS and only while the player is open, the plugin takes its key
  before Lampa (a `keydown` listener on `window` in the capture phase) and does not pass it on. Other keys, menus and the closed
  player work as before; other platforms are unchanged. Side effect: on LG webOS the chosen key does not reach other plugins in the
  player either, so give them different keys.

### Tested

- Unit tests on Node.js 24 (36 tests: 27 + 5 + 4; new: the report, the webOS key before Lampa, the key on other platforms) and
  end-to-end tests in the Lampa 3.4.4 web build in Chromium (36 checks; new: the report opens from the settings, its text is larger
  than the settings, Back returns to the settings). The new webOS key test fails on the 1.1.0 code and passes on 1.1.1.
- **Tanix TX9** (Android 11, Lampa 3.4.4, WebView Chrome 156): the 1.1.1 file loaded in place of the installed one through the
  WebView developer tools (the server copy was not changed). The start line was `display: standard | HDR decoder: yes | HDR shown as
  SDR (display)`; a test video named HDR10 got SDR (HDR shown as SDR); the red key (sent with `adb` as `KEYCODE_PROG_RED`) switched
  SDR → HDR 48 % → SDR, one step per press. The report opened from the settings and was readable on a 1080p screen capture, showed
  the last video and the log, and Back (sent with `adb`) returned to the settings.
- **LG OLED TV** (webOS 25): checked by the maintainer, no problems found.
- Not tested on Samsung Tizen.

### Known issues

- The plugin cannot see whether a TV or box converts HDR to SDR by itself; then choose **Display → SDR only: do not dim**.
- Samsung Tizen has not been reported yet; HLG has been checked only with a test video named HLG.

## [1.1.0] - 2026-11-04

Stable release with the changes of the 1.1 betas — an English interface, the **Display** setting and color keys on Android TV
boxes — and a fix for embedded subtitles on LG webOS. Tested on an LG OLED TV (webOS 25) and an Android TV box (Tanix TX9).
Upgrading from 1.0.0: see 1.1.0-beta.1 and 1.1.0-beta.2 below; settings and manual HDR/SDR choices are kept.

### Fixed

- LG webOS: embedded subtitles (inside an MKV, drawn by the TV) were not dimmed after Lampa re-created the video element
  (log line “repeat to new video”, [app.min.js](https://github.com/yumata/lampa/blob/4294a571aad8883116e57d975ad05519f84be13e/app.min.js#L7970)): on the LG TV an old `<video>` without a media ID stayed first on the
  page, and the plugin took the media ID from the first `<video>`. Now the plugin uses the video of Lampa's player
  (`Lampa.PlayerVideo.video()`), then the first `<video>` with a media ID, and checks for a new media ID every 2 s until the player
  is closed (before: only during the first 20 s).

### Tested

- Unit tests on Node.js 22 and 24 (33 tests, one new for this fix) and end-to-end tests in the Lampa 3.4.4 web build in Chromium
  (34 checks).
- **LG OLED65M59LA** (webOS 25, Lampa web app served by Lampac), a test plan run over the webOS developer tools with screen captures
  from the TV; the tested build was 1.1.0-beta.2 with this fix (only the version differs):
  - the start line `display: high | HDR decoder: yes`;
  - test videos named HDR10, Dolby Vision and HLG: external SRT and ASS subtitles dimmed to 48 % (text brightness 122 of 255; yellow
    ASS text stays yellow), notification “… (by name)”;
  - embedded SRT subtitles in an HDR10 MKV: brightness 104 in HDR and 205 in SDR, also with an old `<video>` left first on the page
    (not dimmed before this fix);
  - an HLS stream with `VIDEO-RANGE=PQ`: HDR10 (by HLS stream); an online 2160p AV1 stream without HDR signs: SDR;
  - a Dolby Vision torrent through TorrServer: Dolby Vision (by TorrServer torrent); with a neutral title ffprobe (`/ffp`) updated
    SDR to “Dolby Vision — dimmed, 48% (by file)” 2 s after the start;
  - the yellow key (405), pressed by the maintainer on the remote's on-screen color keys, switches HDR ↔ SDR and remembers the
    choice; **Forget manual HDR/SDR choices**, **Display → SDR only: do not dim** and the English interface work;
  - ASS subtitles are drawn at 60 fps with and without dimming (with dimming one frame of 1201 took longer than 25 ms, without it
    none of 1200).
- The Tanix TX9 results of 1.1.0-beta.2 still apply (the display check and the color keys are unchanged).

### Known issues

- **Yellow key on LG webOS.** In the player on webOS Lampa itself also uses the yellow key (405): it switches the color of the
  subtitles drawn by the TV ([app.min.js](https://github.com/yumata/lampa/blob/4294a571aad8883116e57d975ad05519f84be13e/app.min.js#L7530)). If you choose the yellow key for HDR/SDR, the color of embedded subtitles
  may change too; choose another key if this bothers you.
- On the Tanix TX9 the built-in player could not play an HEVC 10-bit HDR10 test file, and torrents were opened in an external
  Android player, where the plugin does not run.
- The plugin cannot see whether a TV or box converts HDR to SDR by itself; then choose **Display → SDR only: do not dim**.
- Samsung Tizen has not been reported yet; HLG has been checked only with a test video named HLG.

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

[Unreleased]: https://github.com/emoorpheus/lampa-adaptive-subtitles/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/emoorpheus/lampa-adaptive-subtitles/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/emoorpheus/lampa-adaptive-subtitles/compare/v1.1.0-beta.2...v1.1.0
[1.1.0-beta.2]: https://github.com/emoorpheus/lampa-adaptive-subtitles/compare/v1.1.0-beta.1...v1.1.0-beta.2
[1.1.0-beta.1]: https://github.com/emoorpheus/lampa-adaptive-subtitles/compare/v1.0.0...v1.1.0-beta.1
[1.0.0]: https://github.com/emoorpheus/lampa-adaptive-subtitles/releases/tag/v1.0.0
