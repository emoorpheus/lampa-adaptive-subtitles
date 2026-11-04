
    // ---------- Меню настроек ----------
    function addSettings() {
        if (!Lampa.SettingsApi) return;
        var webos = isWebos();
        var C = 'adaptive_subs';

        Lampa.SettingsApi.addComponent({
            component: C,
            name: tr('plugin_title'),
            icon: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M6 13h5M13 13h5M6 16h8M16 16h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
        });

        function add(param, field, extra) {
            var o = { component: C, param: param, field: field };
            if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) o[k] = extra[k];
            try { Lampa.SettingsApi.addParam(o); } catch (e) {}
        }
        function title(name, text) { add({ name: name, type: 'title' }, { name: text }); }
        function refresh() { applyKind(current.kind, current.source); }
        function reevaluate() { if (playerOpened()) evaluate(playdata(), true); else refresh(); }
        var tones = toneNames(), levels = { same: tr('level_same') };
        for (var t in tones) if (tones.hasOwnProperty(t)) levels[t] = tones[t];

        title('adaptive_subs_t_detect', tr('t_detect'));
        add({ name: 'adaptive_subs_mode', type: 'select', default: DEFAULTS.adaptive_subs_mode,
            values: { auto: tr('mode_auto'), hdr: tr('mode_hdr'), sdr: tr('mode_sdr') } },
            { name: tr('set_mode'), description: tr('set_mode_d') },
            { onChange: reevaluate });
        add({ name: 'adaptive_subs_screen', type: 'select', default: DEFAULTS.adaptive_subs_screen,
            values: { auto: tr('screen_auto'), hdr: tr('screen_hdr'), sdr: tr('screen_sdr') } },
            { name: tr('set_screen'), description: tr('set_screen_d') },
            { onChange: reevaluate });
        add({ name: 'adaptive_subs_ffp', type: 'trigger', default: true },
            { name: tr('set_ffp'), description: tr('set_ffp_d') });
        add({ name: 'adaptive_subs_hls', type: 'trigger', default: true },
            { name: tr('set_hls'), description: tr('set_hls_d') });
        if (webos) {
            add({ name: 'adaptive_subs_webos_probe', type: 'trigger', default: false },
                { name: tr('set_probe'), description: tr('set_probe_d') });
        }

        title('adaptive_subs_t_look', tr('t_look'));
        add({ name: 'adaptive_subs_hdr_style', type: 'select', default: DEFAULTS.adaptive_subs_hdr_style,
            values: { dim: tr('style_dim'), color: tr('style_color') } },
            { name: tr('set_style'), description: tr('set_style_d') },
            { onChange: refresh });
        add({ name: 'adaptive_subs_hdr_tone', type: 'select', default: DEFAULTS.adaptive_subs_hdr_tone, values: tones },
            { name: tr('set_tone'), description: tr('set_tone_d') },
            { onChange: refresh });
        add({ name: 'adaptive_subs_level_hdr10', type: 'select', default: 'same', values: levels },
            { name: tr('set_hdr10'), description: tr('set_hdr10_d') }, { onChange: refresh });
        add({ name: 'adaptive_subs_level_dv', type: 'select', default: 'same', values: levels },
            { name: tr('set_dv') }, { onChange: refresh });
        add({ name: 'adaptive_subs_level_hlg', type: 'select', default: 'same', values: levels },
            { name: tr('set_hlg') }, { onChange: refresh });
        add({ name: 'adaptive_subs_ass', type: 'trigger', default: true },
            { name: tr('set_ass'), description: tr('set_ass_d') },
            { onChange: refresh });
        if (webos) {
            add({ name: 'adaptive_subs_webos_opacity', type: 'select', default: DEFAULTS.adaptive_subs_webos_opacity,
                values: { '191': tr('op_191'), '153': tr('op_153'), '128': tr('op_128'), '102': tr('op_102'), '77': tr('op_77') } },
                { name: tr('set_webos_op'), description: tr('set_webos_op_d') },
                { onChange: function () { applyWebos(); } });
        }

        title('adaptive_subs_t_sdr', tr('t_sdr'));
        add({ name: 'adaptive_subs_sdr_color', type: 'select', default: DEFAULTS.adaptive_subs_sdr_color,
            values: { lampa: tr('keep_lampa'), '#ffffff': tr('color_white'), '#f0f0f0': tr('color_soft'), '#fff4c2': tr('color_warm') } },
            { name: tr('set_color'), description: tr('set_color_d') },
            { onChange: refresh });
        add({ name: 'adaptive_subs_size', type: 'select', default: DEFAULTS.adaptive_subs_size,
            values: { 'default': tr('keep_lampa'), '3.2vh': tr('size_xs'), '3.8vh': tr('size_s'), '4.4vh': tr('size_m'), '5vh': tr('size_l'), '5.8vh': tr('size_xl') } },
            { name: tr('set_size'), description: tr('set_size_d') },
            { onChange: refresh });
        if (webos) {
            add({ name: 'adaptive_subs_webos_size', type: 'select', default: DEFAULTS.adaptive_subs_webos_size,
                values: { 'default': tr('wsize_keep'), '0': tr('wsize_0'), '1': '1', '2': '2', '3': '3', '4': tr('wsize_4') } },
                { name: tr('set_webos_size') },
                { onChange: function () { applyWebos(); } });
        }

        title('adaptive_subs_t_ctrl', tr('t_ctrl'));
        add({ name: 'adaptive_subs_key', type: 'select', default: DEFAULTS.adaptive_subs_key,
            values: { none: tr('key_none'), red: tr('key_red'), green: tr('key_green'), yellow: tr('key_yellow'), blue: tr('key_blue') } },
            { name: tr('set_key'), description: tr('set_key_d') });
        add({ name: 'adaptive_subs_forget', type: 'button' },
            { name: tr('set_forget'), description: tr('set_forget_d') },
            { onChange: function () {
                try { Lampa.Storage.set(OVERRIDES, {}); } catch (e) {}
                try { Lampa.Noty.show(tr('noty_forgot')); } catch (e) {}
            } });
        add({ name: 'adaptive_subs_notify', type: 'trigger', default: true },
            { name: tr('set_notify'), description: tr('set_notify_d') });
        add({ name: 'adaptive_subs_report', type: 'button' },
            { name: tr('set_report'), description: tr('set_report_d') },
            { onChange: function () { Report.open(); } });
    }
