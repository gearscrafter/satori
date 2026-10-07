import { NavigationResult } from '../lsp/analysis_server';

/**
 * Where every symbol of the project is used, built from the navigation of each file (see DartAnalysisClient).
 * It answers the same question as the language server's "find references", without asking it once per symbol.
 */

export interface Usage {
    /** The URI of the file that uses the symbol, written the way the rest of the extension writes it. */
    uri: string;
    line: number;
    character: number;
    endLine: number;
    endCharacter: number;
}

/** One way to write a path so the server's `C:\Users\x` and VS Code's `c:/Users/x` compare equal. */
export function normalizePath(p: string): string {
    const slashes = p.replace(/\\/g, '/');
    return /^[a-zA-Z]:/.test(slashes) ? slashes[0].toLowerCase() + slashes.slice(1) : slashes;
}

/** Offsets of the first character of every line. */
export function lineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) { starts.push(i + 1); }
    }
    return starts;
}

/** 0-based line and column of an offset, by binary search over `lineStarts`. */
export function positionAt(starts: number[], offset: number): { line: number; character: number } {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (starts[mid] <= offset) { low = mid; } else { high = mid - 1; }
    }
    return { line: low, character: offset - starts[low] };
}

export class NavigationIndex {
    private readonly byTarget = new Map<string, Usage[]>();

    static key(path: string, line: number, character: number): string {
        return `${normalizePath(path)}:${line}:${character}`;
    }

    /** The uses of the symbol declared at this position (0-based) of this file, or an empty list. */
    referencesTo(path: string, line: number, character: number): Usage[] {
        return this.byTarget.get(NavigationIndex.key(path, line, character)) ?? [];
    }

    get size(): number { return this.byTarget.size; }

    /**
     * Adds what one file says about its identifiers.
     * @param usageUri URI of the file the navigation belongs to
     * @param text the file's contents, to turn offsets into lines and columns
     * @param keepTarget decides which declarations are worth remembering (the project's own files)
     * @param selfPath path of the file the navigation belongs to, to tell a declaration from a use of it
     */
    addFile(result: NavigationResult, usageUri: string, text: string, keepTarget: (path: string) => boolean, selfPath: string): void {
        const starts = lineStarts(text);
        const keep = result.targets.map(t => keepTarget(result.files[t.fileIndex] ?? ''));
        for (const region of result.regions) {
            // `this.x` / `super.x` in a constructor header points the word "this" at the field too; it is not a use of it.
            const word = text.substr(region.offset, region.length);
            if (word === 'this' || word === 'super') { continue; }
            let usage: Usage | undefined;
            for (const index of region.targets) {
                const target = result.targets[index];
                if (!target || !keep[index]) { continue; }
                // A declaration points at itself: that is where the symbol is born, not a use of it.
                if (region.offset === target.offset && result.files[target.fileIndex] !== undefined && normalizePath(result.files[target.fileIndex]) === normalizePath(selfPath)) { continue; }
                if (!usage) {
                    const start = positionAt(starts, region.offset);
                    const end = positionAt(starts, region.offset + region.length);
                    usage = { uri: usageUri, line: start.line, character: start.character, endLine: end.line, endCharacter: end.character };
                }
                const key = NavigationIndex.key(result.files[target.fileIndex], target.startLine - 1, target.startColumn - 1);
                const list = this.byTarget.get(key);
                if (list) { list.push(usage); } else { this.byTarget.set(key, [usage]); }
            }
        }
    }
}
