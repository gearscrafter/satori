import * as fs from 'fs';
import * as vscode from 'vscode';
import { ProjectGraphModel, ProjectGraphNode } from '../types/index';

export interface SnippetRequest {
    nodeId?: string;
    sourceId?: string;
    targetId?: string;
}

export interface Snippet {
    file: string;
    startLine: number;
    lines: string[];
    highlightLine: number | null;
    jump: { start: { line: number; character: number }; end: { line: number; character: number } };
    title: string;
}

type Pos = { line: number; character: number };
type SimpleRange = { start: Pos; end: Pos };

const MAX_LINES = 60;
const CONTEXT = 3;

function stripDecor(label: string): string {
    return label.replace(/^(?:\u{1F517}|⚙️?)\s*/u, '');
}

function rangeOf(node: ProjectGraphNode): SimpleRange | null {
    const raw: any = node.data.range ?? node.data.selectionRange;
    if (!raw) {
        return null;
    }
    const start = Array.isArray(raw) ? raw[0] : raw.start;
    const end = Array.isArray(raw) ? raw[1] : raw.end;
    if (!start || !end) {
        return null;
    }
    return { start: { line: start.line, character: start.character }, end: { line: end.line, character: end.character } };
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the code excerpt shown next to the graph. For a source/target pair it
 * locates the line inside the source symbol that references the target; for a
 * single node it shows the node's own definition.
 */
export function buildSnippet(graph: ProjectGraphModel, request: SnippetRequest): Snippet | null {
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    const primary = byId.get(request.sourceId ?? request.nodeId ?? '');
    if (!primary || !primary.data.fileUri) {
        return null;
    }
    const range = rangeOf(primary);
    if (!range) {
        return null;
    }

    let content: string;
    try {
        content = fs.readFileSync(vscode.Uri.parse(primary.data.fileUri).fsPath, 'utf8');
    } catch {
        return null;
    }
    const fileLines = content.split(/\r?\n/);
    if (range.start.line >= fileLines.length) {
        return null;
    }

    let highlightLine: number | null = null;
    let highlightColumn = range.start.character;
    let matchLength = Math.max(1, range.end.line === range.start.line ? range.end.character - range.start.character : 1);
    let title = stripDecor(primary.label);

    const target = request.targetId ? byId.get(request.targetId) : undefined;
    if (target) {
        const name = stripDecor(target.label);
        const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`);
        const lastLine = Math.min(range.end.line, fileLines.length - 1);
        for (let i = range.start.line; i <= lastLine; i++) {
            const text = fileLines[i];
            if (text.trimStart().startsWith('//')) {
                continue;
            }
            const match = pattern.exec(i === range.start.line ? text.substring(range.start.character) : text);
            if (match) {
                highlightLine = i;
                highlightColumn = match.index + (i === range.start.line ? range.start.character : 0);
                matchLength = name.length;
                break;
            }
        }
        title = `${stripDecor(primary.label)} → ${name}`;
    }

    if (!target && range.end.line === range.start.line) {
        highlightLine = range.start.line;
    }

    const lastLineOfSymbol = Math.min(range.end.line, fileLines.length - 1);
    let from = range.start.line;
    let to = lastLineOfSymbol;
    if (to - from < 1) {
        from = Math.max(0, from - CONTEXT);
        to = Math.min(fileLines.length - 1, to + CONTEXT + 1);
    }
    if (to - from + 1 > MAX_LINES) {
        const anchor = highlightLine ?? range.start.line;
        from = Math.max(range.start.line, anchor - Math.floor(MAX_LINES / 2));
        to = Math.min(lastLineOfSymbol, from + MAX_LINES - 1);
        from = Math.max(range.start.line, to - MAX_LINES + 1);
    }

    const jumpLine = highlightLine ?? range.start.line;
    return {
        file: primary.data.fileUri,
        startLine: from,
        lines: fileLines.slice(from, to + 1),
        highlightLine,
        jump: {
            start: { line: jumpLine, character: highlightColumn },
            end: { line: jumpLine, character: highlightColumn + matchLength }
        },
        title
    };
}
