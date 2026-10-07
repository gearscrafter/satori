import * as assert from 'assert';
import * as path from 'path';
import { NavigationIndex, lineStarts, normalizePath, positionAt } from '../../analysis/navigation_index';
import { OverrideIndex, HierarchySymbol } from '../../analysis/hierarchy';
import { DartAnalysisClient, NavigationResult } from '../../lsp/analysis_server';
import { firstExistingPath, realDartExecutable } from '../../lsp/dart_executable';

suite('Navigation Index Test Suite', () => {
    test('writes a Windows path and a VS Code path the same way', () => {
        assert.strictEqual(normalizePath('C:\\Users\\x\\a.dart'), normalizePath('c:/Users/x/a.dart'));
        assert.strictEqual(normalizePath('/home/x/a.dart'), '/home/x/a.dart');
    });

    test('turns offsets into lines and columns', () => {
        const text = 'class A {\n  int b;\n}\n';
        const starts = lineStarts(text);
        assert.deepStrictEqual(starts, [0, 10, 19, 21]);
        assert.deepStrictEqual(positionAt(starts, 0), { line: 0, character: 0 });
        assert.deepStrictEqual(positionAt(starts, 16), { line: 1, character: 6 });
        assert.deepStrictEqual(positionAt(starts, 19), { line: 2, character: 0 });
    });

    const text = 'class A {\n  int b = 0;\n  void m() { b = 1; }\n}\n';
    const result: NavigationResult = {
        files: ['C:\\proj\\lib\\a.dart', 'C:\\sdk\\int.dart'],
        targets: [
            { kind: 'FIELD', fileIndex: 0, offset: 16, length: 1, startLine: 2, startColumn: 7 },
            { kind: 'CLASS', fileIndex: 1, offset: 0, length: 3, startLine: 1, startColumn: 1 }
        ],
        regions: [
            { offset: 16, length: 1, targets: [0] },
            { offset: 21, length: 3, targets: [1] },
            { offset: 36, length: 1, targets: [0] }
        ]
    };

    test('records where a declaration is used, found by the position of its name', () => {
        const index = new NavigationIndex();
        index.addFile(result, 'file:///c%3A/proj/lib/a.dart', text, p => normalizePath(p) === 'c:/proj/lib/a.dart', 'C:\\proj\\lib\\a.dart');
        const uses = index.referencesTo('c:/proj/lib/a.dart', 1, 6);
        assert.strictEqual(uses.length, 1, 'the declaration itself is not a use');
        assert.deepStrictEqual(uses[0], { uri: 'file:///c%3A/proj/lib/a.dart', line: 2, character: 13, endLine: 2, endCharacter: 14 });
    });

    test('forgets what points outside the project', () => {
        const index = new NavigationIndex();
        index.addFile(result, 'file:///a', text, p => normalizePath(p) === 'c:/proj/lib/a.dart', 'C:\\proj\\lib\\a.dart');
        assert.strictEqual(index.referencesTo('c:/sdk/int.dart', 0, 0).length, 0);
        assert.strictEqual(index.size, 1);
    });

    test('ignores the "this" and "super" words that point at a field', () => {
        const source = 'class P {\n  final int x;\n  P(this.x);\n}\n';
        const thisAt = source.indexOf('this');
        const xAt = source.indexOf('x);');
        const nav: NavigationResult = {
            files: ['/p/a.dart'],
            targets: [{ kind: 'FIELD', fileIndex: 0, offset: 22, length: 1, startLine: 2, startColumn: 13 }],
            regions: [{ offset: thisAt, length: 4, targets: [0] }, { offset: xAt, length: 1, targets: [0] }]
        };
        const index = new NavigationIndex();
        index.addFile(nav, 'file:///p/a.dart', source, () => true, '/p/a.dart');
        const uses = index.referencesTo('/p/a.dart', 1, 12);
        assert.strictEqual(uses.length, 1);
        assert.strictEqual(source.substr(xAt, 1), 'x');
    });

    test('an unknown position has no uses', () => {
        assert.deepStrictEqual(new NavigationIndex().referencesTo('/p/a.dart', 3, 3), []);
    });
});

