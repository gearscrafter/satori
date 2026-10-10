import { FileStamp } from './graph_cache';
import { normalizePath } from './navigation_index';

/**
 * Analysing again only what changed. The saved state of the last analysis says which files there were and what
 * they looked like; comparing it with the files now gives the ones to ask about again, and everything else is
 * taken from what was saved.
 */

export interface StampDiff {
    /** Files that were there and are different now (normalised paths). */
    changed: string[];
    added: string[];
    deleted: string[];
}

export function diffStamps(before: readonly FileStamp[], now: readonly FileStamp[]): StampDiff {
    const was = new Map(before.map(s => [normalizePath(s.path), s]));
    const changed: string[] = [];
    const added: string[] = [];
    for (const stamp of now) {
        const path = normalizePath(stamp.path);
        const old = was.get(path);
        if (!old) { added.push(path); } else if (old.size !== stamp.size || Math.round(old.mtimeMs) !== Math.round(stamp.mtimeMs)) { changed.push(path); }
        was.delete(path);
    }
    return { changed, added, deleted: Array.from(was.keys()) };
}

export interface Plan {
    /** "reuse": nothing the analysis depends on changed. "incremental": ask again about some files. "full": start over. */
    mode: 'reuse' | 'incremental' | 'full';
    reason: string;
}

/** A change this big costs about as much as starting over, and starting over is the one that is always right. */
export const INCREMENTAL_MAX_SHARE = 0.2;
export const INCREMENTAL_MIN_FILES = 25;

export function planAnalysis(totalFiles: number, diff: StampDiff, dependents: number): Plan {
    const touched = diff.changed.length + diff.added.length + diff.deleted.length;
    if (touched === 0) { return { mode: 'reuse', reason: 'no file changed' }; }
    const toAsk = diff.changed.length + diff.added.length + dependents;
    const limit = Math.max(INCREMENTAL_MIN_FILES, Math.floor(totalFiles * INCREMENTAL_MAX_SHARE));
    if (toAsk > limit) { return { mode: 'full', reason: `${toAsk} files to ask about again is more than ${limit}` }; }
    return { mode: 'incremental', reason: `${diff.changed.length} changed, ${diff.added.length} new, ${diff.deleted.length} deleted, ${dependents} that use them` };
}
