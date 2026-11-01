/*!
 * Adaptive Subtitles for Lampa v@VERSION@ (MIT License)
 * HDR / Dolby Vision / HLG video -> subtitles are dimmed (no glare on OLED screens); SDR -> as in Lampa.
 * Dimming uses brightness, so colours and styling are kept (external subtitles, ASS: Lampa's simple renderer and JASSUB).
 * HDR detection: file name, TorrServer torrent title, ffprobe data (from the torrent parser or TorrServer /ffp,
 * shared with other plugins through window.__lampa_ffp__), HLS VIDEO-RANGE. Manual HDR/SDR key in the player
 * (remembered per torrent or per show). Other plugins can listen to the "adaptive_subs" event.
 *
 * On LG webOS, embedded (MKV) subtitles are drawn by the system player, not by HTML, so CSS does not affect them.
 * For those the plugin changes character opacity via luna://com.webos.media (setSubtitleCharacterOpacity), the same
 * method Lampa itself uses (src/interaction/player/video/webos/subtitles.js). The opacity chosen in Lampa is kept:
 * passed as is in SDR and dimmed proportionally in HDR.
 * The interface follows the Lampa language: Russian or English (other languages use English). ES5 + Promise, no dependencies.
 */
(function () {
    'use strict';

    if (window.adaptive_subs_plugin) return;
    window.adaptive_subs_plugin = true;

    var VERSION = '@VERSION@';
    var STYLE_ID = 'adaptive-subs-style';
    var QUICK_WAIT = 1500;          // мс: ждём быстрые источники (название раздачи, HLS) до первого уведомления
    var NET_TIMEOUT = 4000;
    var FFP_TIMEOUT = 3e4;          // TorrServer запускает ffprobe по торренту: бывает долго
    var OVERRIDE_LIMIT = 300;
    var current = { profile: 'sdr', kind: 'sdr', brightness: 1, source: '', key: '', detected: 'sdr' };
    var lookupToken = 0;
    var session = 0;
    var torrCache = {};
    var hlsCache = {};

    // ---------- Настройки ----------
    var DEFAULTS = {
        adaptive_subs_mode: 'auto',
        adaptive_subs_hdr_style: 'dim',
        adaptive_subs_hdr_tone: '#7a7a7a',
        adaptive_subs_level_hdr10: 'same',
        adaptive_subs_level_dv: 'same',
        adaptive_subs_level_hlg: 'same',
        adaptive_subs_ass: 'true',
        adaptive_subs_webos_opacity: '128',
        adaptive_subs_webos_size: 'default',
        adaptive_subs_sdr_color: 'lampa',
        adaptive_subs_size: 'default',
        adaptive_subs_ffp: 'true',
        adaptive_subs_hls: 'true',
        adaptive_subs_display: 'false',
        adaptive_subs_webos_probe: 'false',
        adaptive_subs_key: 'none',
        adaptive_subs_notify: 'true'
    };

    function opt(name) {
        var v;
        try { v = Lampa.Storage.get(name, DEFAULTS[name]); } catch (e) { v = DEFAULTS[name]; }
        return (v === undefined || v === null || v === '') ? DEFAULTS[name] : v;
    }

    function flag(name) {
        var v = opt(name);
        return v === true || v === 'true';
    }

    function copy(obj) {
        var out = {};
        for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
        return out;
    }

    function log() {
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('AdaptiveSubs');
            console.log.apply(console, args);
        } catch (e) {}
    }

    function isHdrKind(kind) {
        return kind === 'hdr' || kind === 'hdr10' || kind === 'dv' || kind === 'hlg';
    }
