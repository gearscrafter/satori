/**
 * Which classes a piece of code (a method, a constructor or a field declaration) names as a *type* or *creates*,
 * read from its text. It expects comment-free, string-free text (see stripCommentsAndStrings).
 *
 * - `created`: `Repo()`, `const Repo()`, `new Repo<T>()`.
 * - `used`: `Repo repo;`, `List<Repo> all`, `Future<Repo> load()`, `x as Repo`, `x is Repo`, `getIt<Repo>()`,
 *   `context.read<Repo>()`. This is also how a class that is injected (get_it, Provider, GetX) shows up.
 *
 * `Repo.load()` and `Color.red` are not counted: a static call is already a call, and a named constructor cannot be
 * told from it without the class itself.
 */
export interface TypeUsage {
    created: string[];
    used: string[];
}

export function typeUsage(source: string, classNames: ReadonlySet<string>, ownName?: string): TypeUsage {
    const created = new Set<string>();
    const used = new Set<string>();

    for (const match of source.matchAll(/(?<![\w$.])([A-Z][\w$]*)/g)) {
        const name = match[1];
        if (!classNames.has(name) || name === ownName) { continue; }

        let rest = source.slice(match.index! + name.length);
        const generics = skipGenerics(rest);
        rest = rest.slice(generics);
        const next = /^\s*(.)/.exec(rest)?.[1];

        if (next === '(') {
            created.add(name);
        } else if (next === '.') {
            continue;
        } else {
            used.add(name);
        }
    }
    return { created: Array.from(created), used: Array.from(used) };
}

/** The length of a `<...>` right at the start of `text` (with nesting), or 0 when there is none. */
function skipGenerics(text: string): number {
    const start = /^\s*</.exec(text);
    if (!start) { return 0; }
    let depth = 0;
    for (let i = start[0].length - 1; i < text.length; i++) {
        const ch = text[i];
        if (ch === '<') { depth++; }
        else if (ch === '>') {
            depth--;
            if (depth === 0) { return i + 1; }
        } else if (!/[\w$\s,?.&]/.test(ch)) {
            return 0;
        }
    }
    return 0;
}

/**
 * The whole declaration of a field, from the start of its line up to the ";" that ends it. The range the Dart server
 * gives for a field covers only its name, so the type written before it ("final Repo repo;") has to be read from the line.
 */
export function declarationFrom(lines: readonly string[], line: number, maxLines = 8): string {
    let text = '';
    for (let i = line; i < lines.length && i < line + maxLines; i++) {
        text += (i === line ? '' : '\n') + lines[i];
        if (lines[i].includes(';')) { break; }
    }
    return text;
}

/**
 * The names a type can be told from. Two classes with the same name in different files cannot be told apart by their
 * name, and picking one would depend on the order the files were read in, so such a name is left out.
 */
export function unambiguousClassNames(classLabels: Iterable<string>): Set<string> {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const label of classLabels) {
        if (seen.has(label)) { repeated.add(label); } else { seen.add(label); }
    }
    return new Set(Array.from(seen).filter(name => !repeated.has(name)));
}
