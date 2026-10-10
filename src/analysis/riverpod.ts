import { typeUsage } from './type_usage';

/**
 * Riverpod reads a provider *variable* (`ref.watch(userProvider)`), and the class behind it is only known by following
 * that variable to where it is declared. This finds the declarations in the text of the files, and the providers that
 * a piece of code reads, so the code can be linked to the classes the providers hold. Both expect comment-free,
 * string-free text (see stripCommentsAndStrings).
 */

/** The providers declared in a file, each with the classes of the project its declaration names. */
export function providerDeclarations(text: string, classNames: ReadonlySet<string>): Map<string, string[]> {
    const found = new Map<string, string[]>();
    if (!/Provider|iverpod/.test(text)) { return found; }

    // final userProvider = StateNotifierProvider<UserNotifier, UserState>((ref) => UserNotifier(...));
    // final counterProvider = NotifierProvider<Counter, int>(Counter.new);
    const declaration = /(?:^|[;}\n])\s*(?:final|const|var)\s+(?:[\w<>?, ]+\s+)?([a-z_]\w*)\s*=\s*(?:\w+\.)?(\w*Provider\w*)\b(?:\s*\.\s*\w+)*\s*(<[^;(]*>)?\s*\(/g;
    for (const match of text.matchAll(declaration)) {
        const open = match.index! + match[0].length - 1;
        const end = matchingParenthesis(text, open);
        // The provider type itself (StateNotifierProvider) is not something it holds.
        const body = text.slice(match.index! + match[0].indexOf(match[2]) + match[2].length, end + 1);
        found.set(match[1], classesIn(body, classNames));
    }

    // @riverpod class Counter extends _$Counter {}            -> counterProvider holds Counter
    // @riverpod Future<List<Todo>> todos(Ref ref) async {}   -> todosProvider holds Todo
    for (const match of text.matchAll(/@[Rr]iverpod\b(?:\s*\([^)]*\))?\s*(?:(?:abstract|final)\s+)*(class\s+([A-Z]\w*)|([\w<>?, ]+?)\s+([a-z_]\w*)\s*\()/g)) {
        if (match[2]) {
            found.set(lowerFirst(match[2]) + 'Provider', classNames.has(match[2]) ? [match[2]] : []);
        } else {
            found.set(match[4] + 'Provider', classesIn(match[3], classNames));
        }
    }
    return found;
}

/** The providers a piece of code reads, writes or listens to: ref.watch(x), ref.read(x.notifier), ref.listen(x(id), ...). */
export function watchedProviders(code: string): string[] {
    const names = new Set<string>();
    for (const match of code.matchAll(/\b(?:ref|widgetRef|container)\s*\.\s*(?:watch|read|listen|listenManual|refresh|invalidate|exists)\s*\(\s*([A-Za-z_$][\w$]*)/g)) {
        names.add(match[1]);
    }
    return Array.from(names);
}

function classesIn(code: string, classNames: ReadonlySet<string>): string[] {
    const usage = typeUsage(code, classNames);
    const tearOffs = Array.from(code.matchAll(/(?<![\w$.])([A-Z][\w$]*)\s*\.\s*new\b/g)).map(m => m[1]).filter(n => classNames.has(n));
    return Array.from(new Set([...usage.used, ...usage.created, ...tearOffs]));
}

function matchingParenthesis(text: string, open: number): number {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '(') { depth++; }
        else if (text[i] === ')') { depth--; if (depth === 0) { return i; } }
    }
    return text.length - 1;
}

function lowerFirst(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1);
}
