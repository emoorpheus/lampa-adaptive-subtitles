// Настройки плагина в настоящей Lampa 3.4.4: раздел, пункты (без пунктов webOS в браузере), выбор значения
// через настоящие события Lampa ('hover:enter'), кнопка «Забыть ручные выборы HDR/SDR». Внешняя сеть — заглушки.
const { open } = require('./lib');
const assert = require('assert');
const results = [];
function check(name, fn) { try { fn(); results.push('✓ ' + name); } catch (e) { results.push('✗ ' + name + ' — ' + e.message.split('\n')[0]); } }

(async () => {
    const env = await open();
    global.__env = env;
    const names = (comp) => env.ev((comp) => new Promise((res) => {
        Lampa.Settings.create(comp);
        setTimeout(() => res(Array.from(document.querySelectorAll('.settings__body .settings-param, .settings__body .settings-param-title')).map((el) =>
            (el.getAttribute('data-name') || (el.getAttribute('data-static') ? 'static' : 'title')) + '=' + ((el.querySelector('.settings-param__name') || el).textContent.trim()))), 400);
    }), comp);
    // главный экран настроек
    const folders = await env.ev(() => new Promise((res) => {
        Lampa.Controller.toggle('settings');
        setTimeout(() => res(Array.from(document.querySelectorAll('.settings-folder')).map((f) => f.getAttribute('data-component') + '=' + f.textContent.trim())), 600);
    }));
    check('в настройках Lampa есть раздел «Адаптивные субтитры»', () => {
        assert.ok(folders.includes('adaptive_subs=Адаптивные субтитры'), folders.join(' | '));
    });
    // раздел adaptive_subs
    const ad = await names('adaptive_subs');
    console.log('adaptive_subs: ' + ad.length + '\n  ' + ad.join('\n  '));
    check('раздел «Адаптивные субтитры»: без пунктов webOS в браузере', () => {
        assert.ok(ad.includes('adaptive_subs_mode=Режим') && ad.includes('adaptive_subs_forget=Забыть ручные выборы HDR/SDR'), ad.join(' | '));
        assert.ok(!ad.some((n) => /webos/.test(n)), ad.join(' | '));
    });
    const sel = await env.ev(() => new Promise((res) => {
        $('.settings__body .settings-param[data-name="adaptive_subs_mode"]').trigger('hover:enter');
        setTimeout(() => {
            const items = Array.from(document.querySelectorAll('.selectbox-item'));
            const it = items.find((i) => i.textContent.includes('Всегда SDR'));
            if (it) $(it).trigger('hover:enter');
            setTimeout(() => res({ items: items.map((i) => i.textContent.trim()), stored: Lampa.Storage.field('adaptive_subs_mode'),
                value: $('.settings__body .settings-param[data-name="adaptive_subs_mode"] .settings-param__value').text() }), 400);
        }, 400);
    }));
    check('выбор «Режим → Всегда SDR» через меню выбора Lampa сохраняется', () => {
        assert.ok(sel.items.length === 3, JSON.stringify(sel.items));
        assert.strictEqual(sel.stored, 'sdr'); assert.ok(sel.value.includes('Всегда SDR'), sel.value);
    });
    const forget = await env.ev(() => new Promise((res) => {
        Lampa.Storage.set('adaptive_subs_overrides', { 't:1399': 'hdr' });
        $('.settings__body .settings-param[data-name="adaptive_subs_forget"]').trigger('hover:enter');
        setTimeout(() => res({ ov: Lampa.Storage.get('adaptive_subs_overrides', '{}'), noty: (document.querySelector('.noty') || {}).textContent || '' }), 400);
    }));
    check('кнопка «Забыть ручные выборы HDR/SDR» очищает выборы', () => {
        assert.deepStrictEqual(forget.ov, {}); assert.ok(forget.noty.includes('Ручные выборы HDR/SDR забыты'), forget.noty);
    });
    check('ошибок JavaScript на странице нет', () => assert.deepStrictEqual(env.logs.filter((l) => l.startsWith('PAGEERROR')), []));
    console.log(results.join('\n'));
    await env.shot('e2e_settings');
    await env.close();
    process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); if (global.__env) console.log(global.__env.logs.filter((l) => /PAGEERROR|Adaptive/.test(l)).join('\n')); process.exit(2); });
