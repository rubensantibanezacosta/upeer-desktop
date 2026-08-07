export interface ConcurrencyTask<T> {
    run: () => Promise<T>;
}

export async function runWithConcurrency<T>(
    tasks: ConcurrencyTask<T>[],
    concurrency: number,
): Promise<T[]> {
    const limit = Math.max(1, Math.floor(concurrency));
    const results: T[] = new Array(tasks.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
        while (nextIndex < tasks.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await tasks[currentIndex].run();
        }
    };

    const workerCount = Math.min(limit, tasks.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i += 1) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

export async function runWithConcurrencyMap<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    return runWithConcurrency(
        items.map((item) => ({ run: () => fn(item) })),
        concurrency,
    );
}