suite('Override Index Test Suite', () => {
    const member = (name: string, kind = 5): HierarchySymbol => ({ name, kind });
    const cls = (name: string, children: HierarchySymbol[], relations?: HierarchySymbol['relations']): HierarchySymbol =>
        ({ name, kind: 4, children, relations });

    test('finds the same-named members of the classes that implement or extend', () => {
        const save = member('save');
        const repo = cls('Repository', [save]);
        const userSave = member('save');
        const user = cls('UserRepository', [userSave], { implements: ['Repository<User>'] });
        const adminSave = member('save');
        const admin = cls('AdminRepository', [adminSave, member('other')], { extends: ['UserRepository'] });
        const index = new OverrideIndex([repo, user, admin]);
        assert.deepStrictEqual(index.overridersOf(save), [userSave, adminSave]);
        assert.deepStrictEqual(index.overridersOf(userSave), [adminSave]);
        assert.deepStrictEqual(index.overridersOf(adminSave), []);
    });

    test('a member with another name or kind is not an override', () => {
        const save = member('save');
        const repo = cls('Repository', [save]);
        const other = cls('Other', [member('save', 6), member('load')], { extends: ['Repository'] });
        assert.deepStrictEqual(new OverrideIndex([repo, other]).overridersOf(save), []);
    });

    test('survives a loop in the hierarchy and an unknown member', () => {
        const a = cls('A', [member('x')], { extends: ['B'] });
        const b = cls('B', [member('x')], { extends: ['A'] });
        const index = new OverrideIndex([a, b]);
        assert.strictEqual(index.overridersOf(a.children![0]).length, 1);
        assert.deepStrictEqual(index.overridersOf(member('x')), []);
    });
});

suite('Analysis Client Test Suite', () => {
    const fake = path.resolve(__dirname, '../../../src/test/fixtures/fake_analysis_server.js');
    const run = () => new DartAnalysisClient(process.execPath, [fake]);

    test('starts, waits for the analysis and answers the navigation of a file', async () => {
        const client = run();
        try {
            assert.strictEqual(await client.start(), '9.9');
            await client.analyze('/proj', 5000);
            const nav = await client.getNavigation('/proj/lib/a.dart', 10);
            assert.deepStrictEqual(nav.files, ['/proj/lib/a.dart']);
            assert.strictEqual(nav.regions.length, 1);
        } finally { client.dispose(); }
    });

    test('answers several requests at once', async () => {
        const client = run();
        try {
            await client.start();
            await client.analyze('/proj', 5000);
            const all = await Promise.all([1, 2, 3, 4, 5].map(i => client.getNavigation(`/proj/lib/f${i}.dart`, i)));
            assert.deepStrictEqual(all.map(n => n.targets[0].offset), [1, 2, 3, 4, 5]);
        } finally { client.dispose(); }
    });

    test('reports an error answer as an error', async () => {
        const client = run();
        try {
            await client.start();
            await client.analyze('/proj', 5000);
            await assert.rejects(client.getNavigation('/proj/missing.dart', 1), /INVALID_FILE/);
        } finally { client.dispose(); }
    });

    test('gives up when the analysis never ends', async () => {
        const client = new DartAnalysisClient(process.execPath, [fake, 'never-finishes']);
        try {
            await client.start();
            await assert.rejects(client.analyze('/proj', 200), /did not finish/);
        } finally { client.dispose(); }
    });

    test('fails every request when the server stops', async () => {
        const client = new DartAnalysisClient(process.execPath, [fake, 'dies']);
        try {
            await client.start();
            await assert.rejects(client.analyze('/proj', 5000), /stopped/);
        } finally { client.dispose(); }
    });

    test('a program that does not exist is an error, not a hang', async () => {
        const client = new DartAnalysisClient(path.join(__dirname, 'no-such-program'), []);
        await assert.rejects(client.start());
        client.dispose();
    });
});

suite('Dart Executable Test Suite', () => {
    const sep = path.sep;
    test('prefers the real dart.exe that sits next to a Flutter launcher script', () => {
        const launcher = ['C:', 'flutter', 'bin', 'dart.bat'].join(sep);
        const real = ['C:', 'flutter', 'bin', 'cache', 'dart-sdk', 'bin', 'dart.exe'].join(sep);
        assert.strictEqual(realDartExecutable(launcher, f => f === real, 'win32'), real);
    });

    test('keeps what it was given when there is nothing better', () => {
        const given = ['C:', 'sdk', 'bin', 'dart.exe'].join(sep);
        assert.strictEqual(realDartExecutable(given, () => true, 'win32'), given);
        const launcher = ['C:', 'x', 'dart.bat'].join(sep);
        assert.strictEqual(realDartExecutable(launcher, () => false, 'win32'), launcher);
    });

    test('takes the first line of "where dart" that exists', () => {
        assert.strictEqual(firstExistingPath('C:\\a\\dart\r\nC:\\a\\dart.bat\r\n', f => f.endsWith('.bat')), 'C:\\a\\dart.bat');
        assert.strictEqual(firstExistingPath('', () => true), undefined);
        assert.strictEqual(firstExistingPath('/usr/bin/dart\n', () => true), '/usr/bin/dart');
    });
});
