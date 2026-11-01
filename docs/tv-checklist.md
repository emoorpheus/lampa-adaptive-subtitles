# Checklist for testing on a real TV

Tested so far (version 1.0.0): LG OLED65M59LA (webOS 25) — see README → Tested devices. Reports from other devices are very welcome,
especially Samsung Tizen, Android TV and older webOS versions. These steps make a report useful. Please remove IP addresses and logins
from screenshots and logs.

Labels are given in English (1.1.0-beta.1 and later with Lampa in English) and in Russian (1.0.0, or Lampa in Russian).

1. **Installed:** Settings has the section **Adaptive Subtitles** («Адаптивные субтитры»). If you have a console, note the line
   `AdaptiveSubs v… initialized`.
2. **HDR10:** play a file with subtitles whose name contains `HDR10` (or a torrent whose ffprobe data says PQ / SMPTE 2084). Expected:
   the notification “Subtitles: HDR10 — dimmed, 48% (…)” («Субтитры: HDR10 — затемнённые, 48% (…)»), visibly dimmer subtitles,
   coloured ASS text still coloured.
3. **Dolby Vision** and **HLG:** the same with a `DV` / `Dolby Vision` and an `HLG` file — the notification names the type.
4. **SDR:** a file without HDR signs — “Subtitles: SDR — normal (no HDR signs)” («Субтитры: SDR — обычные (признаков HDR нет)»),
   subtitles look as without the plugin.
5. **TorrServer:** for an HDR torrent whose name says nothing about HDR, does “Subtitles updated: …” («Субтитры уточнены: …») appear
   after the ffprobe check? (Needs **Exact check via TorrServer** («Точно по файлу через TorrServer») and TorrServer with `/ffp`.)
6. **HDR/SDR key:** choose a color key in **HDR/SDR key in the player** («Клавиша HDR/SDR в плеере»), press it during playback — the
   profile switches; open the same video again — the choice is remembered; **Forget manual HDR/SDR choices**
   («Забыть ручные выборы HDR/SDR») resets it.
7. **LG webOS, embedded subtitles** (subtitles inside an MKV, drawn by the TV): in HDR they should become less bright, in SDR they
   should look as Lampa shows them. After closing the player, check that the next SDR video has normal subtitles.
8. **Remote:** the chosen color key does not break other functions (on LG webOS the color buttons also control Lampa's embedded subtitles).
9. **Performance:** on a weak TV, does playback with ASS subtitles stutter with **Dim ASS subtitles** («Затемнять субтитры ASS») on,
   but not with it off?
10. **Language (1.1.0-beta.1 and later):** with Settings → Interface → Interface language set to English, the plugin's settings and
    notifications are in English; with Russian, in Russian.
11. **Report:** open an issue with your device model, OS version (webOS / Tizen / Android TV), Lampa version, source (online / torrent),
    the HDR type of the file, what worked and what did not. Console lines starting with `AdaptiveSubs` help if you can get them;
    on Android: `adb logcat | grep -F AdaptiveSubs`.
