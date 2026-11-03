// Сценарий в настоящей Lampa 3.4.4 (веб-сборка yumata/lampa) в Chromium, внешняя сеть — заглушки.
// Проверяем: загрузку плагина Lampa, HDR по названию -> затемнение настоящего элемента субтитров Lampa,
// событие «adaptive_subs» для других плагинов, следующий файл без признаков HDR -> SDR (как в Lampa).
const { open, BASE } = require('./lib');
const assert = require('assert');
const PKG = require('../package.json');
const GOT = { id: 1399, name: 'Game of Thrones', original_name: 'Game of Thrones', first_air_date: '2011-04-17', number_of_seasons: 8, source: 'tmdb',
    genre_ids: [10765, 18, 10759], origin_country: ['US'], original_language: 'en',
    seasons: [{ season_number: 1, episode_count: 10, air_date: '2011-04-17' }] };
const results = [];
function check(name, fn) { try { fn(); results.push('✓ ' + name); } catch (e) { results.push('✗ ' + name + ' — ' + e.message.split('\n')[0]); } }

(async () => {
    // headless Chromium сообщает dynamic-range: standard — затемнение проверяем с «Экран: HDR-экран» (Авто — в e2e_screen)
    const env = await open({ storage: { adaptive_subs_screen: 'hdr' } });
    global.__env = env;
    check('Lampa готова, плагин инициализирован (версия из package.json, в браузере — без «| webOS»)', () => {
        assert.ok(env.ready);
        assert.ok(env.pluginLogs().some((l) => l.includes('[AdaptiveSubs] v' + PKG.version + ' initialized') && !l.includes('webOS')), env.pluginLogs().join(' | '));
    });
    // события для других плагинов: Lampa.Listener и CustomEvent на window
    await env.ev(() => {
        window.__events = [];
        Lampa.Listener.follow('adaptive_subs', (e) => window.__events.push(JSON.parse(JSON.stringify(e))));
        window.addEventListener('adaptive_subs:profile', (e) => window.__events.push({ dom: true, profile: e.detail.profile }));
    });
    const state = () => env.ev(() => {
        const el = document.querySelector('.player-video__subtitles-text');
        return { a: JSON.parse(JSON.stringify(window.AdaptiveSubs.state)), filter: el ? getComputedStyle(el).filter : null,
            style: !!document.getElementById('adaptive-subs-style'), dur: (document.querySelector('video') || {}).duration,
            noty: (document.querySelector('.noty') || {}).textContent || '', events: window.__events.slice() };
    });
    await env.ev(({ BASE, GOT }) => {
        const list = [
            { title: 'Game.of.Thrones.S01E01.2160p.HDR.webm', season: 1, episode: 1, url: BASE + 'video/got_s01e01.webm', card: GOT },
            { title: 'Game.of.Thrones.S01E02.1080p.WEB-DL.webm', season: 1, episode: 2, url: BASE + 'video/got_s01e02.webm', card: GOT }
        ];
        Lampa.Player.play(list[0]);
        Lampa.Player.playlist(list);
    }, { BASE, GOT });
    await env.wait(4000);
    const s1 = await state();
    console.log('S1E1: ' + JSON.stringify(s1));
    check('видео открыто в плеере Lampa, длина 3700 с', () => assert.strictEqual(Math.round(s1.dur), 3700));
    check('HDR по названию; фильтр brightness(0.48) на настоящем .player-video__subtitles-text', () => {
        assert.strictEqual(s1.a.profile, 'hdr'); assert.strictEqual(s1.a.source, 'name');
        assert.strictEqual(s1.filter, 'brightness(0.48)');
        assert.ok(s1.style, 'стиль #adaptive-subs-style вставлен');
    });
    check('уведомление о профиле субтитров', () => assert.ok(/^Субтитры: HDR — затемнённые, 48%/.test(s1.noty), s1.noty));
    check('событие «adaptive_subs» в Lampa.Listener и «adaptive_subs:profile» на window', () => {
        assert.deepStrictEqual(s1.events.filter((e) => !e.dom), [{ type: 'profile', profile: 'hdr', kind: 'hdr', brightness: 0.48, source: 'name' }]);
        assert.deepStrictEqual(s1.events.filter((e) => e.dom), [{ dom: true, profile: 'hdr' }]);
    });
    // следующий файл без признаков HDR: как Lampa (обычные субтитры)
    await env.ev(() => { Lampa.Player.close(); });
    await env.wait(1000);
    await env.ev(({ BASE, GOT }) => Lampa.Player.play({ title: 'Game.of.Thrones.S01E02.1080p.WEB-DL.webm', season: 1, episode: 2, url: BASE + 'video/got_s01e02.webm', card: GOT }), { BASE, GOT });
    await env.wait(4000);
    const s2 = await state();
    console.log('S1E2: ' + JSON.stringify(s2));
    check('файл без признаков HDR — SDR, фильтр снят; событие SDR отправлено', () => {
        assert.strictEqual(Math.round(s2.dur), 3400);
        assert.strictEqual(s2.a.profile, 'sdr');
        assert.strictEqual(s2.filter, 'none');
        assert.deepStrictEqual(s2.events.filter((e) => !e.dom).map((e) => e.profile), ['hdr', 'sdr']);
    });
    check('ошибок JavaScript на странице нет', () => assert.deepStrictEqual(env.logs.filter((l) => l.startsWith('PAGEERROR')), []));
    console.log(results.join('\n'));
    console.log('plugin logs:\n' + env.pluginLogs().slice(0, 40).join('\n'));
    await env.close();
    process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); if (global.__env) { console.log(global.__env.logs.slice(-80).join('\n')); } process.exit(2); });
