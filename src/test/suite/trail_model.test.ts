import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const mediaDir = path.resolve(__dirname, '../../../media/trail');
const TrailModel = require(path.join(mediaDir, 'trail_model.js'));

const node = (id: string, label: string, kind: string, layer: string, parent?: string, source = 'project') =>
    ({ id, label, kind, parent, data: { fileUri: 'file:///x.dart', layer, source: { type: source }, range: [{ line: 1, character: 0 }, { line: 5, character: 1 }] } });
const edge = (id: string, source: string, target: string, label: string) => ({ id, source, target, label });

const graph = {
    nodes: [
        node('V', 'HomeView', 'class', 'view'),
        node('V.build', 'build', 'method', 'member', 'V'),
        node('S', 'HomeController', 'class', 'state'),
        node('S.load', 'load', 'method', 'member', 'S'),
        node('S.items', 'items', 'field', 'member', 'S'),
        node('R', 'ItemRepository', 'class', 'service'),
        node('R.fetch', 'fetch', 'method', 'member', 'R'),
        node('M', 'Item', 'class', 'model'),
        node('SDK', '⚙️ String', 'class', 'utility', undefined, 'sdk'),
        node('PKG', '🔗 Dio', 'class', 'service', undefined, 'external_package'),
        { id: 'pc', label: 'pkg', kind: 'package_container', data: { fileUri: '', source: { type: 'external_package' } } }
    ],
    edges: [
        edge('e1', 'V.build', 'S.load', 'CALLS'),
        edge('e2', 'V.build', 'S.items', 'READS_FROM'),
        edge('e3', 'S.load', 'R.fetch', 'CALLS'),
        edge('e4', 'R.fetch', 'M', 'USES_AS_TYPE'),
        edge('e5', 'M', 'V.build', 'CALLS'),
        edge('e6', 'S.load', 'S.items', 'WRITES_TO'),
        edge('e7', 'S', 'SDK', 'USES_AS_TYPE'),
        edge('e8', 'R.fetch', 'PKG', 'CALLS')
    ]
};

