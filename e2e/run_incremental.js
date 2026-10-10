// Runs e2e/suite_incremental.js on a throwaway copy of e2e/dummy_app, because the suite edits, adds and deletes files.
//   node e2e/run_incremental.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-incremental-'));
fs.cpSync(path.join(__dirname, 'dummy_app'), copy, { recursive: true, filter: src => !/[\\/]\.dart_tool([\\/]|$)/.test(src) });

const env = {
    ...process.env,
    SATORI_E2E_PROJECT: copy,
    SATORI_E2E_SUITE: path.join(__dirname, 'suite_incremental.js'),
    SATORI_E2E_STORAGE: path.join(root, '.vscode-test', 'user-data', 'User', 'globalStorage', 'gearscrafter.satori')
};
delete env.ELECTRON_RUN_AS_NODE;
const run = cp.spawnSync(process.execPath, [path.join(__dirname, 'run.js')], { stdio: 'inherit', env });
fs.rmSync(copy, { recursive: true, force: true });
process.exit(run.status ?? 1);
