import * as assert from 'assert';
import { decide, orderChoices, packageNameOf, packagesFrom } from '../../filesystem/project_choice';

suite('Project Choice Test Suite', () => {
    test('the name of a package comes from its pubspec.yaml', () => {
        assert.strictEqual(packageNameOf('name: my_app\ndescription: x\n'), 'my_app');
        assert.strictEqual(packageNameOf('# a comment\nname: "quoted"\n'), 'quoted');
        assert.strictEqual(packageNameOf('description: no name here\n'), undefined);
    });

    test('a name that is only part of another key is not the name', () => {
        assert.strictEqual(packageNameOf('dependencies:\n  name: ^1.0.0\nname: real\n'), 'real');
    });

    test('packages are named by their pubspec and placed relative to the open folder', () => {
        const texts: Record<string, string> = { 'C:/m/packages/app/pubspec.yaml': 'name: app\n', 'C:/m/packages/core/pubspec.yaml': 'name: core_lib\n' };
        const found = packagesFrom('C:\\m', ['C:\\m\\packages\\app\\pubspec.yaml', 'C:/m/packages/core/pubspec.yaml'], p => texts[p.replace(/\\/g, '/')]);
        assert.deepStrictEqual(found.map(c => [c.name, c.relative]), [['app', 'packages/app'], ['core_lib', 'packages/core']]);
    });

    test('a pubspec that cannot be read still counts, named by its folder', () => {
        const found = packagesFrom('/m', ['/m/tools/gen/pubspec.yaml'], () => { throw new Error('denied'); });
        assert.deepStrictEqual(found.map(c => [c.name, c.relative]), [['gen', 'tools/gen']]);
    });

    test('the same folder twice is one package', () => {
        const found = packagesFrom('/m', ['/m/a/pubspec.yaml', '/m/A/pubspec.yaml'], () => 'name: a\n');
        assert.strictEqual(found.length, 1);
    });

    test('the one used last comes first, the examples last, the nearest first among the rest', () => {
        const base = packagesFrom('/m', ['/m/packages/zeta/pubspec.yaml', '/m/packages/alpha/pubspec.yaml', '/m/packages/alpha/example/pubspec.yaml', '/m/apps/deep/inner/pubspec.yaml', '/m/top/pubspec.yaml'], p => 'name: ' + p.split('/').slice(-2)[0] + '\n');
        assert.deepStrictEqual(orderChoices(base).map(c => c.relative), ['top', 'packages/alpha', 'packages/zeta', 'apps/deep/inner', 'packages/alpha/example']);
        assert.deepStrictEqual(orderChoices(base, '/m/packages/zeta').map(c => c.relative)[0], 'packages/zeta');
        assert.strictEqual(orderChoices(base, '/M/PACKAGES/ZETA/').map(c => c.relative)[0], 'packages/zeta', 'case and a trailing slash do not matter');
    });

    test('nothing, one, or several', () => {
        const some = packagesFrom('/m', ['/m/a/pubspec.yaml', '/m/b/pubspec.yaml'], () => undefined);
        assert.strictEqual(decide([]), 'none');
        assert.strictEqual(decide(some.slice(0, 1)), 'single');
        assert.strictEqual(decide(some), 'pick');
    });
});
