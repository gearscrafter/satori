/* Satori trail view: nested layer/class/member boxes, aggregated edges, data-flow trace, draggable boxes, legend and edit mode. */
(function () {
    'use strict';

    const M = window.TrailModel;
    const Icons = window.TrailIcons;
    const Paint = window.TrailPaint;
    const vscodeApi = (function () {
        try { return acquireVsCodeApi(); } catch (e) { return { postMessage: function (m) { console.log('postMessage', m); }, getState: function () { return undefined; }, setState: function () { return undefined; } }; }
    })();

    // All user-facing text comes from the localization files that the extension injects.
    const I18N = (function () {
        try { return JSON.parse(document.getElementById('satori-i18n').textContent || '{}'); } catch (e) { return {}; }
    })();
    function t(key) {
        let text = I18N[key] || key;
        for (let i = 1; i < arguments.length; i++) { text = text.replace('{' + (i - 1) + '}', arguments[i]); }
        return text;
    }

    let projectRoot = '';
    let graph;
    let savedAnnotations = {};
    try {
        const payload = JSON.parse(document.getElementById('satori-data').textContent);
        graph = payload.graph || { nodes: [], edges: [] };
        projectRoot = payload.projectRoot || '';
        savedAnnotations = payload.annotations || {};
    } catch (e) {
        graph = { nodes: [], edges: [] };
        vscodeApi.postMessage({ command: 'log', args: ['[Trail] Could not parse graph data: ' + e.message] });
    }

    const EDGE_GROUPS = {
        calls: ['CALLS', 'PASSES_AS_ARGUMENT'],
        inherit: ['EXTENDS', 'IMPLEMENTS'],
        data: ['READS_FROM', 'WRITES_TO'],
        types: ['USES_AS_TYPE', 'INSTANCE_OF']
    };
    const FLOW_ORDER = ['view', 'state', 'service', 'model'];
    const VERBS = {
        CALLS: 'calls', EXTENDS: 'extends', IMPLEMENTS: 'implements', READS_FROM: 'reads',
        WRITES_TO: 'writes', USES_AS_TYPE: 'type', INSTANCE_OF: 'creates', PASSES_AS_ARGUMENT: 'passes'
    };
    const KEYWORDS = new Set(['abstract', 'as', 'async', 'await', 'class', 'const', 'else', 'enum', 'extends', 'extension', 'factory', 'final',
        'for', 'get', 'if', 'implements', 'import', 'in', 'is', 'late', 'mixin', 'new', 'null', 'on', 'override', 'required', 'return', 'set',
        'static', 'super', 'switch', 'this', 'throw', 'try', 'catch', 'var', 'void', 'while', 'with', 'yield', 'true', 'false']);
    const PALETTE = ['#6f42c1', '#e53935', '#fd7e14', '#28a744', '#007bff', '#333333'];
    const WIDTHS = [2, 4, 7];
    const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const DRAG_THRESHOLD = 4;

    const state = {
        filters: { showSdk: false, showPackages: true, groups: { calls: true, inherit: true, data: true, types: true } },
        layerEmphasis: null,
        sel: null,
        flowSel: null,
        trace: null,
        code: { mode: 'definition', refs: [], active: -1, snippet: null, loading: false, empty: false },
        snippetReq: 0,
        focus: null,
        depFocus: null,
        searchResults: [],
        searchActive: 0,
        offsets: new Map(),
        prevRects: new Map(),
        renderToken: 0,
        lastDragEnd: 0,
        edgeFrame: 0,
        hudOpen: !!((vscodeApi.getState && vscodeApi.getState()) || {}).hudOpen,
        paint: {
            editing: false, tool: 'pen', color: PALETTE[0], width: WIDTHS[1], fill: false, hidden: false,
            store: Paint.createStore(savedAnnotations), draft: null, erasing: false, saveTimer: 0
        }
    };
    const trail = M.createTrail();
    let model = buildModel();

    function buildModel() {
        const groups = state.filters.groups;
        const all = Object.keys(groups).every(function (k) { return groups[k]; });
        let labels = null;
        if (!all) {
            labels = new Set();
            Object.keys(groups).forEach(function (k) { if (groups[k]) { EDGE_GROUPS[k].forEach(function (l) { labels.add(l); }); } });
        }
        return M.createModel(graph, { showSdk: state.filters.showSdk, showPackages: state.filters.showPackages, edgeLabels: labels });
    }

    /* ---------- DOM helpers ---------- */
    const $ = function (id) { return document.getElementById(id); };
    function el(tag, attrs) {
        const node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                const v = attrs[k];
                if (v === false || v === null || v === undefined) { return; }
                if (k === 'class') { node.className = v; }
                else if (k === 'text') { node.textContent = v; }
                else { node.setAttribute(k, v === true ? '' : v); }
            });
        }
        for (let i = 2; i < arguments.length; i++) {
            const c = arguments[i];
            if (c === null || c === undefined || c === false) { continue; }
            node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        }
        return node;
    }
    function ico(name, size) { return Icons.create(name, size); }
    function kindIcon(kind, size) { return ico(Icons.iconForKind(kind), size || 13); }
    function setIcon(button, name, tip, size) {
        button.replaceChildren(ico(name, size || 15));
        button.title = tip;
        button.setAttribute('aria-label', tip);
    }
    function clickable(node, handler) {
        node.setAttribute('role', 'button');
        node.setAttribute('tabindex', '0');
        node.addEventListener('click', function (e) {
            e.stopPropagation();
            if (performance.now() - state.lastDragEnd < 250) { return; }
            handler(e);
        });
        return node;
    }
    function layerLabel(layer) { return t('layer.' + layer); }
    function sourceBadge(source) { return source === 'sdk' ? 'SDK' : source === 'external_package' ? 'pkg' : null; }
    function cssEscape(value) { return (window.CSS && CSS.escape) ? CSS.escape(value) : String(value).replace(/"/g, '\\"'); }
    function canvasOrigin() { return $('canvas').getBoundingClientRect(); }
    function rectRel(node) {
        const r = node.getBoundingClientRect();
        const c = canvasOrigin();
        return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
    }

    /* ---------- navigation ---------- */
    function resetSelection() {
        state.sel = null;
        state.flowSel = null;
        state.code = { mode: state.trace ? 'trace' : 'definition', refs: [], active: -1, snippet: null, loading: false, empty: false };
    }
    function navigate(id) {
        if (!id || !model.nodes.has(id)) { return; }
        trail.push(id);
        afterNavigation();
    }
    function afterNavigation() {
        resetSelection();
        state.offsets = new Map();
        render();
        postRelationships();
        const f = state.focus;
        if (f && !state.trace) { requestSnippet({ nodeId: f.focusId }, false); }
    }
    function goHome() {
        trail.push(null);
        afterNavigation();
    }
    function step(direction) {
        if (direction < 0 ? !trail.canBack() : !trail.canForward()) { return; }
        if (direction < 0) { trail.back(); } else { trail.forward(); }
        afterNavigation();
    }

    function postRelationships() {
        const f = state.depFocus;
        if (!f) { vscodeApi.postMessage({ command: 'clearRelationships' }); return; }
        const edges = [];
        function add(cards, incoming) {
            cards.forEach(function (g) {
                g.cards.forEach(function (c) {
                    const s = incoming ? c.id : f.ownerId;
                    const tg = incoming ? f.ownerId : c.id;
                    edges.push({ id: (incoming ? 'in:' : 'out:') + c.id, source: s, target: tg, label: c.dominantLabel, sourceNode: model.nodes.get(s), targetNode: model.nodes.get(tg) });
                });
            });
        }
        add(f.left, true);
        add(f.right, false);
        vscodeApi.postMessage({ command: 'showRelationships', data: { focusedNodeLabel: f.center.label, focusedNodeId: f.ownerId, edges: edges } });
    }

    /* ---------- snippet requests ---------- */
    function requestSnippet(params, reveal) {
        const id = ++state.snippetReq;
        state.code.loading = true;
        state.code.snippet = null;
        state.code.empty = false;
        renderCodeBody();
        vscodeApi.postMessage(Object.assign({ command: 'getSnippet', requestId: id, reveal: !!reveal }, params));
    }
    function selectRef(index, reveal) {
        const ref = state.code.refs[index];
        if (!ref) { return; }
        state.code.active = index;
        renderRefs();
        requestSnippet({ sourceId: ref.source, targetId: ref.target }, reveal !== false);
    }

    /* ---------- selection of connections ---------- */
    function selectCard(card, side) {
        state.sel = { cardId: card.id, side: side };
        state.flowSel = null;
        state.code.mode = 'edge';
        state.code.refs = card.refs.map(function (r) { return { source: r.source, target: r.target, label: r.label }; });
        applySelectionStyles();
        selectRef(0, true);
    }
    function selectFlow(from, to) {
        state.flowSel = { from: from, to: to };
        state.sel = null;
        state.code.mode = 'flow';
        state.code.refs = model.flowRefs(from, to);
        applySelectionStyles();
        renderLayerFlow();
        if (state.code.refs.length) { selectRef(0, true); } else { renderRefs(); }
    }
    function applySelectionStyles() {
        document.querySelectorAll('.card.selected').forEach(function (n) { n.classList.remove('selected'); });
        document.querySelectorAll('#edges .edge.selected').forEach(function (n) { n.classList.remove('selected'); });
        if (!state.sel) { return; }
        document.querySelectorAll('.card[data-id="' + cssEscape(state.sel.cardId) + '"][data-side="' + state.sel.side + '"]').forEach(function (n) { n.classList.add('selected'); });
        document.querySelectorAll('#edges .edge[data-card="' + cssEscape(state.sel.cardId) + '"][data-side="' + state.sel.side + '"]').forEach(function (n) { n.classList.add('selected'); });
    }

    /* ---------- data-flow trace ---------- */
    function startTrace(id) {
        const flow = model.traceFlow(id);
        if (!flow) { return; }
        state.trace = { startId: id, flow: flow, byEdge: new Map(flow.edges.map(function (e) { return [e.id, e]; })), nodeIds: new Set(flow.nodes.map(function (n) { return n.id; })) };
        state.sel = null;
        state.flowSel = null;
        state.offsets = new Map();
        state.code = { mode: 'trace', refs: [], active: 0, snippet: null, loading: false, empty: false };
        renderTopbar();
        renderStage({ animate: true });
        renderRefs();
        requestSnippet({ nodeId: id }, false);
    }
    function clearTrace() {
        if (!state.trace) { return; }
        state.trace = null;
        state.offsets = new Map();
        resetSelection();
        renderTopbar();
        renderStage({ animate: true });
        renderRefs();
        if (state.focus) { requestSnippet({ nodeId: state.focus.focusId }, false); } else { renderCodeBody(); }
    }
    function selectTraceRow(index) {
        const row = traceRows()[index];
        if (!row) { return; }
        state.code.active = index;
        renderRefs();
        if (row.via) { requestSnippet({ sourceId: row.via.source, targetId: row.via.target }, true); }
        else { requestSnippet({ nodeId: row.id }, true); }
    }
    function traceRows() {
        if (!state.trace) { return []; }
        const nodes = state.trace.flow.nodes;
        const providers = nodes.filter(function (n) { return n.depth < 0; }).sort(function (a, b) { return b.depth - a.depth || a.name.localeCompare(b.name); });
        const start = nodes.filter(function (n) { return n.depth === 0; });
        const consumers = nodes.filter(function (n) { return n.depth > 0; });
        return providers.concat(start, consumers);
    }

    /**
     * In a trace the diagram is re-arranged so data always reads left to right: the boxes that provide data go on
     * the left of the focus, the ones that consume it on the right. Boxes with no data link are left out.
     */
    function traceFocus(f) {
        const trace = state.trace;
        const left = new Map();
        const right = new Map();
        function add(card) {
            card.refs.forEach(function (r) {
                const fe = trace.byEdge.get(r.id);
                if (!fe) { return; }
                const isProvider = model.ownerOf(fe.provider) === card.id;
                const side = isProvider ? left : right;
                const otherEnd = model.ownerOf(r.source) === card.id ? r.source : r.target;
                const centerEnd = otherEnd === r.source ? r.target : r.source;
                let c = side.get(card.id);
                if (!c) {
                    c = { id: card.id, label: card.label, kind: card.kind, layer: card.layer, source: card.source, inDeg: card.inDeg, outDeg: card.outDeg,
                        edgeCount: 0, byLabel: {}, refs: [], memberIds: [], centerMemberIds: [], violation: false };
                    side.set(card.id, c);
                }
                c.edgeCount++;
                c.byLabel[r.label] = (c.byLabel[r.label] || 0) + 1;
                c.refs.push({ id: r.id, source: r.source, target: r.target, label: r.label, incoming: isProvider });
                if (otherEnd !== card.id && c.memberIds.indexOf(otherEnd) < 0) { c.memberIds.push(otherEnd); }
                if (c.centerMemberIds.indexOf(centerEnd) < 0) { c.centerMemberIds.push(centerEnd); }
            });
        }
        f.left.forEach(function (g) { g.cards.forEach(add); });
        f.right.forEach(function (g) { g.cards.forEach(add); });

        function group(side) {
            const cards = Array.from(side.values());
            cards.forEach(function (c) {
                c.dominantLabel = M.dominantLabel(c.byLabel);
                c.members = c.memberIds.map(function (id) { const n = model.nodes.get(id); return { id: id, label: M.stripDecor(n.label), kind: n.kind }; });
            });
            return M.LAYERS.map(function (layer) {
                return { layer: layer, cards: cards.filter(function (c) { return c.layer === layer; }).sort(function (a, b) { return b.edgeCount - a.edgeCount || a.label.localeCompare(b.label); }) };
            }).filter(function (g) { return g.cards.length > 0; });
        }
        return Object.assign({}, f, { left: group(left), right: group(right), traceMode: true });
    }

    /* ---------- rendering ---------- */
    function render() {
        renderTopbar();
        renderLayerFlow();
        renderStage({ animate: true });
        renderRefs();
        renderCodeBody();
    }

    function renderTopbar() {
        $('btn-back').disabled = !trail.canBack();
        $('btn-forward').disabled = !trail.canForward();
        const crumbs = $('trail-crumbs');
        crumbs.replaceChildren();
        const items = trail.list();
        const idx = trail.index();
        const start = Math.max(0, items.length - 6);
        if (start > 0) { crumbs.appendChild(el('span', { class: 'crumb-sep', text: '…' })); }
        for (let i = start; i < items.length; i++) {
            if (i > start) { crumbs.appendChild(el('span', { class: 'crumb-sep', text: '›' })); }
            const id = items[i];
            const label = id === null ? t('trail.home') : model.nameOf(id);
            const crumb = el('span', { class: 'crumb' + (i === idx ? ' current' : ''), title: label + ' — ' + t('trail.tip.crumb'), text: label });
            (function (target) {
                clickable(crumb, function () { trail.goTo(target); afterNavigation(); });
            })(i);
            crumbs.appendChild(crumb);
        }
        renderTraceBar();
    }

    function renderTraceBar() {
        const box = $('flowpath');
        box.replaceChildren();
        const trace = state.trace;
        if (!trace) { box.hidden = true; return; }
        box.hidden = false;
        const flow = trace.flow;
        box.appendChild(ico('trace', 15));
        box.appendChild(el('span', { class: 'flow-label', text: t('trail.trace.title') }));
        box.appendChild(clickable(el('span', { class: 'crumb current', title: t('trail.ctx.focus'), text: model.nameOf(trace.startId) }), function () { navigate(trace.startId); }));
        box.appendChild(el('span', { class: 'trace-summary', text: t('trail.trace.summary', String(flow.upstream), String(flow.downstream)) }));
        box.appendChild(el('span', { class: 'trace-summary trace-direction' }, ico('arrow-down', 12), t('trail.trace.hint')));
        if (flow.truncated) { box.appendChild(el('span', { class: 'trace-summary', text: t('trail.trace.truncated') })); }
        const clear = el('button', { title: t('trail.ctx.clearTrace.desc') }, ico('close', 12), ' ' + t('trail.trace.clear'));
        clear.addEventListener('click', clearTrace);
        box.appendChild(clear);
    }

    function renderFilters() {
        const box = $('filters');
        box.replaceChildren();
        function check(label, tip, icon, checked, onChange) {
            const input = el('input', { type: 'checkbox' });
            input.checked = checked;
            input.addEventListener('change', function () { onChange(input.checked); });
            return el('label', { title: tip }, input, ico(icon, 13), label);
        }
        box.appendChild(check(t('trail.showSdk'), t('trail.tip.sdk'), 'sdk', state.filters.showSdk, function (v) { state.filters.showSdk = v; refilter(); }));
        box.appendChild(check(t('trail.showPackages'), t('trail.tip.packages'), 'package', state.filters.showPackages, function (v) { state.filters.showPackages = v; refilter(); }));
        Object.keys(EDGE_GROUPS).forEach(function (g) {
            const btn = el('button', {
                class: 'chip-toggle e-' + EDGE_GROUPS[g][0], 'aria-pressed': String(state.filters.groups[g]),
                title: t('trail.tip.filter.' + g), text: t('trail.filter.' + g)
            });
            btn.addEventListener('click', function () {
                state.filters.groups[g] = !state.filters.groups[g];
                refilter();
                renderFilters();
            });
            box.appendChild(btn);
        });
    }
    function refilter() {
        model = buildModel();
        const startId = state.trace && model.nodes.has(state.trace.startId) ? state.trace.startId : null;
        state.trace = null;
        resetSelection();
        render();
        postRelationships();
        if (startId) { startTrace(startId); }
        else if (state.focus) { requestSnippet({ nodeId: state.focus.focusId }, false); }
    }

    function renderLayerFlow() {
        const strip = $('layerflow');
        strip.replaceChildren();
        const flows = model.layerFlow();
        const get = function (a, b) { return flows.find(function (f) { return f.from === a && f.to === b; }); };
        strip.appendChild(el('span', { class: 'flow-label', text: t('trail.layerFlow') }));

        function pill(layer) {
            const p = el('button', {
                class: 'layer-pill layer-' + layer, 'aria-pressed': String(state.layerEmphasis === layer),
                title: t('trail.tip.layer', layerLabel(layer)) + ' — ' + t('hud.layer.' + layer)
            }, ico('layer-' + layer, 14), layerLabel(layer));
            p.addEventListener('click', function () { state.layerEmphasis = state.layerEmphasis === layer ? null : layer; renderStage({ animate: false }); renderLayerFlow(); });
            return p;
        }
        function flowChip(f, prefix) {
            const pressed = !!(state.flowSel && state.flowSel.from === f.from && state.flowSel.to === f.to);
            const tip = t('trail.tip.flowChip', layerLabel(f.from), layerLabel(f.to), String(f.count));
            const chip = el('button', {
                class: 'flow-chip' + (f.violation ? ' violation' : ''), 'aria-pressed': String(pressed),
                title: f.violation ? t('trail.violation') + '. ' + tip : tip
            }, f.violation ? ico('warning', 12) : null, (prefix || '') + f.count);
            chip.addEventListener('click', function () { selectFlow(f.from, f.to); });
            return chip;
        }

        const shown = new Set();
        FLOW_ORDER.forEach(function (layer, i) {
            strip.appendChild(pill(layer));
            if (i < FLOW_ORDER.length - 1) {
                const f = get(layer, FLOW_ORDER[i + 1]);
                strip.appendChild(el('span', { class: 'flow-arrow' }, '→', f ? flowChip(f) : null));
                if (f) { shown.add(f.from + '>' + f.to); }
            }
        });
        strip.appendChild(pill('utility'));

        flows.filter(function (f) { return !shown.has(f.from + '>' + f.to); })
            .sort(function (a, b) { return (b.violation - a.violation) || (b.count - a.count); })
            .forEach(function (f) {
                const arrow = f.from === f.to ? '↻' : '→';
                const label = f.from === f.to
                    ? layerLabel(f.from) + ' ' + arrow + ' '
                    : layerLabel(f.from) + ' ' + arrow + ' ' + layerLabel(f.to) + ' ';
                strip.appendChild(flowChip(f, label));
            });
    }

    function captureRects() {
        const map = new Map();
        document.querySelectorAll('.card[data-key]').forEach(function (n) { map.set(n.dataset.key, rectRel(n)); });
        return map;
    }

    function renderStage(options) {
        const animate = !options || options.animate !== false;
        const columns = $('columns');
        if (animate) { state.prevRects = captureRects(); }
        const token = ++state.renderToken;
        columns.replaceChildren();
        $('edges').replaceChildren();
        const current = trail.current();
        state.depFocus = current ? model.focus(current) : null;
        state.focus = state.depFocus && state.trace ? traceFocus(state.depFocus) : state.depFocus;
        if (state.focus) { renderFocus(state.focus, columns); } else { renderOverview(columns); }
        renderPaint();

        const finish = function () {
            if (token !== state.renderToken) { return; }
            drawEdges(animate && !REDUCED_MOTION);
            renderPaint();
        };
        if (animate && !REDUCED_MOTION) {
            requestAnimationFrame(function () {
                if (token !== state.renderToken) { return; }
                animateEntrance().then(finish);
            });
        } else {
            requestAnimationFrame(finish);
        }
    }

    /** Boxes that already existed glide to their new place; new ones emerge from the centre box, like nested nodes unfolding. */
    function animateEntrance() {
        const animations = [];
        const duration = 340;
        const easing = 'cubic-bezier(.2,.8,.2,1)';
        const centerEl = document.querySelector('.card.center');
        const centerRect = centerEl ? rectRel(centerEl) : null;
        let order = 0;
        document.querySelectorAll('.card[data-key]').forEach(function (cardEl) {
            const id = cardEl.dataset.id;
            const now = rectRel(cardEl);
            const prev = state.prevRects.get(cardEl.dataset.key) || state.prevRects.get('center:' + id)
                || state.prevRects.get('left:' + id) || state.prevRects.get('right:' + id);
            if (prev) {
                const dx = prev.x - now.x;
                const dy = prev.y - now.y;
                if (Math.abs(dx) + Math.abs(dy) > 1) {
                    animations.push(cardEl.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: duration, easing: easing }));
                }
            } else if (centerRect && !cardEl.classList.contains('center')) {
                const dx = (centerRect.x + centerRect.w / 2) - (now.x + now.w / 2);
                const dy = (centerRect.y + centerRect.h / 2) - (now.y + now.h / 2);
                animations.push(cardEl.animate(
                    [{ transform: 'translate(' + dx * 0.55 + 'px,' + dy * 0.55 + 'px) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }],
                    { duration: duration, easing: easing, delay: Math.min(order++ * 28, 280), fill: 'backwards' }));
            } else {
                animations.push(cardEl.animate([{ transform: 'scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: duration, easing: easing, fill: 'backwards' }));
            }
        });
        document.querySelectorAll('.layer-group, .overview-col').forEach(function (n) {
            animations.push(n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out', fill: 'backwards' }));
        });
        document.querySelectorAll('.overview-item').forEach(function (n, i) {
            animations.push(n.animate([{ transform: 'translateY(8px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }],
                { duration: 260, easing: easing, delay: Math.min(i * 18, 260), fill: 'backwards' }));
        });
        return Promise.all(animations.map(function (a) { return a.finished.catch(function () { return null; }); }));
    }

    function countBadge(text, tip, extraClass) {
        return el('span', { class: 'badge ' + (extraClass || ''), title: tip, text: text });
    }

    function renderOverview(columns) {
        const o = model.overview();
        const total = o.layers.reduce(function (n, l) { return n + l.classes.length; }, 0);
        columns.style.display = 'block';
        if (total === 0) { columns.appendChild(el('p', { class: 'overview-hint', text: t('trail.empty') })); return; }
        columns.appendChild(el('p', { class: 'overview-hint' }, ico('pointer', 14), t('trail.overviewHint')));
        const grid = el('div', { id: 'overview' });
        o.layers.forEach(function (l) {
            const col = el('div', { class: 'overview-col layer-' + l.layer + (state.layerEmphasis && state.layerEmphasis !== l.layer ? ' dim' : ''), title: t('hud.layer.' + l.layer) });
            col.appendChild(el('h3', null, ico('layer-' + l.layer, 15), layerLabel(l.layer), el('span', { class: 'n', text: String(l.classes.length) })));
            l.classes.forEach(function (c) {
                const badge = sourceBadge(c.source);
                const item = el('button', { class: 'overview-item layer-' + c.layer + (c.inDeg + c.outDeg === 0 ? ' idle' : ''), 'data-id': c.id, title: c.label + ' — ' + t('trail.tip.member') },
                    kindIcon(c.kind, 14),
                    el('span', { class: 'name', text: c.label }),
                    badge ? countBadge(badge, t('hud.boxes.source'), 'source') : null,
                    countBadge('↘' + c.inDeg + ' ↗' + c.outDeg, t('trail.tip.inout')));
                item.addEventListener('click', function () { navigate(c.id); });
                col.appendChild(item);
            });
            grid.appendChild(col);
        });
        columns.appendChild(grid);
    }

    function memberRow(m, extra) {
        const inFlow = state.trace && state.trace.nodeIds.has(m.id);
        const kindClass = (m.kind === 'method' || m.kind === 'function' || m.kind === 'constructor') ? ' kind-method'
            : (m.kind === 'field' || m.kind === 'property') ? ' kind-field' : '';
        const row = el('div', {
            class: 'member' + kindClass + (extra && extra.active ? ' active' : '') + (inFlow ? ' in-flow' : ''), 'data-id': m.id,
            title: m.label + ' — ' + t('trail.tip.member')
        },
            el('span', { class: 'mk' }, kindIcon(m.kind, 12)),
            el('span', { class: 'label', text: m.label }),
            extra && extra.io ? el('span', { class: 'io', title: t('trail.tip.inout'), text: extra.io }) : null);
        return clickable(row, function () { navigate(m.id); });
    }

    function applyOffset(node, key) {
        const o = state.offsets.get(key);
        if (o) {
            node.style.translate = o.x + 'px ' + o.y + 'px';
            node.classList.add('moved');
        }
    }

    function neighborCard(card, side) {
        const key = side + ':' + card.id;
        const traced = !!state.trace;
        const dim = state.layerEmphasis && state.layerEmphasis !== card.layer;
        const node = el('div', {
            class: 'card' + (card.violation ? ' violation' : '') + (dim ? ' dim' : '') + (traced ? ' in-flow' : ''),
            'data-id': card.id, 'data-side': side, 'data-key': key, 'data-layer': card.layer
        });
        const badge = sourceBadge(card.source);
        const head = el('div', { class: 'card-head', title: (card.violation ? t('trail.violation') + '. ' : '') + t('trail.tip.card') },
            kindIcon(card.kind, 15),
            el('span', { class: 'name', text: card.label }),
            badge ? countBadge(badge, t('hud.boxes.source'), 'source') : null,
            countBadge(String(card.edgeCount), t('trail.tip.count'), 'count'));
        clickable(head, function () { navigate(card.id); });
        makeDraggable(head, node, key);
        node.appendChild(head);
        if (card.members.length) {
            const list = el('div', { class: 'members' });
            card.members.slice(0, 6).forEach(function (m) { list.appendChild(memberRow(m)); });
            if (card.members.length > 6) { list.appendChild(el('div', { class: 'card-foot', text: t('trail.more', String(card.members.length - 6)) })); }
            node.appendChild(list);
        }
        applyOffset(node, key);
        return node;
    }

    function sideColumn(groups, side, title, emptyText) {
        const col = el('div', { class: 'column side-' + side });
        col.appendChild(el('div', { class: 'column-title', text: title }));
        if (!groups.length) { col.appendChild(el('div', { class: 'empty-side', text: emptyText })); }
        groups.forEach(function (g) {
            const key = 'group:' + side + ':' + g.layer;
            const group = el('div', { class: 'layer-group layer-' + g.layer });
            const band = el('div', { class: 'layer-band', title: t('trail.tip.band') }, ico('layer-' + g.layer, 13), layerLabel(g.layer));
            makeDraggable(band, group, key);
            group.appendChild(band);
            g.cards.forEach(function (c) { group.appendChild(neighborCard(c, side)); });
            applyOffset(group, key);
            col.appendChild(group);
        });
        return col;
    }

    function renderFocus(f, columns) {
        columns.style.display = 'grid';
        const center = el('div', { class: 'column side-center' });
        center.appendChild(el('div', { class: 'column-title', text: t('trail.members') }));
        if (f.activeMemberId) {
            const scope = el('div', { class: 'scope-chip' }, t('trail.scope', model.nameOf(f.activeMemberId)));
            const clear = el('button', { title: t('trail.backToClass'), 'aria-label': t('trail.backToClass') }, ico('close', 11));
            clear.addEventListener('click', function () { navigate(f.ownerId); });
            scope.appendChild(clear);
            center.appendChild(scope);
        }
        const c = f.center;
        const key = 'center:' + c.id;
        const isStart = state.trace && model.ownerOf(state.trace.startId) === c.id;
        const card = el('div', { class: 'card center' + (isStart ? ' trace-start' : ''), 'data-id': c.id, 'data-key': key, 'data-layer': c.layer });
        const badge = sourceBadge(c.source);
        const head = el('div', { class: 'card-head', title: t('trail.tip.card') },
            kindIcon(c.kind, 16),
            el('span', { class: 'name', text: c.label }),
            badge ? countBadge(badge, t('hud.boxes.source'), 'source') : null,
            el('span', { class: 'badge', title: t('hud.layer.' + c.layer) }, ico('layer-' + c.layer, 11), layerLabel(c.layer)));
        clickable(head, function () { navigate(c.id); });
        makeDraggable(head, card, key);
        card.appendChild(head);
        if (c.members.length) {
            const list = el('div', { class: 'members' });
            c.members.forEach(function (m) {
                list.appendChild(memberRow(m, { active: m.id === f.activeMemberId, io: (m.inCount || m.outCount) ? '↘' + m.inCount + ' ↗' + m.outCount : '' }));
            });
            card.appendChild(list);
        }
        if (c.internalCount) { card.appendChild(el('div', { class: 'card-foot', text: t('trail.internal', String(c.internalCount)) })); }
        applyOffset(card, key);
        center.appendChild(card);
        const trace = el('button', { title: t('trail.tip.traceButton') }, ico('trace', 14), t('trail.traceFlow'));
        trace.addEventListener('click', function () { startTrace(f.focusId); });
        center.appendChild(el('div', { class: 'center-actions' }, trace));

        const leftTitle = f.traceMode ? t('trail.trace.leftTitle') : t('trail.usedBy');
        const rightTitle = f.traceMode ? t('trail.trace.rightTitle') : t('trail.uses');
        const leftEmpty = f.traceMode ? t('trail.trace.empty') : t('trail.noneUsedBy');
        const rightEmpty = f.traceMode ? t('trail.trace.empty') : t('trail.noneUses');
        columns.appendChild(sideColumn(f.left, 'left', leftTitle, leftEmpty));
        columns.appendChild(center);
        columns.appendChild(sideColumn(f.right, 'right', rightTitle, rightEmpty));
    }

    /* ---------- dragging boxes ---------- */
    function makeDraggable(handle, target, key) {
        handle.classList.add('drag-handle');
        handle.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || state.paint.editing) { return; }
            const startX = e.clientX;
            const startY = e.clientY;
            const base = state.offsets.get(key) || { x: 0, y: 0 };
            let moved = false;

            function onMove(ev) {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (!moved) {
                    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) { return; }
                    moved = true;
                    target.classList.add('dragging');
                    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
                }
                const next = { x: base.x + dx, y: base.y + dy };
                state.offsets.set(key, next);
                target.style.translate = next.x + 'px ' + next.y + 'px';
                target.classList.add('moved');
                scheduleEdges();
            }
            function onUp() {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
                target.classList.remove('dragging');
                if (moved) { state.lastDragEnd = performance.now(); }
            }
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        });
    }
    function scheduleEdges() {
        if (state.edgeFrame) { return; }
        state.edgeFrame = requestAnimationFrame(function () { state.edgeFrame = 0; drawEdges(false); });
    }

    /* ---------- edges ---------- */
    const SVG_NS = 'http://www.w3.org/2000/svg';
    function svgEl(tag, attrs) {
        const n = document.createElementNS(SVG_NS, tag);
        Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
        return n;
    }

    function drawEdges(animate) {
        const svg = $('edges');
        svg.replaceChildren();
        const f = state.focus;
        if (!f) { return; }
        const centerCard = document.querySelector('.card.center');
        if (!centerCard) { return; }
        const canvasRect = canvasOrigin();
        svg.setAttribute('height', String($('canvas').scrollHeight));

        const defs = svgEl('defs');
        const marker = svgEl('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto', markerUnits: 'userSpaceOnUse' });
        marker.appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z' }));
        defs.appendChild(marker);
        svg.appendChild(defs);

        const cr = centerCard.getBoundingClientRect();
        const all = [];
        f.left.forEach(function (g) { g.cards.forEach(function (c) { all.push({ card: c, side: 'left' }); }); });
        f.right.forEach(function (g) { g.cards.forEach(function (c) { all.push({ card: c, side: 'right' }); }); });

        all.forEach(function (item) {
            const card = item.card;
            const side = item.side;
            const cardEl = document.querySelector('.card[data-id="' + cssEscape(card.id) + '"][data-side="' + side + '"]');
            if (!cardEl) { return; }
            const headRect = cardEl.querySelector('.card-head').getBoundingClientRect();
            const cardRect = cardEl.getBoundingClientRect();
            let anchor = null;
            for (let i = 0; i < card.centerMemberIds.length && !anchor; i++) {
                anchor = centerCard.querySelector('.member[data-id="' + cssEscape(card.centerMemberIds[i]) + '"]');
            }
            const ar = (anchor || centerCard.querySelector('.card-head')).getBoundingClientRect();
            const cy = ar.top + ar.height / 2 - canvasRect.top;
            const ny = headRect.top + headRect.height / 2 - canvasRect.top;
            // Connect through the side that faces the other box, so dragging a box across the centre still reads well.
            const cardIsLeftOfCenter = cardRect.left + cardRect.width / 2 < cr.left + cr.width / 2;
            const cardEdgeX = (cardIsLeftOfCenter ? cardRect.right : cardRect.left) - canvasRect.left;
            const centerEdgeX = (cardIsLeftOfCenter ? cr.left : cr.right) - canvasRect.left;
            let x1, y1, x2, y2;
            if (side === 'left') { x1 = cardEdgeX; y1 = ny; x2 = centerEdgeX; y2 = cy; }
            else { x1 = centerEdgeX; y1 = cy; x2 = cardEdgeX; y2 = ny; }
            const dx = (x2 - x1) / 2;
            const d = 'M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2;
            const width = 1.5 + Math.min(card.edgeCount, 8) * 0.55;
            const dim = state.layerEmphasis && state.layerEmphasis !== card.layer;
            const group = svgEl('g', {
                class: 'edge e-' + card.dominantLabel + (card.violation ? ' violation' : '') + (dim ? ' dim' : '') + (state.trace ? ' in-flow' : ''),
                'data-card': card.id, 'data-side': side
            });
            group.appendChild(svgEl('path', { class: 'edge-path', d: d, 'stroke-width': String(width), 'marker-end': 'url(#arrow)' }));
            const hit = svgEl('path', { class: 'hit', d: d });
            group.appendChild(hit);
            // Chips sit close to the neighbour box (not at the midpoint) so edges to a busy hub do not stack their counters.
            const bt = side === 'left' ? 0.22 : 0.78;
            const u = 1 - bt;
            const mx = u * u * u * x1 + 3 * u * u * bt * (x1 + dx) + 3 * u * bt * bt * (x2 - dx) + bt * bt * bt * x2;
            const my = u * u * u * y1 + 3 * u * u * bt * y1 + 3 * u * bt * bt * y2 + bt * bt * bt * y2;
            const text = String(card.edgeCount);
            const w = 12 + text.length * 7;
            const chip = svgEl('g', { class: 'edge-chip' });
            chip.appendChild(svgEl('rect', { x: String(mx - w / 2), y: String(my - 9), width: String(w), height: '18', rx: '9' }));
            const label = svgEl('text', { x: String(mx), y: String(my) });
            label.textContent = text;
            chip.appendChild(label);
            const title = svgEl('title');
            title.textContent = t('trail.tip.edgeChip', VERBS[card.dominantLabel] || card.dominantLabel, String(card.edgeCount));
            chip.appendChild(title);
            group.appendChild(chip);
            const select = function () { selectCard(card, side); };
            hit.addEventListener('click', select);
            chip.addEventListener('click', select);
            svg.appendChild(group);
            if (animate) { group.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out', fill: 'backwards' }); }
        });
        applySelectionStyles();
    }

    /* ---------- refs list + code ---------- */
    function renderRefs() {
        const box = $('refs');
        box.replaceChildren();
        const f = state.focus;
        const code = state.code;

        if (state.trace && code.mode === 'trace') { renderTraceRefs(box); return; }

        if (code.mode === 'definition') {
            box.appendChild(el('h4', { text: t('trail.connections') }));
            const cards = [];
            if (f) {
                f.left.forEach(function (g) { g.cards.forEach(function (c) { cards.push({ c: c, side: 'left' }); }); });
                f.right.forEach(function (g) { g.cards.forEach(function (c) { cards.push({ c: c, side: 'right' }); }); });
            }
            if (!cards.length) { box.appendChild(el('div', { class: 'ref-empty', text: f ? t('trail.noneUses') : t('trail.pickConnection') })); return; }
            box.appendChild(el('div', { class: 'ref-empty', text: t('trail.pickConnection') }));
            cards.forEach(function (item) {
                const row = el('div', { class: 'ref-row e-' + item.c.dominantLabel },
                    el('div', { class: 'ref-line' },
                        el('span', { class: 'verb', text: item.side === 'left' ? '→ ' + (VERBS[item.c.dominantLabel] || '') : (VERBS[item.c.dominantLabel] || '') + ' →' }),
                        kindIcon(item.c.kind, 12),
                        el('span', { class: 'ref-name', text: item.c.label }),
                        el('span', { class: 'badge count', title: t('trail.tip.count'), text: String(item.c.edgeCount) })));
                clickable(row, function () { selectCard(item.c, item.side); });
                box.appendChild(row);
            });
            return;
        }
        box.appendChild(el('h4', { text: t('trail.references') + ' (' + code.refs.length + ')' }));
        if (!code.refs.length) { box.appendChild(el('div', { class: 'ref-empty', text: t('trail.noSnippet') })); return; }
        code.refs.forEach(function (ref, i) {
            const row = el('div', { class: 'ref-row e-' + ref.label + (i === code.active ? ' active' : '') },
                el('div', { class: 'ref-line' },
                    clickable(el('span', { class: 'ref-name', text: model.nameOf(ref.source) }), function () { navigate(ref.source); }),
                    el('span', { class: 'verb', text: VERBS[ref.label] || ref.label }),
                    clickable(el('span', { class: 'ref-name', text: model.nameOf(ref.target) }), function () { navigate(ref.target); })));
            clickable(row, function () { selectRef(i, true); });
            box.appendChild(row);
        });
    }

    function renderTraceRefs(box) {
        const trace = state.trace;
        box.appendChild(el('h4', { text: t('trail.trace.title') + ' · ' + model.nameOf(trace.startId) }));
        const rows = traceRows();
        if (rows.length <= trace.flow.seeds.length) { box.appendChild(el('div', { class: 'ref-empty', text: t('trail.trace.empty') })); }
        let lastSection = null;
        rows.forEach(function (row, i) {
            const section = row.depth < 0 ? 'providers' : row.depth > 0 ? 'consumers' : 'start';
            if (section !== lastSection && section !== 'start') {
                box.appendChild(el('div', { class: 'trace-section' }, ico('arrow-down', 11), t('trail.trace.' + section)));
            }
            lastSection = section;
            if (section === 'start' && row.id !== trace.startId) { return; }
            const verb = row.via ? el('span', { class: 'verb', text: VERBS[row.via.label] || row.via.label }) : el('span', { class: 'verb', text: t('trail.trace.start') });
            const glyph = row.depth === 0 ? ico('dot', 12) : ico('arrow-down', 12);
            const line = el('div', { class: 'ref-line', style: 'padding-left:' + (Math.max(0, Math.abs(row.depth) - 1) * 14) + 'px' },
                el('span', { class: 'flow-glyph' }, glyph),
                clickable(el('span', { class: 'ref-name', text: row.name }), function () { navigate(row.id); }),
                verb);
            const r = el('div', { class: 'ref-row' + (row.via ? ' e-' + row.via.label : '') + (i === state.code.active ? ' active' : '') }, line);
            clickable(r, function () { selectTraceRow(i); });
            box.appendChild(r);
        });
    }

    function highlightCode(text, mark) {
        const frag = document.createDocumentFragment();
        function tokens(segment, parent) {
            const re = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|\b([A-Za-z_]\w*)\b/g;
            let last = 0;
            let m;
            while ((m = re.exec(segment)) !== null) {
                if (m.index > last) { parent.appendChild(document.createTextNode(segment.slice(last, m.index))); }
                if (m[1]) { parent.appendChild(el('span', { class: 'tok-cm', text: m[1] })); }
                else if (m[2]) { parent.appendChild(el('span', { class: 'tok-st', text: m[2] })); }
                else if (KEYWORDS.has(m[3])) { parent.appendChild(el('span', { class: 'tok-kw', text: m[3] })); }
                else { parent.appendChild(document.createTextNode(m[3])); }
                last = re.lastIndex;
            }
            if (last < segment.length) { parent.appendChild(document.createTextNode(segment.slice(last))); }
        }
        if (mark && mark.end > mark.start && mark.start <= text.length) {
            tokens(text.slice(0, mark.start), frag);
            const m = el('mark');
            tokens(text.slice(mark.start, mark.end), m);
            frag.appendChild(m);
            tokens(text.slice(mark.end), frag);
        } else {
            tokens(text, frag);
        }
        return frag;
    }

    function renderCodeBody() {
        const body = $('code-body');
        body.replaceChildren();
        const code = state.code;
        const s = code.snippet;
        $('btn-open').hidden = !s;
        $('code-title').textContent = s ? s.title : '';
        $('code-file').textContent = s ? decodeURIComponent(s.file.split('/').pop() || '') : '';
        if (code.loading) { body.appendChild(el('div', { class: 'code-empty', text: t('trail.loading') })); return; }
        if (!s) { body.appendChild(el('div', { class: 'code-empty', text: code.empty ? t('trail.noSnippet') : t('trail.pickConnection') })); return; }
        s.lines.forEach(function (text, i) {
            const line = s.startLine + i;
            const isHit = s.highlightLine === line;
            const mark = isHit ? { start: s.jump.start.character, end: s.jump.end.character } : null;
            const tx = el('span', { class: 'tx' });
            tx.appendChild(highlightCode(text, mark));
            body.appendChild(el('div', { class: 'code-line' + (isHit ? ' hl' : ''), 'data-line': String(line) }, el('span', { class: 'ln', text: String(line + 1) }), tx));
        });
        const target = body.querySelector('.hl');
        if (target) { target.scrollIntoView({ block: 'center' }); }
    }

    /* ---------- context menu ---------- */
    function closeMenu() {
        const menu = $('ctxmenu');
        if (!menu.hidden) { menu.hidden = true; menu.replaceChildren(); }
    }
    function menuTargetId(target) {
        const member = target.closest && target.closest('.member[data-id]');
        if (member) { return member.dataset.id; }
        const card = target.closest && target.closest('.card[data-id]');
        if (card) { return card.dataset.id; }
        const item = target.closest && target.closest('.overview-item[data-id]');
        return item ? item.dataset.id : null;
    }
    function openInEditor(id) {
        const node = model.nodes.get(id);
        const range = model.nodeRange(id);
        if (!node || !range || !node.data.fileUri) { return; }
        vscodeApi.postMessage({ command: 'openClass', file: node.data.fileUri, start: range.start, end: range.end });
    }
    function openMenu(x, y, id) {
        const menu = $('ctxmenu');
        menu.replaceChildren();
        menu.appendChild(el('div', { class: 'menu-title' }, kindIcon(model.nodes.get(id).kind, 12), model.nameOf(id)));
        function item(label, desc, icon, action) {
            const b = el('button', { role: 'menuitem', type: 'button' },
                el('span', { class: 'glyph' }, ico(icon, 15)),
                el('span', { class: 'text' }, el('span', { class: 'label', text: label }), el('span', { class: 'desc', text: desc })));
            b.addEventListener('click', function () { closeMenu(); action(); });
            menu.appendChild(b);
        }
        item(t('trail.ctx.trace'), t('trail.ctx.trace.desc'), 'trace', function () {
            if (!state.focus) { navigate(id); }
            startTrace(id);
        });
        if (state.trace) { item(t('trail.ctx.clearTrace'), t('trail.ctx.clearTrace.desc'), 'close', clearTrace); }
        item(t('trail.ctx.focus'), t('trail.ctx.focus.desc'), 'focus', function () { navigate(id); });
        item(t('trail.ctx.open'), t('trail.ctx.open.desc'), 'open', function () { openInEditor(id); });
        menu.hidden = false;
        const w = menu.offsetWidth;
        const h = menu.offsetHeight;
        menu.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + 'px';
        menu.style.top = Math.max(4, Math.min(y, window.innerHeight - h - 4)) + 'px';
        const first = menu.querySelector('button');
        if (first) { first.focus(); }
    }

    /* ---------- legend (HUD) ---------- */
    function hudEdgeSample(label, extraClass) {
        const svg = svgEl('svg', { viewBox: '0 0 64 16', width: '64', height: '16', class: 'hud-edge e-' + label + (extraClass ? ' ' + extraClass : ''), 'aria-hidden': 'true' });
        svg.appendChild(svgEl('path', { class: 'edge-path', d: 'M2,8 L54,8' }));
        svg.appendChild(svgEl('path', { class: 'edge-head', d: 'M50,4 L58,8 L50,12 Z' }));
        return svg;
    }
    function hudRow(sample, text) {
        return el('div', { class: 'hud-row' }, el('span', { class: 'hud-sample' }, sample), el('span', { class: 'hud-text', text: text }));
    }
    function buildHud() {
        const hud = $('hud');
        hud.replaceChildren();
        if (!state.hudOpen) { hud.hidden = true; return; }
        hud.hidden = false;
        const close = el('button', { class: 'hud-close' });
        setIcon(close, 'close', t('hud.close'), 13);
        close.addEventListener('click', function () { setHud(false); });
        const panel = el('div', { class: 'hud-panel', role: 'dialog', 'aria-label': t('hud.title') },
            el('div', { class: 'hud-head' }, ico('help', 16), el('h2', { text: t('hud.title') }), close));

        const layers = el('section', null, el('h3', { text: t('hud.layers') }), el('p', { class: 'hud-note', text: t('hud.layers.desc') }));
        M.LAYERS.forEach(function (layer) {
            layers.appendChild(hudRow(el('span', { class: 'hud-layer layer-' + layer }, ico('layer-' + layer, 14)),
                layerLabel(layer) + ' — ' + t('hud.layer.' + layer)));
        });
        panel.appendChild(layers);

        const boxes = el('section', null, el('h3', { text: t('hud.boxes') }));
        boxes.appendChild(hudRow(el('span', { class: 'hud-box-container layer-state' }), t('hud.boxes.container')));
        boxes.appendChild(hudRow(el('span', { class: 'hud-box-class layer-state' }, ico('class', 13)), t('hud.boxes.class')));
        boxes.appendChild(hudRow(el('span', { class: 'member kind-method hud-pill' }, el('span', { class: 'mk' }, ico('method', 12)), 'method'), t('hud.boxes.method')));
        boxes.appendChild(hudRow(el('span', { class: 'member kind-field hud-pill' }, el('span', { class: 'mk' }, ico('field', 12)), 'field'), t('hud.boxes.field')));
        boxes.appendChild(hudRow(el('span', { class: 'badge count', text: '3' }), t('hud.boxes.count')));
        boxes.appendChild(hudRow(el('span', { class: 'badge', text: '↘1 ↗2' }), t('hud.boxes.inout')));
        boxes.appendChild(hudRow(el('span', { class: 'badge source', text: 'SDK' }), t('hud.boxes.source')));
        panel.appendChild(boxes);

        const arrows = el('section', null, el('h3', { text: t('hud.arrows') }), el('p', { class: 'hud-note', text: t('hud.arrows.dir') }));
        [['CALLS', 'calls'], ['EXTENDS', 'extends'], ['IMPLEMENTS', 'implements'], ['READS_FROM', 'reads'], ['WRITES_TO', 'writes'], ['INSTANCE_OF', 'creates'], ['USES_AS_TYPE', 'type']]
            .forEach(function (pair) { arrows.appendChild(hudRow(hudEdgeSample(pair[0]), t('hud.arrows.' + pair[1]))); });
        arrows.appendChild(hudRow(el('span', { class: 'edge-chip-sample', text: '2' }), t('hud.arrows.count')));
        arrows.appendChild(hudRow(hudEdgeSample('CALLS', 'violation'), t('hud.arrows.violation')));
        arrows.appendChild(hudRow(hudEdgeSample('CALLS', 'in-flow'), t('hud.arrows.flow')));
        panel.appendChild(arrows);

        const use = el('section', null, el('h3', { text: t('hud.use') }));
        [['pointer', 'hud.use.click'], ['trace', 'hud.use.right'], ['move', 'hud.use.drag'], ['search', 'hud.use.arrow'], ['edit', 'hud.use.edit']].forEach(function (pair) {
            use.appendChild(hudRow(el('span', { class: 'hud-icon' }, ico(pair[0], 14)), t(pair[1])));
        });
        use.appendChild(el('p', { class: 'hud-note hud-keys', text: t('hud.use.keys') }));
        panel.appendChild(use);

        hud.appendChild(panel);
    }
    function setHud(open) {
        state.hudOpen = !!open;
        $('btn-help').setAttribute('aria-pressed', String(state.hudOpen));
        buildHud();
        try { vscodeApi.setState(Object.assign({}, vscodeApi.getState() || {}, { hudOpen: state.hudOpen })); } catch (e) { /* state is optional */ }
    }

    /* ---------- edit mode: a transparent sheet to draw over the diagram ---------- */
    function paintScope() { return trail.current() || 'overview'; }
    function paintPoint(e) {
        const c = canvasOrigin();
        return [Math.round((e.clientX - c.left) * 10) / 10, Math.round((e.clientY - c.top) * 10) / 10];
    }
    function shapeElement(s) {
        const common = { stroke: s.color, 'stroke-width': String(s.width), fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
        const fillAttrs = s.fill ? { fill: s.color, 'fill-opacity': '0.18' } : {};
        let node;
        if (s.type === 'pen') {
            node = svgEl('path', Object.assign({ d: Paint.pathFromPoints(s.points) }, common));
        } else if (s.type === 'line') {
            node = svgEl('path', Object.assign({ d: 'M' + s.x1 + ',' + s.y1 + ' L' + s.x2 + ',' + s.y2 }, common));
        } else if (s.type === 'arrow') {
            node = svgEl('path', Object.assign({ d: 'M' + s.x1 + ',' + s.y1 + ' L' + s.x2 + ',' + s.y2 + ' ' + Paint.arrowHead(s.x1, s.y1, s.x2, s.y2, 9 + s.width * 2) }, common));
        } else if (s.type === 'rect') {
            const r = Paint.normalizeRect(s.x1, s.y1, s.x2, s.y2);
            node = svgEl('rect', Object.assign({ x: String(r.x), y: String(r.y), width: String(r.w), height: String(r.h), rx: '8' }, common, fillAttrs));
        } else {
            const r = Paint.normalizeRect(s.x1, s.y1, s.x2, s.y2);
            node = svgEl('ellipse', Object.assign({ cx: String(r.x + r.w / 2), cy: String(r.y + r.h / 2), rx: String(r.w / 2), ry: String(r.h / 2) }, common, fillAttrs));
        }
        node.setAttribute('class', 'shape');
        if (s.id) { node.setAttribute('data-id', s.id); }
        return node;
    }
    function renderPaint() {
        const svg = $('paint');
        svg.replaceChildren();
        svg.setAttribute('height', String($('canvas').scrollHeight));
        if (!state.paint.hidden) {
            state.paint.store.shapes(paintScope()).forEach(function (s) { svg.appendChild(shapeElement(s)); });
        }
        if (state.paint.draft) {
            const draft = shapeElement(state.paint.draft);
            draft.setAttribute('class', 'shape draft');
            svg.appendChild(draft);
        }
        refreshPaintTools();
    }
    function schedulePaintSave() {
        clearTimeout(state.paint.saveTimer);
        state.paint.saveTimer = setTimeout(function () {
            vscodeApi.postMessage({ command: 'saveAnnotations', projectRoot: projectRoot, data: state.paint.store.serialize() });
        }, 400);
    }
    function paintChanged() {
        renderPaint();
        schedulePaintSave();
    }
    function eraseAt(point) {
        const hit = state.paint.store.hitTop(paintScope(), point[0], point[1], 8);
        if (hit) { state.paint.store.remove(paintScope(), hit.id); paintChanged(); }
    }
    function startDraw(e) {
        const p = state.paint;
        if (!p.editing || e.button !== 0) { return; }
        e.preventDefault();
        if (p.hidden) { p.hidden = false; buildPaintTools(); }
        const point = paintPoint(e);
        $('paint').setPointerCapture(e.pointerId);
        if (p.tool === 'eraser') { p.erasing = true; eraseAt(point); return; }
        p.draft = p.tool === 'pen'
            ? { type: 'pen', color: p.color, width: p.width, points: [point] }
            : { type: p.tool, color: p.color, width: p.width, fill: p.fill, x1: point[0], y1: point[1], x2: point[0], y2: point[1] };
        renderPaint();
    }
    function moveDraw(e) {
        const p = state.paint;
        if (p.erasing) { eraseAt(paintPoint(e)); return; }
        if (!p.draft) { return; }
        const point = paintPoint(e);
        if (p.draft.type === 'pen') {
            const last = p.draft.points[p.draft.points.length - 1];
            if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 1.5) { return; }
            p.draft.points.push(point);
        } else {
            p.draft.x2 = point[0];
            p.draft.y2 = point[1];
        }
        renderPaint();
    }
    function endDraw() {
        const p = state.paint;
        if (p.erasing) { p.erasing = false; return; }
        const draft = p.draft;
        if (!draft) { return; }
        p.draft = null;
        if (draft.type === 'pen') {
            draft.points = Paint.simplify(draft.points, 2.5);
            p.store.add(paintScope(), draft);
        } else if (Math.abs(draft.x2 - draft.x1) + Math.abs(draft.y2 - draft.y1) > 6) {
            p.store.add(paintScope(), draft);
        }
        paintChanged();
    }
    function setEditing(on) {
        const p = state.paint;
        p.editing = !!on;
        p.draft = null;
        p.erasing = false;
        document.body.classList.toggle('editing', p.editing);
        $('btn-edit').setAttribute('aria-pressed', String(p.editing));
        if (p.editing) { closeMenu(); p.hidden = false; }
        buildPaintTools();
        renderPaint();
    }
    function toolButton(tool) {
        const b = el('button', { class: 'tool', 'data-tool': tool, 'aria-pressed': String(state.paint.tool === tool) });
        setIcon(b, tool, t('trail.edit.' + tool), 16);
        b.addEventListener('click', function () { state.paint.tool = tool; buildPaintTools(); });
        return b;
    }
    function buildPaintTools() {
        const host = $('painttools');
        host.replaceChildren();
        if (!state.paint.editing) { host.hidden = true; return; }
        host.hidden = false;
        const p = state.paint;
        const inner = el('div', { class: 'tools-inner' });
        inner.appendChild(el('div', { class: 'tools-title', title: t('trail.edit.hint') }, ico('edit', 14), el('span', { text: t('trail.edit.title') })));
        const tools = el('div', { class: 'tool-group' });
        Paint.TOOLS.forEach(function (tool) { tools.appendChild(toolButton(tool)); });
        inner.appendChild(tools);

        const colors = el('div', { class: 'tool-group', role: 'group', 'aria-label': t('trail.edit.color') });
        PALETTE.forEach(function (c) {
            const b = el('button', { class: 'swatch', 'aria-pressed': String(p.color === c), title: t('trail.edit.color') + ' ' + c, 'aria-label': t('trail.edit.color') + ' ' + c, style: 'background:' + c });
            b.addEventListener('click', function () { p.color = c; buildPaintTools(); });
            colors.appendChild(b);
        });
        inner.appendChild(colors);

        const widths = el('div', { class: 'tool-group', role: 'group', 'aria-label': t('trail.edit.width') });
        WIDTHS.forEach(function (w) {
            const b = el('button', { class: 'width', 'aria-pressed': String(p.width === w), title: t('trail.edit.width') + ' ' + w, 'aria-label': t('trail.edit.width') + ' ' + w },
                el('span', { class: 'width-dot', style: 'width:' + (w + 4) + 'px;height:' + (w + 4) + 'px' }));
            b.addEventListener('click', function () { p.width = w; buildPaintTools(); });
            widths.appendChild(b);
        });
        const fill = el('button', { class: 'tool', id: 'tool-fill', 'aria-pressed': String(p.fill) });
        setIcon(fill, 'fill', t('trail.edit.fill'), 16);
        fill.addEventListener('click', function () { p.fill = !p.fill; buildPaintTools(); });
        widths.appendChild(fill);
        inner.appendChild(widths);

        const actions = el('div', { class: 'tool-group' });
        const undo = el('button', { class: 'tool', id: 'tool-undo' });
        setIcon(undo, 'undo', t('trail.edit.undo'), 16);
        undo.addEventListener('click', function () { p.store.undo(paintScope()); paintChanged(); });
        const redo = el('button', { class: 'tool', id: 'tool-redo' });
        setIcon(redo, 'redo', t('trail.edit.redo'), 16);
        redo.addEventListener('click', function () { p.store.redo(paintScope()); paintChanged(); });
        const clear = el('button', { class: 'tool', id: 'tool-clear' });
        setIcon(clear, 'trash', t('trail.edit.clear'), 16);
        clear.addEventListener('click', function () { if (p.store.clear(paintScope())) { paintChanged(); } });
        const hide = el('button', { class: 'tool', id: 'tool-hide', 'aria-pressed': String(p.hidden) });
        setIcon(hide, p.hidden ? 'eye-off' : 'eye', t('trail.edit.hide'), 16);
        hide.addEventListener('click', function () { p.hidden = !p.hidden; buildPaintTools(); renderPaint(); });
        [undo, redo, clear, hide].forEach(function (b) { actions.appendChild(b); });
        inner.appendChild(actions);

        const done = el('button', { class: 'tool-done' }, ico('close', 13), ' ' + t('trail.edit.done'));
        done.addEventListener('click', function () { setEditing(false); });
        inner.appendChild(done);
        host.appendChild(inner);
        refreshPaintTools();
    }
    function refreshPaintTools() {
        if (!state.paint.editing) { return; }
        const scope = paintScope();
        const set = function (id, disabled) { const b = $(id); if (b) { b.disabled = disabled; } };
        set('tool-undo', !state.paint.store.canUndo(scope));
        set('tool-redo', !state.paint.store.canRedo(scope));
        set('tool-clear', !state.paint.store.canUndo(scope));
    }

    /* ---------- search ---------- */
    function renderSearch() {
        const box = $('search-results');
        const input = $('search');
        box.replaceChildren();
        const query = input.value.trim();
        if (!query) { box.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
        state.searchResults = model.search(query, 14);
        state.searchActive = Math.min(state.searchActive, Math.max(0, state.searchResults.length - 1));
        box.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        if (!state.searchResults.length) { box.appendChild(el('div', { class: 'search-empty', text: t('trail.noResults') })); return; }
        state.searchResults.forEach(function (r, i) {
            const item = el('div', { class: 'search-item layer-' + r.layer + (i === state.searchActive ? ' active' : ''), role: 'option' },
                el('span', { class: 'mk' }, kindIcon(r.kind, 13)), el('span', { text: r.name }));
            item.addEventListener('mousedown', function (e) { e.preventDefault(); pickSearch(i); });
            box.appendChild(item);
        });
    }
    function pickSearch(i) {
        const r = state.searchResults[i];
        if (!r) { return; }
        $('search').value = '';
        state.searchActive = 0;
        renderSearch();
        navigate(r.id);
    }

    /* ---------- wiring ---------- */
    function init() {
        setIcon($('btn-home'), 'home', t('trail.tip.home'));
        setIcon($('btn-back'), 'back', t('trail.tip.back'));
        setIcon($('btn-forward'), 'forward', t('trail.tip.forward'));
        setIcon($('btn-reset'), 'reset', t('trail.tip.reset'));
        setIcon($('btn-edit'), 'edit', t('trail.tip.edit'));
        setIcon($('btn-help'), 'help', t('trail.tip.help'));
        $('btn-help').setAttribute('aria-pressed', String(state.hudOpen));
        $('search-icon').appendChild(ico('search', 13));
        $('search').placeholder = t('trail.search');
        $('search').title = t('trail.tip.search');
        $('search').setAttribute('aria-label', t('trail.tip.search'));
        $('btn-open').replaceChildren(ico('open', 13), ' ' + t('trail.openInEditor'));
        $('btn-open').title = t('trail.tip.openCode');

        $('btn-home').addEventListener('click', goHome);
        $('btn-back').addEventListener('click', function () { step(-1); });
        $('btn-forward').addEventListener('click', function () { step(1); });
        $('btn-reset').addEventListener('click', function () { state.offsets = new Map(); renderStage({ animate: false }); });
        $('btn-edit').addEventListener('click', function () { setEditing(!state.paint.editing); });
        $('btn-help').addEventListener('click', function () { setHud(!state.hudOpen); });
        $('btn-open').addEventListener('click', function () {
            const s = state.code.snippet;
            if (s) { vscodeApi.postMessage({ command: 'openClass', file: s.file, start: s.jump.start, end: s.jump.end }); }
        });

        const paintEl = $('paint');
        paintEl.addEventListener('pointerdown', startDraw);
        paintEl.addEventListener('pointermove', moveDraw);
        paintEl.addEventListener('pointerup', endDraw);
        paintEl.addEventListener('pointercancel', endDraw);

        const input = $('search');
        input.addEventListener('input', function () { state.searchActive = 0; renderSearch(); });
        input.addEventListener('blur', function () { $('search-results').hidden = true; });
        input.addEventListener('focus', renderSearch);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') { state.searchActive = Math.min(state.searchActive + 1, state.searchResults.length - 1); renderSearch(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { state.searchActive = Math.max(state.searchActive - 1, 0); renderSearch(); e.preventDefault(); }
            else if (e.key === 'Enter') { pickSearch(state.searchActive); }
            else if (e.key === 'Escape') { input.value = ''; renderSearch(); input.blur(); }
        });

        document.addEventListener('contextmenu', function (e) {
            if (state.paint.editing) { e.preventDefault(); return; }
            const id = menuTargetId(e.target);
            if (!id || !model.nodes.has(id)) { closeMenu(); return; }
            e.preventDefault();
            openMenu(e.clientX, e.clientY, id);
        });
        document.addEventListener('mousedown', function (e) { if (!e.target.closest || !e.target.closest('#ctxmenu')) { closeMenu(); } });
        window.addEventListener('blur', closeMenu);
        window.addEventListener('resize', closeMenu);
        $('stage').addEventListener('scroll', closeMenu);

        document.addEventListener('keydown', function (e) {
            const tag = (e.target.tagName || '').toLowerCase();
            const typing = tag === 'input' || tag === 'textarea';
            const menu = $('ctxmenu');
            if (!menu.hidden) {
                const items = Array.prototype.slice.call(menu.querySelectorAll('button'));
                const at = items.indexOf(document.activeElement);
                if (e.key === 'Escape') { closeMenu(); e.preventDefault(); return; }
                if (e.key === 'ArrowDown') { items[(at + 1) % items.length].focus(); e.preventDefault(); return; }
                if (e.key === 'ArrowUp') { items[(at - 1 + items.length) % items.length].focus(); e.preventDefault(); return; }
            }
            if (state.paint.editing && !typing) {
                const key = e.key.toLowerCase();
                const toolKeys = { p: 'pen', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', x: 'eraser' };
                if (e.key === 'Escape') { setEditing(false); e.preventDefault(); return; }
                if ((e.ctrlKey || e.metaKey) && key === 'z') { (e.shiftKey ? state.paint.store.redo : state.paint.store.undo)(paintScope()); paintChanged(); e.preventDefault(); return; }
                if ((e.ctrlKey || e.metaKey) && key === 'y') { state.paint.store.redo(paintScope()); paintChanged(); e.preventDefault(); return; }
                if (!e.ctrlKey && !e.metaKey && !e.altKey && toolKeys[key]) { state.paint.tool = toolKeys[key]; buildPaintTools(); e.preventDefault(); return; }
                if (key === 'e') { setEditing(false); e.preventDefault(); return; }
            }
            if ((e.key === 'Enter' || e.key === ' ') && e.target.getAttribute && e.target.getAttribute('role') === 'button') {
                e.preventDefault();
                e.target.click();
            } else if (e.altKey && e.key === 'ArrowLeft') { step(-1); }
            else if (e.altKey && e.key === 'ArrowRight') { step(1); }
            else if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); }
            else if (e.key === '?' && !typing) { e.preventDefault(); setHud(!state.hudOpen); }
            else if ((e.key === 'e' || e.key === 'E') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { setEditing(!state.paint.editing); }
            else if (e.key === 'Escape' && !typing) {
                if (state.hudOpen) { setHud(false); }
                else if (state.trace) { clearTrace(); }
                else if (state.sel) {
                    resetSelection();
                    applySelectionStyles();
                    renderRefs();
                    if (state.focus) { requestSnippet({ nodeId: state.focus.focusId }, false); }
                }
            }
        });

        window.addEventListener('resize', function () { scheduleEdges(); });
        if (window.ResizeObserver) { new ResizeObserver(function () { scheduleEdges(); }).observe($('columns')); }

        window.addEventListener('message', function (event) {
            const m = event.data || {};
            switch (m.command) {
                case 'setFocusInGraph':
                    navigate(m.nodeId);
                    break;
                case 'setPathHighlight': {
                    const owner = model.ownerOf(m.sourceId);
                    if (!owner) { break; }
                    navigate(owner);
                    const target = model.ownerOf(m.targetId);
                    const f = state.focus;
                    if (!f || !target) { break; }
                    let found = null;
                    f.left.forEach(function (g) { g.cards.forEach(function (c) { if (c.id === target && !found) { found = { c: c, side: 'left' }; } }); });
                    f.right.forEach(function (g) { g.cards.forEach(function (c) { if (c.id === target && !found) { found = { c: c, side: 'right' }; } }); });
                    if (found) { selectCard(found.c, found.side); }
                    break;
                }
                case 'snippet':
                    if (m.requestId === state.snippetReq) {
                        state.code.loading = false;
                        state.code.snippet = m.snippet || null;
                        state.code.empty = !m.snippet;
                        renderCodeBody();
                    }
                    break;
            }
        });

        renderFilters();
        buildHud();
        render();
        vscodeApi.postMessage({ command: 'log', args: ['[Trail] ready: ' + graph.nodes.length + ' nodes, ' + graph.edges.length + ' edges'] });
        vscodeApi.postMessage({ command: 'ready' });
    }

    init();
})();
