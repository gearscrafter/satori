import * as assert from 'assert';
import * as path from 'path';

const mediaDir = path.resolve(__dirname, '../../../media/trail');
const TrailPaint = require(path.join(mediaDir, 'trail_paint.js'));
const TrailIcons = require(path.join(mediaDir, 'trail_icons.js'));

suite('Trail Paint Test Suite', () => {
    const rect = { type: 'rect', color: '#6f42c1', width: 2, fill: false, x1: 10, y1: 10, x2: 110, y2: 60 };

    test('store keeps shapes per scope and assigns ids', () => {
        const store = TrailPaint.createStore();
        const a = store.add('classA', rect);
        store.add('classB', rect);
        assert.ok(a.id);
        assert.strictEqual(store.shapes('classA').length, 1);
        assert.strictEqual(store.shapes('classB').length, 1);
        assert.strictEqual(store.shapes('other').length, 0);
    });

    test('undo and redo walk back and forth, and a new shape drops the redo history', () => {
        const store = TrailPaint.createStore();
        store.add('s', rect);
        store.add('s', Object.assign({}, rect, { type: 'ellipse' }));
        assert.ok(store.undo('s'));
        assert.deepStrictEqual(store.shapes('s').map((x: any) => x.type), ['rect']);
        assert.ok(store.canRedo('s'));
        assert.ok(store.redo('s'));
        assert.deepStrictEqual(store.shapes('s').map((x: any) => x.type), ['rect', 'ellipse']);
        store.undo('s');
        store.add('s', Object.assign({}, rect, { type: 'line' }));
        assert.strictEqual(store.canRedo('s'), false);
        assert.strictEqual(store.undo('empty'), false);
    });

    test('remove can be undone back into its original position', () => {
        const store = TrailPaint.createStore();
        const first = store.add('s', rect);
        store.add('s', Object.assign({}, rect, { type: 'line' }));
        store.remove('s', first.id);
        assert.deepStrictEqual(store.shapes('s').map((x: any) => x.type), ['line']);
        store.redo('s');
        assert.deepStrictEqual(store.shapes('s').map((x: any) => x.type), ['rect', 'line']);
    });

    test('clear empties only one scope', () => {
        const store = TrailPaint.createStore();
        store.add('a', rect);
        store.add('b', rect);
        assert.ok(store.clear('a'));
        assert.strictEqual(store.shapes('a').length, 0);
        assert.strictEqual(store.shapes('b').length, 1);
    });

    test('serialize and restore round-trips, ignoring invalid shapes', () => {
        const store = TrailPaint.createStore();
        store.add('a', rect);
        store.add('a', { type: 'pen', color: '#333', width: 3, points: [[0, 0], [5, 5], [9, 3]] });
        const restored = TrailPaint.createStore(store.serialize());
        assert.strictEqual(restored.shapes('a').length, 2);
        const dirty = TrailPaint.createStore({ a: [rect, { type: 'rect', x1: 'x' }, { type: 'nope' }, null, { type: 'eraser' }], b: 'not-a-list' });
        assert.strictEqual(dirty.shapes('a').length, 1);
        assert.strictEqual(dirty.shapes('b').length, 0);
    });

    test('shapes per scope are capped', () => {
        const store = TrailPaint.createStore();
        for (let i = 0; i < 520; i++) { store.add('s', rect); }
        assert.strictEqual(store.shapes('s').length, 500);
    });

    test('hit testing works on strokes and on filled shapes', () => {
        assert.ok(TrailPaint.hitTest(rect, 10, 30), 'left border');
        assert.ok(!TrailPaint.hitTest(rect, 60, 35), 'inside an unfilled rect is not a hit');
        assert.ok(TrailPaint.hitTest(Object.assign({}, rect, { fill: true }), 60, 35), 'inside a filled rect is a hit');
        const line = { type: 'line', width: 2, x1: 0, y1: 0, x2: 100, y2: 0 };
        assert.ok(TrailPaint.hitTest(line, 50, 4));
        assert.ok(!TrailPaint.hitTest(line, 50, 30));
        const ellipse = { type: 'ellipse', width: 2, fill: false, x1: 0, y1: 0, x2: 100, y2: 60 };
        assert.ok(TrailPaint.hitTest(ellipse, 50, 0), 'top of the ellipse');
        assert.ok(!TrailPaint.hitTest(ellipse, 50, 30), 'centre of an unfilled ellipse');
        const pen = { type: 'pen', width: 2, points: [[0, 0], [50, 50], [100, 0]] };
        assert.ok(TrailPaint.hitTest(pen, 25, 25));
    });

    test('hitTop returns the top-most shape under the cursor', () => {
        const store = TrailPaint.createStore();
        store.add('s', Object.assign({}, rect, { fill: true }));
        const top = store.add('s', Object.assign({}, rect, { fill: true, color: '#e53935' }));
        assert.strictEqual(store.hitTop('s', 60, 35).id, top.id);
        assert.strictEqual(store.hitTop('s', 500, 500), null);
    });

    test('simplify drops near points and keeps the ends', () => {
        const points = [[0, 0], [1, 0], [2, 0], [10, 0], [11, 0], [20, 0]];
        const simple = TrailPaint.simplify(points, 5);
        assert.deepStrictEqual(simple[0], [0, 0]);
        assert.deepStrictEqual(simple[simple.length - 1], [20, 0]);
        assert.ok(simple.length < points.length);
    });

    test('pathFromPoints handles 0, 1, 2 and many points', () => {
        assert.strictEqual(TrailPaint.pathFromPoints([]), '');
        assert.ok(TrailPaint.pathFromPoints([[3, 4]]).startsWith('M3,4'));
        assert.strictEqual(TrailPaint.pathFromPoints([[0, 0], [5, 5]]), 'M0,0 L5,5');
        assert.ok(TrailPaint.pathFromPoints([[0, 0], [5, 5], [10, 0]]).includes('Q'));
    });

    test('arrowHead points toward the end of the line', () => {
        const d = TrailPaint.arrowHead(0, 0, 100, 0, 10);
        assert.ok(d.includes('L100,0'), 'tip sits on the end point');
        const rect2 = TrailPaint.normalizeRect(50, 40, 10, 5);
        assert.deepStrictEqual(rect2, { x: 10, y: 5, w: 40, h: 35 });
    });
});

