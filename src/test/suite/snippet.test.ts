import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildSnippet } from '../../analysis/snippet';
import { ProjectGraphModel, ProjectGraphNode } from '../../types/index';

suite('Snippet Test Suite', () => {
    let dir: string;
    let fileUri: string;

    const dart = [
        'import "x.dart";',                       // 0
        '',                                       // 1
        'class Controller {',                     // 2
        '  final Repo repo;',                     // 3
        '',                                       // 4
        '  Future<void> register() async {',      // 5
        '    // save later',                      // 6
        '    final user = User();',               // 7
        '    await repo.save(user);',             // 8
        '  }',                                    // 9
        '}',                                      // 10
        '',                                       // 11
        'class User extends Entity {}'            // 12
    ].join('\n');

    const node = (id: string, label: string, kind: string, range: number[][]): ProjectGraphNode => ({
        id, label, kind,
        data: { fileUri, range: [{ line: range[0][0], character: range[0][1] }, { line: range[1][0], character: range[1][1] }] as any }
    });

    const graph = (): ProjectGraphModel => ({
        nodes: [
            node('ctl', 'Controller', 'class', [[2, 0], [10, 1]]),
            node('register', 'register', 'method', [[5, 2], [9, 3]]),
            node('save', 'save', 'method', [[0, 0], [0, 4]]),
            node('user', 'User', 'class', [[12, 0], [12, 28]]),
            node('entity', 'Entity', 'class', [[0, 0], [0, 4]]),
            node('repoField', 'repo', 'field', [[3, 14], [3, 18]])
        ],
        edges: []
    });

    suiteSetup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-snippet-'));
        const file = path.join(dir, 'controller.dart');
        fs.writeFileSync(file, dart);
        fileUri = vscode.Uri.file(file).toString();
    });

    suiteTeardown(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('finds the exact line where the source references the target', () => {
        const s = buildSnippet(graph(), { sourceId: 'register', targetId: 'save' });
        assert.ok(s);
        assert.strictEqual(s.highlightLine, 8);
        assert.strictEqual(s.jump.start.line, 8);
        assert.strictEqual(s.jump.start.character, '    await repo.'.length);
        assert.strictEqual(s.jump.end.character - s.jump.start.character, 'save'.length);
        assert.strictEqual(s.lines[s.highlightLine! - s.startLine], '    await repo.save(user);');
        assert.strictEqual(s.title, 'register -> save');
    });

    test('ignores matches inside line comments', () => {
        const g = graph();
        g.nodes.push(node('later', 'later', 'method', [[0, 0], [0, 4]]));
        const s = buildSnippet(g, { sourceId: 'register', targetId: 'later' });
        assert.ok(s);
        assert.strictEqual(s.highlightLine, null);
        assert.strictEqual(s.jump.start.line, 5);
    });

    test('for a class reference it highlights the declaration header', () => {
        const s = buildSnippet(graph(), { sourceId: 'user', targetId: 'entity' });
        assert.ok(s);
        assert.strictEqual(s.highlightLine, 12);
        assert.strictEqual(s.jump.start.character, 'class User extends '.length);
    });

    test('a single node shows its own definition', () => {
        const s = buildSnippet(graph(), { nodeId: 'register' });
        assert.ok(s);
        assert.strictEqual(s.startLine, 5);
        assert.strictEqual(s.lines.length, 5);
        assert.strictEqual(s.highlightLine, null);
    });

    test('a one-line symbol gets surrounding context lines', () => {
        const s = buildSnippet(graph(), { nodeId: 'repoField' });
        assert.ok(s);
        assert.ok(s.lines.length > 1);
        assert.ok(s.startLine <= 3 && s.startLine + s.lines.length - 1 >= 3);
        assert.strictEqual(s.highlightLine, 3);
    });

    test('returns null for unknown nodes and unreadable files', () => {
        assert.strictEqual(buildSnippet(graph(), { nodeId: 'missing' }), null);
        const g = graph();
        g.nodes[0].data.fileUri = vscode.Uri.file(path.join(dir, 'nope.dart')).toString();
        assert.strictEqual(buildSnippet(g, { nodeId: 'ctl' }), null);
    });
});
