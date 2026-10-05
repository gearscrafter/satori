/**
 * Returns the part of a (comment-free) method source that can contain calls: everything after the
 * parameter list, or after `=>` / `{` for a getter. The method's own name is written in its signature
 * followed by "(", and without this cut it would be mistaken for a call to itself.
 * Abstract declarations have no body, so they give an empty string.
 */
export function methodBody(source: string): string {
    let depth = 0;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            depth--;
            if (depth === 0) {
                const rest = source.slice(i + 1);
                return /^\s*;/.test(rest) ? '' : rest;
            }
        } else if (depth === 0 && (ch === '{' || (ch === '=' && source[i + 1] === '>'))) {
            return source.slice(i);
        } else if (depth === 0 && ch === ';') {
            return '';
        }
    }
    return '';
}
