
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
