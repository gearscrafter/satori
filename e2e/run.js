// End-to-end runner: launches VS Code with the real Dart extension, opens e2e/dummy_app
// and runs e2e/suite.js against the built bundle (dist/extension.js).
// Usage: npm run test:e2e
const path = require('path');
const cp = require('child_process');
const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } = require('@vscode/test-electron');

async function main() {
    const root = path.resolve(__dirname, '..');
    const extensionsDir = path.join(root, '.vscode-test', 'extensions');

    const vscodeExecutablePath = await downloadAndUnzipVSCode();
    const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    const install = cp.spawnSync(
        cli,
        [...cliArgs, '--extensions-dir', extensionsDir, '--install-extension', 'Dart-Code.dart-code'],
        { stdio: 'inherit', shell: process.platform === 'win32' }
    );
    if (install.status !== 0) {
        throw new Error('Could not install Dart-Code.dart-code into the test instance');
    }

    // SATORI_E2E_PROJECT and SATORI_E2E_SUITE let a different project or check be tried with the same launcher.
    await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath: root,
        extensionTestsPath: process.env.SATORI_E2E_SUITE || path.join(__dirname, 'suite.js'),
        launchArgs: [
            process.env.SATORI_E2E_PROJECT || path.join(__dirname, 'dummy_app'),
            '--disable-workspace-trust',
            '--skip-welcome',
            '--skip-release-notes'
        ]
    });
}

delete process.env.ELECTRON_RUN_AS_NODE;
main().catch(err => {
    console.error(err);
    process.exit(1);
});
