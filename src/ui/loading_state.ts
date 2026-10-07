/**
 * What the loading screen shows: the steps of the analysis, which one is running, and how far it has got.
 * Several steps can run at the same time (Dart's analysis server reads the project while the symbols are read),
 * so each step has its own state instead of there being one "current step".
 */
export type PhaseId = 'files' | 'symbols' | 'relations' | 'types' | 'graph' | 'draw';

export const PHASE_ORDER: PhaseId[] = ['files', 'symbols', 'relations', 'types', 'graph', 'draw'];

export type PhaseStatus = 'pending' | 'active' | 'done';

export interface PhaseSnapshot {
    id: PhaseId;
    label: string;
    status: PhaseStatus;
    done: number;
    total: number;
    detail: string;
}

export interface LoadingSnapshot {
    phases: PhaseSnapshot[];
    /** Whole-analysis progress from 0 to 1, a weighted mean of the steps. */
    overall: number;
}

/** How much each step counts towards the overall bar; it is a guess of their usual share of the time. */
const WEIGHT: Record<PhaseId, number> = { files: 0.03, symbols: 0.3, relations: 0.3, types: 0.12, graph: 0.2, draw: 0.05 };

/** What the steps of the analysis tell the person waiting. */
export interface LoadingReporter {
    start(id: PhaseId, detail?: string): void;
    progress(id: PhaseId, done: number, total: number, detail?: string): void;
    finish(id: PhaseId): void;
    /** Called when the analysis is over, so nothing keeps running. */
    release?(): void;
}

export const silentReporter: LoadingReporter = { start: () => undefined, progress: () => undefined, finish: () => undefined };

export class LoadingState {
    private readonly phases = new Map<PhaseId, PhaseSnapshot>();

    constructor(labels: Record<PhaseId, string>) {
        for (const id of PHASE_ORDER) {
            this.phases.set(id, { id, label: labels[id], status: 'pending', done: 0, total: 0, detail: '' });
        }
    }

    start(id: PhaseId, detail = ''): void {
        const phase = this.phases.get(id)!;
        if (phase.status === 'done') { return; }
        phase.status = 'active';
        phase.detail = detail;
    }

    progress(id: PhaseId, done: number, total: number, detail?: string): void {
        const phase = this.phases.get(id)!;
        if (phase.status === 'done') { return; }
        phase.status = 'active';
        phase.done = Math.max(0, Math.min(done, total));
        phase.total = Math.max(0, total);
        if (detail !== undefined) { phase.detail = detail; }
    }

    finish(id: PhaseId): void {
        const phase = this.phases.get(id)!;
        phase.status = 'done';
        phase.done = phase.total;
        phase.detail = '';
    }

    snapshot(): LoadingSnapshot {
        const phases = PHASE_ORDER.map(id => ({ ...this.phases.get(id)! }));
        let overall = 0;
        for (const phase of phases) {
            const fraction = phase.status === 'done' ? 1 : phase.status === 'active' && phase.total > 0 ? phase.done / phase.total : 0;
            overall += WEIGHT[phase.id] * fraction;
        }
        return { phases, overall: Math.min(1, overall) };
    }
}

/** Passes `snapshot` on at most once every `minGapMs` (and always the last one), so a fast loop does not flood the page. */
export class Throttle {
    private last = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly send: () => void, private readonly minGapMs = 150, private readonly now: () => number = Date.now) { }

    request(): void {
        const wait = this.last + this.minGapMs - this.now();
        if (wait <= 0) {
            this.flush();
        } else if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), wait);
        }
    }

    flush(): void {
        if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
        this.last = this.now();
        this.send();
    }

    cancel(): void {
        if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    }
}
