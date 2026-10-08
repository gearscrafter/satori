// Runs inside the VS Code extension host (see run.js):
//   SATORI_E2E_PROJECT=e2e/clean_app SATORI_E2E_SUITE=e2e/suite_architecture.js node e2e/run.js
// Checks that the layers and the rules of satori.json reach the graph and the audit.
const vscode = require('vscode');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(description, fn, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try { const v = await fn(); if (v) { return v; } } catch { /* retry */ }
        await sleep(1000);
    }
    throw new Error(`Timed out waiting for: ${description}`);
}

const results = [];
async function check(name, fn) {
    try { await fn(); results.push({ name, ok: true }); console.log(`  PASS ${name}`); }
    catch (e) { results.push({ name, ok: false }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

exports.run = async function run() {
    const projectRoot = path.resolve(__dirname, 'clean_app');
    const satori = vscode.extensions.getExtension('gearscrafter.satori');
    const dart = vscode.extensions.getExtension('Dart-Code.dart-code');
    await dart.activate();
    const api = await satori.activate();

    const probe = vscode.Uri.file(path.join(projectRoot, 'lib', 'domain', 'user.dart'));
    await waitFor('document symbols', async () => {
        const syms = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', probe);
        return Array.isArray(syms) && syms.length > 0;
    }, 120000);

    await vscode.commands.executeCommand('satori.analyzeProject');
    const graph = api.getGraph();
    if (process.env.SATORI_E2E_GRAPH_OUT) { fs.writeFileSync(process.env.SATORI_E2E_GRAPH_OUT, JSON.stringify(graph, null, 1)); }
    const layerOf = label => {
        const n = graph.nodes.find(x => x.kind === 'class' && x.label === label) || graph.nodes.find(x => x.label === label);
        return n && n.data.layer;
    };

    await check('classes are placed by the folder they live in', () => {
        assert.strictEqual(layerOf('LoginPage'), 'presentation');
        assert.strictEqual(layerOf('RemoteUserRepository'), 'data');
        assert.strictEqual(layerOf('Logger'), 'core');
        assert.strictEqual(layerOf('User'), 'domain');
    });

    await check('a folder wins over a name: UserRepository lives in domain although its name says data', () => {
        assert.strictEqual(layerOf('UserRepository'), 'domain');
    });

    await check('a name places a class that is in no listed folder', () => {
        assert.strictEqual(layerOf('LoginUseCase'), 'domain');
    });

    await check('no class is left with a layer that satori.json does not have', () => {
        const allowed = new Set(['presentation', 'domain', 'data', 'core', 'member']);
        const stray = graph.nodes.filter(n => n.data && n.data.layer && !allowed.has(n.data.layer)).map(n => `${n.label}:${n.data.layer}`);
        assert.deepStrictEqual(stray, []);
    });

    await check('the rules of satori.json find the presentation -> data shortcut and nothing else', () => {
        const TrailModel = require(path.resolve(__dirname, '..', 'media', 'trail', 'trail_model.js'));
        const file = JSON.parse(fs.readFileSync(path.join(projectRoot, 'satori.json'), 'utf8')).architecture;
        const architecture = { layers: file.layers, neutral: 'core', mode: file.rules.mode, allow: file.rules.allow };
        const model = TrailModel.createModel(graph, { architecture, projectRoot });
        const found = model.audit().violations.map(v => `${v.sourceLabel} > ${v.targetLabel}`);
        assert.deepStrictEqual(found, ['LoginPage > RemoteUserRepository']);
    });

    await check('the same graph under the default layers has no such rule', () => {
        const TrailModel = require(path.resolve(__dirname, '..', 'media', 'trail', 'trail_model.js'));
        const model = TrailModel.createModel(graph, {});
        assert.ok(!model.audit().violations.some(v => v.sourceLabel === 'LoginPage'));
    });

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} architecture checks passed`);
    if (failed.length) { throw new Error(`${failed.length} architecture checks failed`); }
};
