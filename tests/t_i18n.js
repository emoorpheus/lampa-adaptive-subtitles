'use strict';
// Язык интерфейса: таблица строк (ru/en), выбор языка как у Lampa, английские настройки и уведомления
const assert = require('assert');
const fs = require('fs');
const { createEnv, test, run, FILES } = require('./lib/harness');
const acorn = require('../tools/vendor/acorn.js');

const J = (x) => JSON.parse(JSON.stringify(x));
const CYR = /[\u0400-\u04FF]/;
const H = 'abcdef0123456789abcdef0123456789abcdef01';
const TS = 'http://torrserver.test:8090';
const TS_SETTINGS = { torrserver_url: TS };
const holes = (s) => (String(s).match(/\{[a-z0-9_]+\}/gi) || []).sort().join(',');

function aenv(o) {
    o = o || {};
    const env = createEnv(o.webos ? { platform: 'webos' } : {});
    env.T.playerDom();
    if (o.lang) env.setStorage('language', o.lang);
    if (o.settings) for (const k of Object.keys(o.settings)) env.setStorage(k, o.settings[k]);
    if (o.webos) env.run('window.webOS = { platform: { tv: true }, service: { request: function () { return {}; } } };');
    env.load('adaptive');
    return env;
}
const start = (env, data) => env.T.play(env.clone(data), { position: 0 });
const tsUrl = (name) => TS + '/stream/' + encodeURIComponent(name) + '?link=' + H + '&index=1&play';

const SRC = fs.readFileSync(FILES.adaptive, 'utf8');
const AST = acorn.parse(SRC, { ecmaVersion: 5, sourceType: 'script' });
function walk(node, fn) {
    if (!node || typeof node.type !== 'string') return;
    fn(node);
    for (const key of Object.keys(node)) {
        const v = node[key];
        if (Array.isArray(v)) v.forEach((c) => walk(c, fn));
        else if (v && typeof v.type === 'string') walk(v, fn);
    }
}
let TABLE = null;
walk(AST, (n) => { if (n.type === 'VariableDeclarator' && n.id.name === 'I18N') TABLE = n.init; });
const inTable = (n) => TABLE && n.start >= TABLE.start && n.end <= TABLE.end;

test('таблица строк: у каждой строки все языки I18N_LANGS, одинаковые подстановки, в английском нет кириллицы', () => {
    const T = aenv().A._test, keys = Object.keys(T.I18N), LANGS = Array.from(T.I18N_LANGS), bad = [];
    assert.ok(LANGS.includes('ru') && LANGS.includes('en'), LANGS.join(','));
    assert.ok(keys.length > 80, String(keys.length));
    for (const k of keys) {
        const row = T.I18N[k];
        if (Object.keys(row).sort().join(',') !== LANGS.slice().sort().join(',')) { bad.push(k + ': языки ' + Object.keys(row).join(',')); continue; }
        LANGS.forEach((l) => {
            if (typeof row[l] !== 'string' || !row[l].trim()) bad.push(k + ': ' + l + ' пустая строка');
            else if (holes(row[l]) !== holes(row.ru)) bad.push(k + ': ' + l + ' подстановки ' + JSON.stringify(row[l]));
        });
        if (CYR.test(row.en)) bad.push(k + ': кириллица в en: ' + row.en);
    }
    assert.deepStrictEqual(bad, []);
});

test('сборка: кириллица в строках кода — только в таблице I18N; ключи tr() есть в таблице, лишних строк нет', () => {
    const T = aenv().A._test, keys = Object.keys(T.I18N), cyr = [], missing = [], literals = new Set(), prefixes = new Set();
    assert.ok(TABLE && TABLE.type === 'ObjectExpression', 'var I18N = { ... } в сборке');
    let calls = 0;
    walk(AST, (n) => {
        if (n.type === 'Literal' && typeof n.value === 'string' && !inTable(n)) {
            literals.add(n.value);
            if (CYR.test(n.value)) cyr.push(SRC.slice(n.start, n.end));
        }
        if (n.type === 'BinaryExpression' && n.operator === '+' && n.left.type === 'Literal' && typeof n.left.value === 'string' && /^[a-z]+_$/.test(n.left.value)) prefixes.add(n.left.value);
        if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'tr' && n.arguments[0]) {
            const a = n.arguments[0];
            calls++;
            if (a.type === 'Literal' && !T.I18n.has(a.value)) missing.push(a.value);
            if (a.type === 'BinaryExpression' && a.left.type === 'Literal' && !keys.some((k) => k.indexOf(a.left.value) === 0)) missing.push(a.left.value + '…');
        }
    });
    assert.deepStrictEqual(cyr, [], 'кириллица вне таблицы');
    assert.ok(calls > 60, 'вызовов tr: ' + calls);
    assert.deepStrictEqual(missing, [], 'нет в таблице');
    const unused = keys.filter((k) => !literals.has(k) && !Array.from(prefixes).some((p) => k.indexOf(p) === 0));
    assert.deepStrictEqual(unused, [], 'строки таблицы, которые нигде не используются');
});

test('язык как у Lampa: без выбора — русский, ru — русский, en — английский, другие (uk, be, zh) — английский', () => {
    for (const [code, lang, text] of [[null, 'ru', 'Адаптивные субтитры'], ['ru', 'ru', 'Адаптивные субтитры'], ['en', 'en', 'Adaptive Subtitles'], ['uk', 'en', 'Adaptive Subtitles'], ['be', 'en', 'Adaptive Subtitles'], ['zh', 'en', 'Adaptive Subtitles']]) {
        const env = aenv({ lang: code }), T = env.A._test;
        assert.strictEqual(T.I18n.code(), code || 'ru');
        assert.strictEqual(T.I18n.lang(), lang, String(code));
        assert.strictEqual(env.L.SettingsApi.components[0].name, text, String(code));
    }
    const T = aenv().A._test;
    assert.strictEqual(T.tr('no_such_key'), 'no_such_key');
    assert.strictEqual(T.I18n.format('{state} {x}', { state: 'SDR' }), 'SDR {x}', 'подставляются только переданные значения');
});

