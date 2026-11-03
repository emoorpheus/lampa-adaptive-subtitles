// Фильм в настоящей Lampa 3.4.4: Dolby Vision по названию; клавиша HDR/SDR (синяя, 406) в плеере
// с запоминанием выбора для фильма (Lampa.Storage «adaptive_subs_overrides»). Внешняя сеть — заглушки.
const { open, BASE } = require('./lib');
const assert = require('assert');
const MOVIE = { id: 27205, title: 'Начало', original_title: 'Inception', release_date: '2010-07-15', genre_ids: [28, 878, 12], source: 'tmdb' };
const results = [];
function check(name, fn) { try { fn(); results.push('✓ ' + name); } catch (e) { results.push('✗ ' + name + ' — ' + e.message.split('\n')[0]); } }

(async () => {
    const env = await open({ storage: { adaptive_subs_key: 'blue', adaptive_subs_screen: 'hdr' } });   // экран: см. e2e_player
    global.__env = env;
    const press = (code) => env.ev((code) => {
        for (const type of ['keydown', 'keyup']) {
            const e = new KeyboardEvent(type, { bubbles: true, cancelable: true });
            Object.defineProperty(e, 'keyCode', { get: () => code });
            Object.defineProperty(e, 'which', { get: () => code });
            window.dispatchEvent(e);
        }
    }, code);
    const state = () => env.ev(() => ({ a: JSON.parse(JSON.stringify(window.AdaptiveSubs.state)), noty: (document.querySelector('.noty') || {}).textContent || '',
        filter: (() => { const el = document.querySelector('.player-video__subtitles-text'); return el ? getComputedStyle(el).filter : null; })(),
        ov: Lampa.Storage.get('adaptive_subs_overrides', '{}'), opened: Lampa.Player.opened() }));
    await env.ev(({ BASE, MOVIE }) => Lampa.Player.play({ title: 'Inception.2010.2160p.WEB-DL.DV.HDR.webm', url: BASE + 'video/got_s01e01.webm', card: MOVIE }), { BASE, MOVIE });
    await env.wait(4500);
    const s0 = await state();
    console.log('start: ' + JSON.stringify(s0));
    check('Dolby Vision по названию: затемнение субтитров', () => {
        assert.ok(s0.opened);
        assert.strictEqual(s0.a.profile, 'hdr'); assert.strictEqual(s0.a.kind, 'dv'); assert.strictEqual(s0.a.source, 'name');
        assert.ok(/^brightness\(0\.\d+\)$/.test(s0.filter), s0.filter);
    });
    await press(406);
    await env.wait(700);
    const s1 = await state();
    console.log('после 406: ' + JSON.stringify(s1));
    check('синяя кнопка (406) в плеере: SDR вручную, запомнено для фильма (t:27205)', () => {
        assert.strictEqual(s1.a.profile, 'sdr'); assert.strictEqual(s1.a.source, 'override');
        assert.deepStrictEqual(Object.keys(s1.ov), ['t:27205']); assert.strictEqual(s1.ov['t:27205'].p, 'sdr'); assert.strictEqual(typeof s1.ov['t:27205'].t, 'number');
        assert.ok(/SDR/.test(s1.noty) && /запомнено для сериала или фильма/.test(s1.noty), s1.noty);
        assert.strictEqual(s1.filter, 'none');
        assert.ok(s1.opened, 'плеер не закрыт');
    });
    await press(406);
    await env.wait(700);
    const s2 = await state();
    check('повторное нажатие — снова HDR (Dolby Vision), выбор перезаписан', () => {
        assert.strictEqual(s2.a.profile, 'hdr'); assert.strictEqual(s2.a.kind, 'dv'); assert.deepStrictEqual(Object.keys(s2.ov), ['t:27205']); assert.strictEqual(s2.ov['t:27205'].p, 'hdr'); assert.ok(s2.ov['t:27205'].t >= s1.ov['t:27205'].t);
        assert.ok(/^brightness\(0\.\d+\)$/.test(s2.filter), s2.filter);
    });
    // тот же фильм заново — ваш выбор (без определения по названию)
    await env.ev(() => { Lampa.Player.close(); });
    await env.wait(1000);
    await env.ev(({ BASE, MOVIE }) => Lampa.Player.play({ title: 'Inception.2010.1080p.BluRay.webm', url: BASE + 'video/got_s01e01.webm', card: MOVIE }), { BASE, MOVIE });
    await env.wait(3000);
    const s3 = await state();
    console.log('повторный запуск: ' + JSON.stringify(s3));
    check('повторный запуск фильма (в названии HDR нет) — запомненный выбор HDR', () => {
        assert.strictEqual(s3.a.profile, 'hdr'); assert.strictEqual(s3.a.source, 'override');
    });
    check('ошибок JavaScript на странице нет', () => assert.deepStrictEqual(env.logs.filter((l) => l.startsWith('PAGEERROR')), []));
    console.log(results.join('\n'));
    console.log(env.pluginLogs().join('\n'));
    await env.close();
    process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); if (global.__env) console.log(global.__env.logs.filter((l) => /PAGEERROR|Adaptive/.test(l)).join('\n')); process.exit(2); });
