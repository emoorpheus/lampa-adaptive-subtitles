
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
        try { Lampa.Noty.show(text); } catch (e) { log(text); }
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
        promise.then(function (kind) { self.offer(kind, source); }, function () {}).then(function () {
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

    function bindKey() {
        var kp = Lampa.Keypad && Lampa.Keypad.listener;
        if (!kp || typeof kp.follow !== 'function') return;
        kp.follow('keydown', function (e) {
            var want = KEY_CODES[opt('adaptive_subs_key')];
            if (!want || !e || keyCodeOf(e.code, e.event) !== want || !playerActive()) return;
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
        var sess = ++session;
        try { evaluate(data || playdata(), true); } catch (e) { log(e && e.message); }
        watchMedia(sess);
    }

    function onDestroy() {
        lookupToken++;
        session++;
        Resolver.active = null;
    }
