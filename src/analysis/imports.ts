export interface ImportRef {
    /** The imported URI as written, e.g. `package:dio/dio.dart` or `dart:async`. */
    uri: string;
    /** Zero-based line of the directive. */
    line: number;
    /** Zero-based column where the URI text starts. */
    column: number;
}

const DIRECTIVE = /^\s*(?:import|export)\s+(['"])([^'"]+)\1/;
const MAX_IMPORTS_PER_FILE = 200;

/** `import` and `export` directives of a Dart file with their position. `part` directives and comments are ignored. */
export function parseImports(content: string): ImportRef[] {
    const found: ImportRef[] = [];
    const lines = content.split(/\r?\n/);
    for (let line = 0; line < lines.length && found.length < MAX_IMPORTS_PER_FILE; line++) {
        const text = lines[line];
        if (/^\s*\/\//.test(text)) { continue; }
        const match = DIRECTIVE.exec(text);
        if (match) {
            found.push({ uri: match[2], line, column: text.indexOf(match[2]) });
        }
    }
    return found;
}

/** The `name:` of a pubspec.yaml, or an empty string when there is none. */
export function parsePubspecName(content: string): string {
    const match = /^name:\s*['"]?([\w.-]+)['"]?\s*(?:#.*)?$/m.exec(content);
    return match ? match[1] : '';
}
