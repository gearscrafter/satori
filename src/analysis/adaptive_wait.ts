import { SymbolStats, symbolsLookComplete } from './analysis_health';

/**
 * Waits for Dart's language server to be ready, for as long as it is getting there.
 *
 * Right after it starts it answers "no symbols" for most files, and how long it needs depends on the size of the
 * project: seconds for a small one, a minute or two for a big one. A fixed wait is too short for the big ones and
 * too long for a project that really has nothing to find. So it asks again in rounds, only about the files that
 * came back empty, and keeps waiting while each round brings more files back than the last. It stops when the
 * answers are complete, when they stop improving, or when the rounds run out.
 */
export interface WaitOptions {
    /** How long to wait before each round. The number of rounds is its length. */
    delaysMs: number[];
    /** Rounds in a row without a single new file with symbols before giving up. */
    stallLimit: number;
    sleep: (ms: number) => Promise<void>;
    /** Asks again about the files that are still empty and returns how it stands. */
    round: (number: number) => Promise<SymbolStats>;
    /** Told before each wait, to show it. */
    onWait?: (round: number, delayMs: number, stats: SymbolStats) => void;
}

export type WaitEnd = 'complete' | 'stalled' | 'ran-out';

export interface WaitResult {
    rounds: number;
    waitedMs: number;
    stats: SymbolStats;
    end: WaitEnd;
}

/** 3 s, then 5, 8, 12, 15, 20, 25 and 30: about two minutes in all, the first rounds short so a small project is not kept waiting. */
export const DEFAULT_DELAYS_MS = [3000, 5000, 8000, 12000, 15000, 20000, 25000, 30000];

export async function waitForSymbols(initial: SymbolStats, options: WaitOptions): Promise<WaitResult> {
    let stats = initial;
    let best = initial.withSymbols;
    let stalled = 0;
    let waited = 0;
    let rounds = 0;
    for (let i = 0; i < options.delaysMs.length; i++) {
        if (symbolsLookComplete(stats)) { return { rounds, waitedMs: waited, stats, end: 'complete' }; }
        const delay = options.delaysMs[i];
        options.onWait?.(i + 1, delay, stats);
        await options.sleep(delay);
        waited += delay;
        stats = await options.round(i + 1);
        rounds++;
        if (stats.withSymbols > best) { best = stats.withSymbols; stalled = 0; } else { stalled++; }
        if (symbolsLookComplete(stats)) { return { rounds, waitedMs: waited, stats, end: 'complete' }; }
        if (stalled >= options.stallLimit) { return { rounds, waitedMs: waited, stats, end: 'stalled' }; }
    }
    return { rounds, waitedMs: waited, stats, end: symbolsLookComplete(stats) ? 'complete' : 'ran-out' };
}
