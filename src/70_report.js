
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
