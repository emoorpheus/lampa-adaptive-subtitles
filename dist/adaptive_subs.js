/*!
 * Adaptive Subtitles for Lampa v1.1.1 (MIT License)
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

    var VERSION = "1.1.1";
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


    // ---------- Язык интерфейса: как в Lampa ----------
    // Lampa хранит выбранный язык в Storage 'language' (ru, en, uk, ...) и при смене языка перезагружает страницу,
    // поэтому раздел настроек, собранный при запуске, всегда на текущем языке.
    // Русский — для 'ru', английский — для всех остальных языков. Новый язык: код в I18N_LANGS и колонка в строках.
    // Строка: { ru: '...', en: '...' }; подстановки {name}.
    var I18N_LANGS = ['ru', 'en'];
    var I18N_FALLBACK = 'en';
    var I18N = {
        plugin_title: { ru: 'Адаптивные субтитры', en: 'Adaptive Subtitles' },

        // Уведомление: «Субтитры: HDR10 — затемнённые, 48% (по файлу)»
        noty_subs: { ru: 'Субтитры: {state}', en: 'Subtitles: {state}' },
        noty_refined: { ru: 'Субтитры уточнены: {state}', en: 'Subtitles updated: {state}' },
        state_hdr: { ru: '{kind} — затемнённые, {pct}%', en: '{kind} — dimmed, {pct}%' },
        state_sdr: { ru: 'SDR — обычные', en: 'SDR — normal' },
        why_release: { ru: 'запомнено для раздачи', en: 'remembered for this torrent' },
        why_title: { ru: 'запомнено для сериала или фильма', en: 'remembered for this series or movie' },
        noty_forgot: { ru: 'Ручные выборы HDR/SDR забыты', en: 'Manual HDR/SDR choices forgotten' },

        // Откуда профиль
        src_name: { ru: 'по названию', en: 'by name' },
        src_torrserver: { ru: 'по раздаче TorrServer', en: 'by TorrServer torrent' },
        src_parser: { ru: 'по данным раздачи', en: 'by torrent data' },
        src_ffprobe: { ru: 'по файлу', en: 'by file' },
        src_hls: { ru: 'по потоку HLS', en: 'by HLS stream' },
        src_webos: { ru: 'по данным webOS', en: 'by webOS data' },
        src_manual: { ru: 'вручную', en: 'manually' },
        src_override: { ru: 'ваш выбор', en: 'your choice' },
        src_display: { ru: 'экран без HDR', en: 'display without HDR' },
        src_player: { ru: 'плеер не воспроизводит HDR', en: 'the player cannot play HDR' },
        src_screen: { ru: 'экран: только SDR', en: 'display: SDR only' },
        src_default: { ru: 'признаков HDR нет', en: 'no HDR signs' },

        // Уровни яркости в HDR
        tone_9a9a9a: { ru: 'Светлее — 60%', en: 'Lighter — 60%' },
        tone_8a8a8a: { ru: 'Умеренно — 54%', en: 'Moderate — 54%' },
        tone_7a7a7a: { ru: 'Темнее — 48%', en: 'Darker — 48%' },
        tone_666666: { ru: 'Тёмные — 40%', en: 'Dark — 40%' },
        tone_555555: { ru: 'Очень тёмные — 33%', en: 'Very dark — 33%' },
        level_same: { ru: 'Как основной уровень', en: 'Same as the main level' },

        // Настройки: определение HDR
        t_detect: { ru: 'Определение HDR', en: 'HDR detection' },
        set_mode: { ru: 'Режим', en: 'Mode' },
        set_mode_d: { ru: 'Авто: технические данные файла (ffprobe), поток HLS, затем слова HDR / DV / Dolby Vision / HDR10 / HLG в названии файла и раздачи', en: 'Auto: technical file data (ffprobe), the HLS stream, then the words HDR / DV / Dolby Vision / HDR10 / HLG in the file and torrent names' },
        mode_auto: { ru: 'Авто (по файлу и релизу)', en: 'Auto (by file and release)' },
        mode_hdr: { ru: 'Всегда HDR (приглушённые)', en: 'Always HDR (dimmed)' },
        mode_sdr: { ru: 'Всегда SDR (обычные)', en: 'Always SDR (normal)' },
        set_screen: { ru: 'Экран', en: 'Display' },
        set_screen_d: { ru: 'Затемнять нужно, только когда HDR действительно показывается. Авто: не затемнять, если браузер сообщает, что экран без HDR, или встроенный плеер не воспроизводит HDR-видео (например, Android-приставка со старым WebView). На LG webOS и Samsung Tizen в «Авто» решает видео', en: 'Dimming is needed only when HDR is actually shown. Auto: do not dim if the browser reports that the display has no HDR, or if the built-in player cannot play HDR video (for example, an Android box with an old WebView). On LG webOS and Samsung Tizen, in Auto the video decides' },
        screen_auto: { ru: 'Авто', en: 'Auto' },
        screen_hdr: { ru: 'HDR-экран: затемнять HDR', en: 'HDR display: dim for HDR' },
        screen_sdr: { ru: 'Только SDR: не затемнять', en: 'SDR only: do not dim' },
        set_ffp: { ru: 'Точно по файлу через TorrServer', en: 'Exact check via TorrServer' },
        set_ffp_d: { ru: 'ffprobe на TorrServer (/ffp): различает HDR10, Dolby Vision и HLG. Нужен TorrServer с ffprobe', en: 'ffprobe on TorrServer (/ffp): tells HDR10, Dolby Vision and HLG apart. Requires TorrServer with ffprobe' },
        set_hls: { ru: 'По потоку HLS (онлайн)', en: 'By HLS stream (online)' },
        set_hls_d: { ru: 'Признак VIDEO-RANGE (SDR / HLG / PQ) в плейлисте m3u8, если источник его указывает', en: 'The VIDEO-RANGE attribute (SDR / HLG / PQ) in the m3u8 playlist, if the source provides it' },
        set_probe: { ru: 'Сведения webOS о видео (эксперимент)', en: 'webOS video info (experimental)' },
        set_probe_d: { ru: 'Записывать в журнал, что телевизор сообщает о видео, и использовать явный признак HDR, если он есть. Не проверено', en: 'Log what the TV reports about the video and use an explicit HDR flag if there is one. Not tested' },

        // Настройки: вид в HDR
        t_look: { ru: 'Вид в HDR', en: 'HDR look' },
        set_style: { ru: 'HDR: способ', en: 'HDR: method' },
        set_style_d: { ru: 'Затемнение яркостью оставляет цветные надписи цветными. Субтитры WebVTT, которые рисует сам браузер, всегда перекрашиваются', en: 'Dimming by brightness keeps coloured text coloured. WebVTT subtitles drawn by the browser itself are always recoloured' },
        style_dim: { ru: 'Затемнять (цвета сохраняются)', en: 'Dim (colours kept)' },
        style_color: { ru: 'Перекрашивать в серый', en: 'Recolour to grey' },
        set_tone: { ru: 'HDR: яркость субтитров', en: 'HDR: subtitle brightness' },
        set_tone_d: { ru: 'Основной уровень. В режиме «перекрашивать» — серый той же яркости', en: 'The main level. In the “Recolour to grey” mode — grey of the same brightness' },
        set_hdr10: { ru: 'HDR10: яркость', en: 'HDR10: brightness' },
        set_hdr10_d: { ru: 'Если тип HDR известен', en: 'If the HDR type is known' },
        set_dv: { ru: 'Dolby Vision: яркость', en: 'Dolby Vision: brightness' },
        set_hlg: { ru: 'HLG: яркость', en: 'HLG: brightness' },
        set_ass: { ru: 'Затемнять субтитры ASS', en: 'Dim ASS subtitles' },
        set_ass_d: { ru: 'Оформление ASS (цвета, караоке) сохраняется. Нагрузка на слабые ТВ не проверялась', en: 'ASS styling (colours, karaoke) is kept. The load on low-end TVs has not been tested' },
        set_webos_op: { ru: 'HDR: яркость встроенных субтитров (LG webOS)', en: 'HDR: built-in subtitle brightness (LG webOS)' },
        set_webos_op_d: { ru: 'Для субтитров внутри MKV, которые рисует сам телевизор. Доля от яркости, выбранной в Lampa (кнопка 9). В SDR — как в Lampa', en: 'For subtitles inside MKV that the TV draws itself. A share of the brightness chosen in Lampa (key 9). In SDR — as in Lampa' },
        op_191: { ru: '75% — чуть темнее', en: '75% — slightly darker' },
        op_153: { ru: '60% — серые', en: '60% — grey' },
        op_128: { ru: '50% — тёмно-серые', en: '50% — dark grey' },
        op_102: { ru: '40% — тёмные', en: '40% — dark' },
        op_77: { ru: '30% — очень тёмные', en: '30% — very dark' },

        // Настройки: SDR и размер
        t_sdr: { ru: 'SDR и размер', en: 'SDR and size' },
        keep_lampa: { ru: 'Не менять (как в Lampa)', en: 'Do not change (as in Lampa)' },
        set_color: { ru: 'SDR: цвет внешних субтитров', en: 'SDR: external subtitle colour' },
        set_color_d: { ru: 'По умолчанию стиль Lampa не меняется', en: 'By default the Lampa style is not changed' },
        color_white: { ru: 'Белый', en: 'White' },
        color_soft: { ru: 'Мягкий белый', en: 'Soft white' },
        color_warm: { ru: 'Тёплый жёлтый', en: 'Warm yellow' },
        set_size: { ru: 'Размер внешних субтитров', en: 'External subtitle size' },
        set_size_d: { ru: 'Одинаковый для SDR и HDR', en: 'Same for SDR and HDR' },
        size_xs: { ru: 'Очень маленький', en: 'Extra small' },
        size_s: { ru: 'Маленький', en: 'Small' },
        size_m: { ru: 'Средний', en: 'Medium' },
        size_l: { ru: 'Крупный', en: 'Large' },
        size_xl: { ru: 'Очень крупный', en: 'Extra large' },
        set_webos_size: { ru: 'Размер встроенных субтитров (LG webOS)', en: 'Built-in subtitle size (LG webOS)' },
        wsize_keep: { ru: 'Не менять (красная кнопка пульта)', en: 'Do not change (red remote key)' },
        wsize_0: { ru: '0 — самый маленький', en: '0 — smallest' },
        wsize_4: { ru: '4 — самый большой', en: '4 — largest' },

        // Настройки: управление
        t_ctrl: { ru: 'Управление', en: 'Controls' },
        set_key: { ru: 'Клавиша HDR/SDR в плеере', en: 'HDR/SDR key in the player' },
        set_key_d: { ru: 'Переключает профиль, если плагин ошибся, и запоминает выбор для раздачи (или сериала). На LG webOS цветные кнопки также управляют встроенными субтитрами Lampa; не назначайте ту же клавишу, что в плагине «Пропуск заставок»', en: 'Switches the profile if the plugin got it wrong and remembers the choice for the torrent (or the series). On LG webOS the colour keys also control Lampa’s built-in subtitles; do not assign the same key as in the Skip Intro plugin' },
        key_none: { ru: 'Нет', en: 'None' },
        key_red: { ru: 'Красная (403)', en: 'Red (403)' },
        key_green: { ru: 'Зелёная (404)', en: 'Green (404)' },
        key_yellow: { ru: 'Жёлтая (405)', en: 'Yellow (405)' },
        key_blue: { ru: 'Синяя (406)', en: 'Blue (406)' },
        set_forget: { ru: 'Забыть ручные выборы HDR/SDR', en: 'Forget manual HDR/SDR choices' },
        set_forget_d: { ru: 'Снова определять автоматически', en: 'Detect automatically again' },
        set_notify: { ru: 'Уведомление при старте', en: 'Notification on start' },
        set_notify_d: { ru: 'Какой профиль включился и почему; второе — только если точная проверка его сменила', en: 'Which profile was applied and why; a second one only if the exact check changed it' },
        set_report: { ru: 'Отчёт для разработчика', en: 'Report for the developer' },
        set_report_d: { ru: 'Версия, устройство, экран, последнее видео и журнал на одном экране: сфотографируйте его и пришлите разработчику. Ничего не отправляется; адреса серверов, названия файлов и ключи не показываются', en: 'Version, device, display, last video and the log on one screen: take a photo and send it to the developer. Nothing is sent; server addresses, file names and keys are not shown' },
        report_title: { ru: 'Адаптивные субтитры — отчёт', en: 'Adaptive Subtitles — report' },
        report_hint: { ru: 'Сфотографируйте экран; стрелки вверх и вниз — прокрутка. Адреса серверов, названия файлов и ключи скрыты', en: 'Take a photo of the screen; use the up and down arrows to scroll. Server addresses, file names and keys are hidden' },
        report_device: { ru: 'Версия и устройство', en: 'Version and device' },
        report_screen: { ru: 'Экран и плеер', en: 'Display and player' },
        report_last: { ru: 'Последнее видео', en: 'Last video' },
        report_none: { ru: 'ещё не было просмотра', en: 'no playback yet' },
        report_settings: { ru: 'Изменённые настройки', en: 'Changed settings' },
        report_defaults: { ru: 'все по умолчанию', en: 'all default' },
        report_log: { ru: 'Журнал (последние {n})', en: 'Log (last {n})' },
        report_log_empty: { ru: 'журнал пуст', en: 'the log is empty' },
        report_na: { ru: 'Окно отчёта недоступно в этой версии Lampa', en: 'The report window is not available in this Lampa version' }
    };

    var I18n = {
        // Код языка Lampa; без выбранного языка Lampa работает на русском (core/lang.js: lang_default = 'ru')
        code: function () {
            var c = '';
            try { c = String(Lampa.Storage.get('language', '') || ''); } catch (e) {}
            if (!c) {
                try { c = String(window.localStorage.getItem('language') || ''); } catch (e) {}
            }
            return c || 'ru';
        },
        lang: function () {
            var c = this.code();
            for (var i = 0; i < I18N_LANGS.length; i++) if (I18N_LANGS[i] === c) return c;
            return I18N_FALLBACK;
        },
        has: function (key) {
            return Object.prototype.hasOwnProperty.call(I18N, key);
        },
        // Строка на нужном языке; нет перевода — английский, затем русский
        raw: function (key, lang) {
            if (!this.has(key)) return null;
            var row = I18N[key];
            lang = lang || this.lang();
            if (row[lang] !== undefined) return row[lang];
            return row[I18N_FALLBACK] !== undefined ? row[I18N_FALLBACK] : row.ru;
        },
        // Подставляет только переданные значения
        format: function (text, vars) {
            text = String(text);
            if (!vars) return text;
            return text.replace(/\{([a-z0-9_]+)\}/gi, function (m, k) {
                return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
            });
        }
    };

    // Строка интерфейса на языке Lampa: tr('plugin_title'), tr('noty_subs', { state: '...' })
    function tr(key, vars) {
        var text = I18n.raw(key);
        return text === null ? key : I18n.format(text, vars);
    }


    // ---------- Признаки HDR в тексте (название, адрес, качество, раздача) ----------
    var SEP = '(?:^|[\\s._\\-\\[\\]\\(\\)/,+|])';
    var END = '(?=$|[\\s._\\-\\[\\]\\(\\)/,+|])';
    var DV_RE = new RegExp(SEP + '(?:dolby[\\s._\\-]?vision|dovi|dv)' + END, 'i');
    var HLG_RE = new RegExp(SEP + 'hlg' + END, 'i');
    var HDR10_RE = new RegExp(SEP + '(?:hdr10\\+?|hdr10plus|smpte[\\s._\\-]?2084)' + END, 'i');
    var HDR_RE = new RegExp(SEP + '(?:hdr|uhd[\\s._\\-]?hdr)' + END, 'i');
    var SDR_RE = new RegExp(SEP + 'sdr' + END, 'i');

    function safeDecode(s) {
        s = String(s || '');
        for (var i = 0; i < 2; i++) {
            try { var d = decodeURIComponent(s.replace(/\+/g, ' ')); if (d === s) break; s = d; } catch (e) { break; }
        }
        return s;
    }

    // -> 'dv' | 'hlg' | 'hdr10' | 'hdr' | 'sdr' | null
    function kindFromText(text) {
        text = safeDecode(text);
        if (!text) return null;
        if (DV_RE.test(text)) return 'dv';
        if (HLG_RE.test(text)) return 'hlg';
        if (HDR10_RE.test(text)) return 'hdr10';
        if (HDR_RE.test(text)) return 'hdr';
        if (SDR_RE.test(text)) return 'sdr';
        return null;
    }

    // Совместимость с v3: 'hdr' | 'sdr' | null
    function detectFromText(text) {
        var k = kindFromText(text);
        return k ? (isHdrKind(k) ? 'hdr' : 'sdr') : null;
    }

    function collectStrings(data) {
        var out = [];
        if (!data || typeof data !== 'object') return out;
        var keys = ['title', 'url', 'path', 'quality', 'name', 'file', 'translate', 'voice_name', 'release', 'info'];
        for (var i = 0; i < keys.length; i++) {
            var v = data[keys[i]];
            if (typeof v === 'string') out.push(v);
            else if (v && typeof v === 'object' && !(v instanceof Array)) {
                // quality: { "2160p HDR": url, ... }
                for (var k in v) if (v.hasOwnProperty(k)) out.push(k);
            }
        }
        return out;
    }

    // Первая строка с признаком решает (как в v3)
    function kindFromData(data) {
        var strings = collectStrings(data);
        for (var i = 0; i < strings.length; i++) {
            var found = kindFromText(strings[i]);
            if (found) return found;
        }
        return null;
    }

    // ---------- Признаки HDR в ffprobe (данные раздачи или TorrServer /ffp) ----------
    // color_transfer: smpte2084 = PQ (HDR10/HDR10+), arib-std-b67 = HLG;
    // Dolby Vision: side_data «DOVI configuration record» или codec_tag dvh1/dvhe/dva1/dvav
    function kindFromStreams(list) {
        if (list && !Array.isArray(list) && Array.isArray(list.streams)) list = list.streams;
        if (!Array.isArray(list)) return null;
        var video = null, i;
        for (i = 0; i < list.length; i++) {
            var s = list[i];
            if (s && s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic)) { video = s; break; }
        }
        if (!video) return null;
        var dv = /^(?:dvh1|dvhe|dva1|dvav)$/i.test(String(video.codec_tag_string || ''));
        var side = video.side_data_list;
        if (Array.isArray(side)) {
            for (i = 0; i < side.length; i++) {
                if (/dovi|dolby\s*vision/i.test(String(side[i] && side[i].side_data_type || ''))) dv = true;
            }
        }
        if (dv) return 'dv';
        var trc = String(video.color_transfer || '').toLowerCase();
        if (trc === 'smpte2084') return 'hdr10';
        if (trc === 'arib-std-b67') return 'hlg';
        if (trc && trc !== 'unknown' && trc !== 'unspecified' && trc !== 'reserved') return 'sdr';
        // 8 бит без сведений о передаточной функции — SDR (HDR10/HLG/DV требуют 10 бит)
        if (/^(?:yuv420p|yuvj420p|nv12|yuv422p|yuv444p)$/i.test(String(video.pix_fmt || ''))) return 'sdr';
        return null;
    }

    // ---------- HLS: VIDEO-RANGE (SDR | HLG | PQ) и CODECS в мастер-плейлисте ----------
    function kindFromHls(text) {
        if (typeof text !== 'string' || text.indexOf('#EXTM3U') === -1) return null;
        var lines = text.split(/\r?\n/), kinds = {}, n = 0;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('#EXT-X-STREAM-INF:') !== 0) continue;
            n++;
            var attrs = line.slice(18);
            var range = /(?:^|,)VIDEO-RANGE=([A-Za-z]+)/.exec(attrs);
            var codecs = /(?:^|,)CODECS="([^"]*)"/.exec(attrs);
            var k = '?';
            if (codecs && /(?:^|,)\s*(?:dvh1|dvhe|dva1|dvav)\./i.test(codecs[1])) k = 'dv';
            else if (range) {
                var r = range[1].toUpperCase();
                k = r === 'PQ' ? 'hdr10' : (r === 'HLG' ? 'hlg' : (r === 'SDR' ? 'sdr' : '?'));
            }
            kinds[k] = true;
        }
        if (!n || kinds['?']) return null;
        var list = Object.keys(kinds);
        if (list.length === 1) return list[0];
        if (kinds.sdr) return null;          // есть и SDR, и HDR — что выберет плеер, неизвестно
        return 'hdr';
    }


    // ---------- TorrServer ----------
    // Общий кэш ffprobe для autoskip и adaptive_subs: один запуск ffprobe на файл (та же реализация, что в autoskip)
    function sharedFfp() {
        if (!window.__lampa_ffp__ || typeof window.__lampa_ffp__.get !== 'function') {
            window.__lampa_ffp__ = {
                v: 1,
                _p: {},
                get: function (base, hash, index, auth, timeout) {
                    var key = (base + '|' + hash + '|' + index).toLowerCase(), cache = this._p;
                    if (cache[key]) return cache[key];
                    var p = new Promise(function (resolve) {
                        var xhr, done = false, timer;
                        function finish(r) {
                            if (done) return;
                            done = true;
                            clearTimeout(timer);
                            if (!r || r.status !== 200) setTimeout(function () { if (cache[key] === p) delete cache[key]; }, 6e4);
                            resolve(r);
                        }
                        try {
                            xhr = new XMLHttpRequest();
                            xhr.open('GET', base + '/ffp/' + hash + '/' + index, true);
                            if (auth) xhr.setRequestHeader('Authorization', auth);
                            xhr.onreadystatechange = function () {
                                if (xhr.readyState !== 4) return;
                                var json = null;
                                try { json = JSON.parse(xhr.responseText); } catch (e) {}
                                finish({ status: xhr.status, json: json });
                            };
                            xhr.onerror = function () { finish({ status: 0, json: null }); };
                            timer = setTimeout(function () {
                                try { xhr.abort(); } catch (e) {}
                                finish({ status: 0, json: null, timeout: true });
                            }, timeout || 3e4);
                            xhr.send(null);
                        } catch (e) { finish({ status: 0, json: null }); }
                    });
                    cache[key] = p;
                    return p;
                }
            };
        }
        return window.__lampa_ffp__;
    }

    // { base, hash, index|null } из адреса потока TorrServer: /stream, /play и GStreamer /gst
    function torrTarget(data) {
        var url = data && typeof data.url === 'string' ? data.url : '';
        var base = url.match(/^(https?:\/\/[^\/?#]+(?:\/[^?#]*?)?)\/(?:stream|play|gst)(?:\/|\?|$)/);
        if (!base) return null;
        var hash = null, index = null, m;
        if (data && typeof data.torrent_hash === 'string' && /^[a-fA-F0-9]{40}$/.test(data.torrent_hash)) hash = data.torrent_hash;
        if (!hash) {
            m = url.match(/[?&]link=([a-fA-F0-9]{40})(?![a-fA-F0-9])/) || url.match(/\/(?:play|gst)\/([a-fA-F0-9]{40})(?![a-fA-F0-9])/);
            if (m) hash = m[1];
        }
        m = url.match(/[?&]index=(\d+)/) || url.match(/\/play\/[a-fA-F0-9]{40}\/(\d+)/);
        if (m) index = parseInt(m[1], 10);
        if (!hash) return null;
        return { base: base[1], hash: hash.toLowerCase(), index: index, key: hash.toLowerCase() };
    }

    // Как Lampa (utils/reguest.js): Basic-авторизация, если включена и запрос идёт на адрес TorrServer
    function torrAuth(base) {
        try {
            var on = Lampa.Storage.field ? Lampa.Storage.field('torrserver_auth') : Lampa.Storage.get('torrserver_auth', false);
            if (!(on === true || on === 'true')) return null;
            var urls = [Lampa.Storage.get('torrserver_url', ''), Lampa.Storage.get('torrserver_url_two', '')], hit = false;
            for (var i = 0; i < urls.length; i++) {
                var u = String(urls[i] || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
                if (u && base.indexOf(u) !== -1) hit = true;
            }
            if (!hit) return null;
            var pair = Lampa.Storage.get('torrserver_login', '') + ':' + (Lampa.Storage.value ? Lampa.Storage.value('torrserver_password', '') : Lampa.Storage.get('torrserver_password', ''));
            return 'Basic ' + (Lampa.Base64 && Lampa.Base64.encode ? Lampa.Base64.encode(pair) : btoa(pair));
        } catch (e) { return null; }
    }

    // Точный тип по файлу: ffprobe TorrServer (GET /ffp/:hash/:id)
    function ffpKind(t) {
        if (!t || t.index === null || t.index === undefined) return Promise.resolve(null);
        return sharedFfp().get(t.base, t.hash, t.index, torrAuth(t.base), FFP_TIMEOUT).then(function (r) {
            if (!r || r.status !== 200 || !r.json) {
                log('ffprobe from TorrServer unavailable', r ? r.status : '');
                return null;
            }
            return kindFromStreams(r.json.streams || r.json);
        }, function () { return null; });
    }

    // Название раздачи из TorrServer (в имени файла HDR/DV часто нет)
    function torrTitle(t) {
        return new Promise(function (resolve) {
            if (!t) return resolve(null);
            if (torrCache.hasOwnProperty(t.key)) return resolve(torrCache[t.key]);
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', t.base + '/torrents', true);
                xhr.timeout = NET_TIMEOUT;
                xhr.setRequestHeader('Content-Type', 'application/json');
                var auth = torrAuth(t.base);
                if (auth) xhr.setRequestHeader('Authorization', auth);
                xhr.onload = function () {
                    var text = null;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            var j = JSON.parse(xhr.responseText);
                            text = [j.title, j.name].join(' ');
                            torrCache[t.key] = text;
                        } catch (e) {}
                    }
                    resolve(text);
                };
                xhr.onerror = xhr.ontimeout = function () { resolve(null); };
                xhr.send(JSON.stringify({ action: 'get', hash: t.hash }));
            } catch (e) { resolve(null); }
        });
    }

    // ---------- HLS: мастер-плейлист онлайн-потока ----------
    function hlsKind(url) {
        if (hlsCache.hasOwnProperty(url)) return Promise.resolve(hlsCache[url]);
        return new Promise(function (resolve) {
            var done = false, timer;
            function finish(k) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(k);
            }
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4) return;
                    var k = xhr.status >= 200 && xhr.status < 300 ? kindFromHls(xhr.responseText) : null;
                    if (xhr.status >= 200 && xhr.status < 300) hlsCache[url] = k;
                    finish(k);
                };
                xhr.onerror = function () { finish(null); };
                timer = setTimeout(function () {
                    try { xhr.abort(); } catch (e) {}
                    finish(null);
                }, NET_TIMEOUT);
                xhr.send(null);
            } catch (e) { finish(null); }
        });
    }


    // ---------- LG webOS: встроенные субтитры ----------
    var webosOrigRequest = null;
    var lampaOpacity = 255;      // прозрачность символов, выбранная в Lampa (кнопка 9)
    var dimmedMediaId = null;    // mediaId, для которого выставлено затемнение
    var probeLogged = {};        // mediaId -> true: сведения webOS о видео уже записаны в журнал

    // Веб-версия Lampa подключает webOSTV.js всегда (index.html), поэтому window.webOS есть и в обычном
    // браузере. Телевизор определяем, как сама Lampa (core/platform.js): webOS.platform.tv === true
    function isWebos() {
        var w = window.webOS, tv = false;
        if (!w || !w.service || typeof w.service.request !== 'function') return false;
        try { tv = !!(Lampa.Platform && typeof Lampa.Platform.is === 'function' && Lampa.Platform.is('webos')); } catch (e) {}
        return tv || !!(w.platform && w.platform.tv === true);
    }

    function readLampaOpacity() {
        try {
            var p = Lampa.Storage.get('webos_subs_params', '{}');
            if (typeof p === 'string') p = JSON.parse(p);
            var v = p ? parseInt(p.char_opacity, 10) : NaN;
            if (!isNaN(v) && v >= 0 && v <= 255) return v;
        } catch (e) {}
        return 255;
    }

    // В HDR: доля от значения Lampa; уровень HDR10/DV/HLG меняет её пропорционально основному уровню
    function webosOpacity() {
        if (current.profile !== 'hdr') return lampaOpacity;
        var k = parseInt(opt('adaptive_subs_webos_opacity'), 10);
        if (isNaN(k) || k < 0 || k > 255) k = 255;
        var ratio = current.brightness > 0 ? current.brightness / mainLevel() : 1;
        var v = Math.round(lampaOpacity * k / 255 * ratio);
        return v < 0 ? 0 : (v > 255 ? 255 : v);
    }

    function webosFontSize() {
        var v = opt('adaptive_subs_webos_size');
        if (v === 'default') return null;
        v = parseInt(v, 10);
        return (isNaN(v) || v < 0 || v > 4) ? null : v;
    }

    // mediaId видео плеера: сначала Lampa.PlayerVideo.video(), затем любое <video> с mediaId.
    // На LG (webOS 25) после «repeat to new video» в DOM первым может остаться старое <video> без mediaId
    function currentMediaId() {
        var video = null, list, i;
        try { video = Lampa.PlayerVideo && typeof Lampa.PlayerVideo.video === 'function' ? Lampa.PlayerVideo.video() : null; } catch (e) { video = null; }
        if (video && video.mediaId) return video.mediaId;
        list = document.querySelectorAll ? document.querySelectorAll('video') : [];
        for (i = 0; i < list.length; i++) if (list[i] && list[i].mediaId) return list[i].mediaId;
        return null;
    }

    // Эксперимент (по умолчанию выключен): что webOS сообщает о видео в sourceInfo.
    // Какие поля там бывают, не проверено на телевизоре: в журнал пишется всё, а для решения
    // берутся только явные известные значения (HDR10, HDR10+, HLG, Dolby Vision, SDR).
    var WEBOS_KNOWN = { hdr10: 'hdr10', 'hdr10+': 'hdr10', hdr10plus: 'hdr10', hlg: 'hlg', dolbyvision: 'dv', 'dolby vision': 'dv', dovi: 'dv', sdr: 'sdr' };

    function inspectWebos(result) {
        var info = result && result.sourceInfo && result.sourceInfo.programInfo && result.sourceInfo.programInfo[0];
        if (!info) return null;
        var tracks = info.videoTrackInfo || info.videoInfo || [];
        if (!Array.isArray(tracks)) tracks = [tracks];
        var found = null;
        for (var i = 0; i < tracks.length && !found; i++) {
            var t = tracks[i];
            if (!t || typeof t !== 'object') continue;
            for (var k in t) {
                if (!t.hasOwnProperty(k) || typeof t[k] !== 'string' || !/hdr|range|transfer|dolby/i.test(k)) continue;
                var v = t[k].trim().toLowerCase();
                if (WEBOS_KNOWN.hasOwnProperty(v)) { found = WEBOS_KNOWN[v]; break; }
            }
        }
        return { kind: found, video: tracks };
    }

    // Перехват вызовов Lampa в com.webos.media: значение Lampa запоминаем и
    // передаём дальше (в HDR — затемнённым). Объект Lampa не меняем — работаем с копией.
    function hookWebos() {
        if (!isWebos() || webosOrigRequest) return;
        lampaOpacity = readLampaOpacity();
        webosOrigRequest = window.webOS.service.request;
        window.webOS.service.request = function (uri, params) {
            var args = arguments;
            try {
                if (String(uri).indexOf('com.webos.media') !== -1 && params && params.parameters) {
                    var p = null, np = null;
                    if (params.method === 'setSubtitleCharacterOpacity') {
                        var v = parseInt(params.parameters.charOpacity, 10);
                        if (!isNaN(v) && v >= 0 && v <= 255) lampaOpacity = v;
                        p = copy(params.parameters);
                        p.charOpacity = webosOpacity();
                        if (current.profile === 'hdr') dimmedMediaId = p.mediaId || null;
                        else if (dimmedMediaId === p.mediaId) dimmedMediaId = null;
                    } else if (params.method === 'setSubtitleFontSize') {
                        var fs = webosFontSize();
                        if (fs !== null) {
                            p = copy(params.parameters);
                            p.fontSize = fs;
                        }
                    } else if (params.method === 'subscribe' && typeof params.onSuccess === 'function' && flag('adaptive_subs_webos_probe')) {
                        var orig = params.onSuccess, media = params.parameters.mediaId, sess = session;
                        np = copy(params);
                        np.onSuccess = function (result) {
                            try {
                                var r = result && result.sourceInfo ? inspectWebos(result) : null;
                                if (r && !probeLogged[media]) {
                                    probeLogged[media] = true;
                                    log('webOS sourceInfo video:', JSON.stringify(r.video), '->', r.kind || 'no known HDR flag');
                                    if (r.kind && sess === session && Resolver.active) Resolver.active.offer(r.kind, 'webos');
                                }
                            } catch (e) {}
                            return orig.apply(this, arguments);
                        };
                    }
                    if (p) {
                        np = copy(params);
                        np.parameters = p;
                    }
                    if (np) args = [uri, np];
                }
            } catch (e) {}
            return webosOrigRequest.apply(this, args);
        };
    }

    function webosCall(method, parameters, mediaId) {
        if (!webosOrigRequest || !mediaId) return;
        parameters.mediaId = mediaId;
        log('webOS', method, parameters.charOpacity !== undefined ? 'charOpacity ' + parameters.charOpacity : (parameters.fontSize !== undefined ? 'fontSize ' + parameters.fontSize : ''));
        webosOrigRequest.call(window.webOS.service, 'luna://com.webos.media', {
            method: method,
            parameters: parameters,
            onSuccess: function () {},
            onFailure: function (r) { log(method, 'fail', r && r.errorText); }
        });
    }

    // HDR — затемнить; SDR — только вернуть значение Lampa, если мы затемняли это же видео
    function applyWebos() {
        if (!webosOrigRequest) return;
        var id = currentMediaId();
        if (!id) return;
        if (current.profile === 'hdr') {
            webosCall('setSubtitleCharacterOpacity', { charOpacity: webosOpacity() }, id);
            dimmedMediaId = id;
        } else if (dimmedMediaId === id) {
            webosCall('setSubtitleCharacterOpacity', { charOpacity: lampaOpacity }, id);
            dimmedMediaId = null;
        }
        var fs = webosFontSize();
        if (fs !== null) webosCall('setSubtitleFontSize', { fontSize: fs }, id);
    }

    // На start видео ещё не создано: ждём mediaId (до ~20 с) и применяем к каждому новому
    function watchMedia(sess) {
        if (!webosOrigRequest) return;
        var tries = 0, applied = null;
        (function tick() {
            if (sess !== session) return;
            var id = currentMediaId();
            if (id && id !== applied) {
                applied = id;
                applyWebos();
            }
            // первые 20 с — каждые 0,5 с; дальше до конца просмотра — каждые 2 с
            // (Lampa на webOS может пересоздать видео с новым mediaId посреди просмотра)
            setTimeout(tick, ++tries < 40 ? 500 : 2000);
        })();
    }


    // ---------- Уровни яркости ----------
    // Значения соответствуют прежним серым цветам v3: #9a -> 0.60, #8a -> 0.54, #7a -> 0.48, #66 -> 0.40, #55 -> 0.33
    var TONES = { '#9a9a9a': 0.60, '#8a8a8a': 0.54, '#7a7a7a': 0.48, '#666666': 0.40, '#555555': 0.33 };
    var TONE_KEYS = ['#9a9a9a', '#8a8a8a', '#7a7a7a', '#666666', '#555555'];

    // Подписи уровней на языке Lampa: { '#7a7a7a': 'Темнее — 48%', ... } (строки tone_* в 05_i18n.js)
    function toneNames() {
        var out = {};
        for (var i = 0; i < TONE_KEYS.length; i++) out[TONE_KEYS[i]] = tr('tone_' + TONE_KEYS[i].slice(1));
        return out;
    }
    var KIND_NAMES = { dv: 'Dolby Vision', hdr10: 'HDR10', hlg: 'HLG', hdr: 'HDR', sdr: 'SDR' };

    function mainLevel() {
        return TONES[opt('adaptive_subs_hdr_tone')] || TONES[DEFAULTS.adaptive_subs_hdr_tone];
    }

    function levelFor(kind) {
        var v = kind === 'hdr10' || kind === 'dv' || kind === 'hlg' ? opt('adaptive_subs_level_' + kind) : 'same';
        return v && v !== 'same' && TONES[v] ? TONES[v] : mainLevel();
    }

    // Серый того же уровня — для режима «перекрашивать» и для video::cue
    function toneFor(b) {
        var n = Math.max(0, Math.min(255, Math.round(b * 255))), h = n.toString(16);
        if (h.length < 2) h = '0' + h;
        return '#' + h + h + h;
    }

    // ---------- Стили ----------
    var HDR_SHADOW = '0 0 3px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.7), 1px 1px 2px #000';
    var SDR_SHADOW = '0 0 2px #000, 0 0 4px #000, 1px 1px 2px #000, -1px -1px 2px #000';

    function buildCss(st) {
        st = st || current;
        var css = '';
        if (st.profile === 'hdr') {
            var b = st.brightness > 0 && st.brightness <= 1 ? st.brightness : mainLevel(), tone = toneFor(b);
            var f = 'brightness(' + b + ')';
            if (opt('adaptive_subs_hdr_style') === 'color') {
                css += '.player-video__subtitles-text, .player-video__subtitles-text *{color:' + tone + ' !important;' +
                       'text-shadow:' + HDR_SHADOW + ' !important;}';
            } else {
                // яркостью: цветные надписи и оформление остаются, просто темнее
                css += '.player-video__subtitles-text{filter:' + f + ' !important;-webkit-filter:' + f + ' !important;}';
            }
            // WebVTT, который рисует сам браузер: фильтры к ::cue не применяются — только цвет (как в v3)
            css += 'video::cue{color:' + tone + ' !important;text-shadow:' + HDR_SHADOW + ' !important;}';
            // ASS: простой рендер Lampa (.player-video__ass) и JASSUB (холст в .JASSUB)
            if (flag('adaptive_subs_ass')) {
                css += '.player-video__ass, .JASSUB{filter:' + f + ' !important;-webkit-filter:' + f + ' !important;}';
            }
        } else {
            var color = opt('adaptive_subs_sdr_color');
            if (color && color !== 'lampa') {
                css += '.player-video__subtitles-text, .player-video__subtitles-text *{color:' + color + ' !important;' +
                       'text-shadow:' + SDR_SHADOW + ' !important;}' +
                       'video::cue{color:' + color + ' !important;text-shadow:' + SDR_SHADOW + ' !important;}';
            }
        }
        var size = opt('adaptive_subs_size');
        if (size && size !== 'default') {
            css += '.player-video__subtitles-text{font-size:' + size + ' !important;line-height:1.25 !important;}' +
                   'video::cue{font-size:' + size + ' !important;}';
        }
        return css;
    }

    function applyStyle() {
        var el = document.getElementById(STYLE_ID);
        if (!el) {
            el = document.createElement('style');
            el.id = STYLE_ID;
            document.head.appendChild(el);
        }
        var css = buildCss(current);
        if (el.textContent !== css) el.textContent = css;
    }


    // ---------- Профиль: применение, уведомление, событие для других плагинов ----------
    // Откуда профиль: name, torrserver, parser, ffprobe, hls, webos, manual, override, default;
    // почему HDR-видео без затемнения: display, player, screen (строки src_* в 05_i18n.js)
    function sourceName(source) {
        return source && I18n.has('src_' + source) ? tr('src_' + source) : '';
    }
    // Чем выше, тем надёжнее; более слабый источник не перебивает уже найденное
    var PRIO = { 'default': 0, name: 1, torrserver: 2, webos: 3, hls: 4, parser: 5, ffprobe: 6, override: 8, manual: 9 };

    // ---------- Экран: затемнять есть смысл, только если HDR действительно показывается ----------
    // Настройка «Экран»: auto | hdr | sdr. В «Авто»:
    //  1) браузер знает признак dynamic-range (Chrome 98+, Safari, Firefox 100+): standard — экран без HDR;
    //  2) не знает (старый WebView: Android 11 на Tanix TX9 — Chrome 84) — умеет ли встроенный плеер HEVC 10 бит
    //     или Dolby Vision. Не умеет — HDR-видео в нём не запускается (TX9: DEMUXER_ERROR_NO_SUPPORTED_STREAMS),
    //     а то, что играет с «HDR» в названии, на экран выходит в SDR;
    //  3) LG webOS, Samsung Tizen и другие ТВ-платформы — как раньше, решает видео.
    var TV_PLATFORMS = ['webos', 'tizen', 'orsay', 'netcast'];
    var HDR_CODECS = ['video/mp4; codecs="hvc1.2.4.L153.B0"', 'video/mp4; codecs="hev1.2.4.L153.B0"',
        'video/mp4; codecs="dvh1.08.06"', 'video/mp4; codecs="dvhe.08.06"'];
    var hdrDecoder;              // кэш hdrDecoderSupport(): true | false | null

    function tvPlatform() {
        if (isWebos()) return true;
        try {
            for (var i = 0; i < TV_PLATFORMS.length; i++) if (Lampa.Platform.is(TV_PLATFORMS[i])) return true;
        } catch (e) {}
        return false;
    }

    // 'high' | 'standard' | null (браузер признака не знает)
    function displayRange() {
        try {
            if (!window.matchMedia) return null;
            if (window.matchMedia('(dynamic-range: high)').matches) return 'high';
            if (window.matchMedia('(dynamic-range: standard)').matches) return 'standard';
        } catch (e) {}
        return null;
    }

    // Декодирует ли встроенный плеер HEVC 10 бит или Dolby Vision: true | false | null (не узнать)
    function hdrDecoderSupport() {
        if (hdrDecoder !== undefined) return hdrDecoder;
        var video = null, known = false, any = false;
        try { video = document.createElement('video'); } catch (e) {}
        for (var i = 0; i < HDR_CODECS.length; i++) {
            try {
                if (video && typeof video.canPlayType === 'function') {
                    known = true;
                    if (video.canPlayType(HDR_CODECS[i])) any = true;
                }
            } catch (e) {}
            try {
                if (window.MediaSource && typeof window.MediaSource.isTypeSupported === 'function') {
                    known = true;
                    if (window.MediaSource.isTypeSupported(HDR_CODECS[i])) any = true;
                }
            } catch (e) {}
        }
        hdrDecoder = known ? any : null;
        return hdrDecoder;
    }

    // Почему HDR-видео будет показано в SDR: 'screen' (настройка), 'display' (dynamic-range: standard),
    // 'player' (плеер без HDR) или '' (HDR показывается или узнать нельзя)
    function screenBlocksHdr() {
        var mode = opt('adaptive_subs_screen');
        if (mode === 'sdr') return 'screen';
        if (mode === 'hdr' || tvPlatform()) return '';
        var range = displayRange();
        if (range) return range === 'standard' ? 'display' : '';
        return hdrDecoderSupport() === false ? 'player' : '';
    }

    function screenInfo() {
        return { mode: opt('adaptive_subs_screen'), tv: tvPlatform(), range: displayRange(), decoder: hdrDecoderSupport(), blocks: screenBlocksHdr() };
    }

    function emit() {
        var detail = { type: 'profile', profile: current.profile, kind: current.kind, brightness: current.brightness, source: current.source };
        if (current.screen) detail.screen = current.screen;     // HDR-видео, но экран или плеер его не показывает
        try { if (Lampa.Listener && typeof Lampa.Listener.send === 'function') Lampa.Listener.send('adaptive_subs', detail); } catch (e) {}
        try {
            var ev;
            if (typeof CustomEvent === 'function') ev = new CustomEvent('adaptive_subs:profile', { detail: detail });
            else {
                ev = document.createEvent('CustomEvent');
                ev.initCustomEvent('adaptive_subs:profile', false, false, detail);
            }
            window.dispatchEvent(ev);
        } catch (e) {}
    }

    function applyKind(kind, source) {
        var before = current.profile + '|' + current.kind + '|' + current.brightness + '|' + current.screen;
        var hdr = isHdrKind(kind), mine = source === 'manual' || source === 'override';
        current.kind = kind || 'sdr';
        current.source = source || '';
        current.profile = hdr ? 'hdr' : 'sdr';
        current.screen = '';
        if (!mine) current.detected = current.kind;
        // HDR-видео, которое экран или плеер покажет в SDR: субтитры обычные (ручной выбор сильнее)
        if (hdr && !mine) {
            current.screen = screenBlocksHdr();
            if (current.screen) current.profile = 'sdr';
        }
        current.brightness = current.profile === 'hdr' ? levelFor(current.kind) : 1;
        applyStyle();
        applyWebos();
        if (before !== current.profile + '|' + current.kind + '|' + current.brightness + '|' + current.screen) emit();
    }

    function announce(refined, extra) {
        if (!flag('adaptive_subs_notify')) return;
        var hdr = current.profile === 'hdr';
        var state = hdr ? tr('state_hdr', { kind: KIND_NAMES[current.kind] || 'HDR', pct: Math.round(current.brightness * 100) }) : tr('state_sdr');
        var text = tr(refined ? 'noty_refined' : 'noty_subs', { state: state });
        var why = extra || sourceName(current.source);
        // «Dolby Vision по названию; экран без HDR»
        if (!extra && current.screen) why = (KIND_NAMES[current.kind] || 'HDR') + (why ? ' ' + why : '') + '; ' + sourceName(current.screen);
        if (why) text += ' (' + why + ')';
        log('Notice:', text);
        try { Lampa.Noty.show(text); } catch (e) {}
    }

    // ---------- Ручной выбор HDR/SDR: для раздачи (по хешу) или для сериала/фильма ----------
    var OVERRIDES = 'adaptive_subs_overrides';

    function overrideKey(info) {
        if (info && info.hash) return 'h:' + info.hash;
        if (info && info.tmdb) return 't:' + info.tmdb;
        return '';
    }

    function readOverrides() {
        var v;
        try { v = Lampa.Storage.get(OVERRIDES, '{}'); if (typeof v === 'string') v = JSON.parse(v); } catch (e) { v = null; }
        return v && typeof v === 'object' && !(v instanceof Array) ? v : {};
    }

    function getOverride(key) {
        var v = key ? readOverrides()[key] : null;
        return v && (v.p === 'hdr' || v.p === 'sdr') ? v.p : null;
    }

    function setOverride(key, profile) {
        if (!key) return;
        var all = readOverrides(), list = [], k;
        if (profile) all[key] = { p: profile, t: Date.now() };
        else delete all[key];
        for (k in all) if (all.hasOwnProperty(k)) list.push({ k: k, t: all[k] && all[k].t || 0 });
        if (list.length > OVERRIDE_LIMIT) {
            list.sort(function (a, b) { return a.t - b.t; });
            for (var i = 0; i < list.length - OVERRIDE_LIMIT; i++) delete all[list[i].k];
        }
        try { Lampa.Storage.set(OVERRIDES, all); } catch (e) {}
    }

    // ---------- Определение за запуск: быстрые признаки сразу, точные — уточняют ----------
    // Уведомление одно: после быстрых источников (до QUICK_WAIT); второе — только если точный
    // источник позже сменил HDR на SDR или наоборот
    function Resolver(notify) {
        this.token = ++lookupToken;
        this.notify = notify;
        this.best = null;
        this.announced = null;
        this.refined = false;
        this.pending = 0;
        this.timer = null;
        Resolver.active = this;
    }

    Resolver.active = null;

    Resolver.prototype.alive = function () {
        return this.token === lookupToken;
    };

    Resolver.prototype.offer = function (kind, source) {
        if (!this.alive() || !kind) return false;
        var prio = PRIO[source] || 0;
        if (this.best && prio <= this.best.prio) return false;
        var was = this.announced !== null ? current.profile : null;
        this.best = { kind: kind, source: source, prio: prio };
        log('Detected', kind, 'from', source);
        applyKind(kind, source);
        if (was !== null && !this.refined && current.profile !== was) {
            this.refined = true;
            if (this.notify) announce(true);
        }
        return true;
    };

    Resolver.prototype.wait = function (promise, source) {
        var self = this;
        this.pending++;
        promise.then(function (kind) {
            if (!kind && self.alive()) log(source + ': nothing found');
            self.offer(kind, source);
        }, function (err) {
            if (self.alive()) log(source + ': failed', err && (err.status || err.message) ? (err.status || err.message) : '');
        }).then(function () {
            self.pending--;
            if (!self.pending) self.flush();
        });
    };

    Resolver.prototype.start = function () {
        var self = this;
        if (!this.pending) return this.flush();
        this.timer = setTimeout(function () { self.flush(); }, QUICK_WAIT);
    };

    Resolver.prototype.flush = function () {
        clearTimeout(this.timer);
        if (!this.alive() || this.announced !== null) return;
        this.announced = current.profile;
        log('Profile', current.profile + (current.profile === 'hdr' ? ' ' + Math.round(current.brightness * 100) + '%' : ''), '| kind', current.kind,
            '| source', current.source || '-', current.screen ? '| HDR shown as SDR (' + current.screen + ')' : '');
        if (this.notify) announce(false);
    };

    function activityCard() {
        try {
            var act = Lampa.Activity.active();
            return act ? act.card || act.movie || null : null;
        } catch (e) { return null; }
    }

    // Ключ сериала/фильма как в autoskip: id TMDB у карточек tmdb и cub, у других источников — «источник-id»
    function cardKey(card) {
        if (!card || card.id === undefined || card.id === null || card.id === '' || card.id === 0) return '';
        if (!card.source || card.source === 'tmdb' || card.source === 'cub') return String(card.id);
        return String(card.source).replace(/[^A-Za-z0-9]/g, '') + '-' + String(card.id).replace(/[^A-Za-z0-9]/g, '');
    }

    function describeData(data) {
        data = data || {};
        var torr = torrTarget(data), card = data.card || activityCard(), url = typeof data.url === 'string' ? data.url : '';
        return {
            torr: torr,
            hash: torr ? torr.hash : '',
            tmdb: cardKey(card),
            url: url,
            hls: !torr && /^https?:\/\/.+\.m3u8(?:$|[?#])/i.test(url)
        };
    }

    function evaluate(data, notify) {
        var r = new Resolver(notify), info = describeData(data);
        current.key = overrideKey(info);
        var mode = opt('adaptive_subs_mode');
        if (mode === 'hdr' || mode === 'sdr') {
            r.offer(mode, 'manual');
            return r.flush();
        }
        var ov = getOverride(current.key);
        if (ov) {
            r.offer(ov === 'hdr' ? 'hdr' : 'sdr', 'override');
            return r.flush();
        }
        var byName = kindFromData(data);
        r.offer(byName || 'sdr', byName ? 'name' : 'default');
        var byParser = kindFromStreams(data && data.ffprobe);
        if (byParser) r.offer(byParser, 'parser');
        if (info.torr) {
            if (!byParser && flag('adaptive_subs_ffp')) r.wait(ffpKind(info.torr), 'ffprobe');
            if (!byName && !byParser) r.wait(torrTitle(info.torr).then(kindFromText), 'torrserver');
        } else if (info.hls && !byParser && flag('adaptive_subs_hls')) {
            r.wait(hlsKind(info.url), 'hls');
        }
        r.start();
        return r;
    }

    // Клавиша в плеере: HDR <-> SDR, выбор запоминается
    function toggleProfile() {
        var next = current.profile === 'hdr' ? 'sdr' : 'hdr', key = current.key;
        lookupToken++;                          // поздние уточнения не перебьют выбор пользователя
        Resolver.active = null;
        if (key) setOverride(key, next);
        log('HDR/SDR key:', next, key ? '(remembered for the ' + (key.charAt(0) === 'h' ? 'torrent' : 'title') + ')' : '');
        applyKind(next === 'hdr' ? (isHdrKind(current.detected) ? current.detected : 'hdr') : 'sdr', 'override');
        announce(false, key ? tr(key.charAt(0) === 'h' ? 'why_release' : 'why_title') : tr('src_manual'));
        return next;
    }

    var KEY_CODES = { red: 403, green: 404, yellow: 405, blue: 406 };
    // Цветные кнопки по имени клавиши (KeyboardEvent.key): на Android-приставке Tanix TX9 WebView отдаёт их
    // с keyCode 0 и key «ColorF0Red» … «ColorF3Blue» (как в плагине «Пропуск заставок»)
    var COLOR_KEY_NAMES = { ColorF0Red: 403, ColorF1Green: 404, ColorF2Yellow: 405, ColorF3Blue: 406 };

    function keyCodeOf(code, ev) {
        code = parseInt(code, 10);
        if (code > 0) return code;
        var name = ev && ev.key;
        return typeof name === 'string' && COLOR_KEY_NAMES.hasOwnProperty(name) ? COLOR_KEY_NAMES[name] : code;
    }

    function playerActive() {
        try {
            if (!(Lampa.Player.opened && Lampa.Player.opened())) return false;
            var en = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled() : null;
            return !en || typeof en.name !== 'string' || en.name === 'player';
        } catch (e) { return false; }
    }

    // Нажата клавиша HDR/SDR и открыт плеер
    function isOurKey(code, ev) {
        var want = KEY_CODES[opt('adaptive_subs_key')];
        return !!want && keyCodeOf(code, ev) === want && playerActive();
    }

    function bindKey() {
        // LG webOS: Lampa сама слушает цветные кнопки в Keypad и меняет встроенные субтитры телевизора (403 — размер,
        // 404 — положение, 405 — цвет, 406 — фон; Lampa 3.4.4, app.min.js#L7529-L7536). preventDefault её не останавливает,
        // поэтому в плеере забираем свою клавишу раньше Keypad (window, фаза перехвата) и дальше событие не передаём.
        if (isWebos() && typeof window.addEventListener === 'function') {
            window.addEventListener('keydown', function (ev) {
                if (!ev || !isOurKey(ev.keyCode || ev.which, ev)) return;
                ev.__adaptiveSubsKey = true;
                if (typeof ev.preventDefault === 'function') ev.preventDefault();
                if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
                if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
                toggleProfile();
            }, true);
        }
        var kp = Lampa.Keypad && Lampa.Keypad.listener;
        if (!kp || typeof kp.follow !== 'function') return;
        kp.follow('keydown', function (e) {
            if (!e || (e.event && e.event.__adaptiveSubsKey) || !isOurKey(e.code, e.event)) return;
            toggleProfile();
            if (e.event && typeof e.event.preventDefault === 'function') e.event.preventDefault();
        });
    }

    function playdata() {
        try { return Lampa.Player.playdata ? Lampa.Player.playdata() : null; } catch (e) { return null; }
    }

    function playerOpened() {
        try { return !!(Lampa.Player.opened && Lampa.Player.opened()); } catch (e) { return false; }
    }

    // start приходит и при первом запуске, и при выборе серии в плейлисте
    function onStart(data) {
        var sess = ++session, info = describeData(data || playdata());
        lastPlayback = Date.now();
        log('Playback start |', info.torr ? 'TorrServer' : (info.hls ? 'HLS' : 'video'), '| mode', opt('adaptive_subs_mode'),
            data && data.ffprobe ? '| ffprobe in data' : '');
        try { evaluate(data || playdata(), true); } catch (e) { log(e && e.message); }
        watchMedia(sess);
    }

    function onDestroy() {
        lookupToken++;
        session++;
        Resolver.active = null;
    }


    // ---------- Меню настроек ----------
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        var webos = isWebos();
        var C = 'adaptive_subs';

        Lampa.SettingsApi.addComponent({
            component: C,
            name: tr('plugin_title'),
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M6 13h5M13 13h5M6 16h8M16 16h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
        });

        function add(param, field, extra) {
            var o = { component: C, param: param, field: field };
            if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) o[k] = extra[k];
            try { Lampa.SettingsApi.addParam(o); } catch (e) {}
        }
        function title(name, text) { add({ name: name, type: 'title' }, { name: text }); }
        function refresh() { applyKind(current.kind, current.source); }
        function reevaluate() { if (playerOpened()) evaluate(playdata(), true); else refresh(); }
        var tones = toneNames(), levels = { same: tr('level_same') };
        for (var t in tones) if (tones.hasOwnProperty(t)) levels[t] = tones[t];

        title('adaptive_subs_t_detect', tr('t_detect'));
        add({ name: 'adaptive_subs_mode', type: 'select', default: DEFAULTS.adaptive_subs_mode,
            values: { auto: tr('mode_auto'), hdr: tr('mode_hdr'), sdr: tr('mode_sdr') } },
            { name: tr('set_mode'), description: tr('set_mode_d') },
            { onChange: reevaluate });
        add({ name: 'adaptive_subs_screen', type: 'select', default: DEFAULTS.adaptive_subs_screen,
            values: { auto: tr('screen_auto'), hdr: tr('screen_hdr'), sdr: tr('screen_sdr') } },
            { name: tr('set_screen'), description: tr('set_screen_d') },
            { onChange: reevaluate });
        add({ name: 'adaptive_subs_ffp', type: 'trigger', default: true },
            { name: tr('set_ffp'), description: tr('set_ffp_d') });
        add({ name: 'adaptive_subs_hls', type: 'trigger', default: true },
            { name: tr('set_hls'), description: tr('set_hls_d') });
        if (webos) {
            add({ name: 'adaptive_subs_webos_probe', type: 'trigger', default: false },
                { name: tr('set_probe'), description: tr('set_probe_d') });
        }

        title('adaptive_subs_t_look', tr('t_look'));
        add({ name: 'adaptive_subs_hdr_style', type: 'select', default: DEFAULTS.adaptive_subs_hdr_style,
            values: { dim: tr('style_dim'), color: tr('style_color') } },
            { name: tr('set_style'), description: tr('set_style_d') },
            { onChange: refresh });
        add({ name: 'adaptive_subs_hdr_tone', type: 'select', default: DEFAULTS.adaptive_subs_hdr_tone, values: tones },
            { name: tr('set_tone'), description: tr('set_tone_d') },
            { onChange: refresh });
        add({ name: 'adaptive_subs_level_hdr10', type: 'select', default: 'same', values: levels },
            { name: tr('set_hdr10'), description: tr('set_hdr10_d') }, { onChange: refresh });
        add({ name: 'adaptive_subs_level_dv', type: 'select', default: 'same', values: levels },
            { name: tr('set_dv') }, { onChange: refresh });
        add({ name: 'adaptive_subs_level_hlg', type: 'select', default: 'same', values: levels },
            { name: tr('set_hlg') }, { onChange: refresh });
        add({ name: 'adaptive_subs_ass', type: 'trigger', default: true },
            { name: tr('set_ass'), description: tr('set_ass_d') },
            { onChange: refresh });
        if (webos) {
            add({ name: 'adaptive_subs_webos_opacity', type: 'select', default: DEFAULTS.adaptive_subs_webos_opacity,
                values: { '191': tr('op_191'), '153': tr('op_153'), '128': tr('op_128'), '102': tr('op_102'), '77': tr('op_77') } },
                { name: tr('set_webos_op'), description: tr('set_webos_op_d') },
                { onChange: function () { applyWebos(); } });
        }

        title('adaptive_subs_t_sdr', tr('t_sdr'));
        add({ name: 'adaptive_subs_sdr_color', type: 'select', default: DEFAULTS.adaptive_subs_sdr_color,
            values: { lampa: tr('keep_lampa'), '#ffffff': tr('color_white'), '#f0f0f0': tr('color_soft'), '#fff4c2': tr('color_warm') } },
            { name: tr('set_color'), description: tr('set_color_d') },
            { onChange: refresh });
        add({ name: 'adaptive_subs_size', type: 'select', default: DEFAULTS.adaptive_subs_size,
            values: { 'default': tr('keep_lampa'), '3.2vh': tr('size_xs'), '3.8vh': tr('size_s'), '4.4vh': tr('size_m'), '5vh': tr('size_l'), '5.8vh': tr('size_xl') } },
            { name: tr('set_size'), description: tr('set_size_d') },
            { onChange: refresh });
        if (webos) {
            add({ name: 'adaptive_subs_webos_size', type: 'select', default: DEFAULTS.adaptive_subs_webos_size,
                values: { 'default': tr('wsize_keep'), '0': tr('wsize_0'), '1': '1', '2': '2', '3': '3', '4': tr('wsize_4') } },
                { name: tr('set_webos_size') },
                { onChange: function () { applyWebos(); } });
        }

        title('adaptive_subs_t_ctrl', tr('t_ctrl'));
        add({ name: 'adaptive_subs_key', type: 'select', default: DEFAULTS.adaptive_subs_key,
            values: { none: tr('key_none'), red: tr('key_red'), green: tr('key_green'), yellow: tr('key_yellow'), blue: tr('key_blue') } },
            { name: tr('set_key'), description: tr('set_key_d') });
        add({ name: 'adaptive_subs_forget', type: 'button' },
            { name: tr('set_forget'), description: tr('set_forget_d') },
            { onChange: function () {
                try { Lampa.Storage.set(OVERRIDES, {}); } catch (e) {}
                try { Lampa.Noty.show(tr('noty_forgot')); } catch (e) {}
            } });
        add({ name: 'adaptive_subs_notify', type: 'trigger', default: true },
            { name: tr('set_notify'), description: tr('set_notify_d') });
        add({ name: 'adaptive_subs_report', type: 'button' },
            { name: tr('set_report'), description: tr('set_report_d') },
            { onChange: function () { Report.open(); } });
    }


    // ---------- Отчёт для разработчика: всё для разбора проблемы на одном экране ----------
    // Пользователь фотографирует экран и присылает снимок: плагин ничего не отправляет. Адреса серверов, имена файлов
    // и ключи в отчёт не попадают: журнал проходит scrub(), настройки — только значения из списка вариантов
    var REPORT_LOG = 30;
    var REPORT_CSS_ID = 'adaptive-subs-report-style';
    var REPORT_CSS = '.adaptive-subs-report{font-size:1.35em;line-height:1.4;padding-bottom:1em}' +
        '.adaptive-subs-report__hint{opacity:.75;margin-bottom:.3em}.adaptive-subs-report__h{font-weight:700;margin-top:.8em}' +
        '.adaptive-subs-report__l,.adaptive-subs-report__log{white-space:pre-wrap;word-wrap:break-word}' +
        '.adaptive-subs-report__log{font-family:monospace;font-size:.85em;line-height:1.35}';
    var lastPlayback = 0;        // время последнего запуска видео (для «Последнее видео» в отчёте)

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    var Report = {
        stamp: function (t, withDate) {
            var d = new Date(t);
            var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
            return withDate ? pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + ' ' + hm : hm;
        },

        // «Lampa 3.4.4 · webos · webOS · Chrome 108 · 1920×1080»
        device: function () {
            var ua = '', parts = [], m, app = '';
            try { ua = String(navigator.userAgent || ''); } catch (e) {}
            try { app = Lampa.Platform.version('app'); } catch (e) {}
            if (!app) try { app = Lampa.Manifest.app_version; } catch (e) {}
            parts.push('Lampa ' + (app || '?'));
            try { var pl = Lampa.Platform.get(); if (pl) parts.push(String(pl)); } catch (e) {}
            try { if (typeof AndroidJS !== 'undefined' && AndroidJS.appVersion) parts.push('app ' + AndroidJS.appVersion()); } catch (e) {}
            if ((m = ua.match(/Android [\d.]+/))) parts.push(m[0]);
            else if ((m = ua.match(/Tizen [\d.]+/))) parts.push(m[0]);
            else if (/Web0S|webOS/i.test(ua)) parts.push('webOS');
            else if ((m = ua.match(/Windows NT [\d.]+|Mac OS X [\d_]+|CrOS|Linux/))) parts.push(m[0].replace(/_/g, '.'));
            if ((m = ua.match(/(?:Chrome|Chromium)\/(\d+)/))) parts.push('Chrome ' + m[1]);
            else if ((m = ua.match(/Firefox\/(\d+)/))) parts.push('Firefox ' + m[1]);
            else if ((m = ua.match(/AppleWebKit\/([\d.]+)/))) parts.push('WebKit ' + m[1]);
            try {
                var dpr = window.devicePixelRatio;
                if (window.innerWidth > 0) parts.push(window.innerWidth + '\u00d7' + window.innerHeight + (dpr && dpr !== 1 ? ' @' + Math.round(dpr * 100) / 100 + 'x' : ''));
            } catch (e) {}
            return scrub(parts.join(' \u00b7 '));
        },

        // «display: high · HDR decoder: yes · TV: yes · setting: auto»
        screen: function () {
            var s = screenInfo();
            return 'display: ' + (s.range || 'unknown') + ' \u00b7 HDR decoder: ' + (s.decoder === null ? 'unknown' : (s.decoder ? 'yes' : 'no')) +
                ' \u00b7 TV: ' + (s.tv ? 'yes' : 'no') + ' \u00b7 setting: ' + s.mode + (s.blocks ? ' \u00b7 HDR shown as SDR: ' + s.blocks : '') +
                (webosOrigRequest ? ' \u00b7 webOS: Lampa opacity ' + lampaOpacity + ', plugin ' + webosOpacity() : '');
        },

        // «profile: hdr · kind: dv · subtitles 48% · source: ffprobe · detected: dv · manual choice: no»
        last: function () {
            if (!lastPlayback) return tr('report_none');
            var c = current;
            return 'profile: ' + c.profile + ' \u00b7 kind: ' + c.kind + ' \u00b7 subtitles ' + Math.round(c.brightness * 100) + '%' +
                ' \u00b7 source: ' + (c.source || '\u2014') + ' \u00b7 detected: ' + c.detected + (c.screen ? ' \u00b7 shown as SDR: ' + c.screen : '') +
                ' \u00b7 manual choice: ' + (c.key && getOverride(c.key) ? getOverride(c.key) : 'no') + ' \u00b7 ' + this.stamp(lastPlayback, true);
        },

        // Только отличающиеся от значения по умолчанию: «screen: sdr · key: yellow»
        settings: function () {
            var out = [];
            for (var k in DEFAULTS) {
                if (!DEFAULTS.hasOwnProperty(k)) continue;
                var v = opt(k);
                if (String(v) === String(DEFAULTS[k])) continue;
                out.push(k.replace(/^adaptive_subs_/, '') + ': ' + scrub(String(v)));
            }
            return out;
        },

        // [{ c: 'hint' | 'h' | 'l' | 'log', t: текст }]
        lines: function () {
            var out = [], today = new Date(Date.now()).toDateString(), self = this;
            function add(c, t) { out.push({ c: c, t: String(t) }); }
            add('hint', tr('report_hint'));
            add('h', tr('report_device'));
            add('l', 'Adaptive Subtitles ' + VERSION + ' \u00b7 ' + this.device() + ' \u00b7 ' + this.stamp(Date.now(), true));
            add('h', tr('report_screen'));
            add('l', this.screen());
            add('h', tr('report_last'));
            add('l', this.last());
            add('h', tr('report_settings'));
            add('l', this.settings().join(' \u00b7 ') || tr('report_defaults'));
            var list = Journal.last(REPORT_LOG);
            add('h', tr('report_log', { n: list.length }));
            if (!list.length) add('l', tr('report_log_empty'));
            for (var i = 0; i < list.length; i++) add('log', self.stamp(list[i].t, new Date(list[i].t).toDateString() !== today) + ' ' + list[i].m);
            return out;
        },

        open: function () {
            var jq = window.jQuery || window.$;
            if (!jq || !Lampa.Modal || typeof Lampa.Modal.open !== 'function') {
                try { Lampa.Noty.show(tr('report_na')); } catch (e) {}
                return;
            }
            if (!document.getElementById(REPORT_CSS_ID)) {
                var style = document.createElement('style');
                style.id = REPORT_CSS_ID;
                style.textContent = REPORT_CSS;
                document.head.appendChild(style);
            }
            var root = document.createElement('div'), list = this.lines(), prev = 'settings_component';
            root.className = 'adaptive-subs-report';
            for (var i = 0; i < list.length; i++) {
                var el = document.createElement('div');
                el.className = 'adaptive-subs-report__' + list[i].c;
                el.textContent = list[i].t;
                root.appendChild(el);
            }
            try {
                var en = Lampa.Controller.enabled();
                if (en && typeof en.name === 'string' && en.name) prev = en.name;
            } catch (e) {}
            Lampa.Modal.open({
                title: tr('report_title'),
                html: jq(root),
                size: 'large',
                onBack: function () {
                    try { Lampa.Modal.close(); } catch (e) {}
                    try { Lampa.Controller.toggle(prev); } catch (e) {}
                }
            });
        }
    };


    // ---------- Инициализация ----------
    var inited = false;

    function init() {
        if (inited) return;
        inited = true;
        addSettings();
        hookWebos();
        applyStyle();
        Lampa.Player.listener.follow('start', onStart);
        Lampa.Player.listener.follow('destroy', onDestroy);
        bindKey();
        var scr = screenInfo();
        log('v' + VERSION + ' initialized' + (webosOrigRequest ? ' | webOS' : '') + ' | display: ' + (scr.range || 'unknown') +
            ' | HDR decoder: ' + (scr.decoder === null ? 'unknown' : (scr.decoder ? 'yes' : 'no')) + (scr.blocks ? ' | HDR shown as SDR (' + scr.blocks + ')' : ''));
    }

    // Экспорт для других плагинов, отладки и тестов
    window.AdaptiveSubs = {
        version: VERSION,
        detect: detectFromText,
        kind: kindFromText,
        state: current,
        set: function (p) {
            lookupToken++;
            applyKind(p === 'hdr' ? 'hdr' : 'sdr', 'manual');
            announce(false);
        },
        toggle: toggleProfile,
        screen: screenInfo,
        webos: function () { return !!webosOrigRequest; },
        _test: {
            evaluate: evaluate,
            buildCss: buildCss,
            applyKind: applyKind,
            torrServerTarget: torrTarget,
            kindFromStreams: kindFromStreams,
            kindFromHls: kindFromHls,
            kindFromData: kindFromData,
            levelFor: levelFor,
            screenBlocksHdr: screenBlocksHdr,
            keyCodeOf: keyCodeOf,
            resetScreen: function () { hdrDecoder = undefined; },
            toneFor: toneFor,
            overrideKey: overrideKey,
            describeData: describeData,
            getOverride: getOverride,
            setOverride: setOverride,
            sharedFfp: sharedFfp,
            inspectWebos: inspectWebos,
            webosOpacity: webosOpacity,
            applyWebos: applyWebos,
            lampaOpacity: function () { return lampaOpacity; },
            onStart: onStart,
            onDestroy: onDestroy,
            init: init,
            I18n: I18n,
            I18N: I18N,
            I18N_LANGS: I18N_LANGS,
            tr: tr,
            Journal: Journal,
            Report: Report,
            scrub: scrub
        }
    };

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e && e.type === 'ready') init(); });
})();
