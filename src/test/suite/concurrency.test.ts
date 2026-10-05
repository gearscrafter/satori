import * as assert from 'assert';
import { mapLimited, retryUntil } from '../../core';

suite('Concurrency Helpers Test Suite', () => {
    test('retryUntil returns at once when the first answer is good', async () => {
        const waits: number[] = [];
        const outcome = await retryUntil(async () => [1], r => r.length > 0, [10, 20], async ms => { waits.push(ms); });
        assert.deepStrictEqual([outcome.attempts, outcome.exhausted, waits], [1, false, []]);
    });

    test('retryUntil waits between attempts and stops once the answer is good', async () => {
        const waits: number[] = [];
        let calls = 0;
        const outcome = await retryUntil(async () => (++calls < 3 ? [] : [42]), r => r.length > 0, [250, 750, 1500], async ms => { waits.push(ms); });
        assert.deepStrictEqual(outcome.result, [42]);
        assert.deepStrictEqual([outcome.attempts, outcome.exhausted, waits], [3, false, [250, 750]]);
    });

    test('retryUntil reports exhaustion when the answer never becomes good', async () => {
        const waits: number[] = [];
        const outcome = await retryUntil(async () => [] as number[], r => r.length > 0, [1, 2, 3], async ms => { waits.push(ms); });
        assert.deepStrictEqual([outcome.attempts, outcome.exhausted, waits], [4, true, [1, 2, 3]]);
    });

    test('retryUntil without delays asks exactly once', async () => {
        let calls = 0;
        const outcome = await retryUntil(async () => { calls++; return null; }, r => r !== null, []);
        assert.deepStrictEqual([calls, outcome.attempts, outcome.exhausted], [1, 1, true]);
    });

    test('mapLimited keeps input order and never exceeds the limit', async () => {
        let running = 0;
        let peak = 0;
        const results = await mapLimited([5, 1, 4, 2, 3, 6, 0], 3, async n => {
            running++;
            peak = Math.max(peak, running);
            await new Promise(resolve => setTimeout(resolve, n));
            running--;
            return n * 10;
        });
        assert.deepStrictEqual(results, [50, 10, 40, 20, 30, 60, 0]);
        assert.ok(peak <= 3 && peak > 1, 'peak concurrency was ' + peak);
    });

    test('mapLimited copes with an empty list and a limit larger than the list', async () => {
        assert.deepStrictEqual(await mapLimited([], 4, async n => n), []);
        assert.deepStrictEqual(await mapLimited([1, 2], 10, async n => n + 1), [2, 3]);
    });
});
