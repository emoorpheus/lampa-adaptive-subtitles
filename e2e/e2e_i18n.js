// Английский интерфейс в настоящей Lampa 3.4.4 (язык Lampa — English): раздел настроек, значения, уведомление о профиле.
const { open, BASE } = require('./lib');
const assert = require('assert');
const GOT = { id: 1399, name: 'Game of Thrones', original_name: 'Game of Thrones', first_air_date: '2011-04-17', number_of_seasons: 8, source: 'tmdb',
    genre_ids: [10765, 18, 10759], origin_country: ['US'], original_language: 'en',
    seasons: [{ season_number: 1, episode_count: 10, air_date: '2011-04-17' }] };
const results = [];
function check(name, fn) { try { fn(); results.push('✓ ' + name); } catch (e) { results.push('✗ ' + name + ' — ' + e.message.split('\n')[0]); } }

(async () => {
    const env = await open({ storage: { language: 'en' } });
    global.__env = env;
    const lang = await env.ev(() => ({ next: Lampa.Lang.translate('settings_player_next_episode'), plugin: window.AdaptiveSubs._test.I18n.lang() }));
    check('Lampa на английском (Lampa.Lang: «Next episode»), плагин выбрал английский', () => {
        assert.strictEqual(lang.next, 'Next episode');
        assert.strictEqual(lang.plugin, 'en');
    });
    await env.ev(({ BASE, GOT }) => Lampa.Player.play({ title: 'Game.of.Thrones.S01E01.2160p.HDR.webm', season: 1, episode: 1, url: BASE + 'video/got_s01e01.webm', card: GOT }), { BASE, GOT });
    await env.wait(4000);
    const s1 = await env.ev(() => {
        const el = document.querySelector('.player-video__subtitles-text');
        return { profile: window.AdaptiveSubs.state.profile, filter: el ? getComputedStyle(el).filter : null, noty: (document.querySelector('.noty') || {}).textContent || '' };
    });
    console.log('S1E1: ' + JSON.stringify(s1));
    check('уведомление «Subtitles: HDR — dimmed, 48% (by name)», фильтр brightness(0.48)', () => {
        assert.strictEqual(s1.noty.trim(), 'Subtitles: HDR — dimmed, 48% (by name)');
        assert.strictEqual(s1.profile, 'hdr');
        assert.strictEqual(s1.filter, 'brightness(0.48)');
    });
    await env.ev(() => Lampa.Player.close());
    await env.wait(1000);
    const folders = await env.ev(() => new Promise((res) => {
        Lampa.Controller.toggle('settings');
        setTimeout(() => res(Array.from(document.querySelectorAll('.settings-folder')).map((f) => f.getAttribute('data-component') + '=' + f.textContent.trim())), 600);
    }));
    check('в настройках Lampa раздел «Adaptive Subtitles»', () => assert.ok(folders.includes('adaptive_subs=Adaptive Subtitles'), folders.join(' | ')));
    const page = await env.ev(() => new Promise((res) => {
        Lampa.Settings.create('adaptive_subs');
        setTimeout(() => {
            const body = document.querySelector('.settings__body');
            res({ text: body ? body.textContent : '', items: Array.from(document.querySelectorAll('.settings__body .settings-param, .settings__body .settings-param-title')).map((el) =>
                (el.getAttribute('data-name') || (el.getAttribute('data-static') ? 'static' : 'title')) + '=' + ((el.querySelector('.settings-param__name') || el).textContent.trim())) });
        }, 400);
    }));
    console.log('adaptive_subs: ' + page.items.length + '\n  ' + page.items.join('\n  '));
    check('раздел на английском: пункты, значения и описания без кириллицы', () => {
        for (const n of ['title=HDR detection', 'adaptive_subs_mode=Mode', 'adaptive_subs_hdr_tone=HDR: subtitle brightness', 'adaptive_subs_size=External subtitle size', 'adaptive_subs_forget=Forget manual HDR/SDR choices'])
            assert.ok(page.items.includes(n), n + ' нет в: ' + page.items.join(' | '));
        const m = page.text.match(/[^\s]*[\u0400-\u04FF][^\s]*/g);
        assert.ok(!m, 'кириллица: ' + (m || []).slice(0, 5).join(' '));
    });
    // выбор значения в настоящем меню Lampa: подписи на английском
    const sel = await env.ev(() => new Promise((res) => {
        $('.settings__body .settings-param[data-name="adaptive_subs_hdr_tone"]').trigger('hover:enter');
        setTimeout(() => {
            const items = Array.from(document.querySelectorAll('.selectbox-item')).map((i) => i.textContent.trim());
            window.history.back();
            res({ items, value: $('.settings__body .settings-param[data-name="adaptive_subs_hdr_tone"] .settings-param__value').text() });
        }, 400);
    }));
    console.log('tone select: ' + JSON.stringify(sel));
    check('уровни яркости в меню Lampa: «Lighter — 60%» … «Very dark — 33%», выбран «Darker — 48%»', () => {
        assert.deepStrictEqual(sel.items, ['Lighter — 60%', 'Moderate — 54%', 'Darker — 48%', 'Dark — 40%', 'Very dark — 33%']);
        assert.strictEqual(sel.value, 'Darker — 48%');
    });
    check('ошибок JavaScript на странице нет', () => assert.deepStrictEqual(env.logs.filter((l) => l.startsWith('PAGEERROR')), []));
    console.log(results.join('\n'));
    await env.close();
    process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); if (global.__env) { console.log(global.__env.logs.slice(-60).join('\n')); } process.exit(2); });
