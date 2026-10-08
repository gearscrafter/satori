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
    let fileImports = {};
    let ownPackage = '';
    let architecture = null;
    let auditConfig = null;
    let importTargets = {};
    let graph;
    let savedAnnotations = {};
    try {
        const payload = JSON.parse(document.getElementById('satori-data').textContent);
        graph = payload.graph || { nodes: [], edges: [] };
        projectRoot = payload.projectRoot || '';
        savedAnnotations = payload.annotations || {};
        fileImports = payload.fileImports || {};
        ownPackage = payload.ownPackage || '';
        architecture = payload.architecture || null;
        auditConfig = payload.auditConfig || null;
        importTargets = payload.importTargets || {};
    } catch (e) {
        graph = { nodes: [], edges: [] };
        vscodeApi.postMessage({ command: 'log', args: ['[Trail] Could not parse graph data: ' + e.message] });
    }

    const EDGE_GROUPS = {
        calls: ['CALLS', 'PASSES_AS_ARGUMENT'],
        inherit: ['EXTENDS', 'IMPLEMENTS'],
        data: ['READS_FROM', 'WRITES_TO', 'OBSERVES'],
        types: ['USES_AS_TYPE', 'INSTANCE_OF']
    };
    const VERBS = {
        CALLS: 'calls', EXTENDS: 'extends', IMPLEMENTS: 'implements', READS_FROM: 'reads',
        WRITES_TO: 'writes', USES_AS_TYPE: 'type', INSTANCE_OF: 'creates', PASSES_AS_ARGUMENT: 'passes', OBSERVES: 'observes', IMPORTS: 'imports'
    };
    const KEYWORDS = new Set(['abstract', 'as', 'async', 'await', 'class', 'const', 'else', 'enum', 'extends', 'extension', 'factory', 'final',
        'for', 'get', 'if', 'implements', 'import', 'in', 'is', 'late', 'mixin', 'new', 'null', 'on', 'override', 'required', 'return', 'set',
        'static', 'super', 'switch', 'this', 'throw', 'try', 'catch', 'var', 'void', 'while', 'with', 'yield', 'true', 'false']);
    const PALETTE = ['#6f42c1', '#e53935', '#fd7e14', '#28a744', '#007bff', '#333333'];
    const WIDTHS = [2, 4, 7];
    const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const DRAG_THRESHOLD = 4;
    const MAX_CARDS_PER_SIDE = 12;
    const MAX_MEMBERS_SHOWN = 16;
    const MAX_OVERVIEW_PER_LAYER = 30;

    const ZOOM_MIN = 0.2;
    const ZOOM_MAX = 2;
    const ZOOM_STEP = 1.2;

    const state = {
        zoom: 1,
        scale: 1,
        groupBy: 'layer',
        audit: { on: false, metric: 'risk' },
        lod: 'detail',
        libOpen: new Set(),
        groupMode: new Map([['dep:sdk', 'closed']]),
        trackUntil: 0,
        tracking: false,
        expand: { left: false, right: false },
        expandMembers: false,
        overviewOpen: new Set(),
        folder: null,
        focusFull: null,
        filters: { groups: { calls: true, inherit: true, data: true, types: true } },
        deps: { flutter: true, package: true, sdk: true },
        depGroups: [],
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
        return M.createModel(graph, { edgeLabels: labels, projectRoot: projectRoot, fileImports: fileImports, ownPackage: ownPackage, audit: auditConfig, architecture: architecture });
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
    /* The layers of the project (satori.json) or the four of always: how each one is called, drawn and explained. */
    function layerSpec(layer) { return model.architecture.layers.find(function (l) { return l.id === layer; }) || null; }
    function layerLabel(layer) {
        const spec = layerSpec(layer);
        if (spec && spec.label) { return spec.label; }
        if (M.LAYERS.indexOf(layer) >= 0) { return t('layer.' + layer); }
        const words = String(layer).replace(/[-_]+/g, ' ');
        return words.charAt(0).toUpperCase() + words.slice(1);
    }
    function layerIcon(layer) {
        const spec = layerSpec(layer);
        const name = spec && spec.icon ? spec.icon : 'layer-' + layer;
        return window.TrailIcons.names().indexOf(name) >= 0 ? name : 'layer-generic';
    }
    function layerDescription(layer) {
        const spec = layerSpec(layer);
        if (spec && spec.description) { return spec.description; }
        return M.LAYERS.indexOf(layer) >= 0 ? t('hud.layer.' + layer) : '';
    }

    /** Colours for the layers that are not one of the four of always: the one in the file, or one of the palette. */
    const LAYER_PALETTE = ['#7e57c2', '#26a69a', '#ef5350', '#ffa726', '#5c6bc0', '#8d6e63', '#26c6da', '#ec407a'];
    function mixWithWhite(hex, share) {
        const n = parseInt(hex.slice(1), 16);
        const channel = function (v) { return Math.round(v + (255 - v) * share); };
        const r = channel((n >> 16) & 255), g = channel((n >> 8) & 255), b = channel(n & 255);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    function applyLayerStyles() {
        let sheet = document.getElementById('layer-styles');
        if (!sheet) { sheet = document.createElement('style'); sheet.id = 'layer-styles'; document.head.appendChild(sheet); }
        const rules = [];
        let paletteIndex = 0;
        model.architecture.layers.forEach(function (l) {
            const builtin = M.LAYERS.indexOf(l.id) >= 0;
            // A layer that takes no part in the rules is grey unless the file says otherwise; the others take the palette in turn.
            const color = l.color || (builtin ? null : l.id === model.neutralLayer ? '#9e9e9e' : LAYER_PALETTE[paletteIndex++ % LAYER_PALETTE.length]);
            if (!color) { return; }
            rules.push('.layer-' + l.id + ', [data-layer="' + l.id + '"] { --lb: ' + mixWithWhite(color, 0.88) + '; --lbd: ' + mixWithWhite(color, 0.5) + '; --li: ' + color + '; }');
        });
        sheet.textContent = rules.join('\n');
    }
    function cssEscape(value) { return (window.CSS && CSS.escape) ? CSS.escape(value) : String(value).replace(/"/g, '\\"'); }
    function canvasOrigin() { return $('canvas').getBoundingClientRect(); }
    /** Box position inside the canvas, in canvas units (the zoom scales the canvas as a whole). */
    function rectRel(node) {
        const r = node.getBoundingClientRect();
        const c = canvasOrigin();
        const z = state.scale;
        return { x: (r.left - c.left) / z, y: (r.top - c.top) / z, w: r.width / z, h: r.height / z };
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
    function resetCollapse() {
        state.expand = { left: false, right: false };
        state.expandMembers = false;
        state.groupMode = new Map([['dep:sdk', 'closed']]);
    }
    function afterNavigation() {
        resetSelection();
        resetCollapse();
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
    /** Opens the source of an imported library (a package file or a Dart SDK file) when it can be found on disk. */
    function openLibraryFile(uri) {
        const file = importTargets[uri];
        if (!file) { return; }
        vscodeApi.postMessage({ command: 'openClass', file: file, start: { line: 0, character: 0 }, end: { line: 0, character: 0 } });
    }

    function selectCard(card, side) {
        state.sel = { cardId: card.id, side: side };
        state.flowSel = null;
        if (card.imports && card.imports.length) {
            // The arrow of a library stands for import lines, so those are what is listed and shown.
            state.code.mode = 'deps';
            state.code.refs = card.imports.slice();
            applySelectionStyles();
            selectImport(0, true);
            return;
        }
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
    /** Lists the import lines behind one group of the dependency strip and shows the first one. */
    function selectDependency(kind) {
        const group = state.depGroups.find(function (g) { return g.kind === kind; });
        if (!group) { return; }
        state.sel = { dep: kind };
        state.flowSel = null;
        state.code.mode = 'deps';
        state.code.refs = [];
        group.packages.forEach(function (p) { p.imports.forEach(function (imp) { state.code.refs.push({ pkg: p.name, uri: imp.uri, line: imp.line, column: imp.column, fileUri: imp.fileUri }); }); });
        applySelectionStyles();
        selectImport(0, true);
    }
    function selectImport(index, reveal) {
        const ref = state.code.refs[index];
        if (!ref) { return; }
        state.code.active = index;
        renderRefs();
        requestSnippet({ fileUri: ref.fileUri, line: ref.line, column: ref.column, length: ref.uri.length }, reveal !== false);
    }
    function applySelectionStyles() {
        document.querySelectorAll('.card.selected, .dep-group.selected').forEach(function (n) { n.classList.remove('selected'); });
        document.querySelectorAll('#edges .edge.selected').forEach(function (n) { n.classList.remove('selected'); });
        if (state.sel && state.sel.dep) {
            document.querySelectorAll('.dep-group[data-kind="' + state.sel.dep + '"], #edges .edge.dep[data-dep="' + state.sel.dep + '"]').forEach(function (n) { n.classList.add('selected'); });
            return;
        }
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
        resetCollapse();
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
        resetCollapse();
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
            return model.layers.map(function (layer) {
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

    /** Zoomed out around a class, only the layers that take part in its trail matter; the others fade out of the bar. */
    function involvedLayers() {
        if (!state.focus || (state.lod !== 'groups' && state.lod !== 'folders')) { return null; }
        const set = new Set([state.focus.center.layer]);
        ['left', 'right'].forEach(function (side) {
            state.focus[side].forEach(function (g) { g.cards.forEach(function (c) { set.add(c.layer); }); });
        });
        return set;
    }

    function renderLayerFlow() {
        const strip = $('layerflow');
        strip.replaceChildren();
        const involved = involvedLayers();
        const flows = model.layerFlow().filter(function (f) { return !involved || (involved.has(f.from) && involved.has(f.to)); });
        const get = function (a, b) { return flows.find(function (f) { return f.from === a && f.to === b; }); };
        strip.appendChild(el('span', { class: 'flow-label', text: t('trail.layerFlow') }));

        function pill(layer) {
            const p = el('button', {
                class: 'layer-pill layer-' + layer, 'aria-pressed': String(state.layerEmphasis === layer),
                title: t('trail.tip.layer', layerLabel(layer)) + ' — ' + layerDescription(layer)
            }, ico(layerIcon(layer), 14), layerLabel(layer));
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
        const order = model.flowOrder.filter(function (layer) { return !involved || involved.has(layer); });
        order.forEach(function (layer, i) {
            strip.appendChild(pill(layer));
            if (i < order.length - 1) {
                const f = get(layer, order[i + 1]);
                strip.appendChild(el('span', { class: 'flow-arrow' }, '->', f ? flowChip(f) : null));
                if (f) { shown.add(f.from + '>' + f.to); }
            }
        });
        if (!involved || involved.has(model.neutralLayer)) { strip.appendChild(pill(model.neutralLayer)); }

        flows.filter(function (f) { return !shown.has(f.from + '>' + f.to); })
            .sort(function (a, b) { return (b.violation - a.violation) || (b.count - a.count); })
            .forEach(function (f) {
                const arrow = f.from === f.to ? '↻' : '->';
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
        state.depGroups = [];
        const current = trail.current();
        state.depFocus = current ? model.focus(current) : null;
        state.focusFull = state.depFocus && state.trace ? traceFocus(state.depFocus) : state.depFocus;
        state.focus = state.focusFull ? limitFocus(state.focusFull) : null;
        if (state.focus) { renderFocus(state.focus, columns); } else { renderOverview(columns); }
        renderLayerFlow();
        renderPaint();

        const finish = function () {
            if (token !== state.renderToken) { return; }
            syncSizer();
            drawEdges(animate && !REDUCED_MOTION);
            applyHeat();
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

    /** Re-buckets the neighbour boxes by the folder of their file, the way Sourcetrail groups nodes by namespace. */
    function byFolder(groups) {
        const buckets = new Map();
        groups.forEach(function (g) {
            g.cards.forEach(function (c) {
                const name = model.folderOf(c.id) || t('trail.folder.root');
                if (!buckets.has(name)) { buckets.set(name, { layer: 'folder:' + name, folder: name, label: name, colorLayer: c.layer, cards: [] }); }
                buckets.get(name).cards.push(c);
            });
        });
        return Array.from(buckets.values()).sort(function (a, b) { return b.cards.length - a.cards.length || a.label.localeCompare(b.label); });
    }

    /** Crossing into or out of the folder level changes which container holds the boxes, so the stage is built again. */
    function regroupFor(lod, prev) {
        const want = lod === 'folders' ? 'folder' : 'layer';
        if (want === state.groupBy || prev === undefined) { return false; }
        state.groupBy = want;
        return true;
    }
    /** The focused box keeps its place on screen across the rebuild, so zooming back in returns to what was being looked at. */
    function refit(anchor, contentY, ay) {
        renderStage({ animate: true });
        syncSizer();
        const stage = $('stage');
        const box = stage.getBoundingClientRect();
        const node = document.querySelector('.card.center');
        if (anchor && node) {
            const r = node.getBoundingClientRect();
            stage.scrollLeft += (r.left - box.left) - anchor.x;
            stage.scrollTop += (r.top - box.top) - anchor.y;
        } else {
            stage.scrollLeft = 0;
            stage.scrollTop = Math.max(0, contentY * state.scale - ay);
        }
        trackEdges(450);
    }

    /** A hub can have hundreds of neighbours: only the most connected ones are drawn until the user asks for the rest. */
    function limitFocus(f) {
        const left = M.limitCards(f.left, state.expand.left ? Infinity : MAX_CARDS_PER_SIDE);
        const right = M.limitCards(f.right, state.expand.right ? Infinity : MAX_CARDS_PER_SIDE);
        return Object.assign({}, f, {
            left: state.groupBy === 'folder' ? byFolder(left.groups) : left.groups, right: state.groupBy === 'folder' ? byFolder(right.groups) : right.groups,
            hidden: { left: left.hidden, right: right.hidden }, total: { left: left.total, right: right.total }
        });
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

    /** "↘ in  ↗ out" counters, each in its own colour and with a tooltip that spells the numbers out. */
    function ioBadge(inCount, outCount, className) {
        return el('span', { class: className || 'io', title: t('trail.tip.inoutRow', String(inCount), String(outCount)) },
            el('span', { class: 'io-in', text: '↘' + inCount }), ' ', el('span', { class: 'io-out', text: '↗' + outCount }));
    }

    function countBadge(text, tip, extraClass) {
        return el('span', { class: 'badge ' + (extraClass || ''), title: tip, text: text });
    }

    /**
     * Libraries the project imports, as bundles: one box per origin (Flutter, packages, Dart SDK) that unfolds
     * into the libraries it holds. Picking one focuses it, to see which classes import it.
     */
    function libraryBundles() {
        const groups = model.libraries();
        if (!groups.length) { return null; }
        const total = groups.reduce(function (n, g) { return n + g.items.length; }, 0);
        const section = el('div', { class: 'overview-libs' },
            el('h3', null, ico('package', 15), t('trail.deps.libraries'), el('span', { class: 'n', text: String(total) })),
            el('p', { class: 'overview-hint', text: t('trail.deps.librariesHint') }));
        const row = el('div', { class: 'lib-bundles' });
        groups.forEach(function (g) {
            const open = state.libOpen.has(g.kind);
            const head = el('div', { class: 'dep-group-head', title: t('trail.tip.deps.' + g.kind) },
                ico(DEP_ICON[g.kind], 14), el('span', { class: 'dep-group-name', text: t('trail.deps.' + g.kind) }),
                el('span', { class: 'badge count', text: String(g.items.length) }),
                el('span', { class: 'band-chevron' }, ico(open ? 'arrow-up' : 'arrow-down', 12)));
            const box = el('div', { class: 'dep-group lib-bundle dep-' + g.kind + (open ? ' user-open' : ' user-closed'), 'data-kind': g.kind }, head);
            const pills = el('div', { class: 'dep-pills' });
            g.items.forEach(function (item) {
                const pill = el('span', { class: 'dep-pill', title: t('trail.tip.pill', item.name) },
                    item.name, el('span', { class: 'pill-count', text: String(item.users) }));
                clickable(pill, function () { navigate(item.id); });
                pills.appendChild(pill);
            });
            box.appendChild(pills);
            clickable(head, function () {
                if (open) { state.libOpen.delete(g.kind); } else { state.libOpen.add(g.kind); }
                renderStage({ animate: false });
            });
            row.appendChild(box);
        });
        section.appendChild(row);
        return section;
    }

    function folderSelect() {
        const folders = model.folders();
        if (folders.length < 2) { return null; }
        const select = el('select', { id: 'folder-filter', title: t('trail.tip.folder'), 'aria-label': t('trail.folder.label') });
        select.appendChild(el('option', { value: '__all__', text: t('trail.folder.all') + ' (' + folders.reduce(function (n, f) { return n + f.count; }, 0) + ')' }));
        folders.forEach(function (f) {
            select.appendChild(el('option', { value: f.name === '' ? '__root__' : f.name, text: (f.name || t('trail.folder.root')) + ' (' + f.count + ')' }));
        });
        select.value = state.folder === null ? '__all__' : (state.folder === '' ? '__root__' : state.folder);
        if (select.value === '' || select.selectedIndex < 0) { select.value = '__all__'; state.folder = null; }
        select.addEventListener('change', function () {
            state.folder = select.value === '__all__' ? null : select.value === '__root__' ? '' : select.value;
            state.overviewOpen = new Set();
            renderStage({ animate: true });
        });
        return el('label', { class: 'folder-filter', title: t('trail.tip.folder') }, ico('class', 13), t('trail.folder.label'), select);
    }

    /** The overview at the folder level: the classes of every layer re-bucketed by the folder of their file. */
    function overviewFolders(o) {
        const buckets = new Map();
        o.layers.forEach(function (l) {
            l.classes.forEach(function (c) {
                const name = model.folderOf(c.id) || t('trail.folder.root');
                if (!buckets.has(name)) { buckets.set(name, { key: 'folder:' + name, layer: model.neutralLayer, label: name, folder: model.folderOf(c.id) || '', classes: [] }); }
                buckets.get(name).classes.push(c);
            });
        });
        return Array.from(buckets.values()).sort(function (a, b) { return b.classes.length - a.classes.length || a.label.localeCompare(b.label); });
    }

    /** At the far levels a column of the overview is a summary: clicking it zooms in on that layer or folder. */
    function overviewZoomInto(bucket, byFolders) {
        if (state.lod !== 'groups' && state.lod !== 'folders') { return; }
        if (byFolders) { state.folder = bucket.folder; state.groupBy = 'layer'; }
        else { state.overviewOpen.add(bucket.key); }
        state.zoom = 1;
        applyZoom();
        state.groupBy = 'layer';
        renderStage({ animate: true });
    }

    /**
     * When the architecture of satori.json leaves most classes in the neutral layer, its folders and names probably do
     * not match the project. Says so, with the folders the project has, instead of showing one full column and three empty ones.
     */
    function unmatchedNotice(o, total) {
        if (model.architecture.builtin || total < 3) { return null; }
        const neutral = o.layers.find(function (l) { return l.layer === model.neutralLayer; });
        const inNeutral = neutral ? neutral.classes.length : 0;
        if (inNeutral / total < 0.5) { return null; }
        const folders = model.folders().filter(function (f) { return f.name !== ''; }).slice(0, 8).map(function (f) { return f.name; }).join(', ');
        return el('div', { class: 'arch-notice', role: 'note' }, ico('warning', 15),
            el('span', { text: t('trail.arch.unmatched', String(inNeutral), String(total), layerLabel(model.neutralLayer), folders || '-') }));
    }

    function renderOverview(columns) {
        const o = model.overview(state.folder === null ? undefined : { folder: state.folder });
        const total = o.layers.reduce(function (n, l) { return n + l.classes.length; }, 0);
        columns.style.display = 'block';
        const picker = folderSelect();
        if (total === 0) {
            // No class at all in the graph is not a filter: the analysis found nothing, and a saved one may be to blame.
            const noClasses = !graph.nodes.some(function (n) { return n.kind === 'class'; });
            if (noClasses) {
                const retry = el('button', { class: 'empty-action', title: t('trail.emptyProjectTip') }, ico('reset', 14), t('trail.emptyProjectButton'));
                retry.addEventListener('click', function () { vscodeApi.postMessage({ command: 'reanalyze' }); });
                columns.appendChild(el('div', { class: 'empty-project', role: 'note' },
                    el('p', { class: 'empty-title', text: t('trail.emptyProject') }),
                    el('p', { class: 'overview-hint', text: t('trail.emptyProjectCauses') }),
                    retry));
                return;
            }
            columns.appendChild(el('p', { class: 'overview-hint', text: t('trail.empty') }));
            if (picker) { columns.appendChild(picker); }
            return;
        }
        columns.appendChild(el('div', { class: 'overview-head' },
            el('p', { class: 'overview-hint' }, ico('pointer', 14), (model.architecture.builtin ? t('trail.overviewHint') : t('trail.overviewHintCustom'))), picker));
        const notice = unmatchedNotice(o, total);
        if (notice) { columns.appendChild(notice); }
        const grid = el('div', { id: 'overview' });
        const byFolders = state.groupBy === 'folder';
        const buckets = byFolders ? overviewFolders(o) : o.layers.map(function (l) { return { key: l.layer, layer: l.layer, label: layerLabel(l.layer), classes: l.classes }; });
        buckets.forEach(function (l) {
            const col = el('div', { class: 'overview-col layer-' + (byFolders ? model.neutralLayer + ' folder-col' : l.layer) + (!byFolders && state.layerEmphasis && state.layerEmphasis !== l.layer ? ' dim' : ''), title: byFolders ? l.label : layerDescription(l.layer) });
            col.appendChild(el('h3', null, byFolders ? ico('folder', 15) : ico(layerIcon(l.layer), 15), el('span', { class: 'band-title', text: l.label }), el('span', { class: 'n', text: String(l.classes.length) })));
            const chips = el('div', { class: 'group-chips' });
            l.classes.slice(0, 6).forEach(function (c) { chips.appendChild(chipFor(c)); });
            if (l.classes.length > 6) { chips.appendChild(el('span', { class: 'group-chip more', text: '+' + (l.classes.length - 6) })); }
            col.appendChild(chips);
            clickable(col.querySelector('h3'), function () { overviewZoomInto(l, byFolders); });
            const open = state.overviewOpen.has(l.key);
            (open ? l.classes : l.classes.slice(0, MAX_OVERVIEW_PER_LAYER)).forEach(function (c) {
                const item = el('button', { class: 'overview-item layer-' + c.layer + (c.inDeg + c.outDeg === 0 ? ' idle' : ''), 'data-id': c.id, title: c.label + ' — ' + t('trail.tip.member') },
                    kindIcon(c.kind, 14),
                    el('span', { class: 'name', text: c.label }),
                    stateBadge(c.id),
                    ioBadge(c.inDeg, c.outDeg, 'badge io'));
                item.addEventListener('click', function () { navigate(c.id); });
                col.appendChild(item);
            });
            if (l.classes.length > MAX_OVERVIEW_PER_LAYER) {
                const hiddenCount = l.classes.length - MAX_OVERVIEW_PER_LAYER;
                const toggle = el('button', { class: 'more-toggle', title: t('trail.tip.showMore') },
                    ico(open ? 'arrow-up' : 'arrow-down', 12), open ? t('trail.less') : t('trail.more.side', String(hiddenCount)));
                toggle.addEventListener('click', function () {
                    if (open) { state.overviewOpen.delete(l.key); } else { state.overviewOpen.add(l.key); }
                    renderStage({ animate: false });
                });
                col.appendChild(toggle);
            }
            grid.appendChild(col);
        });
        columns.appendChild(grid);
        const libs = libraryBundles();
        if (libs) { columns.appendChild(libs); }
    }

    function memberRow(m, extra) {
        const inFlow = state.trace && state.trace.nodeIds.has(m.id);
        const kindClass = (m.kind === 'method' || m.kind === 'function' || m.kind === 'constructor') ? ' kind-method'
            : (m.kind === 'field' || m.kind === 'property') ? ' kind-field' : '';
        const isLibraryFile = m.kind === 'library';
        const resolvable = isLibraryFile && !!importTargets[m.uri];
        const row = el('div', {
            class: 'member' + (isLibraryFile ? ' kind-lib' + (resolvable ? '' : ' missing') : kindClass) + (extra && extra.active ? ' active' : '') + (inFlow ? ' in-flow' : ''), 'data-id': m.id,
            title: isLibraryFile ? m.label + ' — ' + (resolvable ? t('trail.tip.libFile') : t('trail.tip.libFileMissing')) : m.label + ' — ' + t('trail.tip.member')
        },
            el('span', { class: 'mk' }, kindIcon(m.kind, 12)),
            el('span', { class: 'label', text: m.label }),
            extra && extra.io ? ioBadge(extra.io.inCount, extra.io.outCount) : null);
        return clickable(row, function () { if (isLibraryFile) { openLibraryFile(m.uri); } else { navigate(m.id); } });
    }

    function applyOffset(node, key) {
        const o = state.offsets.get(key);
        if (o) {
            node.style.translate = o.x + 'px ' + o.y + 'px';
            node.classList.add('moved');
        }
    }

    /** Small tag with the state management of a class (Cubit, ChangeNotifier...), or nothing. */
    function stateBadge(id) {
        const sm = model.stateOf(id);
        if (!sm) { return null; }
        return el('span', { class: 'sm-badge sm-' + sm.family, title: t('trail.state.tip', sm.base, t('trail.state.' + sm.family)) }, ico('layer-state', 10), sm.base);
    }

    function neighborCard(card, side) {
        const key = side + ':' + card.id;
        const traced = !!state.trace;
        const dim = state.layerEmphasis && state.layerEmphasis !== card.layer;
        const node = el('div', {
            class: 'card' + (card.violation ? ' violation' : '') + (dim ? ' dim' : '') + (traced ? ' in-flow' : ''),
            'data-id': card.id, 'data-side': side, 'data-key': key, 'data-layer': card.layer
        });
        const head = el('div', { class: 'card-head', title: (card.violation ? t('trail.violation') + '. ' : '') + t('trail.tip.card') },
            kindIcon(card.kind, 15),
            el('span', { class: 'name', text: card.label }),
            stateBadge(card.id),
            countBadge(String(card.edgeCount), t('trail.tip.count'), 'count'));
        clickable(head, function () { navigate(card.id); });
        makeDraggable(head, node, key);
        node.appendChild(head);
        if (card.members.length) {
            const list = el('div', { class: 'members' });
            card.members.slice(0, 6).forEach(function (m) { list.appendChild(memberRow(m)); });
            if (card.members.length > 6) { list.appendChild(el('div', { class: 'card-foot', text: t('trail.more', String(card.members.length - 6)) })); }
            node.appendChild(el('div', { class: 'members-wrap' }, list));
        }
        applyOffset(node, key);
        return node;
    }

    /* ---------- audit: cycles, layer violations and a heat map ---------- */
    const AUDIT_METRICS = ['risk', 'coupling', 'size', 'cycles'];

    // Below this the class is left in its layer colour: the map should point at a few boxes, not paint all of them.
    const HEAT_FLOOR = 0.2;

    function heatColor(h) {
        // One hue from pale to red, like the hotspot scale of CodeScene: the redder, the riskier.
        return 'color-mix(in srgb, #e5484d ' + Math.round(6 + Math.pow(h, 1.4) * 74) + '%, #ffffff)';
    }

    /** Paints every box with the heat of its class; containers take the heat of the hottest box inside. */
    function applyHeat() {
        document.querySelectorAll('.heat, .heat-box').forEach(function (n) {
            if (n.dataset.baseTitle !== undefined) { n.title = n.dataset.baseTitle; delete n.dataset.baseTitle; }
            n.classList.remove('heat', 'heat-box');
            n.style.removeProperty('--heat-bg');
            n.removeAttribute('data-heat');
        });
        if (!state.audit.on) { return; }
        const metric = state.audit.metric;
        const audit = model.audit();
        const heatFor = function (id) { return model.heatOf(id, metric); };
        document.querySelectorAll('.overview-item[data-id], .card[data-id], .group-chip[data-id]').forEach(function (n) {
            const h = heatFor(n.dataset.id);
            if (h < HEAT_FLOOR) { return; }
            n.classList.add('heat');
            n.style.setProperty('--heat-bg', heatColor(h));
            n.dataset.heat = String(Math.round(h * 100));
            const info = audit.classes.get(model.ownerOf(n.dataset.id));
            if (info && info.reasons.length) {
                if (n.dataset.baseTitle === undefined) { n.dataset.baseTitle = n.title || ''; }
                n.title = (n.dataset.baseTitle ? n.dataset.baseTitle + '\n\n' : '') + t('trail.audit.why') + ':\n' + info.reasons.map(function (r) { return reasonIcon(r) + ' ' + reasonText(r); }).join('\n');
            }
        });
        document.querySelectorAll('.layer-group, .overview-col').forEach(function (box) {
            let top = 0;
            box.querySelectorAll('[data-id]').forEach(function (n) { top = Math.max(top, Number(n.dataset.heat || 0)); });
            if (top >= HEAT_FLOOR * 100) {
                box.classList.add('heat-box');
                box.style.setProperty('--heat-bg', heatColor(top / 100));
                box.dataset.heat = String(top);
            }
        });
    }

    function reasonText(r) {
        if (r.type === 'cycle') { return t('trail.audit.why.cycle', r.names.slice(0, 3).join(', ') + (r.names.length > 3 ? ' +' + (r.names.length - 3) : '')); }
        if (r.type === 'violation') { return t('trail.audit.why.violation', r.names.join(', ')); }
        if (r.type === 'god') { return t('trail.audit.why.god', String(r.wmc), String(r.atfd), String(Math.round(r.tcc * 100))); }
        if (r.type === 'coupling') { return t('trail.audit.why.coupling', String(r.value), String(r.max)); }
        return t('trail.audit.why.size', String(r.value), String(r.max));
    }
    function reasonIcon(r) { return r.type === 'cycle' ? '↻' : r.type === 'violation' ? '⚠' : r.type === 'coupling' ? '⇄' : r.type === 'god' ? '⚖' : '▤'; }

    /** Which state management approaches the project mixes, with the classes of each and how many listen to them. */
    function stateColumn() {
        const info = model.stateManagers();
        const col = el('div', { class: 'audit-col' }, el('h4', null, t('trail.state.title'), el('span', { class: 'badge', text: String(info.total) })));
        if (!info.total) { col.appendChild(el('div', { class: 'audit-empty', text: t('trail.state.none') })); return col; }
        if (info.fragmented) { col.appendChild(el('div', { class: 'audit-row' }, el('span', { class: 'audit-flag', title: t('trail.state.fragmentedTip'), text: t('trail.state.fragmented', String(info.families.length)) }))); }
        info.families.forEach(function (f) {
            const row = el('div', { class: 'audit-row state-family' }, el('span', { class: 'sm-badge sm-' + f.family, text: t('trail.state.' + f.family) }), el('span', { class: 'audit-more', text: String(f.classes.length) }));
            f.classes.slice(0, 4).forEach(function (c) {
                const b = el('button', { class: 'audit-link layer-' + c.layer, title: t('trail.state.observedBy', String(c.observers)), text: c.label + (c.observers ? ' · ' + c.observers : '') });
                b.addEventListener('click', function () { navigate(c.id); });
                row.appendChild(b);
            });
            if (f.classes.length > 4) { row.appendChild(el('span', { class: 'audit-more', text: '+' + (f.classes.length - 4) })); }
            col.appendChild(row);
        });
        return col;
    }

    function renderAudit() {
        const panel = $('auditpanel');
        $('btn-audit').setAttribute('aria-pressed', String(state.audit.on));
        panel.hidden = !state.audit.on;
        panel.replaceChildren();
        if (!state.audit.on) { return; }
        const a = model.audit();
        const gods = a.hotspots.filter(function (c) { return c.god; }).length;

        const head = el('div', { class: 'audit-head' }, ico('flame', 15), el('span', { class: 'audit-title', text: t('trail.audit.title') }));
        AUDIT_METRICS.forEach(function (m) {
            const chip = el('button', { class: 'chip-toggle', 'aria-pressed': String(state.audit.metric === m), title: t('trail.audit.tip.' + m), text: t('trail.audit.metric.' + m) });
            chip.addEventListener('click', function () { state.audit.metric = m; renderAudit(); applyHeat(); });
            head.appendChild(chip);
        });
        head.appendChild(el('span', { class: 'heat-legend', title: t('trail.audit.legendTip') },
            el('span', { text: t('trail.audit.low') }), el('span', { class: 'heat-bar' }), el('span', { text: t('trail.audit.high') })));
        panel.appendChild(head);

        function list(title, count, rows, empty) {
            const col = el('div', { class: 'audit-col' }, el('h4', null, title, el('span', { class: 'badge', text: String(count) })));
            if (!rows.length) { col.appendChild(el('div', { class: 'audit-empty', text: empty })); }
            rows.forEach(function (r) { col.appendChild(r); });
            return col;
        }
        function classLink(id, label, layer) {
            const b = el('button', { class: 'audit-link layer-' + layer, title: t('trail.tip.member'), text: label });
            b.addEventListener('click', function () { navigate(id); });
            return b;
        }
        const cycleRows = a.cycles.slice(0, 6).map(function (c) {
            const row = el('div', { class: 'audit-row cycle' }, el('span', { class: 'audit-flag', title: t('trail.audit.tip.cycle', String(c.size)) }, '↻ ' + c.size));
            c.members.slice(0, 5).forEach(function (m) { row.appendChild(classLink(m.id, m.label, m.layer)); });
            if (c.members.length > 5) { row.appendChild(el('span', { class: 'audit-more', text: '+' + (c.members.length - 5) })); }
            return row;
        });
        const violationRows = a.violations.slice(0, 8).map(function (v) {
            return el('div', { class: 'audit-row violation' }, ico('warning', 12),
                classLink(v.source, v.sourceLabel, v.from), el('span', { class: 'audit-arrow', text: '->' }), classLink(v.target, v.targetLabel, v.to),
                el('span', { class: 'audit-more', title: t('trail.audit.tip.violation', layerLabel(v.from), layerLabel(v.to)), text: '×' + v.count }));
        });
        const hotRows = a.hotspots.slice(0, 8).map(function (c) {
            const score = state.audit.metric === 'risk' ? c.risk : c.parts[state.audit.metric];
            const row = el('div', { class: 'audit-row hot' }, classLink(c.id, c.label, c.layer),
                el('span', { class: 'audit-meter', title: Math.round(score * 100) + '%', style: '--heat-bg:' + heatColor(score) + ';--w:' + Math.round(score * 100) + '%' }),
                c.god ? el('span', { class: 'audit-flag', title: t('trail.audit.tip.god', String(c.wmc)) }, t('trail.audit.god')) : null);
            const why = el('div', { class: 'audit-why' });
            c.reasons.forEach(function (r) { why.appendChild(el('span', { class: 'why why-' + r.type, title: reasonText(r), text: reasonIcon(r) + ' ' + reasonText(r) })); });
            return el('div', { class: 'audit-hot' }, row, why);
        });
        const body = el('div', { class: 'audit-body' },
            list(t('trail.audit.cycles'), a.cycles.length, cycleRows, t('trail.audit.noCycles')),
            list(t('trail.audit.violations'), a.violations.length, violationRows, t('trail.audit.noViolations')),
            list(t('trail.audit.hotspots'), a.hotspots.length, hotRows, t('trail.audit.noHotspots')),
            stateColumn());
        panel.appendChild(body);
        if (gods) { panel.appendChild(el('div', { class: 'audit-foot', text: t('trail.audit.godNote', String(gods)) })); }
    }

    function setAudit(on) {
        state.audit.on = on;
        renderStage({ animate: false });
        renderAudit();
        syncSizer();
    }

    /** A name inside a folded container: still a target, so it can be opened without zooming back in first. */
    function chipFor(c) {
        const chip = el('span', { 'data-id': c.id, class: 'group-chip', title: c.label + ' — ' + t('trail.tip.member'), text: c.label });
        clickable(chip, function () { navigate(c.id); });
        chip.addEventListener('click', function (e) { e.stopPropagation(); });
        return chip;
    }

    function sideColumn(groups, side, title, emptyText, f) {
        const col = el('div', { class: 'column side-' + side });
        const total = f.total[side];
        col.appendChild(el('div', { class: 'column-title', text: title + (total > 0 ? ' · ' + total : '') }));
        if (!groups.length) { col.appendChild(el('div', { class: 'empty-side', text: emptyText })); }
        groups.forEach(function (g) {
            const key = 'group:' + side + ':' + g.layer;
            const title = g.label || layerLabel(g.layer);
            const colorLayer = g.colorLayer || g.layer;
            const mode = state.groupMode.get(side + ':' + g.layer);
            const group = el('div', {
                class: 'layer-group layer-' + colorLayer + (g.folder ? ' folder-group' : '') + (mode === 'open' ? ' user-open' : mode === 'closed' ? ' user-closed' : ''),
                'data-side': side, 'data-layer': g.layer
            });
            const connections = g.cards.reduce(function (n, c) { return n + c.edgeCount; }, 0);
            const band = el('div', { class: 'layer-band', title: t('trail.tip.band') },
                g.folder ? ico('folder', 13) : ico(layerIcon(g.layer), 13), el('span', { class: 'band-title', text: title }),
                el('span', { class: 'band-count', text: t('trail.group.count', String(g.cards.length), String(connections)) }),
                el('span', { class: 'band-chevron' }, ico('arrow-down', 12)));
            makeDraggable(band, group, key);
            clickable(band, function () { toggleGroup(group, side, g.layer); });
            const chips = el('div', { class: 'group-chips' });
            g.cards.slice(0, 4).forEach(function (c) { chips.appendChild(chipFor(c)); });
            if (g.cards.length > 4) { chips.appendChild(el('span', { class: 'group-chip more', text: '+' + (g.cards.length - 4) })); }
            const inner = el('div', { class: 'group-inner' });
            g.cards.forEach(function (c) { inner.appendChild(neighborCard(c, side)); });
            group.appendChild(band);
            group.appendChild(chips);
            group.appendChild(el('div', { class: 'group-body' }, inner));
            applyOffset(group, key);
            col.appendChild(group);
        });
        const hidden = f.hidden[side];
        if (hidden > 0 || (state.expand[side] && total > MAX_CARDS_PER_SIDE)) {
            const expanded = state.expand[side];
            const toggle = el('button', { class: 'more-toggle', title: t('trail.tip.showMore') },
                ico(expanded ? 'arrow-up' : 'arrow-down', 12), expanded ? t('trail.less') : t('trail.more.side', String(hidden)));
            toggle.addEventListener('click', function () { state.expand[side] = !expanded; renderStage({ animate: true }); });
            col.appendChild(toggle);
        }
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
        const bandName = state.groupBy === 'folder' ? (model.folderOf(c.id) || t('trail.folder.root')) : layerLabel(c.layer);
        const centerBand = el('div', { class: 'center-band layer-' + c.layer, title: t('trail.tip.band') },
            state.groupBy === 'folder' ? ico('folder', 13) : ico(layerIcon(c.layer), 13), el('span', { class: 'band-title', text: bandName }));
        clickable(centerBand, function () { zoomInto(centerBand); });
        center.appendChild(centerBand);
        const isStart = state.trace && model.ownerOf(state.trace.startId) === c.id;
        const card = el('div', { class: 'card center' + (isStart ? ' trace-start' : ''), 'data-id': c.id, 'data-key': key, 'data-layer': c.layer });
        const head = el('div', { class: 'card-head', title: t('trail.tip.card') },
            c.kind === 'package' ? ico(DEP_ICON[c.depKind] || 'package', 16) : kindIcon(c.kind, 16),
            el('span', { class: 'name', text: c.label }),
            c.kind === 'package' ? null : stateBadge(c.id),
            c.kind === 'package'
                ? el('span', { class: 'badge', title: t('trail.tip.deps.' + c.depKind) }, ico(DEP_ICON[c.depKind] || 'package', 11), t('trail.deps.' + c.depKind))
                : el('span', { class: 'badge', title: layerDescription(c.layer) }, ico(layerIcon(c.layer), 11), layerLabel(c.layer)));
        clickable(head, function () { navigate(c.id); });
        makeDraggable(head, card, key);
        card.appendChild(head);
        const auditInfo = state.audit.on && c.kind !== 'package' ? model.audit().classes.get(c.id) : null;
        if (auditInfo && auditInfo.reasons.length) {
            const why = el('div', { class: 'card-why', title: t('trail.audit.why') });
            auditInfo.reasons.forEach(function (r) { why.appendChild(el('span', { class: 'why why-' + r.type, text: reasonIcon(r) + ' ' + reasonText(r) })); });
            card.appendChild(why);
        }
        if (c.members.some(function (m) { return m.inCount || m.outCount; })) {
            card.appendChild(el('div', { class: 'io-legend', title: t('trail.tip.inout') },
                el('span', { class: 'io-in', text: '↘ ' + t('trail.legend.in') }), ' · ', el('span', { class: 'io-out', text: '↗ ' + t('trail.legend.out') })));
        }
        if (c.members.length) {
            const list = el('div', { class: 'members' });
            const shown = state.expandMembers ? c.members : M.visibleMembers(c.members, f.activeMemberId, MAX_MEMBERS_SHOWN);
            shown.forEach(function (m) {
                list.appendChild(memberRow(m, { active: m.id === f.activeMemberId, io: (m.inCount || m.outCount) ? { inCount: m.inCount, outCount: m.outCount } : null }));
            });
            if (c.members.length > MAX_MEMBERS_SHOWN) {
                const toggle = el('button', { class: 'more-toggle', title: t('trail.tip.showMore') },
                    ico(state.expandMembers ? 'arrow-up' : 'arrow-down', 12),
                    state.expandMembers ? t('trail.less') : t('trail.more.side', String(c.members.length - shown.length)));
                toggle.addEventListener('click', function () { state.expandMembers = !state.expandMembers; renderStage({ animate: false }); });
                list.appendChild(toggle);
            }
            card.appendChild(el('div', { class: 'members-wrap' }, list));
        }
        if (c.internalCount) { card.appendChild(el('div', { class: 'card-foot', text: t('trail.internal', String(c.internalCount)) })); }
        applyOffset(card, key);
        center.appendChild(card);
        if (!f.isLibrary) {
            const trace = el('button', { title: t('trail.tip.traceButton') }, ico('trace', 14), t('trail.traceFlow'));
            trace.addEventListener('click', function () { startTrace(f.focusId); });
            center.appendChild(el('div', { class: 'center-actions' }, trace));
        }

        const leftTitle = f.traceMode ? t('trail.trace.leftTitle') : t('trail.usedBy');
        const rightTitle = f.traceMode ? t('trail.trace.rightTitle') : t('trail.uses');
        const leftEmpty = f.traceMode ? t('trail.trace.empty') : t('trail.noneUsedBy');
        const rightEmpty = f.traceMode ? t('trail.trace.empty') : t('trail.noneUses');
        const rail = dependencyRail(f);
        const rightCol = sideColumn(f.right, 'right', rightTitle, rightEmpty, f);
        if (rail) { rightCol.appendChild(rail); }
        columns.appendChild(sideColumn(f.left, 'left', leftTitle, leftEmpty, f));
        columns.appendChild(center);
        columns.appendChild(rightCol);
    }

    /**
     * The strip above the focused class with what its file imports, split by where it comes from. Arrows rise from the
     * class to each group because the class depends on them. Only imports are known for packages and the SDK: their
     * classes are not analysed, so they are shown as packages, not as boxes of classes.
     */
    const DEP_ICON = { flutter: 'layer-view', package: 'package', sdk: 'sdk' };
    function dependencyRail(f) {
        if (state.trace) { return null; }
        const all = model.dependenciesOf(f.focusId);
        if (!all.length) { return null; }
        const visible = all.filter(function (g) { return state.deps[g.kind]; });
        state.depGroups = visible;

        const head = el('div', { class: 'dep-head' }, ico('package', 15), el('span', { class: 'dep-title', text: t('trail.deps.title') }));
        all.forEach(function (g) {
            const chip = el('button', { class: 'dep-chip dep-' + g.kind, 'aria-pressed': String(!!state.deps[g.kind]), title: t('trail.tip.deps.' + g.kind) },
                ico(DEP_ICON[g.kind], 13), t('trail.deps.' + g.kind), el('span', { class: 'badge', text: String(g.packages.length) }));
            chip.addEventListener('click', function () {
                state.deps[g.kind] = !state.deps[g.kind];
                if (state.sel && state.sel.dep === g.kind) { resetSelection(); }
                renderStage({ animate: false });
                renderRefs();
            });
            head.appendChild(chip);
        });

        const body = el('div', { class: 'dep-groups' });
        visible.forEach(function (g) {
            const key = 'dep:' + g.kind;
            const mode = state.groupMode.get(key);
            const groupHead = el('div', { class: 'dep-group-head', title: t('trail.tip.depGroup') },
                ico(DEP_ICON[g.kind], 14), el('span', { class: 'dep-group-name', text: t('trail.deps.' + g.kind) }),
                el('span', { class: 'badge count', text: String(g.packages.length) }),
                el('span', { class: 'band-chevron' }, ico('arrow-down', 12)));
            const box = el('div', { class: 'dep-group dep-' + g.kind + (mode === 'open' ? ' user-open' : mode === 'closed' ? ' user-closed' : ''), 'data-kind': g.kind }, groupHead);
            const pills = el('div', { class: 'dep-pills' });
            g.packages.forEach(function (p) {
                const pill = el('span', {
                    'data-pkg': p.name, 'data-count': String(p.count), class: 'dep-pill', title: t('trail.tip.pill', p.name) + '\n' + p.imports.map(function (i) { return i.uri; }).join('\n'),
                    text: p.name + (p.count > 1 ? ' ×' + p.count : '')
                });
                clickable(pill, function () { navigate(p.id); });
                pills.appendChild(pill);
            });
            box.appendChild(pills);
            clickable(groupHead, function () { toggleDepGroup(box, g.kind); });
            makeDraggable(groupHead, box, key);
            applyOffset(box, key);
            body.appendChild(box);
        });
        return el('div', { class: 'dep-col', 'aria-label': t('trail.deps.title') }, head, body);
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
                const dx = (ev.clientX - startX) / state.scale;
                const dy = (ev.clientY - startY) / state.scale;
                if (!moved) {
                    if (Math.hypot(dx, dy) * state.scale < DRAG_THRESHOLD) { return; }
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
    /* ---------- zoom and levels of detail ---------- */
    function clampZoom(z) { return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100)); }

    /** Detail follows the zoom: close up everything is open; further out members fold, then each layer folds into a summary. */
    function lodFor(z) { return z >= 0.8 ? 'detail' : z >= 0.5 ? 'cards' : z >= 0.33 ? 'groups' : 'folders'; }

    /**
     * What is drawn grows less than the number says: below 50% the boxes have folded into containers, so the diagram is
     * already small and shrinking it further would only leave empty space and unreadable text.
     */
    function scaleFor(z) { return z >= 0.5 ? z : 0.75 + (z - ZOOM_MIN) / (0.5 - ZOOM_MIN) * 0.25; }

    /** Redraws the arrows on every frame for a while, so they follow boxes that are growing or shrinking. */
    function trackEdges(ms) {
        state.trackUntil = Math.max(state.trackUntil, performance.now() + ms);
        if (state.tracking) { return; }
        state.tracking = true;
        (function loop() {
            drawEdges(false);
            syncSizer();
            if (performance.now() < state.trackUntil) { requestAnimationFrame(loop); }
            else { state.tracking = false; }
        })();
    }

    /** The scaled canvas keeps its layout size, so the scrollable area is sized by hand. */
    function syncSizer() {
        const canvas = $('canvas');
        const stage = $('stage');
        const z = state.scale;
        const w = stage.clientWidth;
        if (z >= 1) {
            // Zoomed in the layout gets narrower, so the scaled canvas still fills the width and scrolls vertically.
            canvas.style.width = (w / z) + 'px';
            canvas.style.marginLeft = '0px';
        } else {
            // Zoomed out the diagram just gets smaller and stays centred, instead of spreading its columns apart.
            canvas.style.width = w + 'px';
            canvas.style.marginLeft = Math.round(w * (1 - z) / 2) + 'px';
        }
        $('zoomsizer').style.height = Math.ceil(canvas.scrollHeight * z) + 'px';
        layoutPaintSheet();
    }

    /**
     * The drawing sheet covers the whole viewer, not only the diagram: when zoomed out the diagram is smaller than
     * the viewer and there is room around it to annotate. The viewBox keeps shapes in canvas coordinates.
     */
    function layoutPaintSheet() {
        const canvas = $('canvas');
        const sheet = $('paint');
        const z = state.scale;
        const margin = parseFloat(canvas.style.marginLeft) || 0;
        const x0 = z < 1 ? -margin / z : 0;
        const width = z < 1 ? $('stage').clientWidth / z : canvas.clientWidth;
        const height = canvas.scrollHeight;
        sheet.style.left = x0 + 'px';
        sheet.style.width = width + 'px';
        sheet.setAttribute('height', String(height));
        sheet.setAttribute('viewBox', x0 + ' 0 ' + width + ' ' + height);
    }

    function applyZoom() {
        const canvas = $('canvas');
        state.scale = scaleFor(state.zoom);
        canvas.style.transform = 'scale(' + state.scale + ')';
        syncSizer();
        const lod = lodFor(state.zoom);
        const changed = lod !== state.lod;
        state.lod = lod;
        if (changed) { renderLayerFlow(); }
        canvas.classList.remove('lod-detail', 'lod-cards', 'lod-groups', 'lod-folders');
        canvas.classList.add('lod-' + lod);
        if (lod === 'folders') { canvas.classList.add('lod-groups'); }
        const label = $('zoom-label');
        label.textContent = Math.round(state.zoom * 100) + '%';
        $('btn-zoom-in').disabled = state.zoom >= ZOOM_MAX;
        $('btn-zoom-out').disabled = state.zoom <= ZOOM_MIN;
        return changed;
    }

    /** Zooms around a point of the screen (the centre of the diagram when none is given). */
    function setZoom(next, clientX, clientY, smooth) {
        const z0 = state.scale;
        const z1 = clampZoom(next);
        if (z1 === state.zoom) { return; }
        const stage = $('stage');
        const box = stage.getBoundingClientRect();
        const ax = (clientX === undefined ? box.left + box.width / 2 : clientX) - box.left;
        const ay = (clientY === undefined ? box.top + box.height / 2 : clientY) - box.top;
        const canvas = $('canvas');
        const margin0 = parseFloat(canvas.style.marginLeft) || 0;
        const contentX = (stage.scrollLeft + ax - margin0) / z0;
        const contentY = (stage.scrollTop + ay) / z0;
        const prevLod = state.lod;
        const centerNode = document.querySelector('.card.center');
        const anchor = centerNode ? { x: centerNode.getBoundingClientRect().left - box.left, y: centerNode.getBoundingClientRect().top - box.top } : null;
        state.zoom = z1;
        const lodChanged = applyZoom();
        if (regroupFor(state.lod, prevLod)) { return refit(anchor, contentY, ay); }
        const margin1 = parseFloat(canvas.style.marginLeft) || 0;
        stage.scrollLeft = contentX * state.scale + margin1 - ax;
        stage.scrollTop = contentY * state.scale - ay;
        if (lodChanged) { flagGroupsAnimating(); }
        trackEdges(smooth || lodChanged ? 450 : 80);
    }

    /** Lets the layer containers clip their content while they fold or unfold, then lets boxes be dragged out again. */
    function flagGroupsAnimating() {
        const groups = document.querySelectorAll('.layer-group');
        groups.forEach(function (g) { g.classList.add('anim'); });
        clearTimeout(flagGroupsAnimating.timer);
        flagGroupsAnimating.timer = setTimeout(function () { groups.forEach(function (g) { g.classList.remove('anim'); }); }, 450);
    }

    /** A dependency group is a bundle: its package pills fold into the title, like Sourcetrail's bundle nodes. */
    function toggleDepGroup(groupEl, kind) {
        const pills = groupEl.querySelector('.dep-pills');
        const folded = window.getComputedStyle(pills).display === 'none';
        const key = 'dep:' + kind;
        if (folded === (state.lod !== 'groups' && state.lod !== 'folders')) { state.groupMode.delete(key); } else { state.groupMode.set(key, folded ? 'open' : 'closed'); }
        const mode = state.groupMode.get(key);
        groupEl.classList.toggle('user-open', mode === 'open');
        groupEl.classList.toggle('user-closed', mode === 'closed');
        trackEdges(200);
    }

    /** A folded container is far too small to work in: clicking it brings the zoom back to where its content is readable. */
    function zoomInto(node) {
        const r = node.getBoundingClientRect();
        setZoom(1, r.left + r.width / 2, r.top + r.height / 2, true);
    }

    function toggleGroup(groupEl, side, layer) {
        if (state.lod === 'groups' || state.lod === 'folders') { zoomInto(groupEl); return; }
        const inner = groupEl.querySelector('.group-inner');
        const folded = inner.getBoundingClientRect().height / state.scale < 8;
        // Asking for what the zoom level would do anyway puts the layer back in automatic mode instead of pinning it.
        const automaticallyOpen = state.lod !== 'groups' && state.lod !== 'folders';
        const wantOpen = folded;
        const key = side + ':' + layer;
        if (wantOpen === automaticallyOpen) { state.groupMode.delete(key); } else { state.groupMode.set(key, wantOpen ? 'open' : 'closed'); }
        const mode = state.groupMode.get(key);
        groupEl.classList.toggle('user-open', mode === 'open');
        groupEl.classList.toggle('user-closed', mode === 'closed');
        groupEl.classList.add('anim');
        setTimeout(function () { groupEl.classList.remove('anim'); }, 450);
        trackEdges(450);
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

    /**
     * Draws one arrow per neighbour box. All geometry is read first and the SVG is written once afterwards:
     * mixing reads and writes forces a layout per arrow and made dragging crawl with hundreds of boxes.
     */
    function drawEdges(animate) {
        const svg = $('edges');
        const f = state.focus;
        const centerCard = document.querySelector('.card.center');
        if (!f || !centerCard) { svg.replaceChildren(); return; }

        // ---- pass 1: read the layout, in canvas units so the zoom does not matter ----
        const z = state.scale;
        const origin = canvasOrigin();
        const local = function (r) {
            return { left: (r.left - origin.left) / z, right: (r.right - origin.left) / z, top: (r.top - origin.top) / z, bottom: (r.bottom - origin.top) / z, width: r.width / z, height: r.height / z };
        };
        const rectOf = function (node) { return local(node.getBoundingClientRect()); };
        const cr = rectOf(centerCard);
        const centerHead = rectOf(centerCard.querySelector('.card-head'));
        const membersWrap = centerCard.querySelector('.members-wrap');
        const membersShown = !!membersWrap && membersWrap.getBoundingClientRect().height / z > 8;
        const centerMembers = new Map();
        if (membersShown) {
            centerCard.querySelectorAll('.member[data-id]').forEach(function (m) { centerMembers.set(m.dataset.id, rectOf(m)); });
        }
        const cardEls = new Map();
        document.querySelectorAll('.card[data-side]').forEach(function (n) { cardEls.set(n.dataset.side + ':' + n.dataset.id, n); });
        const groupEls = new Map();
        document.querySelectorAll('.layer-group[data-side]').forEach(function (n) { groupEls.set(n.dataset.side + ':' + n.dataset.layer, n); });

        function shapeFor(card, side, box, head) {
            let anchor = null;
            for (let i = 0; i < card.centerMemberIds.length && !anchor; i++) { anchor = centerMembers.get(card.centerMemberIds[i]) || null; }
            const ar = anchor || centerHead;
            const cy = ar.top + ar.height / 2;
            const ny = head.top + head.height / 2;
            // Connect through the side that faces the other box, so dragging a box across the centre still reads well.
            const boxIsLeftOfCenter = box.left + box.width / 2 < cr.left + cr.width / 2;
            const boxEdgeX = boxIsLeftOfCenter ? box.right : box.left;
            const centerEdgeX = boxIsLeftOfCenter ? cr.left : cr.right;
            return side === 'left'
                ? { card: card, side: side, x1: boxEdgeX, y1: ny, x2: centerEdgeX, y2: cy }
                : { card: card, side: side, x1: centerEdgeX, y1: cy, x2: boxEdgeX, y2: ny };
        }

        const shapes = [];
        ['left', 'right'].forEach(function (side) {
            f[side].forEach(function (group) {
                const groupEl = groupEls.get(side + ':' + group.layer);
                const inner = groupEl && groupEl.querySelector('.group-inner');
                const open = !inner || inner.getBoundingClientRect().height / z > 8;
                if (open) {
                    group.cards.forEach(function (card) {
                        const cardEl = cardEls.get(side + ':' + card.id);
                        if (cardEl) { shapes.push(shapeFor(card, side, rectOf(cardEl), rectOf(cardEl.querySelector('.card-head')))); }
                    });
                } else if (groupEl) {
                    // A folded layer draws a single arrow that stands for all of its boxes.
                    shapes.push(shapeFor(groupAsCard(group, side), side, rectOf(groupEl), rectOf(groupEl.querySelector('.layer-band'))));
                }
            });
        });

        // Libraries stack vertically in the "uses" column: the class depends on them, so arrows leave its right edge.
        const depShapes = [];
        // Each library is its own node, stacked vertically; a folded group stands for all of them with one arrow.
        document.querySelectorAll('.dep-col .dep-group').forEach(function (g) {
            const r = rectOf(g);
            const toRight = r.left + r.width / 2 > cr.left + cr.width / 2;
            const x1 = toRight ? cr.right : cr.left;
            const y1 = centerHead.top + centerHead.height / 2;
            const x2 = toRight ? r.left : r.right;
            const pills = g.querySelectorAll('.dep-pill[data-pkg]');
            const shown = pills.length && pills[0].getBoundingClientRect().height / z > 4;
            if (shown) {
                pills.forEach(function (pill) {
                    const pr = rectOf(pill);
                    depShapes.push({ kind: g.dataset.kind, name: pill.dataset.pkg, count: Number(pill.dataset.count) || 1, x1: x1, y1: y1, x2: toRight ? pr.left : pr.right, y2: pr.top + pr.height / 2 });
                });
            } else {
                const h = rectOf(g.querySelector('.dep-group-head'));
                depShapes.push({ kind: g.dataset.kind, count: null, x1: x1, y1: y1, x2: x2, y2: h.top + h.height / 2 });
            }
        });
        const height = $('canvas').scrollHeight;

        // ---- pass 2: write the SVG in one go ----
        const frag = document.createDocumentFragment();
        const defs = svgEl('defs');
        const marker = svgEl('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto', markerUnits: 'userSpaceOnUse' });
        marker.appendChild(svgEl('path', { d: 'M0,0 L10,5 L0,10 z' }));
        defs.appendChild(marker);
        frag.appendChild(defs);

        shapes.forEach(function (s) {
            const card = s.card;
            const side = s.side;
            const dx = (s.x2 - s.x1) / 2;
            const d = 'M' + s.x1 + ',' + s.y1 + ' C' + (s.x1 + dx) + ',' + s.y1 + ' ' + (s.x2 - dx) + ',' + s.y2 + ' ' + s.x2 + ',' + s.y2;
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
            const mx = u * u * u * s.x1 + 3 * u * u * bt * (s.x1 + dx) + 3 * u * bt * bt * (s.x2 - dx) + bt * bt * bt * s.x2;
            const my = u * u * u * s.y1 + 3 * u * u * bt * s.y1 + 3 * u * bt * bt * s.y2 + bt * bt * bt * s.y2;
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
            frag.appendChild(group);
            if (animate) { group.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out', fill: 'backwards' }); }
        });

        depShapes.forEach(function (s) {
            const group = state.depGroups.find(function (g) { return g.kind === s.kind; });
            if (!group) { return; }
            const dx = (s.x2 - s.x1) / 2;
            const d = 'M' + s.x1 + ',' + s.y1 + ' C' + (s.x1 + dx) + ',' + s.y1 + ' ' + (s.x2 - dx) + ',' + s.y2 + ' ' + s.x2 + ',' + s.y2;
            const edge = svgEl('g', { class: 'edge dep dep-' + s.kind, 'data-dep': s.kind });
            edge.appendChild(svgEl('path', { class: 'edge-path', d: d, 'stroke-width': String(1.8 + Math.min(group.packages.length, 6) * 0.5), 'marker-end': 'url(#arrow)' }));
            const hit = svgEl('path', { class: 'hit', d: d });
            edge.appendChild(hit);
            const bt = 0.78;
            const u = 1 - bt;
            const mx = u * u * u * s.x1 + 3 * u * u * bt * (s.x1 + dx) + 3 * u * bt * bt * (s.x2 - dx) + bt * bt * bt * s.x2;
            const my = u * u * u * s.y1 + 3 * u * u * bt * s.y1 + 3 * u * bt * bt * s.y2 + bt * bt * bt * s.y2;
            const text = String(s.count === null || s.count === undefined ? group.total : s.count);
            const w = 12 + text.length * 7;
            const chip = svgEl('g', { class: 'edge-chip' });
            chip.appendChild(svgEl('rect', { x: String(mx - w / 2), y: String(my - 9), width: String(w), height: '18', rx: '9' }));
            const label = svgEl('text', { x: String(mx), y: String(my) });
            label.textContent = text;
            chip.appendChild(label);
            const title = svgEl('title');
            title.textContent = t('trail.tip.depGroup');
            chip.appendChild(title);
            edge.appendChild(chip);
            const select = function () { selectDependency(s.kind); };
            hit.addEventListener('click', select);
            chip.addEventListener('click', select);
            frag.appendChild(edge);
            if (animate) { edge.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out', fill: 'backwards' }); }
        });

        svg.setAttribute('height', String(height));
        svg.replaceChildren(frag);
        applySelectionStyles();
    }

    /** Stands in for every box of a folded layer: one arrow whose counter adds up all of their connections. */
    function groupAsCard(group, side) {
        const byLabel = {};
        const refs = [];
        const centerMemberIds = [];
        let edgeCount = 0;
        let violation = false;
        group.cards.forEach(function (c) {
            edgeCount += c.edgeCount;
            violation = violation || c.violation;
            Object.keys(c.byLabel).forEach(function (l) { byLabel[l] = (byLabel[l] || 0) + c.byLabel[l]; });
            c.refs.forEach(function (r) { refs.push(r); });
            c.centerMemberIds.forEach(function (id) { if (centerMemberIds.indexOf(id) < 0) { centerMemberIds.push(id); } });
        });
        return {
            id: 'group:' + side + ':' + group.layer, label: group.label || layerLabel(group.layer), kind: 'class', layer: group.colorLayer || group.layer, edgeCount: edgeCount,
            byLabel: byLabel, dominantLabel: M.dominantLabel(byLabel), refs: refs, centerMemberIds: centerMemberIds, memberIds: [], members: [], violation: violation, aggregated: true
        };
    }

    /* ---------- refs list + code ---------- */
    function renderRefs() {
        const box = $('refs');
        box.replaceChildren();
        const f = state.focusFull || state.focus;
        const code = state.code;

        if (state.trace && code.mode === 'trace') { renderTraceRefs(box); return; }

        if (code.mode === 'definition') {
            box.appendChild(el('h4', { text: t('trail.connections') }));
            const cards = [];
            if (f) {
                f.left.forEach(function (g) { g.cards.forEach(function (c) { cards.push({ c: c, side: 'left' }); }); });
                f.right.forEach(function (g) { g.cards.forEach(function (c) { cards.push({ c: c, side: 'right' }); }); });
            }
            if (!cards.length && !state.depGroups.length) { box.appendChild(el('div', { class: 'ref-empty', text: f ? t('trail.noneUses') : t('trail.pickConnection') })); return; }
            box.appendChild(el('div', { class: 'ref-empty', text: t('trail.pickConnection') }));
            state.depGroups.forEach(function (g) {
                const row = el('div', { class: 'ref-row dep-ref dep-' + g.kind },
                    el('div', { class: 'ref-line' },
                        el('span', { class: 'verb', text: t('trail.deps.' + g.kind) }),
                        ico('arrow-up', 12),
                        el('span', { class: 'ref-name', text: g.packages.map(function (p) { return p.name; }).slice(0, 3).join(', ') + (g.packages.length > 3 ? '…' : '') }),
                        el('span', { class: 'badge count', title: t('trail.tip.depGroup'), text: String(g.total) })));
                clickable(row, function () { selectDependency(g.kind); });
                box.appendChild(row);
            });
            cards.forEach(function (item) {
                const row = el('div', { class: 'ref-row e-' + item.c.dominantLabel },
                    el('div', { class: 'ref-line' },
                        el('span', { class: 'verb', text: item.side === 'left' ? '-> ' + (VERBS[item.c.dominantLabel] || '') : (VERBS[item.c.dominantLabel] || '') + ' ->' }),
                        kindIcon(item.c.kind, 12),
                        el('span', { class: 'ref-name', text: item.c.label }),
                        el('span', { class: 'badge count', title: t('trail.tip.count'), text: String(item.c.edgeCount) })));
                clickable(row, function () { selectCard(item.c, item.side); });
                box.appendChild(row);
            });
            return;
        }
        if (code.mode === 'deps') {
            box.appendChild(el('h4', { text: t('trail.deps.imports') + ' (' + code.refs.length + ')' }));
            code.refs.forEach(function (ref, i) {
                const row = el('div', { class: 'ref-row' + (i === code.active ? ' active' : '') },
                    el('div', { class: 'ref-line' },
                        el('span', { class: 'ref-name', text: ref.uri }),
                        el('span', { class: 'verb', text: ':' + (ref.line + 1) })));
                clickable(row, function () { selectImport(i, true); });
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

        const layers = el('section', null, el('h3', { text: t('hud.layers') }), el('p', { class: 'hud-note', text: model.architecture.builtin ? t('hud.layers.desc') : t('hud.layers.descCustom') }));
        model.layers.forEach(function (layer) {
            layers.appendChild(hudRow(el('span', { class: 'hud-layer layer-' + layer }, ico(layerIcon(layer), 14)),
                layerLabel(layer) + ' — ' + layerDescription(layer)));
        });
        panel.appendChild(layers);

        const boxes = el('section', null, el('h3', { text: t('hud.boxes') }));
        boxes.appendChild(hudRow(el('span', { class: 'hud-box-container layer-state' }), t('hud.boxes.container')));
        boxes.appendChild(hudRow(el('span', { class: 'hud-box-class layer-state' }, ico('class', 13)), t('hud.boxes.class')));
        boxes.appendChild(hudRow(el('span', { class: 'member kind-method hud-pill' }, el('span', { class: 'mk' }, ico('method', 12)), 'method'), t('hud.boxes.method')));
        boxes.appendChild(hudRow(el('span', { class: 'member kind-field hud-pill' }, el('span', { class: 'mk' }, ico('field', 12)), 'field'), t('hud.boxes.field')));
        boxes.appendChild(hudRow(el('span', { class: 'badge count', text: '3' }), t('hud.boxes.count')));
        boxes.appendChild(hudRow(ioBadge(1, 2, 'badge io'), t('hud.boxes.inout')));
        panel.appendChild(boxes);

        const zoom = el('section', null, el('h3', { text: t('hud.zoom') }), el('p', { class: 'hud-note', text: t('hud.zoom.levels') }), el('p', { class: 'hud-note', text: t('hud.zoom.manual') }));

        const deps = el('section', null, el('h3', { text: t('hud.deps') }), el('p', { class: 'hud-note', text: t('hud.deps.rail') }));
        [['flutter', 'layer-view'], ['package', 'package'], ['sdk', 'sdk']].forEach(function (pair) {
            deps.appendChild(hudRow(el('span', { class: 'hud-dep dep-' + pair[0] }, ico(pair[1], 12), t('trail.deps.' + pair[0])), t('trail.tip.deps.' + pair[0])));
        });
        deps.appendChild(el('p', { class: 'hud-note', text: t('hud.deps.chips') }));

        const arrows = el('section', null, el('h3', { text: t('hud.arrows') }), el('p', { class: 'hud-note', text: t('hud.arrows.dir') }));
        [['CALLS', 'calls'], ['EXTENDS', 'extends'], ['IMPLEMENTS', 'implements'], ['READS_FROM', 'reads'], ['WRITES_TO', 'writes'], ['INSTANCE_OF', 'creates'], ['USES_AS_TYPE', 'type']]
            .forEach(function (pair) { arrows.appendChild(hudRow(hudEdgeSample(pair[0]), t('hud.arrows.' + pair[1]))); });
        arrows.appendChild(hudRow(el('span', { class: 'edge-chip-sample', text: '2' }), t('hud.arrows.count')));
        arrows.appendChild(hudRow(hudEdgeSample('CALLS', 'violation'), t('hud.arrows.violation')));
        arrows.appendChild(hudRow(hudEdgeSample('CALLS', 'in-flow'), t('hud.arrows.flow')));
        panel.appendChild(arrows);
        panel.appendChild(deps);
        panel.appendChild(zoom);
        const auditHud = el('section', null, el('h3', { text: t('hud.audit') }), el('p', { class: 'hud-note', text: t('hud.audit.desc') }),
            hudRow(el('span', { class: 'heat-legend' }, el('span', { class: 'heat-bar' })), t('trail.audit.legendTip')));
        panel.appendChild(auditHud);
        const stateHud = el('section', null, el('h3', { text: t('hud.state') }), el('p', { class: 'hud-note', text: t('hud.state.desc') }));
        ['bloc', 'provider', 'riverpod', 'getx'].forEach(function (f) { stateHud.appendChild(hudRow(el('span', { class: 'sm-badge sm-' + f, text: t('trail.state.' + f) }), t('trail.state.tip', t('trail.state.' + f), t('trail.state.' + f)))); });
        panel.appendChild(stateHud);

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
        const z = state.scale;
        return [Math.round((e.clientX - c.left) / z * 10) / 10, Math.round((e.clientY - c.top) / z * 10) / 10];
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
        layoutPaintSheet();
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
        applyLayerStyles();
        setIcon($('btn-home'), 'home', t('trail.tip.home'));
        setIcon($('btn-back'), 'back', t('trail.tip.back'));
        setIcon($('btn-forward'), 'forward', t('trail.tip.forward'));
        setIcon($('btn-reset'), 'reset', t('trail.tip.reset'));
        setIcon($('btn-zoom-out'), 'zoom-out', t('trail.tip.zoomOut'));
        setIcon($('btn-zoom-in'), 'zoom-in', t('trail.tip.zoomIn'));
        $('zoom-label').title = t('trail.tip.zoomReset');
        $('zoom-label').setAttribute('aria-label', t('trail.tip.zoomReset'));
        $('btn-zoom-in').addEventListener('click', function () { setZoom(state.zoom * ZOOM_STEP, undefined, undefined, true); });
        $('btn-zoom-out').addEventListener('click', function () { setZoom(state.zoom / ZOOM_STEP, undefined, undefined, true); });
        $('zoom-label').addEventListener('click', function () { setZoom(1, undefined, undefined, true); });
        $('stage').addEventListener('wheel', function (e) {
            if (!e.ctrlKey && !e.metaKey) { return; }
            e.preventDefault();
            setZoom(state.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY, false);
        }, { passive: false });
        applyZoom();
        setIcon($('btn-audit'), 'flame', t('trail.tip.audit'));
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
        $('btn-audit').addEventListener('click', function () { setAudit(!state.audit.on); });
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
            else if ((e.key === '+' || e.key === '=') && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setZoom(state.zoom * ZOOM_STEP, undefined, undefined, true); }
            else if ((e.key === '-' || e.key === '_') && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setZoom(state.zoom / ZOOM_STEP, undefined, undefined, true); }
            else if (e.key === '0' && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setZoom(1, undefined, undefined, true); }
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

        window.addEventListener('resize', function () { syncSizer(); scheduleEdges(); });
        if (window.ResizeObserver) { new ResizeObserver(function () { syncSizer(); }).observe($('canvas')); }
        if (window.ResizeObserver) { new ResizeObserver(function () { syncSizer(); scheduleEdges(); }).observe($('columns')); }

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
                    const f = state.focusFull;
                    if (!f || !target) { break; }
                    let found = null;
                    f.left.forEach(function (g) { g.cards.forEach(function (c) { if (c.id === target && !found) { found = { c: c, side: 'left' }; } }); });
                    f.right.forEach(function (g) { g.cards.forEach(function (c) { if (c.id === target && !found) { found = { c: c, side: 'right' }; } }); });
                    if (found) {
                        const visible = state.focus[found.side].some(function (g) { return g.cards.some(function (c) { return c.id === target; }); });
                        if (!visible) { state.expand[found.side] = true; renderStage({ animate: false }); }
                        selectCard(found.c, found.side);
                    }
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
