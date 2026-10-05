export type AccessKind = 'read' | 'write' | 'pass';

export interface AccessContext {
    /** Names the enclosing constructor goes by (its label and its class). Enables `this.field` parameter detection. */
    constructorNames?: string[];
}

const ASSIGNMENT = /^(\?\?=|~\/=|>>>=|<<=|>>=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|=(?![=>]))/;
const NON_CALL_WORDS = new Set(['if', 'while', 'for', 'switch', 'catch', 'assert', 'return', 'await', 'in', 'when']);
const THIS_PREFIX = /\bthis\s*\.\s*$/;

interface Group {
    /** True when an unmatched "(" exists on the line before the position. */
    open: boolean;
    /** The dotted name written right before that "(", when it looks like a call. */
    callee: string | null;
}

function enclosingGroup(line: string, position: number): Group {
    let depth = 0;
    for (let i = position - 1; i >= 0; i--) {
        const ch = line[i];
        if (ch === ')') { depth++; }
        else if (ch === '(') {
            if (depth > 0) { depth--; continue; }
            const before = line.slice(0, i).replace(/\s+$/, '');
            const match = before.match(/[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*(?:<[^()]*>)?$/);
            if (!match) { return { open: true, callee: null }; }
            const name = match[0].replace(/<.*$/, '').replace(/\s+/g, '');
            return { open: true, callee: NON_CALL_WORDS.has(name) ? null : name };
        }
    }
    return { open: false, callee: null };
}

function isConstructorName(callee: string | null, names: string[]): boolean {
    if (!callee) { return false; }
    return names.indexOf(callee) >= 0 || names.indexOf(callee.split('.')[0]) >= 0;
}

/**
 * Tells how a field or property is used at one reference, judging from the text around it.
 * `start` and `end` are the character offsets of the identifier inside `line`.
 * A compound assignment such as `+=` or `++` both reads and writes, so more than one kind can come back.
 */
export function classifyAccess(line: string, start: number, end: number, context: AccessContext = {}): AccessKind[] {
    const before = line.slice(0, start);
    const after = line.slice(end);
    const names = context.constructorNames || [];

    if (names.length && THIS_PREFIX.test(before)) {
        const head = before.replace(THIS_PREFIX, '');
        const group = enclosingGroup(line, start);
        const sameLineHeader = group.open && isConstructorName(group.callee, names) && /^\s*[,)}\]]/.test(after);
        const ownLineParameter = !group.open && /^\s*(?:(?:required|covariant|final|const)\s+)*(?:[\w$<>?,]+\s+)?$/.test(head)
            && /^\s*(?:=\s*[^,;)]+)?\s*[,)}\]]?\s*$/.test(after) && !/;\s*$/.test(after);
        if (sameLineHeader || ownLineParameter) { return ['write']; }
    }

    const next = after.replace(/^[!\s]+/, '');
    const assignment = ASSIGNMENT.exec(next);
    if (assignment) { return assignment[0] === '=' ? ['write'] : ['read', 'write']; }
    if (/^(\+\+|--)/.test(next) || /(\+\+|--)\s*$/.test(before)) { return ['read', 'write']; }

    const previous = before.replace(THIS_PREFIX, '').replace(/\s+$/, '');
    const following = after.replace(/^\s+/, '');
    const isNamedArgument = /[A-Za-z_$][\w$]*\s*:$/.test(previous) && !/\?[^:]*:$/.test(previous);
    const startsArgument = /[(,]$/.test(previous) || isNamedArgument;
    if (startsArgument && /^[,)]/.test(following) && enclosingGroup(line, start).callee !== null) { return ['pass']; }

    return ['read'];
}
