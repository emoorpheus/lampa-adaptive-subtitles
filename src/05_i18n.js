
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
