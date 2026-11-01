'use strict';
// Совместимость со старыми движками ТВ (на ТВ не проверялось — это статическая проверка сборок):
// webOS TV 3.x — Chromium 38, 4.x — 53, 5.x — 68, 6.x — 79 (webostv.developer.lge.com/develop/specifications/web-api-and-web-engine);
// Tizen 3.0 — M47 … 6.0 — M76, Tizen 2.3/2.4 — WebKit r152340 (developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html).
// Правила: синтаксис ES5; без встроенных API новее ES5, кроме Promise (его подключает сама Lampa: promise-polyfill в app.min.js);
// CSS: без flex gap (Chrome 84+, MDN BCD css.properties.gap.flex_context), filter — вместе с -webkit-filter (без префикса — Chrome 53+),
// flex/transform — с -webkit- префиксами, как в css/app.css самой Lampa.
const assert = require('assert');
const fs = require('fs');
const { test, run, createEnv, FILES } = require('./lib/harness');
const acorn = require('../tools/vendor/acorn.js'); // acorn 8.19.0 (MIT) в проекте — без npm install

const SRC = { adaptive: fs.readFileSync(FILES.adaptive, 'utf8') };
const AST = {};
for (const k of Object.keys(SRC)) AST[k] = acorn.parse(SRC[k], { ecmaVersion: 5, sourceType: 'script', locations: true });

function walk(node, fn, parent) {
    if (!node || typeof node.type !== 'string') return;
    fn(node, parent);
    for (const key of Object.keys(node)) {
        if (key === 'loc') continue;
        const v = node[key];
        if (Array.isArray(v)) v.forEach((c) => walk(c, fn, node));
        else if (v && typeof v.type === 'string') walk(v, fn, node);
    }
}
const propName = (m) => m && m.type === 'MemberExpression' && !m.computed && m.property.type === 'Identifier' ? m.property.name : null;
const objName = (m) => m && m.type === 'MemberExpression' && m.object.type === 'Identifier' ? m.object.name : null;

const BAD_GLOBALS = ['fetch', 'URLSearchParams', 'URL', 'AbortController', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect',
    'globalThis', 'requestIdleCallback', 'IntersectionObserver', 'ResizeObserver', 'queueMicrotask', 'structuredClone', 'BigInt'];
const BAD_STATIC = { Object: ['assign', 'values', 'entries', 'fromEntries', 'getOwnPropertySymbols', 'is', 'setPrototypeOf'], Array: ['from', 'of'],
    Number: ['isFinite', 'isNaN', 'isInteger', 'isSafeInteger', 'parseFloat', 'parseInt', 'EPSILON'], Math: ['trunc', 'sign', 'cbrt', 'log10', 'log2', 'hypot', 'fround', 'imul', 'clz32', 'expm1', 'log1p'],
    String: ['raw', 'fromCodePoint'], Promise: ['allSettled', 'any'] };
// Методы ES2015+ / новых DOM; совпадения имён со своими методами плагина здесь исключены (fetch, remove, keys, get, set)
const BAD_METHODS = ['includes', 'startsWith', 'endsWith', 'padStart', 'padEnd', 'repeat', 'findIndex', 'findLast', 'findLastIndex', 'flat', 'flatMap',
    'fill', 'copyWithin', 'closest', 'replaceAll', 'matchAll', 'trimStart', 'trimEnd', 'at', 'append', 'prepend', 'replaceWith', 'before', 'after',
    'toggleAttribute', 'randomUUID', 'finally', 'codePointAt', 'normalize', 'animate', 'scrollTo'];

function scan(name) {
    const found = [];
    const at = (n, what) => found.push(name + ':' + n.loc.start.line + ' ' + what);
    walk(AST[name], (n, parent) => {
        if (n.type === 'Identifier' && BAD_GLOBALS.indexOf(n.name) !== -1) {
            const isProp = parent && ((parent.type === 'MemberExpression' && parent.property === n && !parent.computed) || (parent.type === 'Property' && parent.key === n));
            if (!isProp) at(n, 'глобальный ' + n.name);
        }
        if (n.type === 'MemberExpression') {
            const o = objName(n), p = propName(n);
            if (o && p && BAD_STATIC[o] && BAD_STATIC[o].indexOf(p) !== -1) at(n, o + '.' + p);
        }
        if (n.type === 'CallExpression') {
            const p = propName(n.callee);
            if (p && BAD_METHODS.indexOf(p) !== -1) at(n, '.' + p + '()');
            // .find — только у jQuery-элемента Lampa (item.find в onRender настроек), у массивов — нет (ES2015)
            if (p === 'find' && objName(n.callee) !== 'item') at(n, '.find()');
            // NodeList.forEach — Chrome 51+
            if (p === 'forEach' && n.callee.object.type === 'CallExpression' && /^(querySelectorAll|getElementsBy)/.test(propName(n.callee.object.callee) || '')) at(n, 'NodeList.forEach');
        }
    });
    return found;
}