suite('Trail Model Test Suite', () => {
    test('ownerOf climbs from members to their class and ignores package containers', () => {
        const m = TrailModel.createModel(graph);
        assert.strictEqual(m.ownerOf('V.build'), 'V');
        assert.strictEqual(m.ownerOf('V'), 'V');
        assert.strictEqual(m.nodes.has('pc'), false);
    });

    test('aggregates member edges into one class edge with a count', () => {
        const m = TrailModel.createModel(graph);
        const agg = m.findAggregate('V', 'S');
        assert.strictEqual(agg.count, 2);
        assert.deepStrictEqual(agg.byLabel, { CALLS: 1, READS_FROM: 1 });
        assert.strictEqual(agg.label, 'CALLS');
    });

    test('edges inside the same class are counted as internal, not as neighbours', () => {
        const m = TrailModel.createModel(graph);
        assert.strictEqual(m.internalCount, 1);
        assert.strictEqual(m.findAggregate('S', 'S'), null);
    });

    test('flags edges that go against the view > state > service > model flow', () => {
        const m = TrailModel.createModel(graph);
        assert.strictEqual(m.findAggregate('V', 'S').violation, false);
        assert.strictEqual(m.findAggregate('M', 'V').violation, true);
        const flow = m.layerFlow().find((f: any) => f.from === 'model' && f.to === 'view');
        assert.ok(flow && flow.violation);
    });

    test('flowRefs expands an aggregated layer flow into its individual references', () => {
        const refs = TrailModel.createModel(graph).flowRefs('view', 'state');
        assert.deepStrictEqual(refs.map((r: any) => r.id).sort(), ['e1', 'e2']);
        assert.deepStrictEqual(TrailModel.createModel(graph).flowRefs('model', 'view').map((r: any) => r.id), ['e5']);
        assert.deepStrictEqual(TrailModel.createModel(graph).flowRefs('state', 'view'), []);
    });

    test('traceFlow separates providers (upstream) from consumers (downstream)', () => {
        const flow = TrailModel.createModel(graph).traceFlow('S.load');
        const depthOf = (id: string) => flow.nodes.find((n: any) => n.id === id)?.depth;
        assert.strictEqual(depthOf('S.load'), 0);
        assert.strictEqual(depthOf('R.fetch'), -1, 'a callee provides data to its caller');
        assert.strictEqual(depthOf('V.build'), 1, 'a caller consumes what its callee provides');
        assert.strictEqual(depthOf('S.items'), 1, 'a field written by the node is downstream of it');
        assert.ok(flow.upstream >= 1 && flow.downstream >= 2);
    });

    test('traceFlow treats a read as data moving from the field to the reader', () => {
        const flow = TrailModel.createModel(graph).traceFlow('S.items');
        const e2 = flow.edges.find((e: any) => e.id === 'e2');
        assert.strictEqual(e2.provider, 'S.items');
        assert.strictEqual(e2.consumer, 'V.build');
        assert.strictEqual(e2.source, 'V.build', 'raw edge direction is preserved for code lookup');
    });

    test('traceFlow treats a field passed as an argument as data leaving the field', () => {
        const g = {
            nodes: [node('C', 'C', 'class', 'state'), node('C.field', 'items', 'field', 'member', 'C'), node('C.show', 'show', 'method', 'member', 'C')],
            edges: [edge('p', 'C.show', 'C.field', 'PASSES_AS_ARGUMENT')]
        };
        const flow = TrailModel.createModel(g).traceFlow('C.field');
        const passed = flow.edges.find((e: any) => e.id === 'p');
        assert.strictEqual(passed.provider, 'C.field');
        assert.strictEqual(passed.consumer, 'C.show');
        assert.strictEqual(flow.nodes.find((n: any) => n.id === 'C.show').depth, 1);
    });

    test('traceFlow from a class starts from all of its members', () => {
        const flow = TrailModel.createModel(graph).traceFlow('S');
        assert.deepStrictEqual(flow.seeds.sort(), ['S', 'S.items', 'S.load'].sort());
        assert.ok(flow.nodes.some((n: any) => n.id === 'R.fetch'));
    });

    test('traceFlow ignores non-data edges, respects depth and handles unknown nodes', () => {
        const m = TrailModel.createModel(graph);
        assert.strictEqual(m.traceFlow('nope'), null);
        const typeOnly = TrailModel.createModel({
            nodes: [node('A', 'A', 'class', 'model'), node('B', 'B', 'class', 'model')],
            edges: [edge('t', 'A', 'B', 'USES_AS_TYPE'), edge('i', 'A', 'B', 'EXTENDS')]
        });
        assert.deepStrictEqual(typeOnly.traceFlow('A').nodes.map((n: any) => n.id), ['A'], 'type and inheritance edges are not data flow');
        const shallow = m.traceFlow('R.fetch', { maxDepth: 1 });
        assert.ok(shallow.nodes.every((n: any) => Math.abs(n.depth) <= 1));
    });

    test('traceFlow stops at maxNodes and reports truncation', () => {
        const flow = TrailModel.createModel(graph).traceFlow('S.load', { maxNodes: 2 });
        assert.ok(flow.nodes.length <= 2);
        assert.strictEqual(flow.truncated, true);
    });

    test('inheritance edges are never reported as layer violations', () => {
        const g = {
            nodes: [node('A', 'A', 'class', 'view'), node('B', 'B', 'class', 'model')],
            edges: [edge('x', 'B', 'A', 'EXTENDS')]
        };
        assert.strictEqual(TrailModel.createModel(g).findAggregate('B', 'A').violation, false);
    });

    test('SDK and package nodes are hidden unless requested', () => {
        const hidden = TrailModel.createModel(graph, { showSdk: false, showPackages: false });
        assert.strictEqual(hidden.findAggregate('S', 'SDK'), null);
        assert.strictEqual(hidden.findAggregate('R', 'PKG'), null);
        const shown = TrailModel.createModel(graph, { showSdk: true, showPackages: true });
        assert.ok(shown.findAggregate('S', 'SDK'));
        assert.ok(shown.findAggregate('R', 'PKG'));
    });

    test('focus on a class puts callers on the left and callees on the right, grouped by layer', () => {
        const f = TrailModel.createModel(graph).focus('S');
        assert.strictEqual(f.center.label, 'HomeController');
        assert.deepStrictEqual(f.left.map((g: any) => g.layer), ['view']);
        assert.deepStrictEqual(f.right.map((g: any) => g.layer), ['service']);
        assert.strictEqual(f.left[0].cards[0].label, 'HomeView');
        assert.strictEqual(f.left[0].cards[0].edgeCount, 2);
        assert.deepStrictEqual(f.left[0].cards[0].members.map((x: any) => x.label), ['build']);
    });

    test('focus on a member only keeps the edges that touch that member', () => {
        const f = TrailModel.createModel(graph).focus('S.items');
        assert.strictEqual(f.activeMemberId, 'S.items');
        assert.strictEqual(f.left[0].cards[0].edgeCount, 1);
        assert.strictEqual(f.left[0].cards[0].refs[0].label, 'READS_FROM');
        assert.strictEqual(f.right.length, 0);
    });

    test('focus returns null for unknown or hidden nodes', () => {
        const m = TrailModel.createModel(graph);
        assert.strictEqual(m.focus('nope'), null);
        assert.strictEqual(m.focus('SDK'), null);
    });

    test('center members report incoming and outgoing counts', () => {
        const f = TrailModel.createModel(graph).focus('S');
        const load = f.center.members.find((x: any) => x.label === 'load');
        assert.deepStrictEqual([load.inCount, load.outCount], [1, 1]);
    });

    test('overview lists every visible class under its layer, busiest first', () => {
        const o = TrailModel.createModel(graph).overview();
        assert.deepStrictEqual(o.layers.map((l: any) => l.layer), ['view', 'state', 'service', 'model', 'utility']);
        const service = o.layers.find((l: any) => l.layer === 'service');
        assert.deepStrictEqual(service.classes.map((c: any) => c.label), ['ItemRepository', 'Dio']);
    });

    test('search strips decorations, prefers prefixes and classes over members', () => {
        const m = TrailModel.createModel(graph, { showPackages: true });
        assert.deepStrictEqual(m.search('dio').map((r: any) => r.label), ['Dio']);
        const r = m.search('load');
        assert.strictEqual(r[0].name, 'HomeController.load');
        assert.deepStrictEqual(m.search('   '), []);
    });

    test('normalizes ranges given as [start, end] arrays', () => {
        const range = TrailModel.createModel(graph).nodeRange('V');
        assert.deepStrictEqual(range, { start: { line: 1, character: 0 }, end: { line: 5, character: 1 } });
    });

    test('works on the real graph produced for the dummy project', () => {
        const file = path.resolve(__dirname, '../../../e2e/fixtures/dummy_graph.json');
        const real = JSON.parse(fs.readFileSync(file, 'utf8'));
        const m = TrailModel.createModel(real);
        const user = m.overview().layers.flatMap((l: any) => l.classes).find((c: any) => c.label === 'User');
        assert.ok(user, 'User class should be listed');
        const f = m.focus(user.id);
        const labels = [...f.left, ...f.right].flatMap((g: any) => g.cards.map((c: any) => c.label));
        assert.ok(labels.includes('Entity'), 'User should relate to Entity');
    });
});

