'use strict';
// adaptive_subs в «браузере»: определение HDR, стили, уведомления, TorrServer, HLS, webOS, клавиша, события
const assert = require('assert');
const { createEnv, test, run, PKG } = require('./lib/harness');

const J = (x) => JSON.parse(JSON.stringify(x));
const H = 'abcdef0123456789abcdef0123456789abcdef01';
const TS = 'http://torrserver.test:8090';
// карточка TMDB (как Lampa передаёт в плеер)
const GOT = { id: 1399, name: 'Game of Thrones', original_name: 'Game of Thrones', first_air_date: '2011-04-17', number_of_seasons: 8 };
const TS_SETTINGS = { torrserver_url: TS, torrserver_auth: 'true', torrserver_login: 'user', torrserver_password: 'pa:ss' };

// ffprobe-потоки в формате ffprobe -show_streams (как отдаёт TorrServer /ffp через go-ffprobe)
const V = {
    hdr10: { index: 0, codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p10le', color_space: 'bt2020nc', color_transfer: 'smpte2084', color_primaries: 'bt2020',
        side_data_list: [{ side_data_type: 'Mastering display metadata', red_x: '17/25', max_luminance: '10000000/10000' }, { side_data_type: 'Content light level metadata', max_content: 1000, max_average: 400 }] },
    dvP8: { index: 0, codec_type: 'video', codec_name: 'hevc', codec_tag_string: '[0][0][0][0]', pix_fmt: 'yuv420p10le', color_transfer: 'smpte2084',
        side_data_list: [{ side_data_type: 'DOVI configuration record', dv_version_major: 1, dv_profile: 8, dv_bl_signal_compatibility_id: 1 }] },
    dvMp4: { index: 0, codec_type: 'video', codec_name: 'hevc', codec_tag_string: 'dvh1', pix_fmt: 'yuv420p10le' },
    hlg: { index: 0, codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p10le', color_transfer: 'arib-std-b67', color_primaries: 'bt2020' },
    sdr: { index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', color_transfer: 'bt709', color_primaries: 'bt709' },
    sdr8: { index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
    unk10: { index: 0, codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p10le' },
    cover: { index: 3, codec_type: 'video', codec_name: 'mjpeg', pix_fmt: 'yuvj444p', disposition: { attached_pic: 1 } },
    audio: { index: 1, codec_type: 'audio', codec_name: 'eac3', channels: 6 }
};

function aenv(o) {
    o = o || {};
    // телевизор LG: Lampa ставит платформу webos (core/platform.js), webOSTV.js — webOS.platform.tv = true
    if (o.webos && o.webos !== 'lib-only') o = Object.assign({ platform: 'webos' }, o);
    const env = createEnv(o);
    env.T.playerDom();
    if (o.settings) for (const k of Object.keys(o.settings)) env.setStorage(k, o.settings[k]);
    if (o.webos) env.run(`(function () {
        var calls = [];
        window.webOS = { platform: ${o.webos === 'lib-only' ? '{ chrome: 120 }' : '{ tv: true }'}, service: { request: function (uri, params) {
            calls.push({ uri: uri, method: params.method, parameters: JSON.parse(JSON.stringify(params.parameters || {})), params: params });
            return {};
        } } };
        window.__webosCalls = calls;
        window.__webosOrig = window.webOS.service.request;
    })()`);
    if (o.display) env.bridge.media = o.display;
    if (o.pre) o.pre(env);                          // до загрузки плагина: например, чужая реализация window.__lampa_ffp__
    env.load('adaptive');
    return env;
}

const calls = (env, method) => J(env.W.__webosCalls.filter((c) => !method || c.method === method).map((c) => ({ method: c.method, p: c.parameters })));
const tsUrl = (name, index) => TS + '/stream/' + encodeURIComponent(name) + '?link=' + H + '&index=' + (index || 1) + '&play';
// запуск, как у Lampa: create -> start (плейлист не обязателен)
function start(env, data, o) {
    env.T.play(env.clone(data), Object.assign({ position: 0 }, o || {}));
}
function ffpRoute(env, streams, delay, extra) {
    env.on(TS + '/ffp/' + H + '/', { status: 200, body: { streams, format: { duration: '3600.000000' }, chapters: [] }, delay: delay || 100 }, Object.assign({ cors: '*' }, extra || {}));
}

// ---------------- признаки ----------------

test('название: DV / HDR10(+) / HLG / HDR / SDR по словам; без ложных срабатываний (hdrezka, DVDRip, Adventure)', async () => {
    const env = aenv();
    const A = env.A;
    const cases = [
        ['Dune.Part.Two.2024.2160p.UHD.BluRay.DV.HDR10.HEVC.mkv', 'dv'],
        ['Movie 2160p Dolby Vision', 'dv'],
        ['Show.S01E01.2160p.WEB-DL.DoVi.HDR.H265', 'dv'],
        ['Planet.Earth.2160p.HLG.mkv', 'hlg'],
        ['Film.2160p.HDR10+.mkv', 'hdr10'],
        ['Film.2160p.HDR10Plus.mkv', 'hdr10'],
        ['[4K HDR] Фильм', 'hdr'],
        ['Film.1080p.SDR.mkv', 'sdr'],
        ['Movie%20Dolby%20Vision.mkv', 'dv'],
        ['https://hdrezka.ag/films/123-film.html', null],
        ['Film.DVDRip.avi', null],
        ['Adventure.Time.S01E01.mkv', null],
        ['Movie.2160p.mkv', null]
    ];
    for (const [text, want] of cases) assert.strictEqual(A.kind(text), want, text);
    assert.strictEqual(A.detect('Film.2160p.DV.mkv'), 'hdr', 'совместимость с v3: hdr | sdr');
    // данные плеера: первая строка с признаком решает; качество-объект — по ключам
    assert.strictEqual(A._test.kindFromData(env.clone({ title: 'Серия 1', quality: { '2160p HDR': 'u1', '1080p': 'u2' } })), 'hdr');
    assert.strictEqual(A._test.kindFromData(env.clone({ title: 'Film.HLG.mkv', url: 'https://x/Film.DV.mkv' })), 'hlg');
});

test('ffprobe: HDR10 (smpte2084), Dolby Vision (DOVI / dvh1), HLG (arib-std-b67), SDR; обложка не считается видео', async () => {
    const env = aenv();
    const k = (streams) => env.A._test.kindFromStreams(env.clone(streams));
    assert.strictEqual(k([V.hdr10, V.audio]), 'hdr10');
    assert.strictEqual(k([V.dvP8]), 'dv', 'профиль 8 с базовым слоем HDR10 — всё равно Dolby Vision');
    assert.strictEqual(k([V.dvMp4]), 'dv');
    assert.strictEqual(k([V.hlg]), 'hlg');
    assert.strictEqual(k([V.sdr]), 'sdr');
    assert.strictEqual(k([V.sdr8]), 'sdr', '8 бит без сведений — SDR');
    assert.strictEqual(k([V.unk10]), null, '10 бит без сведений — неизвестно');
    assert.strictEqual(k([V.cover, V.hdr10]), 'hdr10');
    assert.strictEqual(k([V.audio]), null);
    assert.strictEqual(k({ streams: [V.hlg] }), 'hlg', 'объект ответа /ffp целиком');
    assert.strictEqual(k(null), null);
});

test('HLS: VIDEO-RANGE и CODECS мастер-плейлиста', async () => {
    const env = aenv();
    const k = (t) => env.A._test.kindFromHls(t);
    const m = (...v) => '#EXTM3U\n#EXT-X-VERSION:7\n' + v.map((a, i) => '#EXT-X-STREAM-INF:BANDWIDTH=' + (1000 + i) + ',' + a + '\nv' + i + '.m3u8').join('\n') + '\n';
    assert.strictEqual(k(m('RESOLUTION=3840x2160,VIDEO-RANGE=PQ,CODECS="hvc1.2.4.L153.B0,mp4a.40.2"')), 'hdr10');
    assert.strictEqual(k(m('VIDEO-RANGE=HLG', 'VIDEO-RANGE=HLG')), 'hlg');
    assert.strictEqual(k(m('VIDEO-RANGE=SDR')), 'sdr');
    assert.strictEqual(k(m('VIDEO-RANGE=SDR', 'VIDEO-RANGE=PQ')), null, 'есть и SDR, и HDR — что выберет плеер, неизвестно');
    assert.strictEqual(k(m('VIDEO-RANGE=PQ', 'VIDEO-RANGE=HLG')), 'hdr');
    assert.strictEqual(k(m('VIDEO-RANGE=PQ,CODECS="dvh1.05.06,ec-3"')), 'dv');
    assert.strictEqual(k(m('RESOLUTION=1920x1080')), null, 'без VIDEO-RANGE — неизвестно');
    assert.strictEqual(k('#EXTM3U\n#EXTINF:6.0,\nseg0.ts\n'), null, 'медиаплейлист без вариантов');
    assert.strictEqual(k('<html>'), null);
});

// ---------------- стили ----------------

test('стили HDR: затемнение яркостью (цвета сохраняются), ::cue — цвет, ASS и JASSUB; перекраска; SDR как в Lampa; размер', async () => {
    const env = aenv();
    const css = (st) => env.A._test.buildCss(env.clone(st));
    const hdr = css({ profile: 'hdr', brightness: 0.48 });
    assert.ok(hdr.includes('.player-video__subtitles-text{filter:brightness(0.48) !important;-webkit-filter:brightness(0.48) !important;}'));
    assert.ok(!/subtitles-text[^{]*\{color/.test(hdr), 'в режиме «затемнять» цвет текста не трогаем');
    assert.ok(hdr.includes('video::cue{color:#7a7a7a !important;'), '::cue — серый той же яркости');
    assert.ok(hdr.includes('.player-video__ass, .JASSUB{filter:brightness(0.48) !important;'));
    assert.strictEqual(css({ profile: 'sdr', brightness: 1 }), '', 'SDR по умолчанию — стиль Lampa не меняется');
    env.setStorage('adaptive_subs_ass', 'false');
    assert.ok(!css({ profile: 'hdr', brightness: 0.48 }).includes('JASSUB'));
    env.setStorage('adaptive_subs_hdr_style', 'color');
    assert.ok(css({ profile: 'hdr', brightness: 0.4 }).includes('.player-video__subtitles-text, .player-video__subtitles-text *{color:#666666 !important;'));
    env.setStorage('adaptive_subs_sdr_color', '#fff4c2');
    env.setStorage('adaptive_subs_size', '4.4vh');
    const sdr = css({ profile: 'sdr', brightness: 1 });
    assert.ok(sdr.includes('{color:#fff4c2 !important;') && sdr.includes('video::cue{color:#fff4c2'));
    assert.ok(sdr.includes('.player-video__subtitles-text{font-size:4.4vh !important;') && sdr.includes('video::cue{font-size:4.4vh'));
    assert.strictEqual(env.A._test.toneFor(0.48), '#7a7a7a');
});

test('уровни: свои для HDR10 / Dolby Vision / HLG, если заданы; иначе основной; применяются к стилю', async () => {
    const env = aenv({ settings: { adaptive_subs_hdr_tone: '#8a8a8a', adaptive_subs_level_dv: '#555555', adaptive_subs_level_hlg: '#9a9a9a' } });
    const L = env.A._test.levelFor;
    assert.deepStrictEqual(['hdr', 'hdr10', 'dv', 'hlg', 'sdr'].map(L), [0.54, 0.54, 0.33, 0.6, 0.54]);
    start(env, { title: 'Film.2160p.DV.mkv', url: 'https://cdn.example/film.mp4' });
    await env.advance(10);
    assert.deepStrictEqual(J(env.A.state), Object.assign({}, J(env.A.state), { profile: 'hdr', kind: 'dv', brightness: 0.33, source: 'name' }));
    assert.ok(env.css('adaptive-subs-style').includes('brightness(0.33)'));
});

// ---------------- запуск: уведомления и уточнение ----------------

test('одно уведомление после быстрых источников; второе — только если точная проверка сменила HDR <-> SDR', async () => {
    // 1) ffprobe ответил быстро (до 1,5 с) — одно уведомление сразу с точным типом
    let env = aenv({ settings: TS_SETTINGS });
    ffpRoute(env, [V.hdr10], 300);
    start(env, { title: 'Film.2160p.HDR.mkv', url: tsUrl('Film.2160p.HDR.mkv'), torrent_hash: H });
    await env.advance(3000);
    assert.deepStrictEqual(env.noty(), ['Субтитры: HDR10 — затемнённые, 48% (по файлу)']);
    assert.strictEqual(env.requests('/ffp/')[0].headers.Authorization, 'Basic ' + Buffer.from('user:pa:ss').toString('base64'));
    // 2) ffprobe позже 1,5 с и сменил HDR на SDR — уведомление «уточнены»
    env = aenv({ settings: TS_SETTINGS });
    ffpRoute(env, [V.sdr], 4000);
    start(env, { title: 'Film.2160p.HDR.mkv', url: tsUrl('Film.2160p.HDR.mkv'), torrent_hash: H });
    await env.advance(1600);
    assert.deepStrictEqual(env.noty(), ['Субтитры: HDR — затемнённые, 48% (по названию)']);
    await env.advance(3000);
    assert.deepStrictEqual(env.noty().slice(1), ['Субтитры уточнены: SDR — обычные (по файлу)']);
    assert.strictEqual(env.css('adaptive-subs-style'), '');
    // 3) ffprobe позже и тоже HDR (уточнил тип) — без второго уведомления
    env = aenv({ settings: TS_SETTINGS });
    ffpRoute(env, [V.dvP8], 4000);
    start(env, { title: 'Film.2160p.HDR.mkv', url: tsUrl('Film.2160p.HDR.mkv'), torrent_hash: H });
    await env.advance(6000);
    assert.strictEqual(env.noty().length, 1);
    assert.strictEqual(env.A.state.kind, 'dv');
    // 4) уведомления выключены — тишина, но профиль применяется
    env = aenv({ settings: { adaptive_subs_notify: 'false' } });
    start(env, { title: 'Film.2160p.HDR.mkv', url: 'https://cdn.example/film.mp4' });
    await env.advance(2000);
    assert.deepStrictEqual(env.noty(), []);
    assert.strictEqual(env.A.state.profile, 'hdr');
});

test('TorrServer: в имени файла признаков нет — название раздачи (POST /torrents, авторизация как в Lampa); кэш', async () => {
    const env = aenv({ settings: TS_SETTINGS });
    env.on(TS + '/ffp/', { status: 404, text: 'not found', delay: 50 }, { cors: '*' });
    env.on(TS + '/torrents', (req) => ({ status: 200, body: { hash: H, title: 'Сериал / Show S01 2160p WEB-DL DV HDR', name: 'Show.S01.2160p' }, delay: 100 }), { cors: '*', method: 'POST' });
    start(env, { title: 'Show.S01E01.mkv', url: tsUrl('Show.S01E01.mkv', 2), torrent_hash: H });
    await env.advance(2000);
    const r = env.requests(TS + '/torrents');
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].method, 'POST');
    assert.deepStrictEqual(JSON.parse(r[0].body), { action: 'get', hash: H });
    assert.strictEqual(r[0].headers['Content-Type'], 'application/json');
    assert.ok(r[0].headers.Authorization.startsWith('Basic '));
    assert.deepStrictEqual(env.noty(), ['Субтитры: Dolby Vision — затемнённые, 48% (по раздаче TorrServer)']);
    // следующая серия той же раздачи — название из кэша, без запроса
    env.T.destroy();
    start(env, { title: 'Show.S01E02.mkv', url: tsUrl('Show.S01E02.mkv', 3), torrent_hash: H });
    await env.advance(2000);
    assert.strictEqual(env.requests(TS + '/torrents').length, 1);
    assert.strictEqual(env.A.state.kind, 'dv');
    // GStreamer-адрес (/gst/<hash>/master.m3u8?index=) — тоже TorrServer, HLS не запрашиваем
    assert.deepStrictEqual(J(env.A._test.torrServerTarget(env.clone({ url: TS + '/gst/' + H + '/master.m3u8?index=4&audio=0' }))), { base: TS, hash: H, index: 4, key: H });
    // авторизация только для адреса TorrServer из настроек
    env.on('http://torrserver2.test:8090/ffp/', { status: 200, body: { streams: [V.sdr] } }, { cors: '*' });
    env.T.destroy();
    start(env, { title: 'x.mkv', url: 'http://torrserver2.test:8090/stream/x.mkv?link=' + H + '&index=1&play' });
    await env.advance(500);
    assert.strictEqual(env.requests('torrserver2.test:8090/ffp/')[0].headers.Authorization, undefined);
});

test('данные раздачи от парсера (data.ffprobe, как interaction/torrent.js) — сразу точный тип, /ffp не нужен', async () => {
    const env = aenv({ settings: TS_SETTINGS });
    start(env, { title: 'Film.mkv', url: tsUrl('Film.mkv'), torrent_hash: H, ffprobe: [V.audio, V.hlg] });
    await env.advance(2000);
    assert.strictEqual(env.requests('/ffp/').length, 0);
    assert.strictEqual(env.requests('/torrents').length, 0);
    assert.deepStrictEqual(env.noty(), ['Субтитры: HLG — затемнённые, 48% (по данным раздачи)']);
});

test('общий ffprobe (window.__lampa_ffp__ v1): другой плагин во время запроса получает тот же ответ — один /ffp на файл', async () => {
    const env = aenv({ settings: TS_SETTINGS });
    ffpRoute(env, [V.hdr10], 400);
    start(env, { title: 'GoT.S01E01.mkv', url: tsUrl('GoT.S01E01.mkv'), torrent_hash: H });
    await env.advance(100);
    const ffp = env.W.__lampa_ffp__;
    assert.strictEqual(ffp.v, 1);
    // так запрашивает другой плагин (например, Skip Intro — главы MKV): адрес TorrServer, hash, индекс файла, авторизация
    let other = null;
    ffp.get(TS, H.toUpperCase(), 1, null, 30000).then((r) => { other = r; });
    await env.advance(2000);
    assert.strictEqual(env.requests('/ffp/').length, 1);
    assert.strictEqual(env.A.state.kind, 'hdr10');
    assert.ok(other && other.status === 200, JSON.stringify(other));
    assert.strictEqual(other.json.streams[0].color_transfer, 'smpte2084');
});

test('общий ffprobe: уже установленную реализацию v1 (другого плагина) не заменяет и использует; авторизация TorrServer передаётся', async () => {
    let stub = null;
    const env = aenv({ settings: TS_SETTINGS, pre: (e) => {
        e.run(`window.__lampa_ffp__ = { v: 1, calls: [], get: function (base, hash, index, auth) {
            this.calls.push([base, hash, index, auth]);
            return Promise.resolve({ status: 200, json: { streams: [${JSON.stringify(V.hlg)}], format: { duration: '3600' }, chapters: [] } });
        } };`);
        stub = e.W.__lampa_ffp__;
    } });
    start(env, { title: 'Film.mkv', url: tsUrl('Film.mkv', 2), torrent_hash: H });
    await env.advance(2000);
    assert.strictEqual(env.W.__lampa_ffp__, stub, 'объект не заменён');
    const calls = J(stub.calls);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0].slice(0, 3), [TS, H, 2]);
    assert.ok(/^Basic /.test(calls[0][3]), 'авторизация TorrServer: ' + calls[0][3]);
    assert.strictEqual(env.requests('/ffp/').length, 0, 'свой запрос не отправлен');
    assert.strictEqual(env.A.state.kind, 'hlg');
});

test('HLS онлайн: VIDEO-RANGE из мастер-плейлиста; повтор — из кэша; без CORS — по названию', async () => {
    const env = aenv();
    const m3u = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=20000000,RESOLUTION=3840x2160,VIDEO-RANGE=PQ\n2160.m3u8\n';
    env.on('https://cdn.example/hdr/master.m3u8', { status: 200, text: m3u, delay: 200 }, { cors: '*' });
    env.on('https://nocors.example/', { status: 200, text: m3u, delay: 50 }, { cors: 'https://other.example' });
    start(env, { title: 'Фильм', url: 'https://cdn.example/hdr/master.m3u8' });
    await env.advance(2000);
    assert.deepStrictEqual(env.noty(), ['Субтитры: HDR10 — затемнённые, 48% (по потоку HLS)']);
    env.T.destroy();
    start(env, { title: 'Фильм', url: 'https://cdn.example/hdr/master.m3u8' });
    await env.advance(2000);
    assert.strictEqual(env.requests('master.m3u8').length, 1, 'кэш');
    env.T.destroy();
    start(env, { title: 'Film.HDR', url: 'https://nocors.example/master.m3u8' });
    await env.advance(2000);
    assert.strictEqual(env.noty().pop(), 'Субтитры: HDR — затемнённые, 48% (по названию)');
    // настройка выключена — плейлист не запрашиваем
    env.setStorage('adaptive_subs_hls', 'false');
    env.T.destroy();
    start(env, { title: 'Фильм', url: 'https://cdn.example/plain/master.m3u8' });
    await env.advance(2000);
    assert.strictEqual(env.requests('/plain/master.m3u8').length, 0);
    assert.strictEqual(env.noty().pop(), 'Субтитры: SDR — обычные (признаков HDR нет)');
});

test('режим «Всегда HDR» / «Всегда SDR» — без запросов; смена уровня в настройках применяется сразу', async () => {
    const env = aenv({ settings: Object.assign({ adaptive_subs_mode: 'hdr' }, TS_SETTINGS) });
    start(env, { title: 'Film.1080p.SDR.mkv', url: tsUrl('Film.mkv'), torrent_hash: H });
    await env.advance(2000);
    assert.strictEqual(env.net.requests.length, 0);
    assert.deepStrictEqual(env.noty(), ['Субтитры: HDR — затемнённые, 48% (вручную)']);
    const tone = env.L.SettingsApi.params.find((p) => p.param.name === 'adaptive_subs_hdr_tone');
    env.setStorage('adaptive_subs_hdr_tone', '#555555');
    tone.onChange('#555555');
    assert.ok(env.css('adaptive-subs-style').includes('brightness(0.33)'));
});

// ---------------- ручной выбор ----------------

test('клавиша HDR/SDR: только в плеере; выбор запоминается для раздачи (h:) или сериала (t:, у не-TMDB — «источник-id»); «Забыть»', async () => {
    const env = aenv({ settings: Object.assign({ adaptive_subs_key: 'blue' }, TS_SETTINGS) });
    env.on(TS + '/ffp/', { status: 404, text: '' }, { cors: '*' });
    env.on(TS + '/torrents', { status: 200, body: { title: 'Film 1080p', name: 'Film' } }, { cors: '*', method: 'POST' });
    start(env, { title: 'Film.mkv', url: tsUrl('Film.mkv'), torrent_hash: H, card: { id: 27205, title: 'Inception' } });
    await env.advance(2000);
    assert.strictEqual(env.A.state.profile, 'sdr');
    env.L.Controller._name = 'select';                 // открыто меню — клавиша не наша
    assert.strictEqual(env.T.key(406, 'keydown'), false);
    env.L.Controller._name = 'player';
    assert.strictEqual(env.T.key(406, 'keydown'), true, 'в плеере клавишу забрали у Lampa');
    assert.deepStrictEqual(env.log.lampaKeys, ['keydown:406']);
    assert.strictEqual(env.A.state.profile, 'hdr');
    assert.strictEqual(env.noty().pop(), 'Субтитры: HDR — затемнённые, 48% (запомнено для раздачи)');
    assert.deepStrictEqual(Object.keys(J(env.L.Storage.get('adaptive_subs_overrides'))), ['h:' + H]);
    // та же раздача снова — ваш выбор, без запросов
    env.T.destroy();
    const before = env.net.requests.length;
    start(env, { title: 'Film.mkv', url: tsUrl('Film.mkv'), torrent_hash: H });
    await env.advance(2000);
    assert.strictEqual(env.net.requests.length, before);
    assert.strictEqual(env.noty().pop(), 'Субтитры: HDR — затемнённые, 48% (ваш выбор)');
    // онлайн-источник: ключ — сериал; у карточки не из TMDB — «источник-id»
    assert.strictEqual(env.A._test.overrideKey(env.A._test.describeData(env.clone({ url: 'https://cdn.example/a.mp4', card: GOT }))), 't:1399');
    assert.strictEqual(env.A._test.overrideKey(env.A._test.describeData(env.clone({ url: 'https://cdn.example/a.mp4', card: { id: 555, source: 'ivi' } }))), 't:ivi-555');
    // плеер закрыт — клавиша не обрабатывается
    env.T.destroy();
    assert.strictEqual(env.T.key(406, 'keydown'), false);
    // «Забыть ручные выборы»
    const forget = env.L.SettingsApi.params.find((p) => p.param.name === 'adaptive_subs_forget');
    forget.onChange();
    assert.deepStrictEqual(J(env.L.Storage.get('adaptive_subs_overrides')), {});
    assert.strictEqual(env.noty().pop(), 'Ручные выборы HDR/SDR забыты');
});

test('ручные выборы: не больше 300, вытесняются самые старые', async () => {
    const env = aenv();
    for (let i = 0; i < 305; i++) { env.A._test.setOverride('t:' + i, 'hdr'); env.T.clock.now += 1000; }
    const all = J(env.L.Storage.get('adaptive_subs_overrides'));
    assert.strictEqual(Object.keys(all).length, 300);
    assert.strictEqual(all['t:0'], undefined);
    assert.strictEqual(all['t:304'].p, 'hdr');
});

// ---------------- события и экран ----------------

test('событие для других плагинов: Lampa.Listener «adaptive_subs» и CustomEvent «adaptive_subs:profile» — только при изменении', async () => {
    const env = aenv();
    const got = [], dom = [];
    env.L.Listener.follow('adaptive_subs', (e) => got.push(J(e)));
    env.W.addEventListener('adaptive_subs:profile', (e) => dom.push(J(e.detail)));
    start(env, { title: 'Film.2160p.HDR10.mkv', url: 'https://cdn.example/f.mp4' });
    await env.advance(2000);
    assert.deepStrictEqual(got, [{ type: 'profile', profile: 'hdr', kind: 'hdr10', brightness: 0.48, source: 'name' }]);
    assert.deepStrictEqual(dom, got);
    env.T.destroy();
    start(env, { title: 'Film.2160p.HDR10.mkv', url: 'https://cdn.example/f.mp4' });
    await env.advance(2000);
    assert.strictEqual(got.length, 1, 'то же состояние — без повторного события');
    env.A.set('sdr');
    assert.deepStrictEqual(got.pop(), { type: 'profile', profile: 'sdr', kind: 'sdr', brightness: 1, source: 'manual' });
});

test('экран без HDR (эксперимент): dynamic-range: standard — обычные субтитры; ручной выбор сильнее', async () => {
    const env = aenv({ settings: { adaptive_subs_display: 'true' }, display: { '(dynamic-range: standard)': true } });
    start(env, { title: 'Film.2160p.HDR.mkv', url: 'https://cdn.example/f.mp4' });
    await env.advance(2000);
    assert.strictEqual(env.A.state.profile, 'sdr');
    assert.deepStrictEqual(env.noty(), ['Субтитры: SDR — обычные (экран без HDR)']);
    env.A.set('hdr');
    assert.strictEqual(env.A.state.profile, 'hdr');
    // экран с HDR — затемняем
    const env2 = aenv({ settings: { adaptive_subs_display: 'true' }, display: { '(dynamic-range: high)': true, '(dynamic-range: standard)': true } });
    start(env2, { title: 'Film.2160p.HDR.mkv', url: 'https://cdn.example/f.mp4' });
    await env2.advance(2000);
    assert.strictEqual(env2.A.state.profile, 'hdr');
});

// ---------------- LG webOS ----------------

test('webOS: прозрачность встроенных субтитров — в SDR как в Lampa, в HDR доля от значения Lampa; объект Lampa не меняется; возврат в SDR', async () => {
    const env = aenv({ webos: true, settings: { webos_subs_params: { char_opacity: 200, font_size: 1 } } });
    assert.strictEqual(env.A.webos(), true);
    assert.strictEqual(env.A._test.lampaOpacity(), 200);
    start(env, { title: 'Film.2160p.HDR.mkv', url: 'https://cdn.example/f.mp4' }, { mediaId: 'm1' });
    await env.advance(600);
    assert.deepStrictEqual(calls(env, 'setSubtitleCharacterOpacity'), [{ method: 'setSubtitleCharacterOpacity', p: { charOpacity: 100, mediaId: 'm1' } }], '200 × 128/255 ≈ 100');
    // Lampa сама вызывает метод (кнопка 9 / initialize): параметры Lampa не трогаем, в webOS уходит затемнённая копия
    const lampaParams = env.clone({ method: 'setSubtitleCharacterOpacity', parameters: { mediaId: 'm1', charOpacity: 255, color: 2 } });
    env.W.webOS.service.request('luna://com.webos.media', lampaParams);
    assert.strictEqual(lampaParams.parameters.charOpacity, 255);
    assert.deepStrictEqual(calls(env, 'setSubtitleCharacterOpacity').pop().p, { mediaId: 'm1', charOpacity: 128, color: 2 });
    assert.strictEqual(env.A._test.lampaOpacity(), 255);
    // другие методы проходят как есть
    env.W.webOS.service.request('luna://com.webos.media', env.clone({ method: 'setSubtitleColor', parameters: { mediaId: 'm1', color: 3 } }));
    assert.deepStrictEqual(calls(env, 'setSubtitleColor').pop().p, { mediaId: 'm1', color: 3 });
    // SDR вручную — возвращаем значение Lampa этому же видео
    env.A.set('sdr');
    assert.deepStrictEqual(calls(env, 'setSubtitleCharacterOpacity').pop().p, { charOpacity: 255, mediaId: 'm1' });
    const n = calls(env).length;
    env.A.set('sdr');
    assert.strictEqual(calls(env).length, n, 'повторно не вызываем');
});

test('webOS: уровень Dolby Vision меняет долю пропорционально; размер встроенных субтитров — если задан', async () => {
    const env = aenv({ webos: true, settings: { adaptive_subs_level_dv: '#555555', adaptive_subs_webos_size: '3' } });
    start(env, { title: 'Film.2160p.DV.mkv', url: 'https://cdn.example/f.mp4' }, { mediaId: 'm2' });
    await env.advance(600);
    // 255 × 128/255 × (0.33 / 0.48) = 88
    assert.deepStrictEqual(calls(env, 'setSubtitleCharacterOpacity').pop().p, { charOpacity: 88, mediaId: 'm2' });
    assert.deepStrictEqual(calls(env, 'setSubtitleFontSize').pop().p, { fontSize: 3, mediaId: 'm2' });
    env.W.webOS.service.request('luna://com.webos.media', env.clone({ method: 'setSubtitleFontSize', parameters: { mediaId: 'm2', fontSize: 1 } }));
    assert.deepStrictEqual(calls(env, 'setSubtitleFontSize').pop().p, { mediaId: 'm2', fontSize: 3 });
    // новое видео (следующая серия) — применяем к новому mediaId
    env.T.destroy();
    start(env, { title: 'Film.2160p.DV.mkv', url: 'https://cdn.example/f2.mp4' }, { mediaId: 'm3' });
    await env.advance(600);
    assert.strictEqual(calls(env, 'setSubtitleCharacterOpacity').pop().p.mediaId, 'm3');
});

test('webOS: сведения sourceInfo (эксперимент, выкл. по умолчанию) — журнал и явный признак; обработчик Lampa вызывается', async () => {
    const info = { sourceInfo: { programInfo: [{ numAudioTracks: 1, videoTrackInfo: [{ codec: 'HEVC', width: 3840, height: 2160, hdrType: 'HDR10' }] }] } };
    // выключено: subscribe не оборачиваем
    let env = aenv({ webos: true });
    start(env, { title: 'Film', url: 'https://cdn.example/f.mp4' }, { mediaId: 'm1' });
    let seen = 0;
    const params = { method: 'subscribe', parameters: { mediaId: 'm1', subscribe: true }, onSuccess: () => { seen++; } };
    env.W.webOS.service.request('luna://com.webos.media', params);
    assert.strictEqual(env.W.__webosCalls.pop().params.onSuccess, params.onSuccess);
    // включено
    env = aenv({ webos: true, settings: { adaptive_subs_webos_probe: 'true' } });
    start(env, { title: 'Film', url: 'https://cdn.example/f.mp4' }, { mediaId: 'm1' });
    env.W.webOS.service.request('luna://com.webos.media', params);
    const sent = env.W.__webosCalls.filter((c) => c.method === 'subscribe').pop().params;
    assert.notStrictEqual(sent.onSuccess, params.onSuccess);
    sent.onSuccess(env.clone(info));
    assert.strictEqual(seen, 1, 'обработчик Lampa получил ответ');
    assert.strictEqual(env.A.state.kind, 'hdr10');
    assert.strictEqual(env.A.state.source, 'webos');
    assert.ok(env.log.console.some((l) => l.includes('webOS sourceInfo video:') && l.includes('hdrType')));
    // поле без известного значения — только журнал
    const env3 = aenv({ webos: true, settings: { adaptive_subs_webos_probe: 'true' } });
    start(env3, { title: 'Film', url: 'https://cdn.example/f.mp4' }, { mediaId: 'm9' });
    env3.W.webOS.service.request('luna://com.webos.media', { method: 'subscribe', parameters: { mediaId: 'm9' }, onSuccess: () => {} });
    env3.W.__webosCalls.pop().params.onSuccess(env3.clone({ sourceInfo: { programInfo: [{ videoTrackInfo: [{ hdrType: 'something-new' }] }] } }));
    assert.strictEqual(env3.A.state.source, 'default');
});

test('не телевизор LG — webOS не трогаем; в т. ч. веб-версия Lampa, где webOSTV.js подключён всегда', async () => {
    for (const env of [aenv(), aenv({ webos: 'lib-only' })]) {
        assert.strictEqual(env.A.webos(), false);
        const names = env.L.SettingsApi.params.map((p) => p.param.name);
        assert.ok(!names.includes('adaptive_subs_webos_opacity') && !names.includes('adaptive_subs_webos_probe') && !names.includes('adaptive_subs_webos_size'));
    }
    const lib = aenv({ webos: 'lib-only' });
    assert.strictEqual(lib.W.webOS.service.request, lib.W.__webosOrig, 'request не подменён');
    const tv = aenv({ webos: true });
    assert.notStrictEqual(tv.W.webOS.service.request, tv.W.__webosOrig, 'на телевизоре — перехват');
    const w = aenv({ webos: true });
    const wn = w.L.SettingsApi.params.map((p) => p.param.name);
    assert.ok(wn.includes('adaptive_subs_webos_opacity') && wn.includes('adaptive_subs_webos_probe') && wn.includes('adaptive_subs_webos_size'));
});

test('поздний ответ прошлого запуска не перебивает новый; ошибки сети не ломают плеер', async () => {
    const env = aenv({ settings: TS_SETTINGS });
    ffpRoute(env, [V.hdr10], 5000);
    start(env, { title: 'A.mkv', url: tsUrl('A.mkv'), torrent_hash: H });
    await env.advance(500);
    env.T.destroy();
    start(env, { title: 'B.1080p.SDR.mp4', url: 'https://cdn.example/b.mp4' });
    await env.advance(6000);
    assert.strictEqual(env.A.state.profile, 'sdr');
    assert.strictEqual(env.A.state.source, 'name');
    assert.deepStrictEqual(env.errors.map((e) => e.where), []);
});

run('adaptive_subs ' + PKG.version + ' — сценарии');
