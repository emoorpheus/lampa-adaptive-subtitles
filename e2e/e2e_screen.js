// «Экран» в настоящей Lampa 3.4.4: HDR-видео, которое экран или плеер покажет в SDR, — субтитры обычные.
// 1) headless Chromium: dynamic-range: standard — экран без HDR;
// 2) браузер как на Android-приставке Tanix TX9 (WebView 84): признака dynamic-range нет, HEVC 10 бит и Dolby Vision
//    не поддерживаются — «плеер не воспроизводит HDR»; цветная кнопка приходит с keyCode 0 и key «ColorF0Red».
const { open, BASE } = require('./lib');
const assert = require('assert');
const MOVIE = { id: 27205, title: 'Начало', original_title: 'Inception', release_date: '2010-07-15', genre_ids: [28, 878, 12], source: 'tmdb' };
const results = [];
function check(name, fn) { try { fn(); results.push('✓ ' + name); } catch (e) { results.push('✗ ' + name + ' — ' + e.message.split('\n')[0]); } }

// Подмена в браузере до загрузки Lampa: как WebView 84 на TX9
function tx9() {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/dynamic-range/.test(q) ? { matches: false, media: q, addListener() {}, removeListener() {} } : mm(q));
    const HDR = /hvc1|hev1|dvh1|dvhe/;
    const cpt = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (t) { return HDR.test(t) ? '' : cpt.call(this, t); };
    if (window.MediaSource) {
        const its = MediaSource.isTypeSupported.bind(MediaSource);
        MediaSource.isTypeSupported = (t) => (HDR.test(t) ? false : its(t));
    }
}

(async () => {
    const state = (env) => env.ev(() => ({ a: JSON.parse(JSON.stringify(window.AdaptiveSubs.state)), scr: window.AdaptiveSubs.screen(),
        noty: (document.querySelector('.noty') || {}).textContent || '', opened: Lampa.Player.opened(),
        filter: (() => { const el = document.querySelector('.player-video__subtitles-text'); return el ? getComputedStyle(el).filter : null; })() }));
    const play = (env, title) => env.ev(({ BASE, MOVIE, title }) => Lampa.Player.play({ title, url: BASE + 'video/got_s01e01.webm', card: MOVIE }), { BASE, MOVIE, title });

    // 1) Chromium как есть
    let env = await open();
    global.__env = env;
    await play(env, 'Inception.2010.2160p.WEB-DL.DV.HDR.webm');
    await env.wait(4000);
    const s1 = await state(env);
    console.log('Chromium: ' + JSON.stringify(s1));
    check('Chromium (dynamic-range: standard): Dolby Vision по названию — субтитры обычные, причина в уведомлении', () => {
        assert.ok(s1.opened);
        assert.strictEqual(s1.scr.range, 'standard');
        assert.strictEqual(s1.a.kind, 'dv'); assert.strictEqual(s1.a.profile, 'sdr'); assert.strictEqual(s1.a.screen, 'display');
        assert.strictEqual(s1.filter, 'none');
        assert.ok(/^Субтитры: SDR — обычные \(Dolby Vision по названию; экран без HDR\)/.test(s1.noty), s1.noty);
    });
    check('журнал: состояние экрана при запуске', () => assert.ok(env.pluginLogs().some((l) => /initialized \| display: standard \| HDR decoder: (yes|no) \| HDR shown as SDR \(display\)/.test(l)), env.pluginLogs().join(' | ')));
    check('ошибок JavaScript на странице нет (Chromium)', () => assert.deepStrictEqual(env.logs.filter((l) => l.startsWith('PAGEERROR')), []));
    await env.close();

    // 2) как на TX9
    env = await open({ init: tx9, storage: { adaptive_subs_key: 'red' } });
    global.__env = env;
    await play(env, 'Inception.2010.2160p.WEB-DL.HDR10.webm');
    await env.wait(4000);
    const s2 = await state(env);
    console.log('TX9: ' + JSON.stringify(s2));
    check('как TX9 (dynamic-range неизвестен, нет HEVC 10 бит и Dolby Vision): HDR10 по названию — субтитры обычные', () => {
        assert.deepStrictEqual(s2.scr, { mode: 'auto', tv: false, range: null, decoder: false, blocks: 'player' });
        assert.strictEqual(s2.a.profile, 'sdr'); assert.strictEqual(s2.a.screen, 'player');
        assert.strictEqual(s2.filter, 'none');
        assert.ok(/^Субтитры: SDR — обычные \(HDR10 по названию; плеер не воспроизводит HDR\)/.test(s2.noty), s2.noty);
    });
    // красная кнопка: keyCode 0, key «ColorF0Red» (как WebView на TX9)
    await env.ev(() => {
        for (const type of ['keydown', 'keyup']) {
            const e = new KeyboardEvent(type, { key: 'ColorF0Red', bubbles: true, cancelable: true });
            Object.defineProperty(e, 'keyCode', { get: () => 0 });
            Object.defineProperty(e, 'which', { get: () => 0 });
            window.dispatchEvent(e);
        }
    });
    await env.wait(700);
    const s3 = await state(env);
    console.log('после ColorF0Red: ' + JSON.stringify(s3));
    check('красная кнопка (keyCode 0, key ColorF0Red): HDR вручную, затемнение, запомнено для фильма', () => {
        assert.strictEqual(s3.a.profile, 'hdr'); assert.strictEqual(s3.a.kind, 'hdr10'); assert.strictEqual(s3.a.source, 'override');
        assert.ok(/^brightness\(0\.\d+\)$/.test(s3.filter), s3.filter);
        assert.ok(/запомнено для сериала или фильма/.test(s3.noty), s3.noty);
        assert.ok(s3.opened, 'плеер не закрыт');
    });
    check('ошибок JavaScript на странице нет (как TX9)', () => assert.deepStrictEqual(env.logs.filter((l) => l.startsWith('PAGEERROR')), []));
    console.log(results.join('\n'));
    console.log(env.pluginLogs().join('\n'));
    await env.close();
    process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); if (global.__env) console.log(global.__env.logs.filter((l) => /PAGEERROR|Adaptive/.test(l)).join('\n')); process.exit(2); });
