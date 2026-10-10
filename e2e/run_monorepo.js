// Runs e2e/suite_monorepo.js on a throwaway copy of e2e/mono_app, because the suite deletes a package.
//   node e2e/run_monorepo.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-monorepo-'));
fs.cpSync(path.join(__dirname, 'mono_app'), copy, { recursive: true });

const env = {
    ...process.env,
    SATORI_E2E_PROJECT: copy,
    SATORI_E2E_SUITE: path.join(__dirname, 'suite_monorepo.js')
};
delete env.ELECTRON_RUN_AS_NODE;
const run = cp.spawnSync(process.execPath, [path.join(__dirname, 'run.js')], { stdio: 'inherit', env });
fs.rmSync(copy, { recursive: true, force: true });
process.exit(run.status ?? 1);
