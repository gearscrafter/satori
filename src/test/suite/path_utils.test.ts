import * as assert from 'assert';
import { isPathInside } from '../../filesystem/path_utils';

suite('Path Utils Test Suite', () => {
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
