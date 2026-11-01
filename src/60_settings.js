
    // ---------- Меню настроек ----------
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        var webos = isWebos();
        var C = 'adaptive_subs';

        Lampa.SettingsApi.addComponent({
            component: C,
            name: 'Адаптивные субтитры',
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
        var levels = { same: 'Как основной уровень' };
        for (var t in TONE_NAMES) if (TONE_NAMES.hasOwnProperty(t)) levels[t] = TONE_NAMES[t];

        title('adaptive_subs_t_detect', 'Определение HDR');
        add({ name: 'adaptive_subs_mode', type: 'select', default: DEFAULTS.adaptive_subs_mode,
            values: { auto: 'Авто (по файлу и релизу)', hdr: 'Всегда HDR (приглушённые)', sdr: 'Всегда SDR (обычные)' } },
            { name: 'Режим', description: 'Авто: технические данные файла (ffprobe), поток HLS, затем слова HDR / DV / Dolby Vision / HDR10 / HLG в названии файла и раздачи' },
            { onChange: reevaluate });
        add({ name: 'adaptive_subs_ffp', type: 'trigger', default: true },
            { name: 'Точно по файлу через TorrServer', description: 'ffprobe на TorrServer (/ffp): различает HDR10, Dolby Vision и HLG. Нужен TorrServer с ffprobe' });
        add({ name: 'adaptive_subs_hls', type: 'trigger', default: true },
            { name: 'По потоку HLS (онлайн)', description: 'Признак VIDEO-RANGE (SDR / HLG / PQ) в плейлисте m3u8, если источник его указывает' });
        add({ name: 'adaptive_subs_display', type: 'trigger', default: false },
            { name: 'Учитывать HDR экрана (эксперимент)', description: 'Если браузер сообщает, что экран сейчас без HDR (dynamic-range), не затемнять. На ТВ не проверено' });
        if (webos) {
            add({ name: 'adaptive_subs_webos_probe', type: 'trigger', default: false },
                { name: 'Сведения webOS о видео (эксперимент)', description: 'Записывать в журнал, что телевизор сообщает о видео, и использовать явный признак HDR, если он есть. Не проверено' });
        }

        title('adaptive_subs_t_look', 'Вид в HDR');
        add({ name: 'adaptive_subs_hdr_style', type: 'select', default: DEFAULTS.adaptive_subs_hdr_style,
            values: { dim: 'Затемнять (цвета сохраняются)', color: 'Перекрашивать в серый' } },
            { name: 'HDR: способ', description: 'Затемнение яркостью оставляет цветные надписи цветными. Субтитры WebVTT, которые рисует сам браузер, всегда перекрашиваются' },
            { onChange: refresh });
        add({ name: 'adaptive_subs_hdr_tone', type: 'select', default: DEFAULTS.adaptive_subs_hdr_tone, values: TONE_NAMES },
            { name: 'HDR: яркость субтитров', description: 'Основной уровень. В режиме «перекрашивать» — серый той же яркости' },
            { onChange: refresh });
        add({ name: 'adaptive_subs_level_hdr10', type: 'select', default: 'same', values: levels },
            { name: 'HDR10: яркость', description: 'Если тип HDR известен' }, { onChange: refresh });
        add({ name: 'adaptive_subs_level_dv', type: 'select', default: 'same', values: levels },
            { name: 'Dolby Vision: яркость' }, { onChange: refresh });
        add({ name: 'adaptive_subs_level_hlg', type: 'select', default: 'same', values: levels },
            { name: 'HLG: яркость' }, { onChange: refresh });
        add({ name: 'adaptive_subs_ass', type: 'trigger', default: true },
            { name: 'Затемнять субтитры ASS', description: 'Оформление ASS (цвета, караоке) сохраняется. Нагрузка на слабые ТВ не проверялась' },
            { onChange: refresh });
        if (webos) {
            add({ name: 'adaptive_subs_webos_opacity', type: 'select', default: DEFAULTS.adaptive_subs_webos_opacity,
                values: { '191': '75% — чуть темнее', '153': '60% — серые', '128': '50% — тёмно-серые', '102': '40% — тёмные', '77': '30% — очень тёмные' } },
                { name: 'HDR: яркость встроенных субтитров (LG webOS)', description: 'Для субтитров внутри MKV, которые рисует сам телевизор. Доля от яркости, выбранной в Lampa (кнопка 9). В SDR — как в Lampa' },
                { onChange: function () { applyWebos(); } });
        }

        title('adaptive_subs_t_sdr', 'SDR и размер');
        add({ name: 'adaptive_subs_sdr_color', type: 'select', default: DEFAULTS.adaptive_subs_sdr_color,
            values: { lampa: 'Не менять (как в Lampa)', '#ffffff': 'Белый', '#f0f0f0': 'Мягкий белый', '#fff4c2': 'Тёплый жёлтый' } },
            { name: 'SDR: цвет внешних субтитров', description: 'По умолчанию стиль Lampa не меняется' },
            { onChange: refresh });
        add({ name: 'adaptive_subs_size', type: 'select', default: DEFAULTS.adaptive_subs_size,
            values: { 'default': 'Не менять (как в Lampa)', '3.2vh': 'Очень маленький', '3.8vh': 'Маленький', '4.4vh': 'Средний', '5vh': 'Крупный', '5.8vh': 'Очень крупный' } },
            { name: 'Размер внешних субтитров', description: 'Одинаковый для SDR и HDR' },
            { onChange: refresh });
        if (webos) {
            add({ name: 'adaptive_subs_webos_size', type: 'select', default: DEFAULTS.adaptive_subs_webos_size,
                values: { 'default': 'Не менять (красная кнопка пульта)', '0': '0 — самый маленький', '1': '1', '2': '2', '3': '3', '4': '4 — самый большой' } },
                { name: 'Размер встроенных субтитров (LG webOS)' },
                { onChange: function () { applyWebos(); } });
        }

        title('adaptive_subs_t_ctrl', 'Управление');
        add({ name: 'adaptive_subs_key', type: 'select', default: DEFAULTS.adaptive_subs_key,
            values: { none: 'Нет', red: 'Красная (403)', green: 'Зелёная (404)', yellow: 'Жёлтая (405)', blue: 'Синяя (406)' } },
            { name: 'Клавиша HDR/SDR в плеере', description: 'Переключает профиль, если плагин ошибся, и запоминает выбор для раздачи (или сериала). ' +
                'На LG webOS цветные кнопки также управляют встроенными субтитрами Lampa; не назначайте ту же клавишу, что в плагине «Пропуск заставок»' });
        add({ name: 'adaptive_subs_forget', type: 'button' },
            { name: 'Забыть ручные выборы HDR/SDR', description: 'Снова определять автоматически' },
            { onChange: function () {
                try { Lampa.Storage.set(OVERRIDES, {}); } catch (e) {}
                try { Lampa.Noty.show('Ручные выборы HDR/SDR забыты'); } catch (e) {}
            } });
        add({ name: 'adaptive_subs_notify', type: 'trigger', default: true },
            { name: 'Уведомление при старте', description: 'Какой профиль включился и почему; второе — только если точная проверка его сменила' });
    }