suite('Trail Dependencies Test Suite', () => {
    test('classifyImport tells the Dart SDK, Flutter, third-party and own imports apart', () => {
        const c = (uri: string) => TrailModel.classifyImport(uri, 'my_app');
        assert.deepStrictEqual(c('dart:async'), { kind: 'sdk', name: 'dart:async' });
        assert.deepStrictEqual(c('package:flutter/material.dart'), { kind: 'flutter', name: 'flutter' });
        assert.deepStrictEqual(c('package:flutter_test/flutter_test.dart'), { kind: 'flutter', name: 'flutter_test' });
        assert.deepStrictEqual(c('package:flutter_bloc/flutter_bloc.dart'), { kind: 'package', name: 'flutter_bloc' });
        assert.deepStrictEqual(c('package:dio/dio.dart'), { kind: 'package', name: 'dio' });
        assert.strictEqual(c('package:my_app/models/user.dart').kind, 'own');
        assert.strictEqual(c('../models/user.dart').kind, 'own');
        assert.strictEqual(TrailModel.classifyImport('package:my_app/x.dart', '').kind, 'package');
    });

    const file = 'file:///c%3A/proj/lib/ui/home.dart';
    const withImports = (imports: any[]) => TrailModel.createModel({
        nodes: [
            { id: 'H', label: 'Home', kind: 'class', data: { fileUri: file, layer: 'view', source: { type: 'project' } } },
            { id: 'H.build', label: 'build', kind: 'method', parent: 'H', data: { fileUri: file, layer: 'member', source: { type: 'project' } } }
        ],
        edges: []
    }, { fileImports: { [file]: imports }, ownPackage: 'my_app' });

    test('dependenciesOf groups a file\'s imports by kind and package, leaving the project\'s own out', () => {
        const m = withImports([
            { uri: 'package:flutter/material.dart', line: 0, column: 8 },
            { uri: 'package:flutter/widgets.dart', line: 1, column: 8 },
            { uri: 'package:dio/dio.dart', line: 2, column: 8 },
            { uri: 'package:my_app/models/user.dart', line: 3, column: 8 },
            { uri: '../state/controller.dart', line: 4, column: 8 },
            { uri: 'dart:async', line: 5, column: 8 }
        ]);
        const deps = m.dependenciesOf('H');
        assert.deepStrictEqual(deps.map((g: any) => g.kind), ['flutter', 'package', 'sdk']);
        assert.deepStrictEqual(deps[0].packages.map((p: any) => [p.name, p.count]), [['flutter', 2]]);
        assert.strictEqual(deps[0].total, 2);
        assert.deepStrictEqual(deps[1].packages[0].imports[0], { uri: 'package:dio/dio.dart', line: 2, column: 8, fileUri: file });
    });

    test('dependenciesOf works from a member and gives nothing for unknown nodes or files without imports', () => {
        const m = withImports([{ uri: 'package:dio/dio.dart', line: 0, column: 8 }]);
        assert.strictEqual(m.dependenciesOf('H.build')[0].packages[0].name, 'dio');
        assert.deepStrictEqual(m.dependenciesOf('nope'), []);
        assert.deepStrictEqual(withImports([]).dependenciesOf('H'), []);
    });

    test('packages with more imports come first', () => {
        const m = withImports([
            { uri: 'package:b/x.dart', line: 0, column: 8 }, { uri: 'package:a/x.dart', line: 1, column: 8 },
            { uri: 'package:b/y.dart', line: 2, column: 8 }
        ]);
        assert.deepStrictEqual(m.dependenciesOf('H')[0].packages.map((p: any) => p.name), ['b', 'a']);
    });
});

