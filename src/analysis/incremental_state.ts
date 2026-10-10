import * as fs from 'fs';
import * as path from 'path';
import { FileStamp } from './graph_cache';
import { Usage } from './navigation_index';

/**
 * What the last analysis knew before drawing the graph: the symbols of every file once their types were resolved, what
 * each file uses, and the files it saw. With it, a few changed files can be analysed again without asking about the
 * rest. It lives next to the saved analysis and is valid for the same extension version and layout only.
 */
// 1: first layout.
export const STATE_LAYOUT = 1;

export interface FileState {
    file: string;
    fileUri: string;
    symbols: unknown[];
}

export interface IncrementalState {
    layout: number;
    extensionVersion: string;
    savedAt: number;
    stamps: FileStamp[];
    /** The relationships came from Dart's analysis server; without them there is nothing to update. */
    hasNavigation: boolean;
    files: FileState[];
    fileImports: Record<string, unknown>;
    usages: Array<[string, Usage[]]>;
}

/** The state of a project goes next to its saved analysis. */
export function stateFileFor(cacheFile: string): string {
    return cacheFile.replace(/\.json$/, '.state.json');
}

export function writeState(file: string, state: IncrementalState): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state));
    fs.renameSync(temp, file);
}

/**
 * Writes the state. The symbols arrive already as JSON because they are copied right after their types are resolved,
 * before the graph is built, and the graph building changes them.
 */
export function writeStateParts(file: string, meta: Pick<IncrementalState, 'extensionVersion' | 'stamps' | 'hasNavigation'>, filesJson: string, fileImports: Record<string, unknown>, usages: Array<[string, Usage[]]>): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    const header = JSON.stringify({ layout: STATE_LAYOUT, extensionVersion: meta.extensionVersion, savedAt: Date.now(), stamps: meta.stamps, hasNavigation: meta.hasNavigation });
    fs.writeFileSync(temp, header.slice(0, -1) + ',"files":' + filesJson + ',"fileImports":' + JSON.stringify(fileImports) + ',"usages":' + JSON.stringify(usages) + '}');
    fs.renameSync(temp, file);
}

export function readState(file: string, extensionVersion: string): IncrementalState | null {
    try {
        if (!fs.existsSync(file)) { return null; }
        const state = JSON.parse(fs.readFileSync(file, 'utf8')) as IncrementalState;
        if (state.layout !== STATE_LAYOUT || state.extensionVersion !== extensionVersion) { return null; }
        if (!Array.isArray(state.stamps) || !Array.isArray(state.files) || !Array.isArray(state.usages)) { return null; }
        return state;
    } catch {
        return null;
    }
}

export function removeState(cacheFile: string): void {
    try { fs.unlinkSync(stateFileFor(cacheFile)); } catch { /* not there */ }
}

const isPosition = (v: unknown): v is { line: number; character: number } =>
    typeof v === 'object' && v !== null && typeof (v as any).line === 'number' && typeof (v as any).character === 'number';

/**
 * A range written as JSON is a pair of positions. Gives every such pair, anywhere in the value, back as a range,
 * because the code that reads symbols asks for `range.start.line`.
 */
export function reviveRanges<T>(value: T, makeRange: (startLine: number, startCharacter: number, endLine: number, endCharacter: number) => unknown): T {
    const walk = (node: any): any => {
        if (Array.isArray(node)) {
            if (node.length === 2 && isPosition(node[0]) && isPosition(node[1])) {
                return makeRange(node[0].line, node[0].character, node[1].line, node[1].character);
            }
            for (let i = 0; i < node.length; i++) { node[i] = walk(node[i]); }
            return node;
        }
        if (node && typeof node === 'object') {
            for (const key of Object.keys(node)) { node[key] = walk(node[key]); }
        }
        return node;
    };
    return walk(value);
}
