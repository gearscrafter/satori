import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { diffStamps, planAnalysis, INCREMENTAL_MIN_FILES } from '../../analysis/incremental';
import { NavigationIndex, Usage } from '../../analysis/navigation_index';
import { readState, reviveRanges, STATE_LAYOUT, stateFileFor, writeStateParts } from '../../analysis/incremental_state';
import { clearCachedAnalyses } from '../../analysis/graph_cache';

const stamp = (p: string, size = 10, mtimeMs = 1000) => ({ path: p, size, mtimeMs });

suite('Incremental Plan Test Suite', () => {
    test('files that are the same are not reported', () => {
        const diff = diffStamps([stamp('/p/a.dart')], [stamp('/p/a.dart')]);
        assert.deepStrictEqual(diff, { changed: [], added: [], deleted: [] });
    });

    test('a different size or time is a change, a new path is an addition, a missing one a deletion', () => {
        const before = [stamp('/p/a.dart'), stamp('/p/b.dart'), stamp('/p/c.dart'), stamp('/p/d.dart')];
        const now = [stamp('/p/a.dart', 11), stamp('/p/b.dart', 10, 2000), stamp('/p/c.dart'), stamp('/p/e.dart')];
        const diff = diffStamps(before, now);
        assert.deepStrictEqual(diff.changed.sort(), ['/p/a.dart', '/p/b.dart']);
        assert.deepStrictEqual(diff.added, ['/p/e.dart']);
        assert.deepStrictEqual(diff.deleted, ['/p/d.dart']);
    });

    test('paths written the Windows way and the VS Code way are the same file', () => {
        const diff = diffStamps([stamp('C:\\proj\\lib\\a.dart')], [stamp('c:/proj/lib/a.dart')]);
        assert.deepStrictEqual(diff, { changed: [], added: [], deleted: [] });
    });

    test('a sub-millisecond difference in the time is not a change', () => {
        assert.deepStrictEqual(diffStamps([stamp('/a', 1, 1000.2)], [stamp('/a', 1, 1000.4)]).changed, []);
    });

    test('nothing changed means nothing to ask', () => {
        assert.strictEqual(planAnalysis(1000, { changed: [], added: [], deleted: [] }, 0).mode, 'reuse');
    });

    test('a few files, and the ones that use them, are asked again', () => {
        const plan = planAnalysis(1000, { changed: ['/a', '/b'], added: ['/c'], deleted: [] }, 20);
        assert.strictEqual(plan.mode, 'incremental');
    });

    test('a deletion alone still needs the state updated, with nothing to ask', () => {
        assert.strictEqual(planAnalysis(1000, { changed: [], added: [], deleted: ['/a'] }, 0).mode, 'incremental');
    });

    test('too much to ask again costs more than starting over', () => {
        const many = Array.from({ length: 300 }, (_, i) => '/f' + i);
        assert.strictEqual(planAnalysis(1000, { changed: many, added: [], deleted: [] }, 0).mode, 'full');
        assert.strictEqual(planAnalysis(1000, { changed: ['/a'], added: [], deleted: [] }, 400).mode, 'full');
    });

    test('a small project may ask about a few files whatever the share', () => {
        const some = Array.from({ length: INCREMENTAL_MIN_FILES }, (_, i) => '/f' + i);
        assert.strictEqual(planAnalysis(40, { changed: some, added: [], deleted: [] }, 0).mode, 'incremental');
    });
});

suite('Navigation Index Update Test Suite', () => {
    const use = (uri: string, line = 0): Usage => ({ uri, line, character: 0, endLine: line, endCharacter: 3 });
    const build = () => NavigationIndex.fromJSON([
        ['/p/a.dart:1:0', [use('file:///p/b.dart'), use('file:///p/c.dart')]],
        ['/p/a.dart:5:0', [use('file:///p/b.dart', 2)]],
        ['/p/b.dart:3:0', [use('file:///p/c.dart', 7)]],
        ['/p/c.dart:9:0', [use('file:///p/a.dart', 4)]]
    ]);

    test('it comes back the way it was saved', () => {
        const index = build();
        assert.deepStrictEqual(NavigationIndex.fromJSON(JSON.parse(JSON.stringify(index.toJSON()))).toJSON(), index.toJSON());
        assert.strictEqual(index.referencesTo('/p/a.dart', 1, 0).length, 2);
    });

    test('the files that use what a file declares', () => {
        assert.deepStrictEqual(Array.from(build().filesUsingDeclarationsIn(new Set(['/p/a.dart']))).sort(), ['file:///p/b.dart', 'file:///p/c.dart']);
        assert.deepStrictEqual(Array.from(build().filesUsingDeclarationsIn(new Set(['/p/z.dart']))), []);
    });

    test('it forgets the declarations of some files and the uses that appear in others', () => {
        const index = build();
        index.forget(new Set(['/p/a.dart']), new Set(['file:///p/c.dart']));
        assert.strictEqual(index.referencesTo('/p/a.dart', 1, 0).length, 0, 'declared in a forgotten file');
        assert.strictEqual(index.referencesTo('/p/b.dart', 3, 0).length, 0, 'its only use was in c');
        assert.strictEqual(index.referencesTo('/p/c.dart', 9, 0).length, 1, 'unrelated');
    });

    test('forgetting a use keeps the others of the same declaration', () => {
        const index = build();
        index.forget(new Set(), new Set(['file:///p/b.dart']));
        assert.deepStrictEqual(index.referencesTo('/p/a.dart', 1, 0).map(u => u.uri), ['file:///p/c.dart']);
        assert.strictEqual(index.referencesTo('/p/a.dart', 5, 0).length, 0);
    });

    test('what another index knows is added, to the same declaration or a new one', () => {
        const index = build();
        index.absorb(NavigationIndex.fromJSON([['/p/a.dart:1:0', [use('file:///p/d.dart')]], ['/p/d.dart:0:0', [use('file:///p/a.dart')]]]));
        assert.strictEqual(index.referencesTo('/p/a.dart', 1, 0).length, 3);
        assert.strictEqual(index.referencesTo('/p/d.dart', 0, 0).length, 1);
    });

    test('a path with a drive letter keeps its colon', () => {
        const index = NavigationIndex.fromJSON([['c:/proj/lib/a.dart:12:4', [use('file:///c%3A/proj/lib/b.dart')]]]);
        assert.deepStrictEqual(Array.from(index.filesUsingDeclarationsIn(new Set(['c:/proj/lib/a.dart']))), ['file:///c%3A/proj/lib/b.dart']);
    });
});