suite('Trail Libraries Test Suite', () => {
    const home = 'file:///c%3A/proj/lib/ui/home.dart';
    const svc = 'file:///c%3A/proj/lib/data/service.dart';
    const cls = (id: string, label: string, fileUri: string, layer: string) => ({ id, label, kind: 'class', data: { fileUri, layer, source: { type: 'project' } } });
    const build = () => TrailModel.createModel({
        nodes: [cls('H', 'Home', home, 'view'), cls('S', 'Service', svc, 'service')],
        edges: [{ id: 'e1', source: 'H', target: 'S', label: 'CALLS' }]
    }, {
        ownPackage: 'app',
        fileImports: {
            [home]: [{ uri: 'package:dio/dio.dart', line: 0, column: 8 }, { uri: 'dart:async', line: 1, column: 8 }, { uri: 'package:app/x.dart', line: 2, column: 8 }],
            [svc]: [{ uri: 'package:dio/src/response.dart', line: 3, column: 8 }, { uri: 'package:dio/dio.dart', line: 4, column: 8 }]
        }
    });

    test('every imported library becomes a node you can navigate to; the project\'s own package does not', () => {
        const m = build();
        assert.ok(m.isLibrary('lib:package:dio') && m.isLibrary('lib:sdk:dart:async'));
        assert.strictEqual(m.isLibrary('lib:own:app'), false);
        assert.strictEqual(m.nodes.get('lib:package:dio').label, 'dio');
    });

    test('focusing a library lists the classes that import it, grouped by layer, and the files they import', () => {
        const f = build().focus('lib:package:dio');
        assert.strictEqual(f.isLibrary, true);
        assert.strictEqual(f.center.label, 'dio');
        assert.deepStrictEqual(f.center.members.map((x: any) => x.uri).sort(), ['package:dio/dio.dart', 'package:dio/src/response.dart']);
        assert.deepStrictEqual(f.left.map((g: any) => [g.layer, g.cards.map((c: any) => c.label)]), [['view', ['Home']], ['service', ['Service']]]);
        assert.deepStrictEqual(f.right, []);
        const service = f.left[1].cards[0];
        assert.deepStrictEqual(service.imports.map((i: any) => [i.uri, i.line]), [['package:dio/src/response.dart', 3], ['package:dio/dio.dart', 4]]);
    });

    test('libraries stay out of the layers, the layer flow and the class focus', () => {
        const m = build();
        const classes = m.overview().layers.flatMap((l: any) => l.classes.map((c: any) => c.label));
        assert.deepStrictEqual(classes.sort(), ['Home', 'Service']);
        assert.deepStrictEqual(m.layerFlow().map((f: any) => f.from + '>' + f.to), ['view>service']);
        const focus = m.focus('H');
        assert.deepStrictEqual(focus.right.flatMap((g: any) => g.cards.map((c: any) => c.label)), ['Service']);
    });

    test('libraries() groups them by origin with how many classes use each', () => {
        const libs = build().libraries();
        assert.deepStrictEqual(libs.map((g: any) => g.kind), ['package', 'sdk']);
        assert.deepStrictEqual(libs[0].items, [{ id: 'lib:package:dio', name: 'dio', users: 2 }]);
    });

    test('a library can be found by name and dependenciesOf points at its node', () => {
        const m = build();
        assert.deepStrictEqual(m.search('dio').map((r: any) => [r.id, r.kind]), [['lib:package:dio', 'package']]);
        assert.strictEqual(m.dependenciesOf('H').find((g: any) => g.kind === 'package').packages[0].id, 'lib:package:dio');
    });
});

suite('Trail Scale Helpers Test Suite', () => {
    const inFolder = (id: string, label: string, folder: string, layer = 'view') => ({
        id, label, kind: 'class', data: { fileUri: `file:///c%3A/proj/lib/${folder}/${id}.dart`, layer, source: { type: 'project' } }
    });

    test('relativeFolder reads the path below lib/, below the root, or falls back to the last folders', () => {
        assert.strictEqual(TrailModel.relativeFolder('file:///c%3A/proj/lib/auth/ui/login.dart', ''), 'auth/ui');
        assert.strictEqual(TrailModel.relativeFolder('file:///c%3A/proj/lib/main.dart', ''), '');
        assert.strictEqual(TrailModel.relativeFolder('file:///c%3A/Proj/src/a/b.dart', 'c:/proj'), 'src/a');
        assert.strictEqual(TrailModel.relativeFolder('file:///home/me/x/deep/er/f.dart', ''), 'deep/er');
        assert.strictEqual(TrailModel.relativeFolder('', ''), '');
    });

    test('folders lists the first folder level with counts and the overview can be filtered by it', () => {
        const g = {
            nodes: [inFolder('a', 'A', 'auth/ui'), inFolder('b', 'B', 'auth/data', 'service'), inFolder('c', 'C', 'cart'), inFolder('d', 'D', '', 'model')],
            edges: []
        };
        const m = TrailModel.createModel(g, { projectRoot: 'c:/proj' });
        assert.deepStrictEqual(m.folders(), [{ name: 'auth', count: 2 }, { name: '', count: 1 }, { name: 'cart', count: 1 }]);
        const labels = (o: any) => o.layers.flatMap((l: any) => l.classes.map((c: any) => c.label)).sort();
        assert.deepStrictEqual(labels(m.overview()), ['A', 'B', 'C', 'D']);
        assert.deepStrictEqual(labels(m.overview({ folder: 'auth' })), ['A', 'B']);
        assert.deepStrictEqual(labels(m.overview({ folder: '' })), ['D']);
        assert.deepStrictEqual(labels(m.overview({ folder: 'nope' })), []);
    });

    test('limitCards keeps the most connected boxes, regrouped by layer, and counts what is hidden', () => {
        const card = (id: string, layer: string, edgeCount: number) => ({ id, label: id, layer, edgeCount });
        const groups = [
            { layer: 'view', cards: [card('v1', 'view', 1), card('v2', 'view', 9)] },
            { layer: 'model', cards: [card('m1', 'model', 5), card('m2', 'model', 5), card('m3', 'model', 2)] }
        ];
        const r = TrailModel.limitCards(groups, 3);
        assert.deepStrictEqual(r.groups.map((g: any) => g.cards.map((c: any) => c.id)), [['v2'], ['m1', 'm2']]);
        assert.deepStrictEqual([r.hidden, r.total], [2, 5]);
        assert.strictEqual(TrailModel.limitCards(groups, 10).hidden, 0);
        assert.strictEqual(TrailModel.limitCards(groups, 10).groups, groups);
    });

    test('visibleMembers keeps connected and active members and fills up in source order', () => {
        const members = Array.from({ length: 30 }, (_, i) => ({ id: 'm' + i, label: 'm' + i, inCount: i === 25 ? 2 : 0, outCount: 0 }));
        const shown = TrailModel.visibleMembers(members, 'm28', 10).map((m: any) => m.id);
        assert.strictEqual(shown.length, 10);
        assert.ok(shown.includes('m25') && shown.includes('m28'));
        assert.deepStrictEqual(shown.slice(0, 3), ['m0', 'm1', 'm2']);
        assert.deepStrictEqual(shown, [...shown].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), 'source order is kept');
        assert.strictEqual(TrailModel.visibleMembers(members.slice(0, 5), null, 10).length, 5);
    });
});

