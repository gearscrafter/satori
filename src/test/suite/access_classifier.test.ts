import * as assert from 'assert';
import { classifyAccess, AccessKind } from '../../analysis/access_classifier';

/** Classifies the first occurrence of `name` in `line`. */
function kind(line: string, name: string, constructorNames?: string[]): AccessKind[] {
    const start = line.indexOf(name);
    assert.ok(start >= 0, `"${name}" not found in "${line}"`);
    return classifyAccess(line, start, start + name.length, { constructorNames });
}

suite('Access Classifier Test Suite', () => {
    test('a plain assignment writes the field', () => {
        assert.deepStrictEqual(kind('    current = user;', 'current'), ['write']);
        assert.deepStrictEqual(kind('    this.current = user;', 'current'), ['write']);
    });

    test('comparisons and arrows are reads, not writes', () => {
        assert.deepStrictEqual(kind('    if (current == null) return;', 'current'), ['read']);
        assert.deepStrictEqual(kind('    final f = () => current;', 'current'), ['read']);
    });

    test('compound assignments and increments read and write', () => {
        assert.deepStrictEqual(kind('    count += 1;', 'count'), ['read', 'write']);
        assert.deepStrictEqual(kind('    cache ??= build();', 'cache'), ['read', 'write']);
        assert.deepStrictEqual(kind('    count++;', 'count'), ['read', 'write']);
        assert.deepStrictEqual(kind('    --count;', 'count'), ['read', 'write']);
    });

    test('null-aware reads stay reads', () => {
        assert.deepStrictEqual(kind('    final user = current ?? other;', 'current'), ['read']);
        assert.deepStrictEqual(kind('    return current?.name;', 'current'), ['read']);
        assert.deepStrictEqual(kind('    return current!.name;', 'current'), ['read']);
    });

    test('a bare argument is passed to the call', () => {
        assert.deepStrictEqual(kind('    print(current);', 'current'), ['pass']);
        assert.deepStrictEqual(kind('    save(id, current);', 'current'), ['pass']);
        assert.deepStrictEqual(kind('    render(user: current);', 'current'), ['pass']);
        assert.deepStrictEqual(kind('    final a = Foo<int>(current);', 'current'), ['pass']);
        assert.deepStrictEqual(kind('    log.add(this.current);', 'current'), ['pass']);
    });

    test('control-flow parentheses and expressions are not argument passing', () => {
        assert.deepStrictEqual(kind('    if (current) go();', 'current'), ['read']);
        assert.deepStrictEqual(kind('    while (running) {', 'running'), ['read']);
        assert.deepStrictEqual(kind('    final x = (current);', 'current'), ['read']);
        assert.deepStrictEqual(kind('    save(current.id);', 'current'), ['read']);
        assert.deepStrictEqual(kind('    save(current + 1);', 'current'), ['read']);
    });

    test('a ternary branch is not mistaken for a named argument', () => {
        assert.deepStrictEqual(kind('    final v = ok ? a : current;', 'current'), ['read']);
    });

    test('this.field parameters in a constructor header assign the field', () => {
        const names = ['UserController'];
        assert.deepStrictEqual(kind('  UserController(this.repository);', 'repository', names), ['write']);
        assert.deepStrictEqual(kind('  UserController(String id, this.name, this.age);', 'name', ['UserController']), ['write']);
        assert.deepStrictEqual(kind('  const Foo({required this.bar});', 'bar', ['Foo']), ['write']);
        assert.deepStrictEqual(kind('  Foo.named(this.bar) : super();', 'bar', ['Foo']), ['write']);
    });

    test('this.field parameters written one per line assign the field', () => {
        const names = ['MyWidget'];
        assert.deepStrictEqual(kind('    required this.title,', 'title', names), ['write']);
        assert.deepStrictEqual(kind('    this.subtitle = \'x\',', 'subtitle', names), ['write']);
        assert.deepStrictEqual(kind('    final this.count', 'count', names), ['write']);
    });

    test('this.field inside a constructor body is not a parameter', () => {
        const names = ['Foo'];
        assert.deepStrictEqual(kind('    go(this.repository);', 'repository', names), ['pass']);
        assert.deepStrictEqual(kind('    return this.repository;', 'repository', names), ['read']);
        assert.deepStrictEqual(kind('    this.value = compute();', 'value', names), ['write']);
        assert.deepStrictEqual(kind('    this.value.update();', 'value', names), ['read']);
    });

    test('without a constructor name it looks like an ordinary call argument', () => {
        assert.deepStrictEqual(kind('  UserController(this.repository);', 'repository'), ['pass']);
    });

    test('an unrelated read is a read', () => {
        assert.deepStrictEqual(kind('    final user = current;', 'current'), ['read']);
        assert.deepStrictEqual(kind('    return repository.findById(id);', 'repository'), ['read']);
    });
});
