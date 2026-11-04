// Настройки плагина в настоящей Lampa 3.4.4: раздел, пункты (без пунктов webOS в браузере), выбор значения
// через настоящие события Lampa ('hover:enter'), кнопка «Забыть ручные выборы HDR/SDR». Внешняя сеть — заглушки.
const { open } = require('./lib');
const assert = require('assert');
const PKG = require('../package.json');
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
        assert.ok(ad.includes('adaptive_subs_mode=Режим') && ad.includes('adaptive_subs_screen=Экран') && ad.includes('adaptive_subs_forget=Забыть ручные выборы HDR/SDR'), ad.join(' | '));
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
    // «Отчёт для разработчика»: окно Lampa.Modal крупным текстом, прокрутка стрелками, «Назад» — обратно в настройки
    await env.ev(() => { $('.settings__body .settings-param[data-name="adaptive_subs_report"]').trigger('hover:enter'); });
    await env.wait(600);
    const rep = await env.ev(() => {
        const m = document.querySelector('.modal');
        const lines = Array.from(document.querySelectorAll('.modal .adaptive-subs-report > div')).map((d) => d.className.replace('adaptive-subs-report__', '') + ': ' + d.textContent);
        const body = document.querySelector('.modal .adaptive-subs-report__l'), name = document.querySelector('.settings-param__name');
        const sc = document.querySelector('.modal .scroll__content');
        return { open: !!m, title: (document.querySelector('.modal__title') || {}).textContent, lines,
            ctrl: Lampa.Controller.enabled().name, font: body ? parseFloat(getComputedStyle(body).fontSize) : 0,
            settingsFont: name ? parseFloat(getComputedStyle(name).fontSize) : 0, scroll: sc ? [sc.scrollHeight, sc.clientHeight] : null };
    });
    console.log('report: ' + JSON.stringify({ title: rep.title, ctrl: rep.ctrl, font: rep.font, settingsFont: rep.settingsFont, scroll: rep.scroll, n: rep.lines.length }) + '\n  ' + rep.lines.join('\n  '));
    await env.shot('e2e_report');
    await env.page.keyboard.press('Escape');
    await env.wait(500);
    const after = await env.ev(() => ({ open: !!document.querySelector('.modal'), ctrl: Lampa.Controller.enabled().name,
        settings: !!document.querySelector('.settings__body .settings-param[data-name="adaptive_subs_report"]') }));
    check('«Отчёт для разработчика»: окно с версией, устройством, экраном, настройками и журналом крупным текстом', () => {
        assert.ok(rep.open, 'окно открыто');
        assert.strictEqual(rep.title, 'Адаптивные субтитры — отчёт');
        assert.strictEqual(rep.ctrl, 'modal');
        const t = rep.lines.join('\n');
        assert.ok(t.indexOf('l: Adaptive Subtitles ' + PKG.version + ' · Lampa 3.4.4 · ') >= 0, t);
        assert.ok(/h: Экран и плеер\nl: display: \w+ · HDR decoder: \w+ · TV: no · setting: auto[^\n]*\n/.test(t), t);
        assert.ok(/h: Изменённые настройки\nl: mode: sdr\n/.test(t), t);
        assert.ok(/h: Журнал \(последние \d+\)\nlog: \d\d:\d\d:\d\d v[\d.]+ initialized/.test(t), t);
        assert.ok(!/127\.0\.0\.1|https?:\/\//.test(t), 'нет адресов');
        assert.ok(rep.font > rep.settingsFont, 'текст крупнее пунктов настроек: ' + rep.font + ' > ' + rep.settingsFont);
    });
    check('«Отчёт»: «Назад» закрывает окно и возвращает в настройки', () => {
        assert.deepStrictEqual(after, { open: false, ctrl: 'settings_component', settings: true });
    });
    check('ошибок JavaScript на странице нет', () => assert.deepStrictEqual(env.logs.filter((l) => l.startsWith('PAGEERROR')), []));
    console.log(results.join('\n'));
    await env.shot('e2e_settings');
    await env.close();
    process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); if (global.__env) console.log(global.__env.logs.filter((l) => /PAGEERROR|Adaptive/.test(l)).join('\n')); process.exit(2); });