suite('Trail History Test Suite', () => {
    test('push, back and forward walk the visited nodes', () => {
        const t = TrailModel.createTrail();
        t.push('a'); t.push('b'); t.push('c');
        assert.strictEqual(t.current(), 'c');
        assert.strictEqual(t.back(), 'b');
        assert.strictEqual(t.back(), 'a');
        assert.strictEqual(t.back(), null);
        assert.strictEqual(t.forward(), 'b');
        assert.ok(t.canForward() && t.canBack());
    });

    test('pushing after going back drops the forward branch', () => {
        const t = TrailModel.createTrail();
        t.push('a'); t.push('b'); t.push('c');
        t.back();
        t.push('x');
        assert.deepStrictEqual(t.list(), ['a', 'b', 'x']);
        assert.strictEqual(t.canForward(), false);
    });

    test('ignores consecutive duplicates and caps its length', () => {
        const t = TrailModel.createTrail(3);
        t.push('a'); t.push('a');
        assert.deepStrictEqual(t.list(), ['a']);
        ['b', 'c', 'd'].forEach(x => t.push(x));
        assert.deepStrictEqual(t.list(), ['b', 'c', 'd']);
    });
});

suite('Trail Audit Test Suite', () => {
    test('finds the circular dependency that runs through the layers', () => {
        const a = TrailModel.createModel(graph).audit();
        assert.strictEqual(a.cycles.length, 1);
        assert.deepStrictEqual(a.cycles[0].members.map((m: any) => m.label).sort(), ['HomeController', 'HomeView', 'Item', 'ItemRepository']);
    });

    test('lists the layer violation with the classes at both ends', () => {
        const a = TrailModel.createModel(graph).audit();
        assert.strictEqual(a.violations.length, 1);
        assert.strictEqual(a.violations[0].sourceLabel, 'Item');
        assert.strictEqual(a.violations[0].targetLabel, 'HomeView');
    });

    test('leaves the SDK and packages out of the audit', () => {
        const a = TrailModel.createModel(graph, { showSdk: true, showPackages: true }).audit();
        assert.strictEqual(a.classes.has('SDK'), false);
        assert.strictEqual(a.classes.has('PKG'), false);
    });

    test('heat grows with cycles and violations and stays between 0 and 1', () => {
        const m = TrailModel.createModel(graph);
        assert.ok(m.heatOf('M', 'risk') > m.heatOf('R', 'risk'), 'the class that breaks the layers is hotter');
        ['V', 'S', 'R', 'M'].forEach(id => assert.ok(m.heatOf(id, 'risk') > 0 && m.heatOf(id, 'risk') <= 1));
        assert.strictEqual(m.heatOf('V.build', 'cycles'), 1, 'a member takes the heat of its class');
        assert.strictEqual(m.heatOf('nope', 'risk'), 0);
    });

    // A class is a God Class by Lanza and Marinescu: ATFD > 5, WMC >= 47 and TCC < 1/3.
    const withComplexity = (id: string, label: string, parent: string, complexity: number) => {
        const n: any = node(id, label, 'method', 'member', parent);
        n.data.complexity = complexity;
        return n;
    };
    function godGraph(complexity: number, foreign: number, shareOwnField: boolean) {
        const nodes: any[] = [node('G', 'Boss', 'class', 'state'), node('G.f', 'f', 'field', 'member', 'G'), node('O', 'Other', 'class', 'model')];
        const edges: any[] = [];
        for (let i = 0; i < 6; i++) { nodes.push(withComplexity('G.m' + i, 'm' + i, 'G', complexity)); }
        for (let i = 0; i < foreign; i++) {
            nodes.push(node('O.a' + i, 'a' + i, 'field', 'member', 'O'));
            edges.push(edge('r' + i, 'G.m' + (i % 6), 'O.a' + i, 'READS_FROM'));
        }
        if (shareOwnField) { for (let i = 0; i < 6; i++) { edges.push(edge('s' + i, 'G.m' + i, 'G.f', 'READS_FROM')); } }
        return { nodes, edges };
    }

    test('flags a God Class by the standard rule: complex, many foreign attributes, little cohesion', () => {
        const c = TrailModel.createModel(godGraph(9, 6, false)).audit().classes.get('G');
        assert.strictEqual(c.wmc, 54);
        assert.strictEqual(c.atfd, 6);
        assert.strictEqual(c.tcc, 0);
        assert.strictEqual(c.god, true);
        assert.strictEqual(c.reasons.find((r: any) => r.type === 'god').wmc, 54);
    });

    test('each condition of the rule matters', () => {
        const god = (g: any, cfg?: any) => TrailModel.createModel(g, cfg ? { audit: cfg } : undefined).audit().classes.get('G').god;
        assert.strictEqual(god(godGraph(7, 6, false)), false, 'WMC 42 is below 47');
        assert.strictEqual(god(godGraph(9, 5, false)), false, 'ATFD must be above 5');
        assert.strictEqual(god(godGraph(9, 6, true)), false, 'methods that share a field are cohesive');
    });

    test('the thresholds can be changed', () => {
        const g = godGraph(7, 6, false);
        assert.strictEqual(TrailModel.createModel(g, { audit: { godWmc: 40 } }).audit().classes.get('G').god, true);
        assert.strictEqual(TrailModel.createModel(godGraph(9, 6, false), { audit: { godAtfd: 6 } }).audit().classes.get('G').god, false);
    });

    test('the weights change the risk', () => {
        const base = TrailModel.createModel(graph).heatOf('M', 'risk');
        const heavier = TrailModel.createModel(graph, { audit: { weights: { violations: 1 } } }).heatOf('M', 'risk');
        assert.notStrictEqual(base, heavier);
    });

    test('works on a long chain without overflowing the stack', () => {
        const nodes = Array.from({ length: 4000 }, (_, i) => node('C' + i, 'C' + i, 'class', 'service'));
        const edges = nodes.slice(1).map((n, i) => edge('x' + i, 'C' + i, n.id, 'CALLS'));
        edges.push(edge('back', 'C3999', 'C0', 'CALLS'));
        const a = TrailModel.createModel({ nodes, edges }).audit();
        assert.strictEqual(a.cycles[0].size, 4000);
    });
});

