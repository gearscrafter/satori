// Runs inside the VS Code extension host (see run.js).
const vscode = require('vscode');
const assert = require('assert');
const path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(description, fn, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
        try {
            last = await fn();
            if (last) { return last; }
        } catch { /* retry */ }
        await sleep(1000);
    }
    throw new Error(`Timed out waiting for: ${description}`);
}

const results = [];
async function check(name, fn) {
    try {
        await fn();
        results.push({ name, ok: true });
        console.log(`  PASS ${name}`);
    } catch (e) {
        results.push({ name, ok: false, error: e });
        console.log(`  FAIL ${name}\n       ${e.message}`);
    }
}

exports.run = async function run() {
    const projectRoot = path.resolve(__dirname, 'dummy_app');
    const satori = vscode.extensions.getExtension('gearscrafter.satori');
    assert.ok(satori, 'Satori extension should be loaded');

    const dart = vscode.extensions.getExtension('Dart-Code.dart-code');
    assert.ok(dart, 'Dart-Code should be installed in the test instance');
    await dart.activate();
    const api = await satori.activate();

    const userUri = vscode.Uri.file(path.join(projectRoot, 'lib', 'models', 'user.dart'));
    console.log('Waiting for the Dart analysis server to serve symbols...');
    await waitFor('document symbols for user.dart', async () => {
        const syms = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', userUri);
        return Array.isArray(syms) && syms.length > 0;
    }, 180000);

    console.log('Running satori.analyzeProject on e2e/dummy_app');
    await check('commands are registered', async () => {
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(cmds.includes('satori.analyzeProject'));
        assert.ok(cmds.includes('extension.showProjectDiagram'));
    });

    await vscode.commands.executeCommand('satori.analyzeProject');

    await check('graph webview tab is open', async () => {
        const labels = vscode.window.tabGroups.all.flatMap(g => g.tabs.map(t => t.label));
        assert.ok(labels.includes('AST Diagram'), `tabs: ${JSON.stringify(labels)}`);
    });

    const graph = api && api.getGraph();
    if (graph && process.env.SATORI_E2E_GRAPH_OUT) {
        require('fs').writeFileSync(process.env.SATORI_E2E_GRAPH_OUT, JSON.stringify(graph, null, 1));
    }
    await check('extension exposes the analyzed graph', async () => {
        assert.ok(graph, 'getGraph() returned nothing');
        assert.ok(graph.nodes.length > 0, 'graph has no nodes');
    });

    if (graph) {
        const byId = new Map(graph.nodes.map(n => [n.id, n]));
        const label = id => (byId.get(id) || {}).label || id;
        const classes = graph.nodes.filter(n => n.kind === 'class').map(n => n.label);
        const edges = graph.edges.map(e => `${label(e.source)} -${e.label}-> ${label(e.target)}`);
        console.log(`Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
        console.log(`Classes: ${classes.join(', ')}`);
        console.log(`Edges:\n  ${edges.join('\n  ')}`);

        await check('all dummy classes become class nodes', async () => {
            for (const c of ['Entity', 'User', 'Repository', 'UserRepository', 'UserController', 'UserView']) {
                assert.ok(classes.includes(c), `missing class node ${c}`);
            }
        });
        const layerOf = name => (graph.nodes.find(n => n.kind === 'class' && n.label === name) || { data: {} }).data.layer;
        console.log('Layers: ' + ['Entity','User','Timestamped','Repository','UserRepository','UserController','UserView'].map(n => n + '=' + layerOf(n)).join(', '));
        await check('classes are assigned to the expected layers', async () => {
            assert.strictEqual(layerOf('UserView'), 'view');
            assert.strictEqual(layerOf('UserController'), 'state');
            assert.strictEqual(layerOf('UserRepository'), 'service');
            assert.strictEqual(layerOf('User'), 'model');
        });
        await check('User EXTENDS Entity', async () => {
            assert.ok(edges.includes('User -EXTENDS-> Entity'));
        });
        await check('UserRepository IMPLEMENTS Repository', async () => {
            assert.ok(edges.includes('UserRepository -IMPLEMENTS-> Repository'));
        });
        await check('project classes are not mislabeled as external packages', async () => {
            assert.ok(graph.nodes.every(n => !n.label.startsWith('🔗')), 'project node labelled as external package');
        });
        await check('external-package nodes do not leak into project classes', async () => {
            assert.ok(!classes.includes('DateTime'));
        });
    }

    await check('webview loads inside VS Code and reports ready', async () => {
        await waitFor('webview ready handshake', () => api.getStats().webviewReady, 30000);
    });

    await check('webview navigates, asks for relationships and serves code snippets', async () => {
        const controller = graph.nodes.find(n => n.kind === 'class' && n.label === 'UserController');
        assert.ok(controller, 'UserController node not found');
        const before = api.getStats();
        await api.focusNode(controller.id);
        await waitFor('webview to react to setFocusInGraph', () => {
            const s = api.getStats();
            return s.relationshipUpdates > before.relationshipUpdates && s.snippetsServed > before.snippetsServed;
        }, 15000);
    });

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed`);
    if (failed.length) {
        throw new Error(`${failed.length} e2e checks failed`);
    }
};
