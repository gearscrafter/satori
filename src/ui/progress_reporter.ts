import { LoadingReporter, LoadingState, PhaseId, PhaseSnapshot, Throttle } from './loading_state';

/** The part of VS Code's notification progress this needs, so it can be tested without VS Code. */
export interface ProgressSink {
    report(value: { increment?: number; message?: string }): void;
}

export interface ReporterTexts {
    labels: Record<PhaseId, string>;
    elapsed: string;
}

function formatElapsed(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

/**
 * Tells the notification at the bottom right how the analysis is going: the step that is slowest right now, its
 * counter, the overall percentage and the elapsed time. The time keeps counting on its own every second, so a long
 * step that reports nothing still shows that the analysis is alive.
 */
export class NotificationReporter implements LoadingReporter {
    private readonly state: LoadingState;
    private readonly throttle: Throttle;
    private readonly startedAt: number;
    private lastOverall = 0;
    private ticker: ReturnType<typeof setInterval> | undefined;

    constructor(
        private readonly sink: ProgressSink,
        private readonly texts: ReporterTexts,
        private readonly now: () => number = Date.now,
        tickMs = 1000
    ) {
        this.state = new LoadingState(texts.labels);
        this.startedAt = now();
        this.throttle = new Throttle(() => this.emit(), 200, now);
        this.ticker = setInterval(() => this.emit(), tickMs);
        this.emit();
    }

    start(id: PhaseId, detail = ''): void { this.state.start(id, detail); this.throttle.request(); }
    progress(id: PhaseId, done: number, total: number, detail?: string): void { this.state.progress(id, done, total, detail); this.throttle.request(); }
    finish(id: PhaseId): void { this.state.finish(id); this.throttle.request(); }

    /** Stops the clock; call it when the analysis ends, however it ends. */
    release(): void {
        this.throttle.cancel();
        if (this.ticker) { clearInterval(this.ticker); this.ticker = undefined; }
    }

    /** The message for the current state. */
    message(): string {
        const snapshot = this.state.snapshot();
        const active = snapshot.phases.filter(p => p.status === 'active');
        // With two steps running side by side the one that is further behind is what the wait depends on.
        const slowest = active.sort((a, b) => fraction(a) - fraction(b))[0];
        const current = slowest ?? snapshot.phases.find(p => p.status === 'pending');
        const percent = `${Math.round(snapshot.overall * 100)}%`;
        const parts = [percent];
        if (current) {
            let text = current.label;
            if (current.total > 0) { text += ` (${current.done}/${current.total})`; }
            else if (current.detail) { text += ` - ${current.detail}`; }
            parts.push(text);
        }
        parts.push(`${this.texts.elapsed} ${formatElapsed(this.now() - this.startedAt)}`);
        return parts.join(' · ');
    }

    private emit(): void {
        const overall = this.state.snapshot().overall;
        const increment = Math.max(0, (overall - this.lastOverall) * 100);
        this.lastOverall = Math.max(this.lastOverall, overall);
        this.sink.report({ increment, message: this.message() });
    }
}

function fraction(p: PhaseSnapshot): number {
    return p.total > 0 ? p.done / p.total : 0;
}
