/** Bound vault I/O while avoiding one disk/sync round trip per note. */
export async function readBatches<T, R>(items: readonly T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += 16) {
    results.push(...await Promise.all(items.slice(start, start + 16).map(read)));
  }
  return results;
}