suite('Trail Audit Reasons Test Suite', () => {
    test('explains why a class is hot, heaviest reason first, with the classes involved', () => {
        const a = TrailModel.createModel(graph).audit();
        const item = a.classes.get('M');
        const types = item.reasons.map((r: any) => r.type);
        assert.ok(types.includes('cycle') && types.includes('violation'));
        const violation = item.reasons.find((r: any) => r.type === 'violation');
        assert.deepStrictEqual(violation.names, ['HomeView']);
        const cycle = item.reasons.find((r: any) => r.type === 'cycle');
        assert.deepStrictEqual(cycle.names.slice().sort(), ['HomeController', 'HomeView', 'ItemRepository']);
        assert.strictEqual(item.reasons[0].type, 'violation', 'a broken layer comes first');
    });

    test('a class that is cool has nothing to explain', () => {
        const m = TrailModel.createModel({ nodes: [node('A', 'Lonely', 'class', 'service')], edges: [] });
        assert.deepStrictEqual(m.audit().classes.get('A').reasons, []);
    });
});

suite('Trail State Management Test Suite', () => {
    const holder = (id: string, label: string, family: string, base: string) => {
        const n: any = node(id, label, 'class', 'state');
        n.data.stateManager = { family, base };
        return n;
    };
    const stateGraph = {
        nodes: [
            holder('C', 'CounterCubit', 'bloc', 'Cubit'),
            holder('S', 'SessionNotifier', 'provider', 'ChangeNotifier'),
            holder('B', 'CartBloc', 'bloc', 'Bloc'),
            node('W', 'CounterView', 'class', 'view'),
            node('W.build', 'build', 'method', 'member', 'W'),
            node('Z', 'Plain', 'class', 'service')
        ],
        edges: [
            edge('o1', 'W.build', 'C', 'OBSERVES'),
            edge('o2', 'W.build', 'S', 'OBSERVES'),
            edge('o3', 'Z', 'C', 'CALLS')
        ]
    };

    test('groups the state holders by approach and counts who listens to each', () => {
        const info = TrailModel.createModel(stateGraph).stateManagers();
        assert.strictEqual(info.total, 3);
        assert.deepStrictEqual(info.families.map((f: any) => f.family), ['bloc', 'provider']);
        const bloc = info.families[0].classes;
        assert.deepStrictEqual(bloc.map((c: any) => [c.label, c.observers]), [['CounterCubit', 1], ['CartBloc', 0]]);
    });

    test('says when more than one approach is mixed', () => {
        assert.strictEqual(TrailModel.createModel(stateGraph).stateManagers().fragmented, true);
        const one = { nodes: [holder('C', 'CounterCubit', 'bloc', 'Cubit')], edges: [] };
        assert.strictEqual(TrailModel.createModel(one).stateManagers().fragmented, false);
    });

    test('a project without state holders has an empty map', () => {
        const info = TrailModel.createModel({ nodes: [node('Z', 'Plain', 'class', 'service')], edges: [] }).stateManagers();
        assert.deepStrictEqual(info, { families: [], fragmented: false, total: 0 });
    });

    test('tells what a class declares for a member too', () => {
        const m = TrailModel.createModel(stateGraph);
        assert.deepStrictEqual(m.stateOf('C'), { family: 'bloc', base: 'Cubit' });
        assert.strictEqual(m.stateOf('Z'), null);
    });

    test('an OBSERVES edge is a data flow from the holder to the widget', () => {
        const m = TrailModel.createModel(stateGraph);
        const trace = m.traceFlow('W');
        const names = trace.nodes.map((n: any) => n.name);
        assert.ok(names.includes('CounterCubit') && names.includes('SessionNotifier'), names.join(','));
    });

    test('works on the real graph of the example: four approaches, one widget listening to four holders, one of them through a Riverpod provider', () => {
        const real = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../e2e/fixtures/dummy_graph.json'), 'utf8'));
        const info = TrailModel.createModel(real).stateManagers();
        assert.deepStrictEqual(info.families.map((f: any) => f.family).sort(), ['bloc', 'getx', 'provider', 'riverpod']);
        assert.strictEqual(info.fragmented, true);
        const observed = info.families.flatMap((fam: any) => fam.classes).filter((c: any) => c.observers > 0).length;
        assert.strictEqual(observed, 4);
    });
});

