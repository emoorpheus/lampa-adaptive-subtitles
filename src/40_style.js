
    // ---------- Уровни яркости ----------
    // Значения соответствуют прежним серым цветам v3: #9a -> 0.60, #8a -> 0.54, #7a -> 0.48, #66 -> 0.40, #55 -> 0.33
    var TONES = { '#9a9a9a': 0.60, '#8a8a8a': 0.54, '#7a7a7a': 0.48, '#666666': 0.40, '#555555': 0.33 };
    var TONE_NAMES = {
        '#9a9a9a': 'Светлее — 60%',
        '#8a8a8a': 'Умеренно — 54%',
        '#7a7a7a': 'Темнее — 48%',
        '#666666': 'Тёмные — 40%',
        '#555555': 'Очень тёмные — 33%'
    };
    var KIND_NAMES = { dv: 'Dolby Vision', hdr10: 'HDR10', hlg: 'HLG', hdr: 'HDR', sdr: 'SDR' };

    function mainLevel() {
        return TONES[opt('adaptive_subs_hdr_tone')] || TONES[DEFAULTS.adaptive_subs_hdr_tone];
    }

    function levelFor(kind) {
        var v = kind === 'hdr10' || kind === 'dv' || kind === 'hlg' ? opt('adaptive_subs_level_' + kind) : 'same';
        return v && v !== 'same' && TONES[v] ? TONES[v] : mainLevel();
    }

    // Серый того же уровня — для режима «перекрашивать» и для video::cue
    function toneFor(b) {
        var n = Math.max(0, Math.min(255, Math.round(b * 255))), h = n.toString(16);
        if (h.length < 2) h = '0' + h;
        return '#' + h + h + h;
    }

    // ---------- Стили ----------
    var HDR_SHADOW = '0 0 3px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.7), 1px 1px 2px #000';
    var SDR_SHADOW = '0 0 2px #000, 0 0 4px #000, 1px 1px 2px #000, -1px -1px 2px #000';

    function buildCss(st) {
        st = st || current;
        var css = '';
        if (st.profile === 'hdr') {
            var b = st.brightness > 0 && st.brightness <= 1 ? st.brightness : mainLevel(), tone = toneFor(b);
            var f = 'brightness(' + b + ')';
            if (opt('adaptive_subs_hdr_style') === 'color') {
                css += '.player-video__subtitles-text, .player-video__subtitles-text *{color:' + tone + ' !important;' +
                       'text-shadow:' + HDR_SHADOW + ' !important;}';
            } else {
                // яркостью: цветные надписи и оформление остаются, просто темнее
                css += '.player-video__subtitles-text{filter:' + f + ' !important;-webkit-filter:' + f + ' !important;}';
            }
            // WebVTT, который рисует сам браузер: фильтры к ::cue не применяются — только цвет (как в v3)
            css += 'video::cue{color:' + tone + ' !important;text-shadow:' + HDR_SHADOW + ' !important;}';
            // ASS: простой рендер Lampa (.player-video__ass) и JASSUB (холст в .JASSUB)
            if (flag('adaptive_subs_ass')) {
                css += '.player-video__ass, .JASSUB{filter:' + f + ' !important;-webkit-filter:' + f + ' !important;}';
            }
        } else {
            var color = opt('adaptive_subs_sdr_color');
            if (color && color !== 'lampa') {
                css += '.player-video__subtitles-text, .player-video__subtitles-text *{color:' + color + ' !important;' +
                       'text-shadow:' + SDR_SHADOW + ' !important;}' +
                       'video::cue{color:' + color + ' !important;text-shadow:' + SDR_SHADOW + ' !important;}';
            }
        }
        var size = opt('adaptive_subs_size');
        if (size && size !== 'default') {
            css += '.player-video__subtitles-text{font-size:' + size + ' !important;line-height:1.25 !important;}' +
                   'video::cue{font-size:' + size + ' !important;}';
        }
        return css;
    }

    function applyStyle() {
        var el = document.getElementById(STYLE_ID);
        if (!el) {
            el = document.createElement('style');
            el.id = STYLE_ID;
            document.head.appendChild(el);
        }
        var css = buildCss(current);
        if (el.textContent !== css) el.textContent = css;
    }
