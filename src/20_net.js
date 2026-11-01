
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
