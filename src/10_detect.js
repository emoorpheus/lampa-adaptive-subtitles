
    // ---------- Признаки HDR в тексте (название, адрес, качество, раздача) ----------
    var SEP = '(?:^|[\\s._\\-\\[\\]\\(\\)/,+|])';
    var END = '(?=$|[\\s._\\-\\[\\]\\(\\)/,+|])';
    var DV_RE = new RegExp(SEP + '(?:dolby[\\s._\\-]?vision|dovi|dv)' + END, 'i');
    var HLG_RE = new RegExp(SEP + 'hlg' + END, 'i');
    var HDR10_RE = new RegExp(SEP + '(?:hdr10\\+?|hdr10plus|smpte[\\s._\\-]?2084)' + END, 'i');
    var HDR_RE = new RegExp(SEP + '(?:hdr|uhd[\\s._\\-]?hdr)' + END, 'i');
    var SDR_RE = new RegExp(SEP + 'sdr' + END, 'i');

    function safeDecode(s) {
        s = String(s || '');
        for (var i = 0; i < 2; i++) {
            try { var d = decodeURIComponent(s.replace(/\+/g, ' ')); if (d === s) break; s = d; } catch (e) { break; }
        }
        return s;
    }

    // -> 'dv' | 'hlg' | 'hdr10' | 'hdr' | 'sdr' | null
    function kindFromText(text) {
        text = safeDecode(text);
        if (!text) return null;
        if (DV_RE.test(text)) return 'dv';
        if (HLG_RE.test(text)) return 'hlg';
        if (HDR10_RE.test(text)) return 'hdr10';
        if (HDR_RE.test(text)) return 'hdr';
        if (SDR_RE.test(text)) return 'sdr';
        return null;
    }

    // Совместимость с v3: 'hdr' | 'sdr' | null
    function detectFromText(text) {
        var k = kindFromText(text);
        return k ? (isHdrKind(k) ? 'hdr' : 'sdr') : null;
    }

    function collectStrings(data) {
        var out = [];
        if (!data || typeof data !== 'object') return out;
        var keys = ['title', 'url', 'path', 'quality', 'name', 'file', 'translate', 'voice_name', 'release', 'info'];
        for (var i = 0; i < keys.length; i++) {
            var v = data[keys[i]];
            if (typeof v === 'string') out.push(v);
            else if (v && typeof v === 'object' && !(v instanceof Array)) {
                // quality: { "2160p HDR": url, ... }
                for (var k in v) if (v.hasOwnProperty(k)) out.push(k);
            }
        }
        return out;
    }

    // Первая строка с признаком решает (как в v3)
    function kindFromData(data) {
        var strings = collectStrings(data);
        for (var i = 0; i < strings.length; i++) {
            var found = kindFromText(strings[i]);
            if (found) return found;
        }
        return null;
    }

    // ---------- Признаки HDR в ffprobe (данные раздачи или TorrServer /ffp) ----------
    // color_transfer: smpte2084 = PQ (HDR10/HDR10+), arib-std-b67 = HLG;
    // Dolby Vision: side_data «DOVI configuration record» или codec_tag dvh1/dvhe/dva1/dvav
    function kindFromStreams(list) {
        if (list && !Array.isArray(list) && Array.isArray(list.streams)) list = list.streams;
        if (!Array.isArray(list)) return null;
        var video = null, i;
        for (i = 0; i < list.length; i++) {
            var s = list[i];
            if (s && s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic)) { video = s; break; }
        }
        if (!video) return null;
        var dv = /^(?:dvh1|dvhe|dva1|dvav)$/i.test(String(video.codec_tag_string || ''));
        var side = video.side_data_list;
        if (Array.isArray(side)) {
            for (i = 0; i < side.length; i++) {
                if (/dovi|dolby\s*vision/i.test(String(side[i] && side[i].side_data_type || ''))) dv = true;
            }
        }
        if (dv) return 'dv';
        var trc = String(video.color_transfer || '').toLowerCase();
        if (trc === 'smpte2084') return 'hdr10';
        if (trc === 'arib-std-b67') return 'hlg';
        if (trc && trc !== 'unknown' && trc !== 'unspecified' && trc !== 'reserved') return 'sdr';
        // 8 бит без сведений о передаточной функции — SDR (HDR10/HLG/DV требуют 10 бит)
        if (/^(?:yuv420p|yuvj420p|nv12|yuv422p|yuv444p)$/i.test(String(video.pix_fmt || ''))) return 'sdr';
        return null;
    }

    // ---------- HLS: VIDEO-RANGE (SDR | HLG | PQ) и CODECS в мастер-плейлисте ----------
    function kindFromHls(text) {
        if (typeof text !== 'string' || text.indexOf('#EXTM3U') === -1) return null;
        var lines = text.split(/\r?\n/), kinds = {}, n = 0;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.indexOf('#EXT-X-STREAM-INF:') !== 0) continue;
            n++;
            var attrs = line.slice(18);
            var range = /(?:^|,)VIDEO-RANGE=([A-Za-z]+)/.exec(attrs);
            var codecs = /(?:^|,)CODECS="([^"]*)"/.exec(attrs);
            var k = '?';
            if (codecs && /(?:^|,)\s*(?:dvh1|dvhe|dva1|dvav)\./i.test(codecs[1])) k = 'dv';
            else if (range) {
                var r = range[1].toUpperCase();
                k = r === 'PQ' ? 'hdr10' : (r === 'HLG' ? 'hlg' : (r === 'SDR' ? 'sdr' : '?'));
            }
            kinds[k] = true;
        }
        if (!n || kinds['?']) return null;
        var list = Object.keys(kinds);
        if (list.length === 1) return list[0];
        if (kinds.sdr) return null;          // есть и SDR, и HDR — что выберет плеер, неизвестно
        return 'hdr';
    }
