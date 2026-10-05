/* Pure drawing logic for the Satori edit mode: shapes, undo/redo per scope, geometry and hit testing. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TrailPaint = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TOOLS = ['pen', 'line', 'arrow', 'rect', 'ellipse', 'eraser'];
    const MAX_SHAPES_PER_SCOPE = 500;
    const MAX_PEN_POINTS = 400;

    function round(n) { return Math.round(n * 10) / 10; }

    function normalizeRect(x1, y1, x2, y2) {
        return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    }

    /** Drops points closer than `minDistance` to the previous kept one, always keeping the last point. */
    function simplify(points, minDistance) {
        if (points.length <= 2) { return points.slice(); }
        const kept = [points[0]];
        for (let i = 1; i < points.length - 1; i++) {
            const last = kept[kept.length - 1];
            if (Math.hypot(points[i][0] - last[0], points[i][1] - last[1]) >= minDistance) { kept.push(points[i]); }
        }
        kept.push(points[points.length - 1]);
        if (kept.length > MAX_PEN_POINTS) {
            const stride = Math.ceil(kept.length / MAX_PEN_POINTS);
            return kept.filter(function (p, i) { return i % stride === 0 || i === kept.length - 1; });
        }
        return kept;
    }

    /** Smooth SVG path through the points using quadratic curves between midpoints. */
    function pathFromPoints(points) {
        if (!points.length) { return ''; }
        if (points.length === 1) { return 'M' + points[0][0] + ',' + points[0][1] + ' l0.01,0'; }
        if (points.length === 2) { return 'M' + points[0][0] + ',' + points[0][1] + ' L' + points[1][0] + ',' + points[1][1]; }
        let d = 'M' + points[0][0] + ',' + points[0][1];
        for (let i = 1; i < points.length - 1; i++) {
            const mx = (points[i][0] + points[i + 1][0]) / 2;
            const my = (points[i][1] + points[i + 1][1]) / 2;
            d += ' Q' + points[i][0] + ',' + points[i][1] + ' ' + round(mx) + ',' + round(my);
        }
        const last = points[points.length - 1];
        return d + ' L' + last[0] + ',' + last[1];
    }

    /** Two short strokes forming an arrow head at (x2, y2), pointing away from (x1, y1). */
    function arrowHead(x1, y1, x2, y2, size) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const spread = Math.PI / 7;
        const a = [x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread)];
        const b = [x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)];
        return 'M' + round(a[0]) + ',' + round(a[1]) + ' L' + x2 + ',' + y2 + ' L' + round(b[0]) + ',' + round(b[1]);
    }

    function distanceToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq === 0) { return Math.hypot(px - x1, py - y1); }
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    /** True when (x, y) is on the shape's stroke (or inside it, for filled shapes). */
    function hitTest(shape, x, y, tolerance) {
        const tol = (tolerance || 6) + (shape.width || 2) / 2;
        switch (shape.type) {
            case 'pen': {
                const pts = shape.points || [];
                if (pts.length === 1) { return Math.hypot(x - pts[0][0], y - pts[0][1]) <= tol; }
                for (let i = 0; i < pts.length - 1; i++) {
                    if (distanceToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= tol) { return true; }
                }
                return false;
            }
            case 'line':
            case 'arrow':
                return distanceToSegment(x, y, shape.x1, shape.y1, shape.x2, shape.y2) <= tol;
            case 'rect': {
                const r = normalizeRect(shape.x1, shape.y1, shape.x2, shape.y2);
                const inside = x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
                if (shape.fill && inside) { return true; }
                const nearVertical = (Math.abs(x - r.x) <= tol || Math.abs(x - (r.x + r.w)) <= tol) && y >= r.y - tol && y <= r.y + r.h + tol;
                const nearHorizontal = (Math.abs(y - r.y) <= tol || Math.abs(y - (r.y + r.h)) <= tol) && x >= r.x - tol && x <= r.x + r.w + tol;
                return nearVertical || nearHorizontal;
            }
            case 'ellipse': {
                const r = normalizeRect(shape.x1, shape.y1, shape.x2, shape.y2);
                const rx = r.w / 2;
                const ry = r.h / 2;
                if (rx === 0 || ry === 0) { return false; }
                const nx = (x - (r.x + rx)) / rx;
                const ny = (y - (r.y + ry)) / ry;
                const d = Math.hypot(nx, ny);
                if (shape.fill && d <= 1) { return true; }
                return Math.abs(d - 1) * Math.min(rx, ry) <= tol;
            }
            default:
                return false;
        }
    }

    /** Per-scope shape lists with undo/redo. A scope is whatever the view is showing (a class id or "overview"). */
    function createStore(initial) {
        const shapes = new Map();
        const redoStacks = new Map();
        let counter = 0;

        if (initial && typeof initial === 'object') {
            Object.keys(initial).forEach(function (scope) {
                if (Array.isArray(initial[scope])) {
                    shapes.set(scope, initial[scope].filter(validShape).slice(0, MAX_SHAPES_PER_SCOPE));
                }
            });
        }

        function list(scope) {
            if (!shapes.has(scope)) { shapes.set(scope, []); }
            return shapes.get(scope);
        }
        function nextId() { return 's' + Date.now().toString(36) + (counter++).toString(36); }

        return {
            shapes: function (scope) { return list(scope).slice(); },
            add: function (scope, shape) {
                const withId = Object.assign({ id: nextId() }, shape);
                const target = list(scope);
                target.push(withId);
                if (target.length > MAX_SHAPES_PER_SCOPE) { target.shift(); }
                redoStacks.set(scope, []);
                return withId;
            },
            remove: function (scope, id) {
                const target = list(scope);
                const index = target.findIndex(function (s) { return s.id === id; });
                if (index < 0) { return null; }
                const removed = target.splice(index, 1)[0];
                const stack = redoStacks.get(scope) || [];
                stack.push({ shape: removed, index: index });
                redoStacks.set(scope, stack);
                return removed;
            },
            undo: function (scope) {
                const target = list(scope);
                if (!target.length) { return false; }
                const removed = target.pop();
                const stack = redoStacks.get(scope) || [];
                stack.push({ shape: removed, index: target.length });
                redoStacks.set(scope, stack);
                return true;
            },
            redo: function (scope) {
                const stack = redoStacks.get(scope) || [];
                if (!stack.length) { return false; }
                const entry = stack.pop();
                const target = list(scope);
                target.splice(Math.min(entry.index, target.length), 0, entry.shape);
                return true;
            },
            clear: function (scope) {
                const target = list(scope);
                const had = target.length > 0;
                shapes.set(scope, []);
                redoStacks.set(scope, []);
                return had;
            },
            canUndo: function (scope) { return list(scope).length > 0; },
            canRedo: function (scope) { return (redoStacks.get(scope) || []).length > 0; },
            hitTop: function (scope, x, y, tolerance) {
                const target = list(scope);
                for (let i = target.length - 1; i >= 0; i--) {
                    if (hitTest(target[i], x, y, tolerance)) { return target[i]; }
                }
                return null;
            },
            serialize: function () {
                const out = {};
                shapes.forEach(function (value, scope) { if (value.length) { out[scope] = value; } });
                return out;
            }
        };
    }

    function validShape(s) {
        if (!s || typeof s !== 'object' || TOOLS.indexOf(s.type) < 0 || s.type === 'eraser') { return false; }
        if (s.type === 'pen') { return Array.isArray(s.points) && s.points.length > 0 && s.points.every(function (p) { return Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]); }); }
        return [s.x1, s.y1, s.x2, s.y2].every(function (n) { return typeof n === 'number' && isFinite(n); });
    }

    return { TOOLS, createStore, simplify, pathFromPoints, arrowHead, hitTest, normalizeRect, validShape, distanceToSegment };
});
