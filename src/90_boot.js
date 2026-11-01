
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
        log('v' + VERSION + ' initialized' + (webosOrigRequest ? ' | webOS' : ''));
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
            init: init
        }
    };

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) { if (e && e.type === 'ready') init(); });
})();
