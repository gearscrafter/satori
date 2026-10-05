/* Pure graph model for the Satori trail view. No DOM access: usable from the webview and from Node tests. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TrailModel = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LAYERS = ['view', 'state', 'service', 'model', 'utility'];
    const LAYER_RANK = { view: 0, state: 1, service: 2, model: 3 };
    const LABEL_PRIORITY = ['EXTENDS', 'IMPLEMENTS', 'CALLS', 'WRITES_TO', 'READS_FROM', 'PASSES_AS_ARGUMENT', 'INSTANCE_OF', 'USES_AS_TYPE'];
    const INHERITANCE = new Set(['EXTENDS', 'IMPLEMENTS']);
    // Which end of an edge provides the data: "target" means the data lives in the edge target (reader/caller is the source).
    const FLOW_PROVIDER = { CALLS: 'target', READS_FROM: 'target', WRITES_TO: 'source', PASSES_AS_ARGUMENT: 'source' };

    function stripDecor(label) {
        return String(label || '').replace(/^(?:\u{1F517}|⚙️?)\s*/u, '');
    }

    function normalizeRange(range) {
        if (!range) { return null; }
        const start = Array.isArray(range) ? range[0] : range.start;
        const end = Array.isArray(range) ? range[1] : range.end;
        if (!start || !end) { return null; }
        return { start: { line: start.line, character: start.character }, end: { line: end.line, character: end.character } };
    }

    function dominantLabel(byLabel) {
        let best = null;
        for (const label of Object.keys(byLabel)) {
            if (best === null || byLabel[label] > byLabel[best] ||
                (byLabel[label] === byLabel[best] && LABEL_PRIORITY.indexOf(label) < LABEL_PRIORITY.indexOf(best))) {
                best = label;
            }
        }
        return best;
    }

    function createModel(graph, options) {
        const opts = Object.assign({ showSdk: false, showPackages: true, edgeLabels: null }, options || {});
        const nodes = new Map();
        for (const n of (graph && graph.nodes) || []) {
            if (n.kind !== 'package_container') { nodes.set(n.id, n); }
        }

        const ownerCache = new Map();
        function ownerOf(id) {
            if (ownerCache.has(id)) { return ownerCache.get(id); }
            let n = nodes.get(id);
            let owner = null;
            if (n) {
                for (let depth = 0; n.parent && nodes.has(n.parent) && depth < 10; depth++) { n = nodes.get(n.parent); }
                owner = n.id;
            }
            ownerCache.set(id, owner);
            return owner;
        }

        function sourceTypeOf(id) {
            const n = nodes.get(ownerOf(id));
            return (n && n.data && n.data.source && n.data.source.type) || 'project';
        }

        function isVisible(id) {
            const type = sourceTypeOf(id);
            if (type === 'sdk') { return opts.showSdk; }
            if (type === 'external_package') { return opts.showPackages; }
            return true;
        }

        function layerOf(id) {
            const n = nodes.get(ownerOf(id));
            const layer = n && n.data && n.data.layer;
            return LAYERS.indexOf(layer) >= 0 ? layer : 'utility';
        }

        function nameOf(id) {
            const n = nodes.get(id);
            if (!n) { return String(id); }
            const owner = ownerOf(id);
            const label = stripDecor(n.label);
            return owner === id ? label : stripDecor(nodes.get(owner).label) + '.' + label;
        }

        const edges = [];
        const flowEdges = [];
        let internalCount = 0;
        const internalByOwner = new Map();
        for (const e of (graph && graph.edges) || []) {
            if (!nodes.has(e.source) || !nodes.has(e.target)) { continue; }
            if (!isVisible(e.source) || !isVisible(e.target)) { continue; }
            if (opts.edgeLabels && !opts.edgeLabels.has(e.label)) { continue; }
            const so = ownerOf(e.source);
            const to = ownerOf(e.target);
            const providerEnd = FLOW_PROVIDER[e.label];
            if (providerEnd) {
                flowEdges.push({
                    id: e.id, label: e.label, source: e.source, target: e.target,
                    provider: providerEnd === 'target' ? e.target : e.source,
                    consumer: providerEnd === 'target' ? e.source : e.target
                });
            }
            if (so === to) {
                internalCount++;
                internalByOwner.set(so, (internalByOwner.get(so) || 0) + 1);
                continue;
            }
            edges.push({ id: e.id, source: e.source, target: e.target, label: e.label, so, to });
        }

        function isViolation(sourceOwner, targetOwner, byLabel) {
            const rs = LAYER_RANK[layerOf(sourceOwner)];
            const rt = LAYER_RANK[layerOf(targetOwner)];
            if (rs === undefined || rt === undefined || rt >= rs) { return false; }
            return !Object.keys(byLabel).every(l => INHERITANCE.has(l));
        }

        const aggregated = new Map();
        for (const e of edges) {
            const key = e.so + '|' + e.to;
            let agg = aggregated.get(key);
            if (!agg) {
                agg = { id: key, source: e.so, target: e.to, count: 0, byLabel: {}, refs: [] };
                aggregated.set(key, agg);
            }
            agg.count++;
            agg.byLabel[e.label] = (agg.byLabel[e.label] || 0) + 1;
            agg.refs.push(e);
        }
        for (const agg of aggregated.values()) {
            agg.label = dominantLabel(agg.byLabel);
            agg.violation = isViolation(agg.source, agg.target, agg.byLabel);
        }

        const owners = [];
        for (const n of nodes.values()) {
            if (ownerOf(n.id) === n.id && isVisible(n.id)) { owners.push(n); }
        }
        const inDeg = new Map();
        const outDeg = new Map();
        for (const agg of aggregated.values()) {
            outDeg.set(agg.source, (outDeg.get(agg.source) || 0) + 1);
            inDeg.set(agg.target, (inDeg.get(agg.target) || 0) + 1);
        }

        function ownerSummary(n) {
            return {
                id: n.id, label: stripDecor(n.label), kind: n.kind, layer: layerOf(n.id),
                source: sourceTypeOf(n.id), inDeg: inDeg.get(n.id) || 0, outDeg: outDeg.get(n.id) || 0
            };
        }

        function layerFlow() {
            const flow = new Map();
            for (const agg of aggregated.values()) {
                const from = layerOf(agg.source);
                const to = layerOf(agg.target);
                const key = from + '>' + to;
                let f = flow.get(key);
                if (!f) { f = { from, to, count: 0, classEdges: 0, violation: false }; flow.set(key, f); }
                f.count += agg.count;
                f.classEdges++;
                if (agg.violation) { f.violation = true; }
            }
            return Array.from(flow.values()).sort((a, b) => b.count - a.count);
        }

        function overview() {
            const byLayer = {};
            for (const l of LAYERS) { byLayer[l] = []; }
            for (const n of owners) { byLayer[layerOf(n.id)].push(ownerSummary(n)); }
            for (const l of LAYERS) {
                byLayer[l].sort((a, b) => (b.inDeg + b.outDeg) - (a.inDeg + a.outDeg) || a.label.localeCompare(b.label));
            }
            return { layers: LAYERS.map(layer => ({ layer, classes: byLayer[layer] })), flow: layerFlow() };
        }

        function membersOf(ownerId) {
            const members = [];
            for (const n of nodes.values()) {
                if (n.parent === ownerId) {
                    members.push({ id: n.id, label: stripDecor(n.label), kind: n.kind });
                }
            }
            return members;
        }

        function focus(id) {
            const owner = ownerOf(id);
            if (!owner || !isVisible(owner)) { return null; }
            const activeMemberId = owner === id ? null : id;
            const ownerNode = nodes.get(owner);

            const touching = edges.filter(e => (e.so === owner || e.to === owner) &&
                (!activeMemberId || e.source === activeMemberId || e.target === activeMemberId));

            const left = new Map();
            const right = new Map();
            for (const e of touching) {
                const incoming = e.to === owner;
                const side = incoming ? left : right;
                const other = incoming ? e.so : e.to;
                const otherEnd = incoming ? e.source : e.target;
                const centerEnd = incoming ? e.target : e.source;
                let card = side.get(other);
                if (!card) {
                    card = Object.assign(ownerSummary(nodes.get(other)), {
                        edgeCount: 0, byLabel: {}, refs: [], memberIds: [], centerMemberIds: [], violation: false
                    });
                    side.set(other, card);
                }
                card.edgeCount++;
                card.byLabel[e.label] = (card.byLabel[e.label] || 0) + 1;
                card.refs.push({ id: e.id, source: e.source, target: e.target, label: e.label, incoming });
                if (otherEnd !== other && card.memberIds.indexOf(otherEnd) < 0) { card.memberIds.push(otherEnd); }
                if (card.centerMemberIds.indexOf(centerEnd) < 0) { card.centerMemberIds.push(centerEnd); }
            }

            function finish(side, incomingSide) {
                const cards = Array.from(side.values());
                for (const c of cards) {
                    c.dominantLabel = dominantLabel(c.byLabel);
                    c.violation = incomingSide
                        ? isViolation(c.id, owner, c.byLabel)
                        : isViolation(owner, c.id, c.byLabel);
                    c.members = c.memberIds.map(mid => ({ id: mid, label: stripDecor(nodes.get(mid).label), kind: nodes.get(mid).kind }));
                }
                return LAYERS.map(layer => ({
                    layer,
                    cards: cards.filter(c => c.layer === layer)
                        .sort((a, b) => b.edgeCount - a.edgeCount || a.label.localeCompare(b.label))
                })).filter(g => g.cards.length > 0);
            }

            const centerMembers = membersOf(owner).map(m => {
                let inCount = 0;
                let outCount = 0;
                for (const e of edges) {
                    if (e.target === m.id) { inCount++; }
                    if (e.source === m.id) { outCount++; }
                }
                return Object.assign(m, { inCount, outCount });
            });

            return {
                focusId: id,
                ownerId: owner,
                activeMemberId,
                center: Object.assign(ownerSummary(ownerNode), { members: centerMembers, internalCount: internalByOwner.get(owner) || 0 }),
                left: finish(left, true),
                right: finish(right, false)
            };
        }

        function search(query, limit) {
            const q = stripDecor(query).trim().toLowerCase();
            if (!q) { return []; }
            const found = [];
            for (const n of nodes.values()) {
                if (!isVisible(n.id)) { continue; }
                const label = stripDecor(n.label).toLowerCase();
                const at = label.indexOf(q);
                if (at < 0) { continue; }
                const isOwner = ownerOf(n.id) === n.id;
                found.push({
                    score: (at === 0 ? 0 : 10) + (isOwner ? 0 : 5) + label.length / 100,
                    result: { id: n.id, label: stripDecor(n.label), kind: n.kind, ownerId: ownerOf(n.id), name: nameOf(n.id), layer: layerOf(n.id) }
                });
            }
            return found.sort((a, b) => a.score - b.score).slice(0, limit || 20).map(f => f.result);
        }

        function findAggregate(sourceOwner, targetOwner) {
            return aggregated.get(sourceOwner + '|' + targetOwner) || null;
        }

        /**
         * Follows how data moves around a node. Upstream are the providers it reads from or calls
         * (negative depth); downstream are the consumers that read or call it (positive depth).
         * Starting from a class traces all of its members.
         */
        function traceFlow(startId, options) {
            if (!nodes.has(startId)) { return null; }
            const maxDepth = (options && options.maxDepth) || 5;
            const maxNodes = (options && options.maxNodes) || 80;
            const seeds = ownerOf(startId) === startId
                ? [startId].concat(membersOf(startId).map(function (m) { return m.id; }))
                : [startId];

            const byProvider = new Map();
            const byConsumer = new Map();
            for (const fe of flowEdges) {
                if (!byProvider.has(fe.provider)) { byProvider.set(fe.provider, []); }
                if (!byConsumer.has(fe.consumer)) { byConsumer.set(fe.consumer, []); }
                byProvider.get(fe.provider).push(fe);
                byConsumer.get(fe.consumer).push(fe);
            }

            const found = new Map();
            seeds.forEach(function (id) { found.set(id, { id: id, depth: 0, via: null }); });
            const used = new Map();
            let truncated = false;

            function walk(sign) {
                let frontier = seeds.slice();
                for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
                    const next = [];
                    for (const id of frontier) {
                        const list = (sign > 0 ? byProvider : byConsumer).get(id) || [];
                        for (const fe of list) {
                            const other = sign > 0 ? fe.consumer : fe.provider;
                            if (!found.has(other)) {
                                if (found.size >= maxNodes) { truncated = true; continue; }
                                found.set(other, { id: other, depth: sign * depth, via: fe });
                                next.push(other);
                            }
                            used.set(fe.id, fe);
                        }
                    }
                    frontier = next;
                }
            }
            walk(1);
            walk(-1);

            const list = Array.from(found.values()).map(function (n) {
                return { id: n.id, depth: n.depth, via: n.via, name: nameOf(n.id), owner: ownerOf(n.id) };
            }).sort(function (a, b) { return a.depth - b.depth || a.name.localeCompare(b.name); });

            return {
                startId: startId,
                seeds: seeds,
                nodes: list,
                edges: Array.from(used.values()).filter(function (fe) { return found.has(fe.provider) && found.has(fe.consumer); }),
                upstream: list.filter(function (n) { return n.depth < 0; }).length,
                downstream: list.filter(function (n) { return n.depth > 0; }).length,
                truncated: truncated
            };
        }

        function flowRefs(fromLayer, toLayer) {
            const refs = [];
            for (const agg of aggregated.values()) {
                if (layerOf(agg.source) === fromLayer && layerOf(agg.target) === toLayer) {
                    for (const r of agg.refs) { refs.push({ id: r.id, source: r.source, target: r.target, label: r.label }); }
                }
            }
            return refs;
        }

        return {
            nodes, edges, internalCount,
            ownerOf, layerOf, nameOf, sourceTypeOf,
            overview, focus, search, layerFlow, findAggregate, flowRefs, traceFlow,
            nodeRange: id => normalizeRange(nodes.get(id) && nodes.get(id).data && (nodes.get(id).data.range || nodes.get(id).data.selectionRange))
        };
    }

    function createTrail(max) {
        const limit = max || 100;
        let items = [];
        let idx = -1;
        return {
            push(id) {
                if (items[idx] === id) { return; }
                items = items.slice(0, idx + 1);
                items.push(id);
                if (items.length > limit) { items.shift(); }
                idx = items.length - 1;
            },
            back() { if (idx > 0) { idx--; return items[idx]; } return null; },
            forward() { if (idx < items.length - 1) { idx++; return items[idx]; } return null; },
            goTo(i) { if (i >= 0 && i < items.length) { idx = i; return items[idx]; } return null; },
            current() { return idx >= 0 ? items[idx] : null; },
            canBack() { return idx > 0; },
            canForward() { return idx < items.length - 1; },
            list() { return items.slice(); },
            index() { return idx; }
        };
    }

    return { LAYERS, LAYER_RANK, createModel, createTrail, stripDecor, normalizeRange, dominantLabel };
});
