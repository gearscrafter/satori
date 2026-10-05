import * as assert from 'assert';
import { methodBody } from '../../analysis/signature';

suite('Method Signature Test Suite', () => {
    test('a method body starts after the parameter list', () => {
        const body = methodBody('Future<void> save(User item) async { repo.save(item); }');
        assert.ok(!body.includes('save(User'), body);
        assert.ok(body.includes('repo.save(item)'));
    });

    test('the method name in its own signature is not part of the body', () => {
        assert.ok(!/\bregister\s*\(/.test(methodBody('Future<void> register(String id) async { await go(); }')));
    });

    test('arrow methods keep their expression', () => {
        assert.strictEqual(methodBody('String describe() => format(name, counter);').trim(), '=> format(name, counter);');
    });

    test('a getter has no parameter list and keeps its calls', () => {
        const body = methodBody('String get label => build(value);');
        assert.ok(body.includes('build(value)'));
    });

    test('named and default parameters with braces stay inside the signature', () => {
        const body = methodBody('void run({int retries = compute(1), required String name}) { go(); }');
        assert.ok(!body.includes('compute'), body);
        assert.ok(body.includes('go()'));
    });

    test('constructors keep their initializer list', () => {
        const body = methodBody('Foo(this.a) : b = make(a), super(a) { init(); }');
        assert.ok(body.includes('make(a)') && body.includes('init()'));
    });

    test('abstract declarations have no body', () => {
        assert.strictEqual(methodBody('Future<void> save(User item);'), '');
    });
});
