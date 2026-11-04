
    // ---------- Инициализация ----------
    var inited = false;

    function init() {
        if (inited) return;
        inited = true;
        addSettings();
        hookWebos();
        applyStyle();
        Lampa.Player.listener.follow('start', onStart);
        Lampa.Player.listener.follow('destroy', onDestroy);
        bindKey();
        var scr = screenInfo();
        log('v' + VERSION + ' initialized' + (webosOrigRequest ? ' | webOS' : '') + ' | display: ' + (scr.range || 'unknown') +
            ' | HDR decoder: ' + (scr.decoder === null ? 'unknown' : (scr.decoder ? 'yes' : 'no')) + (scr.blocks ? ' | HDR shown as SDR (' + scr.blocks + ')' : ''));
    }

    // Экспорт для других плагинов, отладки и тестов
    window.AdaptiveSubs = {
        version: VERSION,
        detect: detectFromText,
        kind: kindFromText,
        state: current,
        set: function (p) {
            lookupToken++;
            applyKind(p === 'hdr' ? 'hdr' : 'sdr', 'manual');
            announce(false);
        },
        toggle: toggleProfile,
        screen: screenInfo,
        webos: function () { return !!webosOrigRequest; },
        _test: {
            evaluate: evaluate,
            buildCss: buildCss,
            applyKind: applyKind,
            torrServerTarget: torrTarget,
            kindFromStreams: kindFromStreams,
            kindFromHls: kindFromHls,
            kindFromData: kindFromData,
            levelFor: levelFor,
            screenBlocksHdr: screenBlocksHdr,
            keyCodeOf: keyCodeOf,
            resetScreen: function () { hdrDecoder = undefined; },
            toneFor: toneFor,
            overrideKey: overrideKey,
            describeData: describeData,
            getOverride: getOverride,
            setOverride: setOverride,
            sharedFfp: sharedFfp,
            inspectWebos: inspectWebos,
            webosOpacity: webosOpacity,
            applyWebos: applyWebos,
            lampaOpacity: function () { return lampaOpacity; },
            onStart: onStart,
            onDestroy: onDestroy,
            init: init,
            I18n: I18n,
            I18N: I18N,
            I18N_LANGS: I18N_LANGS,
            tr: tr,
            Journal: Journal,
            Report: Report,
            scrub: scrub
        }
    };

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e && e.type === 'ready') init(); });
})();