suite('Trail Architecture Test Suite', () => {
    // presentation -> domain <- data, and a core layer outside the rules
    const archGraph = {
        nodes: [
            node('P', 'HomePage', 'class', 'presentation'),
            node('P.build', 'build', 'method', 'member', 'P'),
            node('D', 'LoginUseCase', 'class', 'domain'),
            node('D.run', 'run', 'method', 'member', 'D'),
            node('R', 'UserRepository', 'class', 'data'),
            node('R.fetch', 'fetch', 'method', 'member', 'R'),
            node('C', 'Logger', 'class', 'core'),
            node('C.log', 'log', 'method', 'member', 'C')
        ],
        edges: [
            edge('a', 'P.build', 'D.run', 'CALLS'),      // presentation -> domain
            edge('b', 'R.fetch', 'D.run', 'CALLS'),      // data -> domain
            edge('c', 'D.run', 'R.fetch', 'CALLS'),      // domain -> data
            edge('d', 'P.build', 'R.fetch', 'CALLS'),    // presentation -> data
            edge('e', 'R.fetch', 'C.log', 'CALLS')       // data -> core (neutral)
        ]
    };
    const layers = [{ id: 'presentation' }, { id: 'domain' }, { id: 'data' }, { id: 'core', neutral: true }];
    const make = (rules: any) => TrailModel.createModel(archGraph, { architecture: { layers, neutral: 'core', ...rules } });
    const violations = (m: any) => m.audit().violations.map((v: any) => v.sourceLabel + '>' + v.targetLabel).sort();

    test('the layers of the architecture are the ones the model works with', () => {
        const m = make({ mode: 'allow', allow: [] });
        assert.deepStrictEqual(m.layers, ['presentation', 'domain', 'data', 'core']);
        assert.deepStrictEqual(m.flowOrder, ['presentation', 'domain', 'data']);
        assert.strictEqual(m.neutralLayer, 'core');
        const overview = m.overview();
        assert.deepStrictEqual(overview.layers.map((l: any) => l.layer), ['presentation', 'domain', 'data', 'core']);
        assert.strictEqual(overview.layers.find((l: any) => l.layer === 'core').classes[0].label, 'Logger');
    });

    test('in allow mode anything not listed is a violation, and the neutral layer takes no part', () => {
        const m = make({ mode: 'allow', allow: [['presentation', 'domain'], ['data', 'domain']] });
        assert.deepStrictEqual(violations(m), ['HomePage>UserRepository', 'LoginUseCase>UserRepository']);
    });

    test('in order mode a use that goes back up the order is a violation', () => {
        const m = make({ mode: 'order' });
        // order: presentation, domain, data. Going down is fine, going up is not: data -> domain.
        assert.deepStrictEqual(violations(m), ['UserRepository>LoginUseCase']);
    });

    test('"allow" lists exceptions to the order, and "forbid" adds prohibitions', () => {
        assert.deepStrictEqual(violations(make({ mode: 'order', allow: [['data', 'domain']] })), []);
        assert.deepStrictEqual(violations(make({ mode: 'order', forbid: [['presentation', 'data']] })), ['HomePage>UserRepository', 'UserRepository>LoginUseCase']);
    });

    test('inheritance across layers is not a violation', () => {
        const g = {
            nodes: [node('I', 'UserRepo', 'class', 'domain'), node('Impl', 'UserRepoImpl', 'class', 'data')],
            edges: [edge('x', 'I', 'Impl', 'IMPLEMENTS')]
        };
        const m = TrailModel.createModel(g, { architecture: { layers, neutral: 'core', mode: 'allow', allow: [] } });
        assert.deepStrictEqual(m.audit().violations, []);
    });

    test('a class of a layer that is not in the architecture goes to the neutral layer', () => {
        const g = { nodes: [node('X', 'Ghost', 'class', 'does-not-exist')], edges: [] };
        const m = TrailModel.createModel(g, { architecture: { layers, neutral: 'core' } });
        assert.strictEqual(m.layerOf('X'), 'core');
    });

    test('a missing or damaged architecture is the four layers of always', () => {
        ['x', null, {}, { layers: [] }, { layers: [{}] }].forEach(bad => {
            const m = TrailModel.createModel(graph, { architecture: bad });
            assert.deepStrictEqual(m.layers, ['view', 'state', 'service', 'model', 'utility']);
            assert.strictEqual(m.neutralLayer, 'utility');
        });
    });

    test('libraries are placed in the neutral layer of the architecture', () => {
        const g = { nodes: [node('P', 'HomePage', 'class', 'presentation')], edges: [] };
        const m = TrailModel.createModel(g, {
            architecture: { layers, neutral: 'core' },
            fileImports: { 'file:///x.dart': [{ uri: 'package:dio/dio.dart', line: 0, column: 8 }] }
        });
        const lib = m.libraries()[0].items[0];
        assert.strictEqual(m.layerOf(lib.id), 'core');
    });
});

