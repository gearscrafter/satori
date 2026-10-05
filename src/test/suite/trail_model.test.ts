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
