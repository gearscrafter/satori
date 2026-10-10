import { LoadingReporter, LoadingState, PhaseId, PhaseSnapshot, Throttle } from './loading_state';

/** The part of VS Code's notification progress this needs, so it can be tested without VS Code. */
export interface ProgressSink {
    report(value: { increment?: number; message?: string }): void;
}

export interface ReporterTexts {
    labels: Record<PhaseId, string>;
    elapsed: string;
    /** Short phrases to keep the wait company; none, and nothing is shown. */
    quips?: string[];
}

/** The first phrase appears after this long, so a quick analysis never shows one, and then one changes every so often. */
export const QUIP_FIRST_MS = 4000;
export const QUIP_EVERY_MS = 8000;

/** The phrases in a random order that uses each one before any is repeated (Fisher-Yates). */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
    const list = items.slice();
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
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
    private readonly quips: string[];
    private ticker: ReturnType<typeof setInterval> | undefined;

    constructor(
        private readonly sink: ProgressSink,
        private readonly texts: ReporterTexts,
        private readonly now: () => number = Date.now,
        tickMs = 1000,
        random: () => number = Math.random
    ) {
        this.quips = shuffled(texts.quips ?? [], random);
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
        const elapsed = this.now() - this.startedAt;
        parts.push(`${this.texts.elapsed} ${formatElapsed(elapsed)}`);
        const quip = this.quip(elapsed);
        if (quip) { parts.push(quip); }
        return parts.join(' · ');
    }

    /** The phrase for this moment of the wait: none at first, then one after another. */
    private quip(elapsedMs: number): string | undefined {
        if (this.quips.length === 0 || elapsedMs < QUIP_FIRST_MS) { return undefined; }
        const turn = Math.floor((elapsedMs - QUIP_FIRST_MS) / QUIP_EVERY_MS);
        return this.quips[turn % this.quips.length];
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
