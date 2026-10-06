import * as assert from 'assert';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { findSdkLibDir, readPackageLibDirs, resolveImportFile } from '../../packages/import_targets';

suite('Import Targets Test Suite', () => {
    const configDir = path.resolve('/work/app/.dart_tool');
    const config = JSON.stringify({
        packages: [
            { name: 'dio', rootUri: pathToFileURL(path.resolve('/cache/hosted/dio-5.0.0')).href, packageUri: 'lib/' },
            { name: 'app', rootUri: '../', packageUri: 'lib/' },
            { name: 'local', rootUri: '../../local_pkg', packageUri: 'src/' },
            { name: 'broken' }
        ]
    });

    test('reads the lib folder of every package, resolving relative roots from the config folder', () => {
        const dirs = readPackageLibDirs(config, configDir);
        assert.strictEqual(path.basename(dirs.dio), 'lib');
        assert.ok(dirs.dio.replace(/\\/g, '/').endsWith('/cache/hosted/dio-5.0.0/lib'));
        assert.strictEqual(dirs.app, path.resolve('/work/app', 'lib'));
        assert.strictEqual(dirs.local, path.resolve('/work/local_pkg', 'src'));
        assert.strictEqual('broken' in dirs, false);
    });

    test('unreadable configs give an empty map', () => {
        assert.deepStrictEqual(readPackageLibDirs('not json', configDir), {});
        assert.deepStrictEqual(readPackageLibDirs('{}', configDir), {});
    });

    test('finds the SDK lib folder among candidates', () => {
        const sdk = path.resolve('/sdk');
        const exists = (p: string) => p === path.join(sdk, 'lib', 'core', 'core.dart');
        assert.strictEqual(findSdkLibDir([path.resolve('/nope'), sdk], exists), path.join(sdk, 'lib'));
        assert.strictEqual(findSdkLibDir([path.resolve('/nope')], exists), undefined);
    });

    test('resolves package and dart: imports to files, and leaves unknown ones unresolved', () => {
        const libDirs = { dio: path.resolve('/cache/dio/lib') };
        const sdkLib = path.resolve('/sdk/lib');
        const known = new Set([path.join(libDirs.dio, 'dio.dart'), path.join(libDirs.dio, 'src', 'x.dart'), path.join(sdkLib, 'async', 'async.dart')]);
        const exists = (p: string) => known.has(p);
        assert.strictEqual(resolveImportFile('package:dio/dio.dart', libDirs, sdkLib, exists), path.join(libDirs.dio, 'dio.dart'));
        assert.strictEqual(resolveImportFile('package:dio/src/x.dart', libDirs, sdkLib, exists), path.join(libDirs.dio, 'src', 'x.dart'));
        assert.strictEqual(resolveImportFile('dart:async', libDirs, sdkLib, exists), path.join(sdkLib, 'async', 'async.dart'));
        assert.strictEqual(resolveImportFile('dart:ui', libDirs, sdkLib, exists), undefined, 'engine library not in the SDK');
        assert.strictEqual(resolveImportFile('package:dio/missing.dart', libDirs, sdkLib, exists), undefined);
        assert.strictEqual(resolveImportFile('package:other/a.dart', libDirs, sdkLib, exists), undefined);
        assert.strictEqual(resolveImportFile('dart:async', libDirs, undefined, exists), undefined);
        assert.strictEqual(resolveImportFile('../relative.dart', libDirs, sdkLib, exists), undefined);
    });
});
