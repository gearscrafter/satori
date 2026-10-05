import path from 'path';

function canonical(p: string): string {
    const resolved = path.resolve(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * True when `child` is `parent` or lives inside it, ignoring separator style
 * and, on Windows, drive-letter/case differences.
 */
export function isPathInside(child: string, parent: string): boolean {
    const c = canonical(child);
    const p = canonical(parent);
    return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}