test('английский: раздел «Adaptive Subtitles» (с пунктами webOS), значения и описания без кириллицы', () => {
    const env = aenv({ lang: 'en', webos: true });
    const params = env.L.SettingsApi.params, p = (n) => { const x = params.find((q) => q.param.name === n); assert.ok(x, n); return x; };
    assert.strictEqual(env.L.SettingsApi.components[0].name, 'Adaptive Subtitles');
    assert.strictEqual(p('adaptive_subs_t_detect').field.name, 'HDR detection');
    assert.strictEqual(p('adaptive_subs_mode').field.name, 'Mode');
    assert.deepStrictEqual(J(p('adaptive_subs_mode').param.values), { auto: 'Auto (by file and release)', hdr: 'Always HDR (dimmed)', sdr: 'Always SDR (normal)' });
    assert.deepStrictEqual(J(p('adaptive_subs_hdr_tone').param.values), { '#9a9a9a': 'Lighter — 60%', '#8a8a8a': 'Moderate — 54%', '#7a7a7a': 'Darker — 48%', '#666666': 'Dark — 40%', '#555555': 'Very dark — 33%' });
    assert.strictEqual(p('adaptive_subs_level_dv').param.values.same, 'Same as the main level');
    assert.strictEqual(p('adaptive_subs_hdr_style').param.values.color, 'Recolour to grey');
    assert.strictEqual(p('adaptive_subs_size').param.values['3.8vh'], 'Small');
    assert.strictEqual(p('adaptive_subs_webos_size').field.name, 'Built-in subtitle size (LG webOS)');
    assert.match(p('adaptive_subs_key').field.description, /Skip Intro plugin$/);
    const cyr = [];
    params.forEach((q) => {
        const f = q.field || {}, v = q.param.values && typeof q.param.values === 'object' ? Object.keys(q.param.values).map((k) => q.param.values[k]) : [];
        [f.name, f.description].concat(v).forEach((s) => { if (typeof s === 'string' && CYR.test(s)) cyr.push(q.param.name + ': ' + s); });
    });
    assert.deepStrictEqual(cyr, []);
    assert.ok(params.some((q) => /webos/.test(q.param.name)), 'пункты webOS есть');
});

test('английский: уведомления о профиле, ручной выбор клавишей, «Забыть»', async () => {
    let env = aenv({ lang: 'en' });
    start(env, { title: 'Film.2160p.HDR.mkv', url: 'https://cdn.example/Film.2160p.HDR.mkv' });
    await env.advance(2000);
    assert.deepStrictEqual(env.noty(), ['Subtitles: HDR — dimmed, 48% (by name)']);
    env = aenv({ lang: 'en' });
    start(env, { title: 'Film.1080p.mkv', url: 'https://cdn.example/Film.1080p.mkv' });
    await env.advance(2000);
    assert.deepStrictEqual(env.noty(), ['Subtitles: SDR — normal (no HDR signs)']);
    // ffprobe позже 1,5 с сменил HDR на SDR — «Subtitles updated»
    env = aenv({ lang: 'en', settings: TS_SETTINGS });
    env.on(TS + '/ffp/' + H + '/', { status: 200, body: { streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', color_transfer: 'bt709', color_primaries: 'bt709' }], format: { duration: '3600.000000' }, chapters: [] }, delay: 4000 }, { cors: '*' });
    start(env, { title: 'Film.2160p.HDR.mkv', url: tsUrl('Film.2160p.HDR.mkv'), torrent_hash: H });
    await env.advance(6000);
    assert.deepStrictEqual(env.noty(), ['Subtitles: HDR — dimmed, 48% (by name)', 'Subtitles updated: SDR — normal (by file)']);
    // клавиша HDR/SDR: выбор для раздачи
    env = aenv({ lang: 'en', settings: Object.assign({ adaptive_subs_key: 'blue' }, TS_SETTINGS) });
    env.on(TS + '/ffp/', { status: 404, text: '' }, { cors: '*' });
    env.on(TS + '/torrents', { status: 200, body: { title: 'Film 1080p', name: 'Film' } }, { cors: '*', method: 'POST' });
    start(env, { title: 'Film.mkv', url: tsUrl('Film.mkv'), torrent_hash: H, card: { id: 27205, title: 'Inception' } });
    await env.advance(2000);
    assert.strictEqual(env.T.key(406, 'keydown'), true);
    assert.strictEqual(env.noty().pop(), 'Subtitles: HDR — dimmed, 48% (remembered for this torrent)');
    env.T.destroy();
    start(env, { title: 'Film.mkv', url: tsUrl('Film.mkv'), torrent_hash: H });
    await env.advance(2000);
    assert.strictEqual(env.noty().pop(), 'Subtitles: HDR — dimmed, 48% (your choice)');
    env.L.SettingsApi.params.find((q) => q.param.name === 'adaptive_subs_forget').onChange();
    assert.strictEqual(env.noty().pop(), 'Manual HDR/SDR choices forgotten');
    // ручной выбор из другого плагина: window.AdaptiveSubs.set('hdr')
    env.A.set('sdr');
    assert.strictEqual(env.noty().pop(), 'Subtitles: SDR — normal (manually)');
});

run('t_i18n: язык интерфейса');
