import * as vscode from 'vscode';
import { FileStamp } from '../analysis/graph_cache';
import { diffStamps, planAnalysis, Plan } from '../analysis/incremental';
import { IncrementalState, reviveRanges } from '../analysis/incremental_state';
import { NavigationIndex, normalizePath } from '../analysis/navigation_index';
import { NavigationOutcome } from '../analysis/navigation_runner';
import { SymbolStats } from '../analysis/analysis_health';
import { ImportRef } from '../analysis/imports';
import { log } from '../utils/logger';

export interface AnalyzedFile {
    file: string;
    fileUri: string;
    symbols: any[];
    /** Taken from the saved state: its types are resolved already. */
    enriched?: boolean;
}

export interface IncrementalInput {
    state: IncrementalState;
    uris: vscode.Uri[];
    stamps: FileStamp[];
    /** Reads the symbols of these files from the language server. */
    extractSymbols: (uris: vscode.Uri[]) => Promise<{ files: AnalyzedFile[]; stats: SymbolStats }>;
    /** Asks Dart's analysis server where the symbols of these files point to (and nothing about the others). */
    askNavigation: (ask: vscode.Uri[]) => Promise<NavigationOutcome | null>;
}

export type IncrementalOutcome =
    | { ok: true; plan: Plan; files: AnalyzedFile[]; navigation: NavigationOutcome; reusedImports: Record<string, ImportRef[]>; stats: SymbolStats; asked: number; reused: number }
    | { ok: false; reason: string };

const makeRange = (a: number, b: number, c: number, d: number) => new vscode.Range(a, b, c, d);

/**
 * Works out what has to be asked again since the saved state, asks it, and joins the answers with what was saved.
 * It says why when it cannot (the caller then analyses everything, which is always right).
 */
export async function prepareIncremental(input: IncrementalInput): Promise<IncrementalOutcome> {
    const { state, uris } = input;
    if (!state.hasNavigation) { return { ok: false, reason: 'the saved state has no relationships from the analysis server' }; }

    const diff = diffStamps(state.stamps, input.stamps);
    const index = NavigationIndex.fromJSON(state.usages);

    // What changed may have moved its declarations: the files that use them have to be read again.
    const declaredAgain = new Set([...diff.changed, ...diff.deleted]);
    const byUri = new Map(uris.map(u => [u.toString(), u]));
    const byPath = new Map(uris.map(u => [normalizePath(u.fsPath), u]));
    const askPaths = new Set([...diff.changed, ...diff.added]);
    const dependentPaths: string[] = [];
    for (const uri of index.filesUsingDeclarationsIn(declaredAgain)) {
        const file = byUri.get(uri);
        if (!file) { continue; }
        const filePath = normalizePath(file.fsPath);
        if (!askPaths.has(filePath)) { dependentPaths.push(filePath); askPaths.add(filePath); }
    }

    const plan = planAnalysis(uris.length, diff, dependentPaths.length);
    if (plan.mode === 'full') { return { ok: false, reason: plan.reason }; }

    const ask = Array.from(askPaths).map(p => byPath.get(p)).filter((u): u is vscode.Uri => !!u);
    const savedByPath = new Map(state.files.map(f => [normalizePath(f.file), f]));

    let fresh: AnalyzedFile[] = [];
    let stats: SymbolStats = { files: 0, withSymbols: 0, errors: 0 };
    if (ask.length > 0) {
        const read = await input.extractSymbols(ask);
        fresh = read.files;
        stats = read.stats;
        // A language server that is still starting answers "nothing" for files that have something. That would
        // wipe them out of the diagram, so it is not trusted: the full analysis knows how to wait for it.
        const emptied = fresh.filter(f => f.symbols.length === 0 && (savedByPath.get(normalizePath(f.file))?.symbols.length ?? 0) > 0);
        if (emptied.length > 0 || stats.withSymbols < ask.length * 0.5) {
            return { ok: false, reason: `the language server returned no symbols for ${emptied.length || ask.length - stats.withSymbols} of ${ask.length} files it was asked about` };
        }
    }

    let nav: NavigationOutcome | null = { index, files: 0, startMs: 0, analyzeMs: 0, navigationMs: 0 };
    if (ask.length > 0) {
        nav = await input.askNavigation(ask);
        if (!nav) { return { ok: false, reason: 'the analysis server could not be used' }; }
        const usedIn = new Set<string>(ask.map(u => u.toString()));
        for (const path of diff.deleted) {
            const gone = savedByPath.get(path);
            if (gone) { usedIn.add(gone.fileUri); }
        }
        index.forget(declaredAgain, usedIn);
        index.absorb(nav.index);
        nav = { ...nav, index };
    } else if (diff.deleted.length > 0) {
        const usedIn = new Set<string>();
        for (const path of diff.deleted) {
            const gone = savedByPath.get(path);
            if (gone) { usedIn.add(gone.fileUri); }
        }
        index.forget(declaredAgain, usedIn);
    }

    const freshByPath = new Map(fresh.map(f => [normalizePath(f.file), f]));
    const files: AnalyzedFile[] = [];
    const reusedImports: Record<string, ImportRef[]> = {};
    let reused = 0;
    for (const uri of uris) {
        const path = normalizePath(uri.fsPath);
        const again = freshByPath.get(path);
        if (again) { files.push(again); continue; }
        const saved = savedByPath.get(path);
        if (!saved) {
            // Not asked about and not saved: nothing to build it from.
            return { ok: false, reason: `${path} is neither new nor in the saved state` };
        }
        files.push({ file: saved.file, fileUri: saved.fileUri, symbols: reviveRanges(saved.symbols as any[], makeRange), enriched: true });
        const imports = state.fileImports[saved.fileUri];
        if (imports) { reusedImports[saved.fileUri] = imports as ImportRef[]; }
        reused++;
    }

    log.info(`Incremental analysis: ${plan.reason}; ${ask.length} files asked again, ${reused} reused.`);
    return {
        ok: true, plan, files, navigation: nav, reusedImports, asked: ask.length, reused,
        stats: { files: files.length, withSymbols: files.filter(f => f.symbols.length > 0).length, errors: 0 }
    };
}
