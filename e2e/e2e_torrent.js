// Торрент через (эмулированный) TorrServer в настоящей Lampa 3.4.4: адрес /stream/...?link=&index=&play,
// Dolby Vision из ответа /ffp (ffprobe) при названии файла без признаков HDR; один запрос /ffp на файл; SDR (bt709) по ffprobe.
const { open, BASE } = require('./lib');
const assert = require('assert');
const H = 'abcdef0123456789abcdef0123456789abcdef01';
const AOT_H = '0123456789abcdef0123456789abcdef01234567';
const GOT = { id: 1399, name: 'Game of Thrones', original_name: 'Game of Thrones', first_air_date: '2011-04-17', number_of_seasons: 8, source: 'tmdb',
    genre_ids: [10765, 18, 10759], origin_country: ['US'], original_language: 'en' };
const AOT = { id: 1429, name: 'Attack on Titan', original_name: '進撃の巨人', first_air_date: '2013-04-07', number_of_seasons: 4, source: 'tmdb',
    genre_ids: [16, 10759, 10765], origin_country: ['JP'], original_language: 'ja' };
const results = [];
function check(name, fn) { try { fn(); results.push('✓ ' + name); } catch (e) { results.push('✗ ' + name + ' — ' + e.message.split('\n')[0]); } }

(async () => {
    const tsLog = async () => (await (await fetch(BASE + 'ts/__log')).json());
    await tsLog();
    const env = await open({ storage: { torrserver_url: BASE + 'ts' } });
    global.__env = env;
    await tsLog();
    const state = () => env.ev(() => {
        const v = document.querySelector('video');
        return { dur: v && v.duration, opened: Lampa.Player.opened(), a: JSON.parse(JSON.stringify(window.AdaptiveSubs.state)),
            filter: (() => { const el = document.querySelector('.player-video__subtitles-text'); return el ? getComputedStyle(el).filter : null; })(),
            noty: (document.querySelector('.noty') || {}).textContent || '' };
    });
    await env.ev(({ BASE, GOT, H }) => Lampa.Player.play({
        title: 'Game.of.Thrones.S01E01.mkv', season: 1, episode: 1, card: GOT, torrent_hash: H,
        url: BASE + 'ts/stream/' + encodeURIComponent('Game.of.Thrones.S01E01.mkv') + '?link=' + H + '&index=1&play'
    }), { BASE, GOT, H });
    await env.wait(4500);
    const log1 = await tsLog();
    const s1 = await state();
    console.log('TorrServer: ' + log1.join(' | '));
    console.log('state: ' + JSON.stringify(s1));
    check('видео из /ts/stream открыто в плеере Lampa', () => { assert.ok(s1.opened); assert.strictEqual(Math.round(s1.dur), 3700); });
    check('Dolby Vision по ffprobe (в названии файла HDR нет); затемнение субтитров', () => {
        assert.strictEqual(s1.a.profile, 'hdr'); assert.strictEqual(s1.a.kind, 'dv'); assert.ok(/ffp|ffprobe/.test(s1.a.source), s1.a.source);
        assert.ok(/^brightness\(0\.\d+\)$/.test(s1.filter), s1.filter);
    });
    check('один запрос /ffp на файл (общий кэш window.__lampa_ffp__)', () => {
        assert.strictEqual(log1.filter((l) => l.includes('/ffp/' + H + '/1')).length, 1, log1.join(' | '));
    });
    // вторая раздача: ffprobe говорит bt709 (SDR)
    await env.ev(() => { Lampa.Player.close(); });
    await env.wait(1000);
    await env.ev(({ BASE, AOT, AOT_H }) => Lampa.Player.play({
        title: 'Shingeki no Kyojin - 01.mkv', season: 1, episode: 1, card: AOT, torrent_hash: AOT_H,
        url: BASE + 'ts/stream/' + encodeURIComponent('Shingeki no Kyojin - 01.mkv') + '?link=' + AOT_H + '&index=2&play'
    }), { BASE, AOT, AOT_H });
    await env.wait(4500);
    const log2 = await tsLog();
    const s2 = await state();
    console.log('TorrServer: ' + log2.join(' | '));
    console.log('state: ' + JSON.stringify(s2));
    check('другая раздача: SDR по ffprobe (bt709), фильтр снят', () => {
        assert.strictEqual(Math.round(s2.dur), 1420);
        assert.strictEqual(s2.a.profile, 'sdr'); assert.ok(/ffp|ffprobe/.test(s2.a.source), s2.a.source);
        assert.strictEqual(s2.filter, 'none');
        assert.strictEqual(log2.filter((l) => l.includes('/ffp/' + AOT_H + '/2')).length, 1, log2.join(' | '));
    });
    check('ошибок JavaScript на странице нет', () => assert.deepStrictEqual(env.logs.filter((l) => l.startsWith('PAGEERROR')), []));
    console.log(results.join('\n'));
    console.log(env.pluginLogs().join('\n'));
    await env.close();
    process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
})().catch((e) => { console.error(e); console.log(results.join('\n')); if (global.__env) console.log(global.__env.logs.filter((l) => /PAGEERROR|Adaptive/.test(l)).join('\n')); process.exit(2); });
