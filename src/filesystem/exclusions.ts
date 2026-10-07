/**
 * Files the analysis leaves out by default. Generated code (`*.g.dart`, `*.freezed.dart`...) is often most of the
 * Dart files of a big app, adds nothing a person reads and costs the same language-server questions as written code.
 * The list is the setting `satori.analysis.exclude`; an empty list analyses everything.
 */
export const DEFAULT_EXCLUDES: string[] = [
    '**/*.g.dart',
    '**/*.freezed.dart',
    '**/*.gr.dart',
    '**/*.mocks.dart',
    '**/*.config.dart',
    '**/*.chopper.dart',
    '**/*.reflectable.dart',
    '**/generated/**',
    '**/.dart_tool/**'
];

/** Turns a glob (`**`, `*`, `?`) into a regular expression over a path written with forward slashes. */
export function globToRegExp(glob: string): RegExp {
    let out = '';
    for (let i = 0; i < glob.length; i++) {
        const ch = glob[i];
        if (ch === '*') {
            if (glob[i + 1] === '*') {
                // "**/" matches any number of folders, including none; a trailing "**" matches the rest.
                if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2; } else { out += '.*'; i += 1; }
            } else {
                out += '[^/]*';
            }
        } else if (ch === '?') {
            out += '[^/]';
        } else {
            out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`^${out}$`, 'i');
}

export function makeExcluder(patterns: string[]): (relativePath: string) => boolean {
    const regexes = patterns.filter(p => p.trim() !== '').map(globToRegExp);
    return (relativePath: string) => {
        const normalized = relativePath.replace(/\\/g, '/');
        return regexes.some(r => r.test(normalized));
    };
}
