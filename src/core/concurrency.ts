const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export interface RetryOutcome<T> {
    result: T;
    attempts: number;
    /** True when every attempt was used and the result still did not satisfy `isDone`. */
    exhausted: boolean;
}

/**
 * Calls `operation` until `isDone` accepts its result, waiting `delaysMs[i]` before retry `i`.
 * Used for language-server requests that answer "nothing" while the server is still warming up.
 */
export async function retryUntil<T>(
    operation: () => Promise<T>,
    isDone: (result: T) => boolean,
    delaysMs: number[],
    sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<RetryOutcome<T>> {
    let result = await operation();
    let attempts = 1;
    for (const delay of delaysMs) {
        if (isDone(result)) { return { result, attempts, exhausted: false }; }
        await sleep(delay);
        result = await operation();
        attempts++;
    }
    return { result, attempts, exhausted: !isDone(result) };
}

/** Runs `fn` over `items` with at most `limit` calls in flight, keeping results in input order. */
export async function mapLimited<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;

    async function worker(): Promise<void> {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index], index);
        }
    }

    await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
    return results;
}
