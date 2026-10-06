import * as assert from 'assert';
import { cyclomaticComplexity } from '../../analysis/complexity';

suite('Cyclomatic Complexity Test Suite', () => {
    test('a straight line of code has one path', () => {
        assert.strictEqual(cyclomaticComplexity('void run() { go(); stop(); }'), 1);
    });

    test('counts branches and loops', () => {
        const source = 'int f(int a) { if (a > 0) { for (var i = 0; i < a; i++) { while (x) {} } } else if (a < 0) { return 1; } return 0; }';
        assert.strictEqual(cyclomaticComplexity(source), 1 + 4); // if, for, while, else if
    });

    test('counts switch cases, catches and boolean operators', () => {
        const source = 'void f() { switch (a) { case 1: break; case 2: break; } try { go(); } catch (e) {} if (a && b || c) {} }';
        assert.strictEqual(cyclomaticComplexity(source), 1 + 2 + 1 + 1 + 2);
    });

    test('counts ternaries and null coalescing but not nullable types or null-aware access', () => {
        assert.strictEqual(cyclomaticComplexity('String f(User? u) { return u != null ? u.name : "x"; }'), 2);
        assert.strictEqual(cyclomaticComplexity('String f(User? u) { return u?.name ?? "x"; }'), 2);
        assert.strictEqual(cyclomaticComplexity('void f(List<String>? xs) { xs?[0]; String? s; }'), 1);
    });

    test('an empty body is one path', () => {
        assert.strictEqual(cyclomaticComplexity(''), 1);
    });
});
