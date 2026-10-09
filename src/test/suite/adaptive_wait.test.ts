import * as assert from 'assert';
import { DEFAULT_DELAYS_MS, WaitOptions, waitForSymbols } from '../../analysis/adaptive_wait';
import { SymbolStats } from '../../analysis/analysis_health';

const stats = (withSymbols: number, files = 100): SymbolStats => ({ files, withSymbols, errors: 0 });

/** A server that answers with these counts, round after round, and a clock that never really waits. */
function scripted(answers: number[], delaysMs = DEFAULT_DELAYS_MS, stallLimit = 2) {
    const log = { slept: [] as number[], asked: 0, announced: [] as number[] };
    const options: WaitOptions = {
        delaysMs, stallLimit,
        sleep: async ms => { log.slept.push(ms); },
        round: async n => { log.asked++; return stats(answers[Math.min(n - 1, answers.length - 1)]); },
        onWait: round => { log.announced.push(round); }
    };
    return { options, log };
}

suite('Adaptive Wait Test Suite', () => {
    test('an answer that is already complete does not wait at all', async () => {
        const { options, log } = scripted([100]);
        const result = await waitForSymbols(stats(80), options);
        assert.strictEqual(result.end, 'complete');
        assert.strictEqual(result.rounds, 0);
        assert.deepStrictEqual(log.slept, []);
    });

    test('keeps waiting while each round brings more files, and stops as soon as it is complete', async () => {
        const { options, log } = scripted([5, 12, 30, 48, 60]);
        const result = await waitForSymbols(stats(0), options);
        assert.strictEqual(result.end, 'complete');
        assert.strictEqual(result.rounds, 5);
        assert.strictEqual(result.stats.withSymbols, 60);
        assert.deepStrictEqual(log.slept, [3000, 5000, 8000, 12000, 15000]);
        assert.strictEqual(result.waitedMs, 43000);
    });

    test('a project with nothing to find stops after the first two quiet rounds, as the fixed wait did', async () => {
        const { options, log } = scripted([0, 0, 0, 0]);
        const result = await waitForSymbols(stats(0), options);
        assert.strictEqual(result.end, 'stalled');
        assert.strictEqual(result.rounds, 2);
        assert.deepStrictEqual(log.slept, [3000, 5000]);
        assert.strictEqual(result.waitedMs, 8000);
    });

    test('a slow start does not count as stalled once files begin to come back', async () => {
        const { options } = scripted([0, 4, 4, 20, 55]);
        const result = await waitForSymbols(stats(0), options);
        assert.strictEqual(result.end, 'complete');
        assert.strictEqual(result.rounds, 5);
    });

    test('a quiet round only counts against it when it is followed by another', async () => {
        const { options } = scripted([10, 10, 30, 60]);
        const result = await waitForSymbols(stats(0), options);
        assert.strictEqual(result.end, 'complete', 'one quiet round in a row is below the limit of two');
    });

    test('it gives up when the rounds run out, never waiting forever', async () => {
        let n = 0;
        const options: WaitOptions = {
            delaysMs: [10, 10, 10], stallLimit: 99, sleep: async () => undefined,
            round: async () => stats(++n)   // always improving, never enough
        };
        const result = await waitForSymbols(stats(0), options);
        assert.strictEqual(result.end, 'ran-out');
        assert.strictEqual(result.rounds, 3);
    });

    test('the total wait has a ceiling of about two minutes', () => {
        const total = DEFAULT_DELAYS_MS.reduce((a, b) => a + b, 0);
        assert.ok(total >= 100000 && total <= 130000, String(total));
    });

    test('each wait is announced with its round number', async () => {
        const { options, log } = scripted([0, 0]);
        await waitForSymbols(stats(0), options);
        assert.deepStrictEqual(log.announced, [1, 2]);
    });

    test('an analysis that finishes on the last round is complete, not ran-out', async () => {
        const { options } = scripted([10, 20, 70], [1, 1, 1], 99);
        const result = await waitForSymbols(stats(0), options);
        assert.strictEqual(result.end, 'complete');
    });
});
