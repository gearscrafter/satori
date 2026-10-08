import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AnalysisStats, isHealthy } from './analysis_health';

/**
 * Remembers the finished analysis of a project, so opening it again without changing any file does not ask the
 * Dart language server thousands of questions again. A big project can take a very long time to analyse and the
 * answer only changes when its files do.
 *
 * The cache holds the graph and the imports that the page needs. It is valid only for the same files (path,
 * size and modification time of every one), the same extension version and the same cache layout.
 */
// 2: an analysis is saved only when it found what the project has, and says how much it found.
export const CACHE_LAYOUT = 2;

export interface CachedAnalysis<G = unknown, I = unknown> {
    layout: number;
    extensionVersion: string;
    fingerprint: string;
    savedAt: number;
    stats: AnalysisStats;
    graph: G;
    fileImports: I;
}

export interface FileStamp {
    path: string;
    size: number;
    mtimeMs: number;
}

/** One value that changes when any file is added, removed, renamed, resized or touched. */
export function fingerprintOf(stamps: FileStamp[]): string {
    const hash = crypto.createHash('sha1');
    stamps
        .map(s => `${s.path}|${s.size}|${Math.round(s.mtimeMs)}`)
        .sort()
        .forEach(line => hash.update(line + '\n'));
    return hash.digest('hex');
}

export function stampFiles(files: string[]): FileStamp[] {
    const stamps: FileStamp[] = [];
    for (const file of files) {
        try {
            const st = fs.statSync(file);
            stamps.push({ path: file, size: st.size, mtimeMs: st.mtimeMs });
        } catch {
            // A file that vanished between the search and now simply is not part of the fingerprint.
        }
    }
    return stamps;
}

/** Where the cache of a project lives: one file per project folder, inside the extension's storage. */
export function cacheFileFor(storageDir: string, projectRoot: string): string {
    const key = crypto.createHash('sha1').update(projectRoot.toLowerCase()).digest('hex').slice(0, 16);
    return path.join(storageDir, `analysis-${key}.json`);
}

export function readCachedAnalysis<G, I>(file: string, fingerprint: string, extensionVersion: string): CachedAnalysis<G, I> | null {
    try {
        if (!fs.existsSync(file)) { return null; }
        const cached = JSON.parse(fs.readFileSync(file, 'utf8')) as CachedAnalysis<G, I>;
        if (cached.layout !== CACHE_LAYOUT || cached.extensionVersion !== extensionVersion || cached.fingerprint !== fingerprint) {
            return null;
        }
        if (!cached.stats || !isHealthy(cached.stats)) { return null; }
        return cached;
    } catch {
        // A damaged or half-written file is as good as no cache.
        return null;
    }
}

export function writeCachedAnalysis<G, I>(file: string, fingerprint: string, extensionVersion: string, graph: G, fileImports: I, stats: AnalysisStats): void {
    const entry: CachedAnalysis<G, I> = { layout: CACHE_LAYOUT, extensionVersion, fingerprint, savedAt: Date.now(), stats, graph, fileImports };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Written to a temporary name first so a crash never leaves a truncated cache behind.
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(entry));
    fs.renameSync(temp, file);
}

/** Removes every saved analysis in the folder (all projects). Returns how many files went. */
export function clearCachedAnalyses(storageDir: string): number {
    let removed = 0;
    let names: string[] = [];
    try { names = fs.readdirSync(storageDir); } catch { return 0; }
    for (const name of names) {
        if (/^analysis-[0-9a-f]+\.json(\.\d+\.tmp)?$/.test(name)) {
            try { fs.unlinkSync(path.join(storageDir, name)); removed++; } catch { /* in use or already gone */ }
        }
    }
    return removed;
}
