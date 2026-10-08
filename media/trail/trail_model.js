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

    /** The four layers Satori always had, used when the project has no satori.json. */
    function defaultArchitecture() {
        return {
            layers: LAYERS.map(function (id) { return { id: id, neutral: id === 'utility' }; }),
            mode: 'order', allow: [], forbid: [], neutral: 'utility', builtin: true
        };
    }

    /** Fills in whatever a (possibly missing or damaged) architecture does not say. */
    function resolveArchitecture(given) {
        const base = defaultArchitecture();
        if (!given || !Array.isArray(given.layers) || given.layers.length === 0) { return base; }
        const layers = given.layers.filter(function (l) { return l && typeof l.id === 'string'; });
        if (layers.length === 0) { return base; }
        const ids = layers.map(function (l) { return l.id; });
        const neutral = ids.indexOf(given.neutral) >= 0 ? given.neutral : ids[ids.length - 1];
        const pairs = function (list) { return Array.isArray(list) ? list.filter(function (p) { return Array.isArray(p) && p.length === 2; }) : []; };
        return {
            layers: layers, mode: given.mode === 'allow' || given.mode === 'none' ? given.mode : 'order', allow: pairs(given.allow), forbid: pairs(given.forbid),
            neutral: neutral, builtin: given.builtin === true
        };
    }
    const LABEL_PRIORITY = ['EXTENDS', 'IMPLEMENTS', 'OBSERVES', 'CALLS', 'WRITES_TO', 'READS_FROM', 'PASSES_AS_ARGUMENT', 'INSTANCE_OF', 'USES_AS_TYPE'];
    const INHERITANCE = new Set(['EXTENDS', 'IMPLEMENTS']);
    // Which end of an edge provides the data. All edges are drawn from the method to the symbol it touches:
    // a read, a call or an argument handed on takes the value from the target; a write puts a value into it.
    const FLOW_PROVIDER = { OBSERVES: 'target', CALLS: 'target', READS_FROM: 'target', WRITES_TO: 'source', PASSES_AS_ARGUMENT: 'target' };

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

    // Packages that ship with Flutter itself. Names like flutter_bloc or flutter_svg are third-party and are not listed.
    const FLUTTER_PACKAGES = new Set(['flutter', 'flutter_test', 'flutter_localizations', 'flutter_web_plugins', 'flutter_driver', 'integration_test']);
    const DEPENDENCY_KINDS = ['flutter', 'package', 'sdk'];

    /** Where an imported URI comes from: the Dart SDK, Flutter, a third-party package, or the project itself. */
    function classifyImport(uri, ownPackage) {
        if (/^dart:/.test(uri)) { return { kind: 'sdk', name: uri }; }
        const m = /^package:([^/]+)\//.exec(uri);
        if (!m) { return { kind: 'own', name: uri }; }
        if (ownPackage && m[1] === ownPackage) { return { kind: 'own', name: m[1] }; }
        return { kind: FLUTTER_PACKAGES.has(m[1]) ? 'flutter' : 'package', name: m[1] };
    }

    /** Path of a file URI relative to the project: the part after "/lib/" when there is one, else after the root. */
    function relativeFolder(fileUri, projectRoot) {
        if (!fileUri) { return ''; }
        let p;
        try { p = decodeURIComponent(String(fileUri)); } catch (e) { p = String(fileUri); }
        p = p.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/');
        const dir = p.slice(0, Math.max(0, p.lastIndexOf('/')));
        const lib = dir.search(/(^|\/)lib(\/|$)/);
        if (lib >= 0) { return dir.slice(dir.indexOf('lib', lib) + 3).replace(/^\//, ''); }
        if (projectRoot) {
            const root = String(projectRoot).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
            if (root && dir.toLowerCase().indexOf(root) === 0) { return dir.slice(root.length).replace(/^\//, ''); }
        }
        return dir.split('/').slice(-2).join('/');
    }

    function createModel(graph, options) {
        const opts = Object.assign({ showSdk: false, showPackages: true, edgeLabels: null, projectRoot: '', fileImports: {}, ownPackage: '', audit: null, architecture: null }, options || {});
        const arch = resolveArchitecture(opts.architecture);
        const layerIds = arch.layers.map(function (l) { return l.id; });
        const neutralLayer = arch.neutral;
        // Position in the order of the layers that take part in the rules (the neutral one does not).
        const layerRank = new Map();
        arch.layers.filter(function (l) { return l.id !== neutralLayer; }).forEach(function (l, i) { layerRank.set(l.id, i); });
        const allowed = new Set(arch.allow.map(function (p) { return p[0] + '>' + p[1]; }));
        const forbidden = new Set(arch.forbid.map(function (p) { return p[0] + '>' + p[1]; }));
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
            return layerIds.indexOf(layer) >= 0 ? layer : neutralLayer;
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

        /**
         * A use that goes against the architecture. Inheritance never counts, nor does the neutral layer or a use
         * inside one layer. "forbid" always counts. Then, in "allow" mode anything not listed counts; in "order" mode a
         * use that goes back up the order counts unless "allow" lists it as an exception.
         */
        function isViolation(sourceOwner, targetOwner, byLabel) {
            const from = layerOf(sourceOwner);
            const to = layerOf(targetOwner);
            if (from === to || from === neutralLayer || to === neutralLayer) { return false; }
            if (Object.keys(byLabel).every(l => INHERITANCE.has(l))) { return false; }
            const pair = from + '>' + to;
            if (forbidden.has(pair)) { return true; }
            if (arch.mode === 'none') { return false; }
            if (arch.mode === 'allow') { return !allowed.has(pair); }
            return layerRank.get(to) < layerRank.get(from) && !allowed.has(pair);
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

        /**
         * Libraries (the Dart SDK, Flutter, third-party packages) as nodes you can navigate to. They are built from the
         * import lines, so a library node knows which classes import it and which of its files they import, but not
         * the classes inside it. They live outside the layers: they never appear in the overview columns or in the
         * layer flow, and the dependency strip stands in for them next to a class.
         */
        const libNodes = new Map();
        const importEdges = [];
        (function buildLibraries() {
            const ownersByFile = new Map();
            owners.forEach(function (o) {
                const uri = o.data && o.data.fileUri;
                if (!uri || !opts.fileImports[uri]) { return; }
                if (!ownersByFile.has(uri)) { ownersByFile.set(uri, []); }
                ownersByFile.get(uri).push(o);
            });
            Object.keys(opts.fileImports).forEach(function (fileUri) {
                const fileOwners = ownersByFile.get(fileUri);
                if (!fileOwners) { return; }
                const linked = new Set();
                opts.fileImports[fileUri].forEach(function (imp) {
                    const c = classifyImport(imp.uri, opts.ownPackage);
                    if (c.kind === 'own') { return; }
                    const id = 'lib:' + c.kind + ':' + c.name;
                    let lib = libNodes.get(id);
                    if (!lib) {
                        lib = { id: id, label: c.name, kind: 'package', data: { fileUri: '', layer: neutralLayer, depKind: c.kind, uris: [], source: { type: 'library', packageName: c.name } } };
                        libNodes.set(id, lib);
                    }
                    if (lib.data.uris.indexOf(imp.uri) < 0) { lib.data.uris.push(imp.uri); }
                    if (linked.has(id)) { return; }
                    linked.add(id);
                    fileOwners.forEach(function (o) { importEdges.push({ id: 'imp' + importEdges.length, source: o.id, target: id, label: 'IMPORTS', fileUri: fileUri }); });
                });
            });
            libNodes.forEach(function (lib) { nodes.set(lib.id, lib); });
        })();

        function isLibrary(id) { return libNodes.has(id); }

        /** What a library looks like when it is the centre: who imports it, and which of its files they import. */
        function focusLibrary(id) {
            const lib = libNodes.get(id);
            const cards = new Map();
            importEdges.filter(function (e) { return e.target === id; }).forEach(function (e) {
                const owner = nodes.get(e.source);
                const imports = (opts.fileImports[e.fileUri] || []).filter(function (imp) {
                    const c = classifyImport(imp.uri, opts.ownPackage);
                    return 'lib:' + c.kind + ':' + c.name === id;
                }).map(function (imp) { return { pkg: lib.label, uri: imp.uri, line: imp.line, column: imp.column, fileUri: e.fileUri }; });
                cards.set(owner.id, Object.assign(ownerSummary(owner), {
                    edgeCount: imports.length, byLabel: { IMPORTS: imports.length }, dominantLabel: 'IMPORTS', violation: false,
                    refs: [{ id: e.id, source: e.source, target: id, label: 'IMPORTS', incoming: true }],
                    memberIds: [], centerMemberIds: [id], members: [], imports: imports
                }));
            });
            const all = Array.from(cards.values());
            return {
                focusId: id, ownerId: id, activeMemberId: null, isLibrary: true,
                center: {
                    id: id, label: lib.label, kind: 'package', layer: neutralLayer, source: 'library', depKind: lib.data.depKind,
                    inDeg: all.length, outDeg: 0, internalCount: 0,
                    members: lib.data.uris.map(function (uri) { return { id: 'lib-file:' + uri, label: uri, kind: 'library', uri: uri, inCount: 0, outCount: 0 }; })
                },
                left: layerIds.map(function (layer) {
                    return { layer: layer, cards: all.filter(function (c) { return c.layer === layer; }).sort(function (a, b) { return a.label.localeCompare(b.label); }) };
                }).filter(function (g) { return g.cards.length > 0; }),
                right: []
            };
        }

        /** Libraries grouped by where they come from, with how many classes import each one, for the overview. */
        function libraries() {
            const users = new Map();
            importEdges.forEach(function (e) {
                if (!users.has(e.target)) { users.set(e.target, new Set()); }
                users.get(e.target).add(e.source);
            });
            return DEPENDENCY_KINDS.map(function (kind) {
                const items = Array.from(libNodes.values()).filter(function (l) { return l.data.depKind === kind; })
                    .map(function (l) { return { id: l.id, name: l.label, users: (users.get(l.id) || new Set()).size }; })
                    .sort(function (a, b) { return b.users - a.users || a.name.localeCompare(b.name); });
                return { kind: kind, items: items };
            }).filter(function (g) { return g.items.length > 0; });
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

        /** First folder level of a class below lib/ (empty string for classes directly in lib/). */
        function folderOf(id) {
            const n = nodes.get(ownerOf(id));
            const folder = relativeFolder(n && n.data && n.data.fileUri, opts.projectRoot);
            return folder.split('/')[0] || '';
        }

        /** Folders that contain visible classes, biggest first, for the overview filter. */
        function folders() {
            const counts = new Map();
            for (const n of owners) {
                const f = folderOf(n.id);
                counts.set(f, (counts.get(f) || 0) + 1);
            }
            return Array.from(counts.entries())
                .map(function (e) { return { name: e[0], count: e[1] }; })
                .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
        }

        function overview(filter) {
            const byLayer = {};
            for (const l of layerIds) { byLayer[l] = []; }
            const folder = filter && typeof filter.folder === 'string' ? filter.folder : null;
            for (const n of owners) {
                if (folder !== null && folderOf(n.id) !== folder) { continue; }
                byLayer[layerOf(n.id)].push(ownerSummary(n));
            }
            for (const l of layerIds) {
                byLayer[l].sort((a, b) => (b.inDeg + b.outDeg) - (a.inDeg + a.outDeg) || a.label.localeCompare(b.label));
            }
            return { layers: layerIds.map(layer => ({ layer, classes: byLayer[layer] })), flow: layerFlow() };
        }

        /**
         * Architecture audit over the class graph of the project: circular dependencies (strongly connected groups),
         * layer violations and a heat score per class. Libraries and the SDK are left out, only the project is judged.
         */
        function audit(config) {
            // Defaults follow the God Class detection strategy of Lanza and Marinescu (Object-Oriented Metrics in Practice):
            // ATFD above "few" (5), WMC "very high" (47) and TCC below one third. The weights are Satori's own.
            const cfg = Object.assign({ godWmc: 47, godAtfd: 5, godTcc: 0.33, weights: { coupling: 0.3, size: 0.15, cycles: 0.25, violations: 0.3 } }, opts.audit || {}, config || {});
            const weights = Object.assign({ coupling: 0.3, size: 0.15, cycles: 0.25, violations: 0.3 }, cfg.weights || {});
            const weightSum = Math.max(0.0001, weights.coupling + weights.size + weights.cycles + weights.violations);
            const own = owners.filter(function (n) { return sourceTypeOf(n.id) === 'project'; });
            const ids = new Set(own.map(function (n) { return n.id; }));
            const next = new Map();
            own.forEach(function (n) { next.set(n.id, []); });
            const degree = new Map();
            aggregated.forEach(function (agg) {
                if (ids.has(agg.source) && ids.has(agg.target) && agg.source !== agg.target) {
                    next.get(agg.source).push(agg.target);
                    degree.set(agg.source, (degree.get(agg.source) || 0) + 1);
                    degree.set(agg.target, (degree.get(agg.target) || 0) + 1);
                }
            });

            // Tarjan, iterative so a long chain of classes cannot overflow the stack.
            const index = new Map();
            const low = new Map();
            const onStack = new Set();
            const stack = [];
            const components = [];
            let counter = 0;
            own.forEach(function (root) {
                if (index.has(root.id)) { return; }
                const work = [{ id: root.id, i: 0 }];
                index.set(root.id, counter); low.set(root.id, counter); counter++;
                stack.push(root.id); onStack.add(root.id);
                while (work.length) {
                    const frame = work[work.length - 1];
                    const out = next.get(frame.id);
                    if (frame.i < out.length) {
                        const w = out[frame.i++];
                        if (!index.has(w)) {
                            index.set(w, counter); low.set(w, counter); counter++;
                            stack.push(w); onStack.add(w);
                            work.push({ id: w, i: 0 });
                        } else if (onStack.has(w)) {
                            low.set(frame.id, Math.min(low.get(frame.id), index.get(w)));
                        }
                    } else {
                        work.pop();
                        if (work.length) {
                            const parent = work[work.length - 1].id;
                            low.set(parent, Math.min(low.get(parent), low.get(frame.id)));
                        }
                        if (low.get(frame.id) === index.get(frame.id)) {
                            const comp = [];
                            let w;
                            do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== frame.id);
                            if (comp.length > 1) { components.push(comp); }
                        }
                    }
                }
            });
            const cycleOf = new Map();
            const cycles = components.map(function (comp) {
                const set = new Set(comp);
                const refs = [];
                aggregated.forEach(function (agg) { if (set.has(agg.source) && set.has(agg.target) && agg.source !== agg.target) { refs.push(agg.id); } });
                return {
                    size: comp.length, edges: refs,
                    members: comp.slice().sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b)); }).map(function (id) { return { id: id, label: nameOf(id), layer: layerOf(id) }; })
                };
            }).sort(function (a, b) { return b.size - a.size; });
            cycles.forEach(function (c, i) {
                c.id = 'cycle:' + i;
                c.members.forEach(function (m) { cycleOf.set(m.id, i); });
            });

            const violations = [];
            const violationsBy = new Map();
            const violationTargets = new Map();
            aggregated.forEach(function (agg) {
                if (!agg.violation || !ids.has(agg.source) || !ids.has(agg.target)) { return; }
                violations.push({
                    id: agg.id, source: agg.source, target: agg.target, count: agg.count,
                    sourceLabel: nameOf(agg.source), targetLabel: nameOf(agg.target), from: layerOf(agg.source), to: layerOf(agg.target)
                });
                violationsBy.set(agg.source, (violationsBy.get(agg.source) || 0) + 1);
                if (!violationTargets.has(agg.source)) { violationTargets.set(agg.source, []); }
                violationTargets.get(agg.source).push(nameOf(agg.target));
            });
            violations.sort(function (a, b) { return b.count - a.count || a.sourceLabel.localeCompare(b.sourceLabel); });

            const memberCount = new Map();
            nodes.forEach(function (n) { if (n.parent && ids.has(n.parent)) { memberCount.set(n.parent, (memberCount.get(n.parent) || 0) + 1); } });
            let maxCoupling = 1;
            let maxMembers = 1;
            own.forEach(function (n) {
                maxCoupling = Math.max(maxCoupling, degree.get(n.id) || 0);
                maxMembers = Math.max(maxMembers, memberCount.get(n.id) || 0);
            });

            // WMC: sum of the cyclomatic complexity of the methods. ATFD: foreign attributes it touches.
            // TCC: share of method pairs that use a common attribute of the class.
            const wmcOf = new Map();
            const methodCount = new Map();
            nodes.forEach(function (n) {
                if (!n.parent || !ids.has(n.parent) || (n.kind !== 'method' && n.kind !== 'constructor' && n.kind !== 'function')) { return; }
                const c = (n.data && n.data.complexity) || 1;
                wmcOf.set(n.parent, (wmcOf.get(n.parent) || 0) + c);
                if (n.kind === 'method') { methodCount.set(n.parent, (methodCount.get(n.parent) || 0) + 1); }
            });
            const foreign = new Map();
            const usedBy = new Map();
            flowEdges.forEach(function (fe) {
                if (fe.label !== 'READS_FROM' && fe.label !== 'WRITES_TO') { return; }
                const user = fe.consumer;
                const attr = fe.provider;
                const attrNode = nodes.get(attr);
                const userNode = nodes.get(user);
                if (!attrNode || !userNode || (attrNode.kind !== 'field' && attrNode.kind !== 'property' && attrNode.kind !== 'variable')) { return; }
                const userOwner = ownerOf(user);
                const attrOwner = ownerOf(attr);
                if (!ids.has(userOwner) || !ids.has(attrOwner)) { return; }
                if (userOwner !== attrOwner) {
                    if (!foreign.has(userOwner)) { foreign.set(userOwner, new Set()); }
                    foreign.get(userOwner).add(attr);
                } else if (userNode.kind === 'method') {
                    if (!usedBy.has(attr)) { usedBy.set(attr, new Set()); }
                    usedBy.get(attr).add(user);
                }
            });
            const cohesion = new Map();
            own.forEach(function (n) {
                const count = methodCount.get(n.id) || 0;
                if (count < 2) { cohesion.set(n.id, 1); return; }
                const connected = new Set();
                usedBy.forEach(function (methods) {
                    const list = Array.from(methods).filter(function (m) { return ownerOf(m) === n.id; });
                    for (let i = 0; i < list.length; i++) { for (let j = i + 1; j < list.length; j++) { connected.add(list[i] < list[j] ? list[i] + '|' + list[j] : list[j] + '|' + list[i]); } }
                });
                cohesion.set(n.id, connected.size / (count * (count - 1) / 2));
            });

            const classes = new Map();
            own.forEach(function (n) {
                const coupling = degree.get(n.id) || 0;
                const size = memberCount.get(n.id) || 0;
                const viol = violationsBy.get(n.id) || 0;
                const wmc = wmcOf.get(n.id) || 0;
                const atfd = foreign.has(n.id) ? foreign.get(n.id).size : 0;
                const tcc = cohesion.get(n.id);
                const god = atfd > cfg.godAtfd && wmc >= cfg.godWmc && tcc < cfg.godTcc;
                const parts = {
                    coupling: coupling / maxCoupling,
                    size: god ? 1 : size / maxMembers,
                    cycles: cycleOf.has(n.id) ? 1 : 0,
                    violations: Math.min(1, viol / 3)
                };
                // Why it is hot: every factor that weighs in, the heaviest first, with the numbers behind it.
                const reasons = [];
                if (parts.cycles) {
                    const others = cycles[cycleOf.get(n.id)].members.filter(function (m) { return m.id !== n.id; }).map(function (m) { return m.label; });
                    reasons.push({ type: 'cycle', weight: weights.cycles, names: others, value: others.length + 1 });
                }
                if (viol) { reasons.push({ type: 'violation', weight: weights.violations * parts.violations, names: violationTargets.get(n.id).slice(0, 3), value: viol }); }
                if (parts.coupling >= 0.5) { reasons.push({ type: 'coupling', weight: weights.coupling * parts.coupling, value: coupling, max: maxCoupling }); }
                if (god) { reasons.push({ type: 'god', weight: weights.size, wmc: wmc, atfd: atfd, tcc: tcc }); }
                else if (parts.size >= 0.5) { reasons.push({ type: 'size', weight: weights.size * parts.size, value: size, max: maxMembers }); }
                // The most actionable first: a broken layer, then a circle, then the numbers.
                const priority = { violation: 0, god: 1, cycle: 2, coupling: 3, size: 4 };
                reasons.sort(function (a, b) { return priority[a.type] - priority[b.type]; });
                classes.set(n.id, {
                    reasons: reasons,
                    id: n.id, label: stripDecor(n.label), layer: layerOf(n.id), folder: folderOf(n.id),
                    coupling: coupling, members: size, cycle: cycleOf.has(n.id) ? cycleOf.get(n.id) : -1, violations: viol,
                    god: god, wmc: wmc, atfd: atfd, tcc: tcc, parts: parts,
                    risk: Math.min(1, (parts.coupling * weights.coupling + parts.size * weights.size + parts.cycles * weights.cycles + parts.violations * weights.violations) / weightSum)
                });
            });
            const hotspots = Array.from(classes.values()).filter(function (c) { return c.risk > 0; })
                .sort(function (a, b) { return b.risk - a.risk || a.label.localeCompare(b.label); });
            return { classes: classes, cycles: cycles, violations: violations, hotspots: hotspots };
        }

        /** 0..1 heat of a class for one metric ("risk" mixes all of them), 0 when the class is not part of the project. */
        let auditCache = null;
        function heatOf(id, metric) {
            if (!auditCache) { auditCache = audit(opts.audit); }
            const c = auditCache.classes.get(ownerOf(id));
            if (!c) { return 0; }
            return metric && metric !== 'risk' ? c.parts[metric] || 0 : c.risk;
        }

        /** The state management an owner declares (Bloc, ChangeNotifier...), or null. */
        function stateOf(id) {
            const n = nodes.get(ownerOf(id));
            return (n && n.data && n.data.stateManager) || null;
        }

        /**
         * Which state management approaches the project uses and which classes belong to each, with how many
         * classes listen to every one. Several families at once is the fragmentation worth knowing about.
         */
        function stateManagers() {
            const observers = new Map();
            edges.forEach(function (e) {
                if (e.label !== 'OBSERVES') { return; }
                if (!observers.has(e.to)) { observers.set(e.to, new Set()); }
                observers.get(e.to).add(e.so);
            });
            const families = new Map();
            owners.forEach(function (n) {
                const sm = n.data && n.data.stateManager;
                if (!sm || sourceTypeOf(n.id) !== 'project') { return; }
                if (!families.has(sm.family)) { families.set(sm.family, []); }
                families.get(sm.family).push({ id: n.id, label: stripDecor(n.label), base: sm.base, layer: layerOf(n.id), observers: (observers.get(n.id) || new Set()).size });
            });
            const list = Array.from(families.entries()).map(function (e) {
                return { family: e[0], classes: e[1].sort(function (a, b) { return b.observers - a.observers || a.label.localeCompare(b.label); }) };
            }).sort(function (a, b) { return b.classes.length - a.classes.length || a.family.localeCompare(b.family); });
            return { families: list, fragmented: list.length > 1, total: list.reduce(function (n, f) { return n + f.classes.length; }, 0) };
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
            if (isLibrary(id)) { return focusLibrary(id); }
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
                return layerIds.map(layer => ({
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

        /**
         * What the file of a class imports, grouped by where it comes from (Flutter, third-party packages,
         * Dart SDK) and then by package. The project's own imports are left out: those are the classes
         * already drawn at the sides.
         */
        function dependenciesOf(id) {
            const n = nodes.get(ownerOf(id));
            const imports = (n && n.data && opts.fileImports && opts.fileImports[n.data.fileUri]) || [];
            const byKind = {};
            DEPENDENCY_KINDS.forEach(function (k) { byKind[k] = new Map(); });
            imports.forEach(function (imp) {
                const c = classifyImport(imp.uri, opts.ownPackage);
                if (c.kind === 'own') { return; }
                const packages = byKind[c.kind];
                if (!packages.has(c.name)) { packages.set(c.name, { name: c.name, count: 0, imports: [] }); }
                const p = packages.get(c.name);
                p.count++;
                p.imports.push({ uri: imp.uri, line: imp.line, column: imp.column, fileUri: n.data.fileUri });
            });
            return DEPENDENCY_KINDS.map(function (kind) {
                const packages = Array.from(byKind[kind].values())
                    .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
                packages.forEach(function (p) { p.id = 'lib:' + kind + ':' + p.name; });
                return { kind: kind, packages: packages, total: packages.reduce(function (s, p) { return s + p.count; }, 0) };
            }).filter(function (g) { return g.packages.length > 0; });
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
            nodes, edges, internalCount, architecture: arch, layers: layerIds, neutralLayer,
            flowOrder: layerIds.filter(function (id) { return id !== neutralLayer; }),
            ownerOf, layerOf, nameOf, sourceTypeOf,
            overview, focus, search, layerFlow, findAggregate, flowRefs, traceFlow, folderOf, folders, dependenciesOf, libraries, isLibrary, audit, heatOf, stateOf, stateManagers,
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

    /**
     * Keeps the `limit` most connected boxes of a focus side (ties broken by name) and regroups them by layer.
     * Returns the visible groups plus how many boxes were left out.
     */
    function limitCards(groups, limit) {
        const all = [];
        groups.forEach(function (g) { g.cards.forEach(function (c) { all.push(c); }); });
        if (all.length <= limit) { return { groups: groups, hidden: 0, total: all.length }; }
        const keep = new Set(all.slice().sort(function (a, b) { return b.edgeCount - a.edgeCount || a.label.localeCompare(b.label); })
            .slice(0, limit).map(function (c) { return c.id; }));
        const shown = groups.map(function (g) {
            return { layer: g.layer, cards: g.cards.filter(function (c) { return keep.has(c.id); }) };
        }).filter(function (g) { return g.cards.length > 0; });
        return { groups: shown, hidden: all.length - limit, total: all.length };
    }

    /** Which members of a class to list when it has many: the connected ones and the active one, then the first others. */
    function visibleMembers(members, activeId, limit) {
        if (members.length <= limit) { return members; }
        const keep = new Set();
        members.forEach(function (m) { if (m.id === activeId || (m.inCount || 0) + (m.outCount || 0) > 0) { keep.add(m.id); } });
        for (let i = 0; i < members.length && keep.size < limit; i++) { keep.add(members[i].id); }
        return members.filter(function (m) { return keep.has(m.id); });
    }

    return { LAYERS, LAYER_RANK, defaultArchitecture, resolveArchitecture, DEPENDENCY_KINDS, createModel, createTrail, stripDecor, normalizeRange, dominantLabel, limitCards, visibleMembers, relativeFolder, classifyImport };
});
