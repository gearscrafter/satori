import * as fs from 'fs';
import * as path from 'path';
import { Architecture, parseArchitecture, ParseResult } from './architecture_config';

export const ARCHITECTURE_FILE = 'satori.json';

/**
 * The `satori.json` of the project: in the analysed folder or, going up, in the first folder that has one before
 * the folder of the `pubspec.yaml` is left behind. Returns undefined when there is none.
 */
export function findArchitectureFile(start: string): string | undefined {
    let dir = path.resolve(start);
    for (let i = 0; i < 6; i++) {
        const candidate = path.join(dir, ARCHITECTURE_FILE);
        if (fs.existsSync(candidate)) { return candidate; }
        if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) { return undefined; }
        const parent = path.dirname(dir);
        if (parent === dir) { return undefined; }
        dir = parent;
    }
    return undefined;
}

/** Where satori.json goes when there is none: next to the pubspec.yaml of the project, going up from the analysed folder. */
export function architectureFileFor(start: string): string {
    const existing = findArchitectureFile(start);
    if (existing) { return existing; }
    let dir = path.resolve(start);
    for (let i = 0; i < 6; i++) {
        if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) { return path.join(dir, ARCHITECTURE_FILE); }
        const parent = path.dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    return path.join(path.resolve(start), ARCHITECTURE_FILE);
}

export interface OverrideResult {
    ok: boolean;
    file: string;
    created: boolean;
    /** Why nothing was written. */
    problem?: string;
}

/**
 * Places a class in a layer by hand: writes `architecture.overrides[name]` in satori.json, creating the file (with the
 * default layers, so nothing else changes) when there is none. A null layer takes the class back to the automatic one.
 * A file that is not valid JSON is never overwritten.
 */
export function writeLayerOverride(start: string, className: string, layer: string | null): OverrideResult {
    const file = architectureFileFor(start);
    const existed = fs.existsSync(file);
    let json: any = {};
    if (existed) {
        try { json = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); } catch (e: any) {
            return { ok: false, file, created: false, problem: `${ARCHITECTURE_FILE} is not valid JSON (${e.message}), so it was not changed.` };
        }
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
            return { ok: false, file, created: false, problem: `${ARCHITECTURE_FILE} must hold an object, so it was not changed.` };
        }
    }
    if (!json.architecture || typeof json.architecture !== 'object') { json.architecture = { preset: 'default' }; }
    const overrides: Record<string, string> = json.architecture.overrides && typeof json.architecture.overrides === 'object' ? json.architecture.overrides : {};
    if (layer === null) { delete overrides[className]; } else { overrides[className] = layer; }
    if (Object.keys(overrides).length > 0) { json.architecture.overrides = overrides; } else { delete json.architecture.overrides; }
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    return { ok: true, file, created: !existed };
}

/**
 * What decides the layer of the classes the analysis places, without the classes placed by hand: those are applied in
 * the diagram, so moving one must not make the saved analysis stale.
 */
export function architectureDigest(file: string | undefined): string {
    if (!file) { return ''; }
    try {
        const json = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (json && json.architecture && typeof json.architecture === 'object') { delete json.architecture.overrides; }
        return JSON.stringify(json);
    } catch {
        return 'unreadable';
    }
}

export interface LoadedArchitecture extends ParseResult {
    file?: string;
}

/**
 * The folders that hold the code of the project: the ones inside `lib/`, or inside `lib/src/` when that is all `lib/`
 * has (the layout of a package). Hidden folders are left out.
 */
export function discoverFolders(projectDir: string): { base: string; folders: string[] } {
    const list = (dir: string): string[] => {
        try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name); }
        catch { return []; }
    };
    const lib = list(path.join(projectDir, 'lib'));
    if (lib.length === 1 && lib[0] === 'src') { return { base: 'lib/src', folders: list(path.join(projectDir, 'lib', 'src')) }; }
    return { base: 'lib', folders: lib };
}

export function loadArchitecture(start: string): LoadedArchitecture {
    const file = findArchitectureFile(start);
    if (!file) { return parseResult(undefined); }
    try {
        const context = { discoverFolders: () => discoverFolders(path.dirname(file)) };
        return { ...parseArchitecture(fs.readFileSync(file, 'utf8'), context), file };
    } catch (e: any) {
        return { ...parseResult(undefined), problems: [`${ARCHITECTURE_FILE} could not be read (${e.message}). The default layers are used.`], file };
    }
}

function parseResult(text: string | undefined): ParseResult { return parseArchitecture(text); }

/** What the page needs of an architecture: how to draw the layers and judge the dependencies, not how classes are placed. */
export function viewArchitecture(a: Architecture) {
    return {
        layers: a.layers.map(l => ({ id: l.id, label: l.label, description: l.description, color: l.color, icon: l.icon, neutral: l.neutral === true })),
        mode: a.mode,
        allow: a.allow,
        forbid: a.forbid,
        neutral: a.neutral,
        builtin: a.builtin,
        overrides: a.overrides
    };
}