suite('Incremental State Test Suite', () => {
    let dir: string;
    setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-state-')); });
    teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    test('what is written is read back, with the symbols as they were copied', () => {
        const file = path.join(dir, 'analysis-abc.state.json');
        const files = [{ file: '/p/a.dart', fileUri: 'file:///p/a.dart', symbols: [{ name: 'A', range: [{ line: 1, character: 2 }, { line: 3, character: 4 }] }] }];
        writeStateParts(file, { extensionVersion: '9.9.9', stamps: [stamp('/p/a.dart')], hasNavigation: true }, JSON.stringify(files), { 'file:///p/a.dart': [] }, [['/p/a.dart:1:0', [{ uri: 'u', line: 0, character: 0, endLine: 0, endCharacter: 1 }]]]);
        const state = readState(file, '9.9.9')!;
        assert.strictEqual(state.layout, STATE_LAYOUT);
        assert.strictEqual(state.hasNavigation, true);
        assert.deepStrictEqual(state.files, files);
        assert.strictEqual(state.usages.length, 1);
        assert.deepStrictEqual(state.stamps, [stamp('/p/a.dart')]);
    });

    test('a state of another extension version is not used', () => {
        const file = path.join(dir, 'x.state.json');
        writeStateParts(file, { extensionVersion: '1.0.0', stamps: [], hasNavigation: true }, '[]', {}, []);
        assert.strictEqual(readState(file, '1.0.1'), null);
    });

    test('a damaged or missing state is as good as none', () => {
        const file = path.join(dir, 'x.state.json');
        assert.strictEqual(readState(file, '1.0.0'), null);
        fs.writeFileSync(file, '{"layout": 1, "files": ');
        assert.strictEqual(readState(file, '1.0.0'), null);
    });

    test('it lives next to the saved analysis, and clearing the analyses clears it too', () => {
        const cache = path.join(dir, 'analysis-0123456789abcdef.json');
        assert.strictEqual(stateFileFor(cache), path.join(dir, 'analysis-0123456789abcdef.state.json'));
        fs.writeFileSync(cache, '{}');
        fs.writeFileSync(stateFileFor(cache), '{}');
        fs.writeFileSync(path.join(dir, 'other.json'), '{}');
        assert.strictEqual(clearCachedAnalyses(dir), 2);
        assert.deepStrictEqual(fs.readdirSync(dir), ['other.json']);
    });
});

suite('Revive Ranges Test Suite', () => {
    const make = (a: number, b: number, c: number, d: number) => ({ start: { line: a, character: b }, end: { line: c, character: d } });

    test('a pair of positions anywhere in the value becomes a range', () => {
        const value = [{ name: 'A', range: [{ line: 1, character: 2 }, { line: 3, character: 4 }], children: [{ selectionRange: [{ line: 5, character: 0 }, { line: 5, character: 1 }], parameters: [{ typeRef: { definition: { range: [{ line: 0, character: 0 }, { line: 9, character: 9 }] } } }] }] }];
        const revived: any = reviveRanges(JSON.parse(JSON.stringify(value)), make);
        assert.deepStrictEqual(revived[0].range, make(1, 2, 3, 4));
        assert.deepStrictEqual(revived[0].children[0].selectionRange, make(5, 0, 5, 1));
        assert.deepStrictEqual(revived[0].children[0].parameters[0].typeRef.definition.range, make(0, 0, 9, 9));
    });

    test('other lists are left alone, whatever their length', () => {
        const value: any = reviveRanges({ names: ['a', 'b'], pair: [1, 2], positions: [{ line: 1, character: 1 }, { line: 2, character: 2 }, { line: 3, character: 3 }], one: [{ line: 1, character: 1 }] }, make);
        assert.deepStrictEqual(value.names, ['a', 'b']);
        assert.deepStrictEqual(value.pair, [1, 2]);
        assert.strictEqual(value.positions.length, 3);
        assert.strictEqual(value.one.length, 1);
    });
});