suite('Trail Icons Test Suite', () => {
    const used = [
        'home', 'back', 'forward', 'reset', 'search', 'close', 'help', 'open', 'trace', 'focus', 'move', 'pointer', 'warning',
        'arrow-up', 'arrow-down', 'dot', 'eye', 'eye-off', 'edit', 'pen', 'line', 'arrow', 'rect', 'ellipse', 'eraser', 'undo', 'redo',
        'trash', 'fill', 'class', 'interface', 'enum', 'method', 'function', 'constructor', 'field', 'property', 'package', 'sdk',
        'layer-view', 'layer-state', 'layer-service', 'layer-model', 'layer-utility'
    ];

    test('every icon the view relies on exists', () => {
        const names = TrailIcons.names();
        used.forEach(n => assert.ok(names.includes(n), 'missing icon ' + n));
    });

    test('every icon is made of well-formed parts', () => {
        TrailIcons.names().forEach((name: string) => {
            const parts = TrailIcons.parts(name);
            assert.ok(parts.length > 0, name + ' has no parts');
            parts.forEach((p: any) => {
                if (typeof p === 'string') {
                    assert.ok(/^M[\d\s.,a-zA-Z-]+$/.test(p), name + ' has a malformed path: ' + p);
                } else {
                    assert.ok(['circle', 'rect'].includes(p[0]), name + ' has an unknown shape');
                    p.slice(1, p[0] === 'circle' ? 4 : 5).forEach((n: any) => assert.ok(typeof n === 'number' && isFinite(n)));
                }
            });
        });
    });

    test('node kinds map to an icon that exists', () => {
        const names = TrailIcons.names();
        ['class', 'mixin', 'enum', 'method', 'function', 'constructor', 'field', 'property'].forEach(k => {
            assert.ok(names.includes(TrailIcons.iconForKind(k)), k);
        });
        assert.strictEqual(TrailIcons.iconForKind('something-new'), 'dot');
    });
});
