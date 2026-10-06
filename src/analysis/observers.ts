/**
 * Types of state holders a piece of code listens to, found from how the widgets of the common packages are
 * written: `BlocBuilder<CounterCubit, int>`, `context.read<Session>()`, `Provider.of<Cart>(context)`,
 * `Get.find<Profile>()`. It expects comment-free, string-free text (see stripCommentsAndStrings).
 *
 * Riverpod is not covered: it reads a provider *variable* (`ref.watch(counterProvider)`) and the class behind
 * it is only known by following that variable, which needs more than the text of one method.
 */
const OBSERVER_PATTERNS: RegExp[] = [
    // Widgets that rebuild or react: the first type argument is the holder.
    /\b(?:BlocBuilder|BlocListener|BlocConsumer|BlocSelector|Consumer|Selector|ValueListenableBuilder)\s*<\s*([A-Z]\w*)/g,
    // context.read<T>() / context.watch<T>() / context.select<T, R>()
    /\bcontext\s*\.\s*(?:read|watch|select)\s*<\s*([A-Z]\w*)/g,
    // BlocProvider.of<T>(context), Provider.of<T>(context), RepositoryProvider.of<T>(context)
    /\b(?:BlocProvider|RepositoryProvider|Provider)\s*\.\s*of\s*<\s*([A-Z]\w*)/g,
    // GetX
    /\bGet\s*\.\s*(?:find|put|lazyPut)\s*<\s*([A-Z]\w*)/g
];

export function observedTypeNames(source: string): string[] {
    const found = new Set<string>();
    for (const pattern of OBSERVER_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
            found.add(match[1]);
        }
    }
    return Array.from(found);
}
