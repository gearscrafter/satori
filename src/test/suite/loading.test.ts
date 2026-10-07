import * as assert from 'assert';
import { LoadingState, PHASE_ORDER, Throttle, PhaseId } from '../../ui/loading_state';
import { NotificationReporter } from '../../ui/progress_reporter';
import { mapLimited } from '../../core';

const labels = Object.fromEntries(PHASE_ORDER.map(id => [id, id.toUpperCase()])) as Record<PhaseId, string>;

suite('Loading State Test Suite', () => {
    test('starts with every step waiting and nothing done', () => {
        const snap = new LoadingState(labels).snapshot();
        assert.deepStrictEqual(snap.phases.map(p => p.status), PHASE_ORDER.map(() => 'pending'));
        assert.strictEqual(snap.overall, 0);
    });

    test('several steps can run at once', () => {
        const state = new LoadingState(labels);
        state.start('symbols');
        state.start('relations', 'starting');
        const active = state.snapshot().phases.filter(p => p.status === 'active').map(p => p.id);
        assert.deepStrictEqual(active, ['symbols', 'relations']);
    });

    test('keeps the count between 0 and the total', () => {
        const state = new LoadingState(labels);
        state.progress('symbols', 5, 10);
        assert.strictEqual(state.snapshot().phases[1].done, 5);
        state.progress('symbols', 99, 10);
        assert.strictEqual(state.snapshot().phases[1].done, 10);
        state.progress('symbols', -4, 10);
        assert.strictEqual(state.snapshot().phases[1].done, 0);
    });

    test('a finished step stays finished, whatever arrives afterwards', () => {
        const state = new LoadingState(labels);
        state.progress('types', 3, 10);
        state.finish('types');
        state.progress('types', 1, 10);
        state.start('types', 'again');
        const phase = state.snapshot().phases.find(p => p.id === 'types')!;
        assert.strictEqual(phase.status, 'done');
        assert.strictEqual(phase.done, phase.total);
        assert.strictEqual(phase.detail, '');
    });

    test('the overall progress only grows as steps advance and ends at 1', () => {
        const state = new LoadingState(labels);
        const seen: number[] = [state.snapshot().overall];
        state.progress('symbols', 50, 100); seen.push(state.snapshot().overall);
        state.finish('files'); seen.push(state.snapshot().overall);
        state.finish('symbols'); seen.push(state.snapshot().overall);
        state.progress('relations', 10, 40); seen.push(state.snapshot().overall);
        PHASE_ORDER.forEach(id => state.finish(id)); seen.push(state.snapshot().overall);
        assert.deepStrictEqual(seen, seen.slice().sort((a, b) => a - b));
        assert.ok(Math.abs(seen[seen.length - 1] - 1) < 1e-9);
    });

    test('a step without a count adds nothing until it is done', () => {
        const state = new LoadingState(labels);
        state.start('graph');
        assert.strictEqual(state.snapshot().overall, 0);
    });
});

suite('Throttle Test Suite', () => {
    test('sends the first request at once and groups the ones that follow', async () => {
        let sent = 0;
        let clock = 1000;
        const throttle = new Throttle(() => sent++, 100, () => clock);
        throttle.request();
        assert.strictEqual(sent, 1);
        clock += 10; throttle.request();
        clock += 10; throttle.request();
        assert.strictEqual(sent, 1, 'two requests inside the gap wait');
        await new Promise(r => setTimeout(r, 150));
        assert.strictEqual(sent, 2, 'and are sent together once');
    });

    test('flush sends now, cancel drops what is waiting', () => {
        let sent = 0;
        let clock = 1000;
        const throttle = new Throttle(() => sent++, 100, () => clock);
        throttle.request();
        clock += 1; throttle.request();
        throttle.cancel();
        assert.strictEqual(sent, 1);
        throttle.flush();
        assert.strictEqual(sent, 2);
    });
});

suite('Notification Reporter Test Suite', () => {
    const texts = { labels, elapsed: 'Elapsed' };
    const make = () => {
        const reports: Array<{ increment?: number; message?: string }> = [];
        let clock = 1000;
        const reporter = new NotificationReporter({ report: v => reports.push(v) }, texts, () => clock, 3600000);
        return { reporter, reports, tick: (ms: number) => { clock += ms; } };
    };

    test('says the step, its counter, the percentage and the elapsed time', () => {
        const { reporter, tick } = make();
        try {
            reporter.progress('symbols', 430, 601);
            tick(65000);
            const message = reporter.message();
            assert.ok(/^\d+% · SYMBOLS \(430\/601\) · Elapsed 1m 5s$/.test(message), message);
        } finally { reporter.release(); }
    });

    test('with two steps at once it names the one that is further behind', () => {
        const { reporter } = make();
        try {
            reporter.progress('symbols', 590, 600);
            reporter.progress('relations', 100, 600);
            assert.ok(reporter.message().includes('RELATIONS (100/600)'), reporter.message());
        } finally { reporter.release(); }
    });

    test('a step without a counter shows what it is doing', () => {
        const { reporter } = make();
        try {
            reporter.start('relations', 'Dart is analysing the project');
            assert.ok(reporter.message().includes('RELATIONS - Dart is analysing the project'), reporter.message());
        } finally { reporter.release(); }
    });

    test('the bar only moves forward and never past a hundred in total', () => {
        const { reporter, reports } = make();
        try {
            reporter.progress('symbols', 300, 600);
            PHASE_ORDER.forEach(id => reporter.finish(id));
            reporter.progress('symbols', 1, 600);
            // let the throttled reports go out
        } finally { reporter.release(); }
        assert.ok(reports.every(r => (r.increment ?? 0) >= 0));
        assert.ok(reports.reduce((sum, r) => sum + (r.increment ?? 0), 0) <= 100.0001);
    });

    test('the first report goes out at once, so the notification is never empty', () => {
        const { reporter, reports } = make();
        reporter.release();
        assert.strictEqual(reports.length, 1);
        assert.ok(/^0% · /.test(reports[0].message ?? ''));
    });
});

suite('mapLimited Progress Test Suite', () => {
    test('reports every item finished, in order, up to the total', async () => {
        const seen: Array<[number, number]> = [];
        const out = await mapLimited([1, 2, 3, 4], 2, async n => n * 2, (done, total) => seen.push([done, total]));
        assert.deepStrictEqual(out, [2, 4, 6, 8]);
        assert.deepStrictEqual(seen.map(s => s[0]), [1, 2, 3, 4]);
        assert.ok(seen.every(s => s[1] === 4));
    });

    test('works without a progress callback and with no items', async () => {
        assert.deepStrictEqual(await mapLimited([1], 4, async n => n), [1]);
        assert.deepStrictEqual(await mapLimited([], 4, async n => n, () => { throw new Error('nothing to report'); }), []);
    });
});