suite('Trail No Rules Test Suite', () => {
    test('with the mode none no use is a violation, unless it is forbidden', () => {
        const g = {
            nodes: [node('A', 'ScreenA', 'class', 'views'), node('A.m', 'm', 'method', 'member', 'A'), node('B', 'DataB', 'class', 'models'), node('B.n', 'n', 'method', 'member', 'B')],
            edges: [edge('1', 'A.m', 'B.n', 'CALLS'), edge('2', 'B.n', 'A.m', 'CALLS')]
        };
        const layers = [{ id: 'views' }, { id: 'models' }, { id: 'core', neutral: true }];
        assert.deepStrictEqual(TrailModel.createModel(g, { architecture: { layers, neutral: 'core', mode: 'none' } }).audit().violations, []);
        const forbidden = TrailModel.createModel(g, { architecture: { layers, neutral: 'core', mode: 'none', forbid: [['models', 'views']] } }).audit().violations;
        assert.deepStrictEqual(forbidden.map((v: any) => v.sourceLabel + '>' + v.targetLabel), ['DataB>ScreenA']);
    });
});

suite('Trail Class Placed By Hand Test Suite', () => {
    const layers = [{ id: 'presentation' }, { id: 'domain' }, { id: 'data' }, { id: 'core', neutral: true }];
    const g = {
        nodes: [node('P', 'HomePage', 'class', 'presentation'), node('P.b', 'b', 'method', 'member', 'P'), node('R', 'Repo', 'class', 'data'), node('R.f', 'f', 'method', 'member', 'R')],
        edges: [edge('1', 'P.b', 'R.f', 'CALLS')]
    };
    const make = (overrides: any) => TrailModel.createModel(g, { architecture: { layers, neutral: 'core', mode: 'allow', allow: [['presentation', 'domain']], overrides } });

    test('a class placed by hand goes to that layer, whatever the analysis said', () => {
        assert.strictEqual(make({}).layerOf('R'), 'data');
        assert.strictEqual(make({ Repo: 'domain' }).layerOf('R'), 'domain');
        const columns = make({ Repo: 'domain' }).overview().layers;
        assert.deepStrictEqual(columns.find((l: any) => l.layer === 'domain').classes.map((c: any) => c.label), ['Repo']);
        assert.deepStrictEqual(columns.find((l: any) => l.layer === 'data').classes, []);
    });

    test('the rules use the layer it was placed in', () => {
        assert.deepStrictEqual(make({}).audit().violations.map((v: any) => v.sourceLabel + '>' + v.targetLabel), ['HomePage>Repo']);
        assert.deepStrictEqual(make({ Repo: 'domain' }).audit().violations, []);
    });

    test('a layer that does not exist is ignored', () => {
        assert.strictEqual(make({ Repo: 'nowhere' }).layerOf('R'), 'data');
    });

    test('the neighbours of a focused class are grouped by where they were placed', () => {
        const f = make({ Repo: 'domain' }).focus('P');
        assert.deepStrictEqual(f.right.map((grp: any) => grp.layer), ['domain']);
    });
});

suite('Trail Orientation Test Suite', () => {
    // Hub is used by A, B and C and uses Store; Lonely is used by nobody; Base is only extended; the app is built by main.
    const g = {
        nodes: [
            node('main', 'main', 'function', 'utility'),
            node('App', 'App', 'class', 'view'),
            node('Hub', 'Hub', 'class', 'state'),
            node('A', 'A', 'class', 'view'),
            node('B', 'B', 'class', 'view'),
            node('C', 'C', 'class', 'view'),
            node('Store', 'Store', 'class', 'service'),
            node('Lonely', 'Lonely', 'class', 'model'),
            node('Base', 'Base', 'class', 'model'),
            node('Child', 'Child', 'class', 'model'),
            node('Lib', '🔗 Dio', 'class', 'service', undefined, 'external_package')
        ],
        edges: [
            edge('1', 'main', 'App', 'INSTANCE_OF'),
            edge('2', 'App', 'A', 'INSTANCE_OF'),
            edge('3', 'A', 'Hub', 'USES_AS_TYPE'),
            edge('4', 'B', 'Hub', 'USES_AS_TYPE'),
            edge('5', 'C', 'Hub', 'CALLS'),
            edge('6', 'Hub', 'Store', 'CALLS'),
            edge('7', 'Child', 'Base', 'EXTENDS'),
            edge('8', 'Child', 'Lib', 'CALLS')
        ]
    };
    const audit = () => TrailModel.createModel(g, {}).audit();

    test('the classes the most others are tied to come first', () => {
        const hubs = audit().hubs;
        assert.strictEqual(hubs[0].label, 'Hub');
        assert.deepStrictEqual({ in: hubs[0].incoming, out: hubs[0].outgoing }, { in: 3, out: 1 });
    });

    test('a class with no relationship is not a place to start', () => {
        assert.ok(!audit().hubs.some((c: any) => c.label === 'Lonely'));
    });

    test('classes that nothing uses are listed as possibly unused', () => {
        const unused = audit().unused.map((c: any) => c.label).sort();
        assert.deepStrictEqual(unused, ['B', 'C', 'Child', 'Lonely']);
    });

    test('what main builds, what is only extended and what is used by others are not unused', () => {
        const unused = audit().unused.map((c: any) => c.label);
        ['App', 'A', 'Hub', 'Store', 'Base'].forEach(label => assert.ok(!unused.includes(label), label));
    });

    test('libraries and the SDK are never judged', () => {
        const all = [...audit().hubs, ...audit().unused].map((c: any) => c.label);
        assert.ok(!all.some((label: string) => /Dio/.test(label)));
    });

    test('the same class used twice by another still counts once as a relationship', () => {
        const twice = { nodes: g.nodes, edges: [...g.edges, edge('9', 'A', 'Hub', 'CALLS')] };
        const hub = TrailModel.createModel(twice, {}).audit().hubs.find((c: any) => c.label === 'Hub');
        assert.strictEqual(hub.incoming, 3);
    });
});