// CSS: правило -> объявления
function rules(css) {
    const out = [], re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) out.push({ sel: m[1].trim(), body: m[2] });
    return out;
}
function cssProblems(css, where) {
    const bad = [];
    rules(css).forEach((r) => {
        const decl = r.body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
            const i = d.indexOf(':');
            return { p: d.slice(0, i).trim().toLowerCase(), v: d.slice(i + 1).trim().toLowerCase() };
        });
        const has = (p, v) => decl.some((d) => d.p === p && (v === undefined || d.v.indexOf(v) === 0));
        const need = (cond, p, v, what) => { if (cond && !has(p, v)) bad.push(where + ' ' + r.sel + ': ' + what); };
        decl.forEach((d) => { if (d.p === 'gap' || d.p === 'row-gap' || d.p === 'column-gap') bad.push(where + ' ' + r.sel + ': ' + d.p + ' (flex gap — Chrome 84+)'); });
        need(has('display', 'flex'), 'display', '-webkit-flex', 'display:flex без display:-webkit-flex');
        need(has('flex-direction'), '-webkit-flex-direction', undefined, 'flex-direction без -webkit-');
        need(has('align-items'), '-webkit-align-items', undefined, 'align-items без -webkit-');
        need(has('flex-shrink'), '-webkit-flex-shrink', undefined, 'flex-shrink без -webkit-');
        need(has('filter'), '-webkit-filter', undefined, 'filter без -webkit-filter (Chrome < 53)');
        need(has('transform'), '-webkit-transform', undefined, 'transform без -webkit-transform');
        need(decl.some((d) => d.p === 'transition' && d.v.indexOf('transform') !== -1), '-webkit-transition', undefined, 'transition transform без -webkit-transition');
    });
    return bad;
}

test('синтаксис ES5 (acorn, ecmaVersion 5) у сборки', () => {
    for (const k of Object.keys(AST)) assert.strictEqual(AST[k].type, 'Program', k);
});

test('нет встроенных API новее ES5 (кроме Promise из Lampa) и NodeList.forEach', () => {
    assert.deepStrictEqual(scan('adaptive'), []);
});

test('проверка ловит запрещённое (контроль самого теста)', () => {
    const save = AST.adaptive;
    AST.adaptive = acorn.parse('a.includes(1); Object.assign({}, b); new Map(); x.find(f); item.find(".x"); document.querySelectorAll("p").forEach(f); o.fetch(); y.remove();', { ecmaVersion: 5, locations: true });
    try {
        assert.deepStrictEqual(scan('adaptive').map((s) => s.replace(/^adaptive:\d+ /, '')), ['.includes()', 'Object.assign', 'глобальный Map', '.find()', 'NodeList.forEach']);
    } finally { AST.adaptive = save; }
    assert.deepStrictEqual(cssProblems('.a{display:flex;gap:4px;filter:blur(1px)}.b{-webkit-filter:x;filter:x;display:-webkit-flex;display:flex}', 't'),
        ['t .a: gap (flex gap — Chrome 84+)', 't .a: display:flex без display:-webkit-flex', 't .a: filter без -webkit-filter (Chrome < 53)']);
});

test('CSS adaptive_subs во всех режимах: filter вместе с -webkit-filter, без flex gap', () => {
    const env = createEnv();
    env.load('adaptive');
    const build = (st) => env.A._test.buildCss(env.clone(st));
    const all = [];
    for (const style of ['dim', 'color']) {
        env.setStorage('adaptive_subs_hdr_style', style);
        for (const ass of ['true', 'false']) {
            env.setStorage('adaptive_subs_ass', ass);
            all.push(build({ profile: 'hdr', brightness: 0.48 }), build({ profile: 'sdr', brightness: 1 }));
        }
    }
    env.setStorage('adaptive_subs_sdr_color', '#fff4c2');
    env.setStorage('adaptive_subs_size', '4.4vh');
    all.push(build({ profile: 'sdr', brightness: 1 }), build({ profile: 'hdr', brightness: 0.33 }));
    assert.ok(all.some((c) => c.indexOf('brightness(0.48)') !== -1));
    assert.deepStrictEqual([].concat.apply([], all.map((c, i) => cssProblems(c, '#' + i))), []);
});

run('совместимость со старыми движками ТВ (статическая проверка)');
