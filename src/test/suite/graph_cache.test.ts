import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    cacheFileFor, fingerprintOf, readCachedAnalysis, stampFiles, writeCachedAnalysis, CACHE_LAYOUT
} from '../../analysis/graph_cache';

suite('Graph Cache Test Suite', () => {
    let dir: string;
    setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-cache-')); });
    teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    test('the fingerprint changes with any file that is added, resized or touched, but not with their order', () => {
        const a = { path: '/p/a.dart', size: 10, mtimeMs: 1000 };
        const b = { path: '/p/b.dart', size: 20, mtimeMs: 2000 };
        const base = fingerprintOf([a, b]);
        assert.strictEqual(fingerprintOf([b, a]), base);
        assert.notStrictEqual(fingerprintOf([a]), base);
        assert.notStrictEqual(fingerprintOf([a, { ...b, size: 21 }]), base);
        assert.notStrictEqual(fingerprintOf([a, { ...b, mtimeMs: 2500 }]), base);
        assert.notStrictEqual(fingerprintOf([a, { ...b, path: '/p/c.dart' }]), base);
    });

    test('a saved analysis comes back when nothing changed', () => {
        const file = cacheFileFor(dir, '/projects/app');
        writeCachedAnalysis(file, 'abc', '2.1.1', { nodes: [1, 2], edges: [] }, { 'a.dart': [] });
        const cached = readCachedAnalysis<{ nodes: number[] }, unknown>(file, 'abc', '2.1.1');
        assert.deepStrictEqual(cached?.graph.nodes, [1, 2]);
        assert.strictEqual(cached?.layout, CACHE_LAYOUT);
    });

    test('it is ignored when the files, the extension version or the layout differ', () => {
        const file = cacheFileFor(dir, '/projects/app');
        writeCachedAnalysis(file, 'abc', '2.1.1', {}, {});
        assert.strictEqual(readCachedAnalysis(file, 'other', '2.1.1'), null);
        assert.strictEqual(readCachedAnalysis(file, 'abc', '2.2.0'), null);
        const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
        fs.writeFileSync(file, JSON.stringify({ ...entry, layout: CACHE_LAYOUT + 1 }));
        assert.strictEqual(readCachedAnalysis(file, 'abc', '2.1.1'), null);
    });

    test('a missing or damaged cache is just no cache', () => {
        const file = cacheFileFor(dir, '/projects/app');
        assert.strictEqual(readCachedAnalysis(file, 'abc', '2.1.1'), null);
        fs.writeFileSync(file, '{"layout": 1, "graph": ');
        assert.strictEqual(readCachedAnalysis(file, 'abc', '2.1.1'), null);
    });

    test('every project folder gets its own file', () => {
        assert.notStrictEqual(cacheFileFor(dir, '/projects/one'), cacheFileFor(dir, '/projects/two'));
        assert.strictEqual(cacheFileFor(dir, '/Projects/App'), cacheFileFor(dir, '/projects/app'));
    });

    test('stamps the files that exist and skips the ones that vanished', () => {
        const real = path.join(dir, 'a.dart');
        fs.writeFileSync(real, 'class A {}');
        const stamps = stampFiles([real, path.join(dir, 'gone.dart')]);
        assert.strictEqual(stamps.length, 1);
        assert.strictEqual(stamps[0].size, 10);
    });

    test('writing leaves no temporary file behind', () => {
        const file = cacheFileFor(dir, '/projects/app');
        writeCachedAnalysis(file, 'abc', '2.1.1', {}, {});
        assert.deepStrictEqual(fs.readdirSync(dir).filter(f => f.endsWith('.tmp')), []);
    });
});
