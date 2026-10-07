import * as assert from 'assert';
import { DEFAULT_EXCLUDES, globToRegExp, makeExcluder } from '../../filesystem/exclusions';

suite('Exclusions Test Suite', () => {
    const excluded = makeExcluder(DEFAULT_EXCLUDES);

    test('leaves out generated Dart files wherever they are', () => {
        ['lib/model/user.g.dart', 'lib/a/b/c/state.freezed.dart', 'lib/router.gr.dart', 'test/x.mocks.dart', 'user.g.dart']
            .forEach(p => assert.strictEqual(excluded(p), true, p));
    });

    test('leaves out generated folders and the Dart tool cache', () => {
        assert.strictEqual(excluded('lib/generated/api/client.dart'), true);
        assert.strictEqual(excluded('.dart_tool/build/x.dart'), true);
        assert.strictEqual(excluded('lib/.dart_tool/x.dart'), true);
    });

    test('keeps the code a person writes', () => {
        ['lib/main.dart', 'lib/models/user.dart', 'lib/gen/helper.dart', 'lib/general.dart', 'lib/g.dart']
            .forEach(p => assert.strictEqual(excluded(p), false, p));
    });

    test('a path written with backslashes is the same path', () => {
        assert.strictEqual(excluded('lib\\model\\user.g.dart'), true);
        assert.strictEqual(excluded('lib\\model\\user.dart'), false);
    });

    test('an empty list excludes nothing, and blank entries are ignored', () => {
        assert.strictEqual(makeExcluder([])('lib/user.g.dart'), false);
        assert.strictEqual(makeExcluder(['', '  '])('lib/user.g.dart'), false);
    });

    test('glob pieces: * stays inside a folder, ** crosses folders, ? is one character', () => {
        assert.strictEqual(globToRegExp('lib/*.dart').test('lib/a.dart'), true);
        assert.strictEqual(globToRegExp('lib/*.dart').test('lib/sub/a.dart'), false);
        assert.strictEqual(globToRegExp('lib/**/a.dart').test('lib/a.dart'), true);
        assert.strictEqual(globToRegExp('lib/**/a.dart').test('lib/x/y/a.dart'), true);
        assert.strictEqual(globToRegExp('a?.dart').test('ab.dart'), true);
        assert.strictEqual(globToRegExp('a?.dart').test('abc.dart'), false);
    });

    test('dots and other characters of the pattern are literal', () => {
        assert.strictEqual(globToRegExp('a.dart').test('aXdart'), false);
        assert.strictEqual(globToRegExp('a+b.dart').test('a+b.dart'), true);
    });
});
