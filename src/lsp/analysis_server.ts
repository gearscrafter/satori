import * as cp from 'child_process';

/**
 * A small client for Dart's own analysis server protocol (`dart language-server --protocol=analyzer`).
 *
 * Why it exists: the language server protocol can only answer "where is this symbol used?" one symbol at a time,
 * and a big project has tens of thousands of symbols. This server can answer, in one request per file, where every
 * identifier of the file points to. That makes the number of questions grow with the number of files instead of the
 * number of symbols.
 *
 * It speaks one JSON message per line over the standard input and output of the server process.
 */

export interface NavigationTarget {
    kind: string;
    fileIndex: number;
    offset: number;
    length: number;
    /** 1-based, like the protocol writes them. */
    startLine: number;
    startColumn: number;
}

export interface NavigationRegion {
    offset: number;
    length: number;
    /** Indexes into `targets`. */
    targets: number[];
}

export interface NavigationResult {
    files: string[];
    targets: NavigationTarget[];
    regions: NavigationRegion[];
}

type SpawnFn = (command: string, args: string[], options: cp.SpawnOptions) => cp.ChildProcess;

interface Pending {
    resolve: (message: any) => void;
    reject: (error: Error) => void;
}

export class DartAnalysisClient {
    private child: cp.ChildProcess | undefined;
    private buffer = '';
    private nextId = 1;
    private readonly pending = new Map<string, Pending>();
    private analysisFinished: (() => void) | undefined;
    private analysisFailed: ((error: Error) => void) | undefined;
    private closed = false;

    constructor(
        private readonly executable: string,
        private readonly args: string[] = ['language-server', '--protocol=analyzer'],
        private readonly spawnFn: SpawnFn = cp.spawn
    ) { }

    /** Starts the server and checks that it answers. */
    async start(): Promise<string> {
        // A script such as dart.bat needs a shell on Windows; a real executable does not.
        const needsShell = process.platform === 'win32' && /\.(bat|cmd)$/i.test(this.executable);
        this.child = this.spawnFn(this.executable, this.args, { stdio: ['pipe', 'pipe', 'ignore'], shell: needsShell });
        this.child.on('error', err => this.failAll(err));
        this.child.on('exit', () => { this.closed = true; this.failAll(new Error('the analysis server stopped')); });
        this.child.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString()));
        const reply = await this.request('server.getVersion', {});
        return String(reply.result?.version ?? '');
    }

    /**
     * Points the server at a project and waits until it has finished analysing it. `included` narrows the analysis
     * to some files or folders of it: the rest is only read as far as those files need it.
     */
    async analyze(root: string, timeoutMs: number, included: string[] = [root]): Promise<void> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finished = new Promise<void>((resolve, reject) => {
            this.analysisFinished = resolve;
            this.analysisFailed = reject;
            timer = setTimeout(() => reject(new Error('the analysis server did not finish in ' + Math.round(timeoutMs / 1000) + 's')), timeoutMs);
        });
        try {
            await this.request('server.setSubscriptions', { subscriptions: ['STATUS'] });
            await this.request('analysis.setAnalysisRoots', { included, excluded: [] });
            await finished;
        } finally {
            if (timer) { clearTimeout(timer); }
            this.analysisFinished = undefined;
            this.analysisFailed = undefined;
        }
    }

    /** Where every identifier of `file` points to. */
    async getNavigation(file: string, length: number): Promise<NavigationResult> {
        const reply = await this.request('analysis.getNavigation', { file, offset: 0, length });
        const result = reply.result;
        return { files: result?.files ?? [], targets: result?.targets ?? [], regions: result?.regions ?? [] };
    }

    dispose(): void {
        this.closed = true;
        try { this.child?.kill(); } catch { /* already gone */ }
        this.failAll(new Error('the analysis client was closed'));
    }

    private request(method: string, params: object): Promise<any> {
        if (this.closed || !this.child?.stdin) {
            return Promise.reject(new Error('the analysis server is not running'));
        }
        const id = String(this.nextId++);
        return new Promise((resolve, reject) => {
            this.pending.set(id, {
                resolve: message => message.error ? reject(new Error(`${message.error.code}: ${message.error.message}`)) : resolve(message),
                reject
            });
            this.child!.stdin!.write(JSON.stringify({ id, method, params }) + '\n');
        });
    }

    private onData(text: string): void {
        this.buffer += text;
        let newline: number;
        while ((newline = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            if (!line) { continue; }
            let message: any;
            try { message = JSON.parse(line); } catch { continue; }
            if (message.id !== undefined && this.pending.has(String(message.id))) {
                const pending = this.pending.get(String(message.id))!;
                this.pending.delete(String(message.id));
                pending.resolve(message);
            } else if (message.event === 'server.status' && message.params?.analysis && message.params.analysis.isAnalyzing === false) {
                this.analysisFinished?.();
            }
        }
    }

    private failAll(error: Error): void {
        this.analysisFailed?.(error);
        this.pending.forEach(p => p.reject(error));
        this.pending.clear();
    }
}
