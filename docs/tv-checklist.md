# Checklist for testing on a real TV

[Russian version](tv-checklist.ru.md)

Tested so far: LG OLED65M59LA (webOS 25, version 1.1.0) and Tanix TX9 (Android TV box, Lampa Android app, version 1.1.0-beta.2) —
see README → Tested devices. Reports from other devices are very welcome, especially Samsung Tizen, other Android TV boxes and older
webOS versions. These steps make a report useful. Please remove IP addresses and logins from screenshots and logs.

The labels below are from the English interface (Settings → Interface → Interface language → English, 1.1.0-beta.1 and later).
If Lampa is in Russian, use the [Russian version](tv-checklist.ru.md) of this list.

1. **Installed:** Settings has the section **Adaptive Subtitles**. If you have a console (on Android: `adb logcat | grep -F AdaptiveSubs`),
   note the line `[AdaptiveSubs] v… initialized | display: … | HDR decoder: …` — it tells what the plugin knows about your screen.
2. **Display:** note the value of **Adaptive Subtitles → Display** (default **Auto**) and whether your TV shows HDR at all
   (HDR badge or picture mode of the TV).
3. **HDR10:** play a file with subtitles whose name contains `HDR10` (or a torrent whose ffprobe data says PQ / SMPTE 2084). Expected
   on an HDR TV: the notification “Subtitles: HDR10 — dimmed, 48% (…)”, visibly dimmer subtitles, coloured ASS text still coloured.
   On an SDR screen or a box that shows HDR as SDR: “Subtitles: SDR — normal (HDR10 by name; …)” with the reason, subtitles not dimmed.
4. **Dolby Vision** and **HLG:** the same with a `DV` / `Dolby Vision` and an `HLG` file — the notification names the type.
5. **SDR:** a file without HDR signs — “Subtitles: SDR — normal (no HDR signs)”, subtitles look as without the plugin.
6. **TorrServer:** for an HDR torrent whose name says nothing about HDR, does “Subtitles updated: …” appear after the ffprobe check?
   (Needs **Exact check via TorrServer** and TorrServer with `/ffp`.)
7. **HDR/SDR key:** choose a color key in **HDR/SDR key in the player**, press it during playback — the profile switches; open the
   same video again — the choice is remembered; **Forget manual HDR/SDR choices** resets it. Note whether you pressed the key on the
   remote or sent it in another way (for example `adb`).
8. **LG webOS, embedded subtitles** (subtitles inside an MKV, drawn by the TV): in HDR they should become less bright, in SDR they
   should look as Lampa shows them. After closing the player, check that the next SDR video has normal subtitles.
9. **Remote:** the chosen color key does not break other functions (on LG webOS the color buttons also control Lampa's embedded subtitles).
10. **Performance:** on a weak TV, does playback with ASS subtitles stutter with **Dim ASS subtitles** on, but not with it off?
11. **Language:** with Settings → Interface → Interface language set to English, the plugin's settings and notifications are in
    English; with Russian, in Russian.
12. **Player:** note whether the video played in Lampa's built-in player or in an external player — the plugin works only in the built-in one.
13. **Report:** open an issue with your device model, OS version (webOS / Tizen / Android TV), Lampa version, source (online / torrent),
    the HDR type of the file, the **Display** value, what worked and what did not. Console lines starting with `[AdaptiveSubs]` help
    if you can get them.
