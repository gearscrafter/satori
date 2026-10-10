/**
 * Choosing a package when the folder that is open is not one: a monorepo has no pubspec.yaml at its root, only in the
 * packages below it. This is the part that does not need VS Code: telling the packages apart and ordering them.
 */

export interface PackageChoice {
    /** The name in its pubspec.yaml, or the folder name when it has none. */
    name: string;
    /** The folder of the package, as an absolute path. */
    folder: string;
    /** Where it is, relative to the folder that is open: "packages/app". */
    relative: string;
}

/** `name: my_app` of a pubspec.yaml. */
export function packageNameOf(pubspecText: string): string | undefined {
    const match = /^name\s*:\s*['"]?([A-Za-z_][\w.-]*)['"]?\s*(?:#.*)?$/m.exec(pubspecText);
    return match ? match[1] : undefined;
}

const toSlashes = (p: string) => p.replace(/\\/g, '/');

/**
 * One choice per pubspec.yaml found. `readText` gives its content (a pubspec that cannot be read still counts, named by
 * its folder).
 */
export function packagesFrom(workspaceFolder: string, pubspecPaths: readonly string[], readText: (pubspecPath: string) => string | undefined): PackageChoice[] {
    const base = toSlashes(workspaceFolder).replace(/\/+$/, '');
    const seen = new Set<string>();
    const choices: PackageChoice[] = [];
    for (const pubspec of pubspecPaths) {
        const file = toSlashes(pubspec);
        const folder = file.replace(/\/pubspec\.yaml$/i, '');
        if (seen.has(folder.toLowerCase())) { continue; }
        seen.add(folder.toLowerCase());
        const relative = folder.toLowerCase().startsWith(base.toLowerCase() + '/') ? folder.slice(base.length + 1) : folder;
        let text: string | undefined;
        try { text = readText(pubspec); } catch { text = undefined; }
        choices.push({ name: (text && packageNameOf(text)) || folder.split('/').pop() || folder, folder, relative });
    }
    return choices;
}

/** A package that is only there to show how to use another one is the last thing anyone wants to open. */
const isExample = (c: PackageChoice) => /(^|\/)(example|examples|sample|demo)(\/|$)/i.test(c.relative);

/**
 * The list as it is shown: the one analysed last time first, then the packages nearest to the root, the examples at
 * the end, and by name within each.
 */
export function orderChoices(choices: readonly PackageChoice[], lastUsed?: string): PackageChoice[] {
    const last = lastUsed ? toSlashes(lastUsed).replace(/\/+$/, '').toLowerCase() : undefined;
    const depth = (c: PackageChoice) => c.relative.split('/').length;
    return choices.slice().sort((a, b) => {
        const aLast = last !== undefined && a.folder.toLowerCase() === last ? 0 : 1;
        const bLast = last !== undefined && b.folder.toLowerCase() === last ? 0 : 1;
        return aLast - bLast
            || Number(isExample(a)) - Number(isExample(b))
            || depth(a) - depth(b)
            || a.name.localeCompare(b.name)
            || a.relative.localeCompare(b.relative);
    });
}

/** What to do with what was found: nothing to open, one package to open straight away, or several to pick from. */
export function decide(choices: readonly PackageChoice[]): 'none' | 'single' | 'pick' {
    if (choices.length === 0) { return 'none'; }
    return choices.length === 1 ? 'single' : 'pick';
}
