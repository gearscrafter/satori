// Runs inside the VS Code extension host, on a throwaway copy of dummy_app (see run_incremental.js).
// Checks that analysing again only what changed gives exactly the graph a full analysis gives.
const vscode = require('vscode');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(description, fn, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try { const v = await fn(); if (v) { return v; } } catch { /* retry */ }
        await sleep(500);
    }
    throw new Error(`Timed out waiting for: ${description}`);
}

const results = [];
async function check(name, fn) {
    try { await fn(); results.push({ name, ok: true }); console.log(`  PASS ${name}`); }
    catch (e) { results.push({ name, ok: false }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/** A graph written so two of them compare equal when they draw the same thing (edge ids are only a counter). */
function canonical(graph) {
    const nodes = graph.nodes.map(n => JSON.stringify(n)).sort();
    const edges = graph.edges.map(e => `${e.source}|${e.target}|${e.label}`).sort();
    return { nodes, edges };
}

function firstDifference(a, b) {
    const left = new Set(a);
    const right = new Set(b);
    const onlyA = a.filter(x => !right.has(x)).slice(0, 3);
    const onlyB = b.filter(x => !left.has(x)).slice(0, 3);
    return `only in the incremental one: ${JSON.stringify(onlyA).slice(0, 600)}\n       only in the full one: ${JSON.stringify(onlyB).slice(0, 600)}`;
}

exports.run = async function run() {
    const projectRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const storage = process.env.SATORI_E2E_STORAGE;
    const satori = vscode.extensions.getExtension('gearscrafter.satori');
    const dart = vscode.extensions.getExtension('Dart-Code.dart-code');
    await dart.activate();
    const api = await satori.activate();
    const lib = (...p) => path.join(projectRoot, 'lib', ...p);

    const probe = vscode.Uri.file(lib('main.dart'));
    await waitFor('document symbols', async () => {
        const syms = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', probe);
        return Array.isArray(syms) && syms.length > 0;
    }, 180000);

    const stateFiles = () => fs.existsSync(storage) ? fs.readdirSync(storage).filter(n => /\.state\.json$/.test(n)) : [];
    const analyse = async command => {
        const t0 = Date.now();
        await vscode.commands.executeCommand(command);
        return { graph: api.getGraph(), engine: api.getStats().timings.engine, ms: Date.now() - t0 };
    };
    const edit = (file, fn) => fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8')));

    await vscode.commands.executeCommand('satori.clearCache');
    const first = await analyse('satori.analyzeProject');
    await waitFor('the saved state', () => stateFiles().length > 0, 60000);

    await check('the first analysis is a full one and leaves its state saved', () => {
        assert.notStrictEqual(first.engine, 'incremental');
        assert.strictEqual(stateFiles().length, 1);
        assert.ok(first.graph.nodes.length > 50, 'the graph has nodes');
    });

    // The state is read when a file has changed since: a changed file whose declarations move, a new one, a deleted one.
    await new Promise(r => setTimeout(r, 1200)); // modification times differ at least a second
    edit(lib('models', 'product.dart'), text => text.replace('class Product extends Entity {', 'class Product extends Entity {\n  // A new member above the others moves every declaration below it.\n  bool get isFree => price == 0;\n'));
    fs.writeFileSync(lib('utils', 'extra.dart'), "import '../models/product.dart';\nimport '../models/cart.dart';\n\nclass CartSummary {\n  final Cart cart;\n  CartSummary(this.cart);\n  Product? cheapest() => cart.items.isEmpty ? null : Product('x', 'x', 0).discounted(10);\n}\n");
    fs.unlinkSync(lib('utils', 'formatters.dart'));

    const incremental = await analyse('satori.analyzeProject');
    await waitFor('the saved state again', () => stateFiles().length > 0, 60000);

    await check('after a few changes the analysis is incremental', () => {
        assert.strictEqual(incremental.engine, 'incremental');
    });

    await check('the new class is in the graph and the deleted file is gone', () => {
        assert.ok(incremental.graph.nodes.some(n => n.kind === 'class' && n.label === 'CartSummary'));
        assert.ok(!incremental.graph.nodes.some(n => /formatters\.dart/.test(n.data.fileUri || '')));
        assert.ok(incremental.graph.nodes.some(n => n.label === 'isFree'));
    });

    const full = await analyse('satori.reanalyze');
    await check('the incremental graph is exactly the graph of a full analysis', () => {
        assert.notStrictEqual(full.engine, 'incremental');
        const a = canonical(incremental.graph);
        const b = canonical(full.graph);
        assert.strictEqual(a.nodes.length, b.nodes.length, `nodes: ${a.nodes.length} vs ${b.nodes.length}`);
        assert.strictEqual(a.edges.length, b.edges.length, `edges: ${a.edges.length} vs ${b.edges.length}`);
        const sameNodes = JSON.stringify(a.nodes) === JSON.stringify(b.nodes);
        const sameEdges = JSON.stringify(a.edges) === JSON.stringify(b.edges);
        assert.ok(sameNodes, 'nodes differ\n       ' + firstDifference(a.nodes, b.nodes));
        assert.ok(sameEdges, 'edges differ\n       ' + firstDifference(a.edges, b.edges));
    });

    // A second round on top of the state an incremental analysis saved.
    await waitFor('the saved state after the full analysis', () => stateFiles().length > 0, 60000);
    await new Promise(r => setTimeout(r, 1200));
    edit(lib('services', 'api_client.dart'), text => text + '\n// touched\nint apiVersion() => 2;\n');
    const second = await analyse('satori.analyzeProject');
    await waitFor('the saved state after the second round', () => stateFiles().length > 0, 60000);
    await new Promise(r => setTimeout(r, 1200));
    edit(lib('models', 'user.dart'), text => text + '\n// touched\nint userVersion() => 3;\n');
    const third = await analyse('satori.analyzeProject');
    const fullAgain = await analyse('satori.reanalyze');

    await check('changes on top of an incremental analysis still give the full graph', () => {
        assert.strictEqual(second.engine, 'incremental');
        assert.strictEqual(third.engine, 'incremental');
        const a = canonical(third.graph);
        const b = canonical(fullAgain.graph);
        assert.ok(JSON.stringify(a.nodes) === JSON.stringify(b.nodes), 'nodes differ\n       ' + firstDifference(a.nodes, b.nodes));
        assert.ok(JSON.stringify(a.edges) === JSON.stringify(b.edges), 'edges differ\n       ' + firstDifference(a.edges, b.edges));
    });

    console.log(`  TIME full ${first.ms} ms, incremental ${incremental.ms} ms, full again ${full.ms} ms, incremental (1 file) ${second.ms} ms`);

    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} incremental checks passed`);
    if (failed > 0) { throw new Error(`${failed} incremental check(s) failed`); }
};
