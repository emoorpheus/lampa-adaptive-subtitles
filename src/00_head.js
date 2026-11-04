/*!
 * Adaptive Subtitles for Lampa v@VERSION@ (MIT License)
 * HDR / Dolby Vision / HLG video -> subtitles are dimmed (no glare on OLED screens); SDR -> as in Lampa.
 * Dimming is applied only when HDR can actually be shown: not on an SDR display (dynamic-range) and not in a built-in
 * player that cannot play HDR video (for example, an Android box with an old WebView); "Display" setting.
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
    var current = { profile: 'sdr', kind: 'sdr', brightness: 1, source: '', key: '', detected: 'sdr', screen: '' };
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
        adaptive_subs_screen: 'auto',
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
        var args = Array.prototype.slice.call(arguments);
        try { Journal.add(args); } catch (e) {}
        try {
            args.unshift('AdaptiveSubs');
            console.log.apply(console, args);
        } catch (e) {}
    }

    // Строка журнала для экрана «Отчёт»: без адресов, IP, e-mail, путей и имён файлов, хешей и ключей
    // (так же, как в плагине «Пропуск заставок»)
    function scrub(text) {
        var s = String(text === undefined || text === null ? '' : text);
        s = s.replace(/\b[a-z][a-z0-9+.\-]{1,15}:\/\/[^\s"'<>]+/gi, '<url>')
            .replace(/\bmagnet:\?[^\s"'<>]+/gi, '<url>')
            .replace(/[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+/g, '<email>')
            .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, '<ip>')
            .replace(/\[[0-9a-f:]{6,}\](?::\d{1,5})?/gi, '<ip>')
            .replace(/\blocalhost(?::\d{1,5})?\b/gi, '<host>')
            .replace(/\b[\w.\-]+\.(?:local|lan|home|internal|localdomain)(?::\d{1,5})?\b/gi, '<host>')
            .replace(/[^\s"'<>\/\\|]*\.(?:mkv|mp4|m4v|avi|ts|m2ts|mts|mov|webm|wmv|flv|mpe?g|m3u8?|mpd|srt|vtt|ass|ssa|sub|idx|sup|torrent)\b/gi, '<file>')
            .replace(/(^|[\s(=])(?:\/|[a-z]:\\)[^\s"'<>]+/gi, '$1<path>')
            .replace(/\b(api[_\-]?key|access[_\-]?token|token|password|passwd|secret|authorization|auth)(\s*[=:]\s*)[^\s&;,"']+/gi, '$1$2<hidden>')
            .replace(/\b(key=)[^\s&;,"']+/gi, '$1<hidden>')
            .replace(/\b[0-9a-f]{32,}\b/gi, '<hash>')
            .replace(/[A-Za-z0-9+\/_\-]{40,}={0,2}/g, '<id>');
        return s.length > 300 ? s.slice(0, 299) + '\u2026' : s;
    }

    // ---------- Журнал для экрана «Отчёт» ----------
    // Последние строки лога без адресов, имён файлов и ключей. Хранятся и в localStorage:
    // телевизор часто закрывает приложение целиком, а отчёт открывают уже после перезапуска
    var JOURNAL_KEY = 'adaptive_subs_journal';
    var JOURNAL_MAX = 40;
    var Journal = {
        _list: null,
        _timer: null,

        list: function () {
            if (this._list) return this._list;
            var saved = null, out = [];
            try { saved = JSON.parse(window.localStorage.getItem(JOURNAL_KEY) || 'null'); } catch (e) {}
            if (saved instanceof Array) {
                for (var i = 0; i < saved.length; i++) {
                    var x = saved[i];
                    if (x && typeof x.t === 'number' && typeof x.m === 'string') out.push({ t: x.t, m: scrub(x.m) });
                }
            }
            this._list = out.slice(-JOURNAL_MAX);
            return this._list;
        },

        _text: function (args) {
            var out = [];
            for (var i = 0; i < args.length; i++) {
                var a = args[i];
                if (typeof a === 'string') out.push(a);
                else if (a instanceof Error) out.push(a.message);
                else if (a && typeof a === 'object') {
                    try { out.push(JSON.stringify(a)); } catch (e) { out.push(String(a)); }
                } else out.push(String(a));
            }
            return out.join(' ').replace(/\s+$/, '');
        },

        add: function (args) {
            var list = this.list(), self = this;
            list.push({ t: Date.now(), m: scrub(this._text(args)) });
            if (list.length > JOURNAL_MAX) list.splice(0, list.length - JOURNAL_MAX);
            if (this._timer) return;
            this._timer = setTimeout(function () { self._timer = null; self.save(); }, 3000);
        },

        save: function () {
            try { window.localStorage.setItem(JOURNAL_KEY, JSON.stringify(this.list())); } catch (e) {}
        },

        last: function (n) {
            var list = this.list();
            return list.slice(Math.max(0, list.length - n));
        }
    };

    function isHdrKind(kind) {
        return kind === 'hdr' || kind === 'hdr10' || kind === 'dv' || kind === 'hlg';
    }
