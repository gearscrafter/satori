import { escapeRegExp } from '../core';

const IDENTIFIER_CALL = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?(?=\s*\()/g;
const PLAIN_NAME = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?$/;

/**
 * Which of the known symbol names a piece of code calls (`name(` or `Class.name(`). It expects comment-free,
 * string-free text.
 *
 * The first version tested one regular expression per known name for every member, which is members x names: tens of
 * millions of tests on a project with thousands of classes. This reads the called names once per member and looks
 * them up, so the cost follows the size of the code and not the size of the project.
 */
export class CalledNames {
    private readonly plain = new Set<string>();
    /** Names that are not plain identifiers (an operator, for example) still need their own pattern. */
    private readonly odd = new Map<string, RegExp>();

    constructor(names: Iterable<string>) {
        for (const name of names) {
            if (PLAIN_NAME.test(name)) {
                this.plain.add(name);
            } else {
                this.odd.set(name, new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`));
            }
        }
    }

    mentioned(code: string): string[] {
        const found = new Set<string>();
        for (const match of code.matchAll(IDENTIFIER_CALL)) {
            const text = match[0];
            if (this.plain.has(text)) { found.add(text); }
            const dot = text.indexOf('.');
            if (dot >= 0) {
                const last = text.slice(dot + 1);
                if (this.plain.has(last)) { found.add(last); }
            }
        }
        for (const [name, pattern] of this.odd) {
            if (pattern.test(code)) { found.add(name); }
        }
        return Array.from(found);
    }
}
