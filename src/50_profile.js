
    // ---------- Профиль: применение, уведомление, событие для других плагинов ----------
    var SOURCE_NAMES = {
        name: 'по названию', torrserver: 'по раздаче TorrServer', parser: 'по данным раздачи', ffprobe: 'по файлу',
        hls: 'по потоку HLS', webos: 'по данным webOS', manual: 'вручную', override: 'ваш выбор',
        display: 'экран без HDR', 'default': 'признаков HDR нет'
    };
    // Чем выше, тем надёжнее; более слабый источник не перебивает уже найденное
    var PRIO = { 'default': 0, name: 1, torrserver: 2, webos: 3, hls: 4, parser: 5, ffprobe: 6, override: 8, manual: 9 };

    // Экран сам не показывает HDR (эксперимент): только если браузер знает признак dynamic-range
    function displaySdr() {
        try {
            if (!window.matchMedia) return false;
            return !window.matchMedia('(dynamic-range: high)').matches && window.matchMedia('(dynamic-range: standard)').matches;
        } catch (e) { return false; }
    }

    function emit() {
        var detail = { type: 'profile', profile: current.profile, kind: current.kind, brightness: current.brightness, source: current.source };
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
        var before = current.profile + '|' + current.kind + '|' + current.brightness;
        var hdr = isHdrKind(kind);
        current.kind = kind || 'sdr';
        current.source = source || '';
        current.profile = hdr ? 'hdr' : 'sdr';
        if (source !== 'manual' && source !== 'override') current.detected = current.kind;
        if (hdr && source !== 'manual' && source !== 'override' && flag('adaptive_subs_display') && displaySdr()) {
            current.profile = 'sdr';
            current.source = 'display';
        }
        current.brightness = current.profile === 'hdr' ? levelFor(current.kind) : 1;
        applyStyle();
        applyWebos();
        if (before !== current.profile + '|' + current.kind + '|' + current.brightness) emit();
    }

    function announce(refined, extra) {
        if (!flag('adaptive_subs_notify')) return;
        var hdr = current.profile === 'hdr';
        var text = (refined ? 'Субтитры уточнены: ' : 'Субтитры: ') +
            (hdr ? (KIND_NAMES[current.kind] || 'HDR') + ' — затемнённые, ' + Math.round(current.brightness * 100) + '%' : 'SDR — обычные');
        var why = extra || SOURCE_NAMES[current.source];
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
        announce(false, key ? 'запомнено для ' + (key.charAt(0) === 'h' ? 'раздачи' : 'сериала или фильма') : 'вручную');
        return next;
    }

    var KEY_CODES = { red: [403], green: [404], yellow: [405], blue: [406] };

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
            var codes = KEY_CODES[opt('adaptive_subs_key')];
            if (!codes || !e || codes.indexOf(parseInt(e.code, 10)) === -1 || !playerActive()) return;
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
