import * as vscode from 'vscode';
import * as fs from 'fs';

export interface ClassRelations {
    extends: string[];
    with: string[];
    implements: string[];
}

const CLAUSE_KEYWORDS = new Set(['extends', 'with', 'implements']);

/**
 * Splits a Dart class header ("class A extends B<T> with M implements I, J")
 * into its extends/with/implements clauses. Generic arguments are kept intact.
 */
export function parseInheritanceClauses(header: string): ClassRelations {
    const result: ClassRelations = { extends: [], with: [], implements: [] };
    let depth = 0;
    let current: keyof ClassRelations | undefined;
    let buffer = '';

    const flush = () => {
        if (!current) {
            buffer = '';
            return;
        }
        let item = '';
        let itemDepth = 0;
        for (const ch of buffer) {
            if (ch === '<') {itemDepth++;}
            if (ch === '>') {itemDepth--;}
            if (ch === ',' && itemDepth === 0) {
                if (item.trim()) {result[current].push(item.trim().replace(/<\s+/g, '<'));}
                item = '';
            } else {
                item += ch;
            }
        }
        if (item.trim()) {result[current].push(item.trim().replace(/<\s+/g, '<'));}
        buffer = '';
    };

    for (const token of header.match(/[A-Za-z_$][\w$]*|[<>,]|[^\sA-Za-z_$<>,]+/g) ?? []) {
        if (token === '<') {depth++;}
        if (token === '>') {depth--;}
        if (depth === 0 && CLAUSE_KEYWORDS.has(token)) {
            flush();
            current = token as keyof ClassRelations;
            continue;
        }
        buffer += token === ',' || token === '<' || token === '>' ? token : ` ${token}`;
    }
    flush();
    return result;
}

/**
 * Returns the declaration header of a class (from its start up to the opening
 * brace), flattened to a single line.
 */
export function extractClassHeader(content: string, range: { start: { line: number; character: number } }): string {
    const lines = content.split(/\r?\n/);
    let header = '';
    for (let i = range.start.line; i < lines.length && i < range.start.line + 20; i++) {
        const raw = i === range.start.line ? lines[i].substring(range.start.character) : lines[i];
        const line = raw.replace(/\/\/.*$/, '');
        const brace = line.indexOf('{');
        if (brace >= 0) {
            header += ' ' + line.substring(0, brace);
            break;
        }
        header += ' ' + line;
    }
    return header.replace(/\s+/g, ' ').trim();
}

/**
 * Builds a map of "fileUri#ClassName" to its inheritance relations. The Dart
 * language server leaves `detail` empty for classes, so the header is read from
 * the source file, with `detail` used when the server does provide it.
 */
export function buildClassRelationsFromSymbols(
    filesData: Array<{ file?: string; fileUri: string; symbols: vscode.DocumentSymbol[] }>
): Map<string, ClassRelations> {
    const relations = new Map<string, ClassRelations>();

    for (const fileData of filesData) {
        let content: string | undefined;
        const readContent = () => {
            if (content === undefined && fileData.file) {
                try {
                    content = fs.readFileSync(fileData.file, 'utf8');
                } catch {
                    content = '';
                }
            }
            return content ?? '';
        };

        const visit = (symbols: vscode.DocumentSymbol[] | undefined) => {
            for (const symbol of symbols ?? []) {
                if (symbol.kind === vscode.SymbolKind.Class) {
                    const header = symbol.detail || (symbol.range ? extractClassHeader(readContent(), symbol.range) : '');
                    if (header) {
                        relations.set(`${fileData.fileUri}#${symbol.name}`, parseInheritanceClauses(header));
                    }
                }
                visit(symbol.children);
            }
        };
        visit(fileData.symbols);
    }
    return relations;
}
