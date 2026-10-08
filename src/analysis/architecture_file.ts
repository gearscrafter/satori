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
        builtin: a.builtin
    };
}
