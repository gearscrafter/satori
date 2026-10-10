// Runs inside the VS Code extension host, on a throwaway copy of mono_app (see run_monorepo.js):
// a monorepo with no pubspec.yaml at its root and two packages below it.
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

exports.run = async function run() {
    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const satori = vscode.extensions.getExtension('gearscrafter.satori');
    const dart = vscode.extensions.getExtension('Dart-Code.dart-code');
    await dart.activate();
    const api = await satori.activate();
    const app = path.join(root, 'packages', 'app');

    await waitFor('document symbols', async () => {
        const syms = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', vscode.Uri.file(path.join(app, 'lib', 'app.dart')));
        return Array.isArray(syms) && syms.length > 0;
    }, 180000);

    const classes = () => (api.getGraph() ? api.getGraph().nodes.filter(n => n.kind === 'class').map(n => n.label).sort() : []);

    await check('the root has no pubspec.yaml and the packages do', () => {
        assert.ok(!fs.existsSync(path.join(root, 'pubspec.yaml')));
        assert.ok(fs.existsSync(path.join(app, 'pubspec.yaml')));
        assert.ok(fs.existsSync(path.join(root, 'packages', 'core', 'pubspec.yaml')));
    });

    await vscode.commands.executeCommand('satori.clearCache');
    await vscode.commands.executeCommand('satori.analyzeProject', vscode.Uri.file(app));
    await check('a folder given to the command is analysed without asking', () => {
        assert.deepStrictEqual(classes(), ['AppScreen', 'AppState']);
    });

    await vscode.commands.executeCommand('satori.analyzeProject', path.join(root, 'packages', 'core'));
    await check('a path works as well as a URI, and gives the other package', () => {
        assert.deepStrictEqual(classes(), ['Repo']);
    });

    // With a single package below the root nothing has to be asked: it is the project.
    fs.rmSync(path.join(root, 'packages', 'core'), { recursive: true, force: true });
    await sleep(1500);
    await vscode.commands.executeCommand('satori.clearCache');
    await vscode.commands.executeCommand('satori.analyzeProject');
    await check('with one package below the root it is analysed straight away', () => {
        assert.deepStrictEqual(classes(), ['AppScreen', 'AppState']);
    });

    await vscode.commands.executeCommand('satori.reanalyze');
    await check('analysing again keeps the same package', () => {
        assert.deepStrictEqual(classes(), ['AppScreen', 'AppState']);
    });

    const failed = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} monorepo checks passed`);
    if (failed > 0) { throw new Error(`${failed} monorepo check(s) failed`); }
};
