import * as assert from 'assert';
import { isPathInside, isSamePath } from '../../filesystem/path_utils';
import { packagesNeedingContainers } from '../../packages/graph_integration/container_nodes';
import { ExternalPackageInfo } from '../../types/index';

suite('Path Utils Test Suite', () => {
    test('isSamePath ignores trailing separators and, on Windows, separator style and case', () => {
        assert.ok(isSamePath('/a/b', '/a/b/'));
        assert.ok(!isSamePath('/a/b', '/a/bc'));
        assert.ok(!isSamePath('/a/b', '/a'));
        if (process.platform === 'win32') {
            assert.ok(isSamePath('C:\\Users\\Me\\app', 'c:/users/me/app'));
        }
    });

    test('the project root package gets no container, local packages do', () => {
        const pkg = (name: string, p: string, type: ExternalPackageInfo['type']): ExternalPackageInfo => ({
            name, version: '2.1.0', path: p, type, dartFiles: [], hasLibFolder: true, isFlutterPackage: false, description: ''
        });
        const all = [pkg('my_app', '/work/my_app', 'custom'), pkg('shared', '/work/my_app/packages/shared', 'custom'), pkg('http', '/cache/http', 'third_party')];
        assert.deepStrictEqual(packagesNeedingContainers(all, '/work/my_app').map(p => p.name), ['shared', 'http']);
        assert.deepStrictEqual(packagesNeedingContainers(all, '/work/my_app/').map(p => p.name), ['shared', 'http']);
        assert.deepStrictEqual(packagesNeedingContainers(all, null).map(p => p.name), ['my_app', 'shared', 'http']);
    });

    test('treats a path as inside itself', () => {
        assert.ok(isPathInside('/a/b', '/a/b'));
    });

    test('detects nested paths', () => {
        assert.ok(isPathInside('/a/b/c/d.dart', '/a/b'));
    });

    test('does not match sibling paths sharing a prefix', () => {
        assert.ok(!isPathInside('/a/bc/d.dart', '/a/b'));
    });

    test('ignores separator style mixing on Windows', function () {
        if (process.platform !== 'win32') {
            this.skip();
        }
        assert.ok(isPathInside('/a/b\\c/d.dart', '/a/b'));
    });

    test('is case-insensitive on Windows only', () => {
        assert.strictEqual(isPathInside('/A/B/c.dart', '/a/b'), process.platform === 'win32');
    });
});
