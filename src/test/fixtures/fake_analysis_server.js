// A stand-in for `dart language-server --protocol=analyzer`, used by the tests of the analysis client.
// Modes (first argument): "never-finishes" never reports the end of the analysis; "dies" exits after the roots are set.
const mode = process.argv[2] || '';
let buffer = '';
const send = message => process.stdout.write(JSON.stringify(message) + '\n');

process.stdin.on('data', chunk => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) { continue; }
        const { id, method, params } = JSON.parse(line);
        if (method === 'server.getVersion') {
            send({ id, result: { version: '9.9' } });
        } else if (method === 'server.setSubscriptions') {
            send({ id, result: {} });
        } else if (method === 'analysis.setAnalysisRoots') {
            send({ id, result: {} });
            if (mode === 'dies') { setTimeout(() => process.exit(1), 20); return; }
            send({ event: 'server.status', params: { analysis: { isAnalyzing: true } } });
            if (mode !== 'never-finishes') {
                setTimeout(() => send({ event: 'server.status', params: { analysis: { isAnalyzing: false } } }), 20);
            }
        } else if (method === 'analysis.getNavigation') {
            if (params.file.includes('missing')) {
                send({ id, error: { code: 'GET_NAVIGATION_INVALID_FILE', message: 'invalid file' } });
            } else {
                // Answers later than they were asked so that several requests overlap.
                setTimeout(() => send({
                    id,
                    result: {
                        files: [params.file],
                        targets: [{ kind: 'FIELD', fileIndex: 0, offset: params.length, length: 1, startLine: 1, startColumn: 1 }],
                        regions: [{ offset: 0, length: 1, targets: [0] }]
                    }
                }), 10 - Math.min(params.length, 9));
            }
        }
    }
});
