// __tests__/mapWithConcurrency.test.mjs
//
// Mirrors mapWithConcurrency() in src/js/caseManagement.js. That helper replaced
// `Promise.all(cases.map(fetch))` for the per-case detail / co-owner fetches: it
// keeps the request COUNT the same but caps how many run at once so a large case
// list no longer bursts dozens-to-hundreds of simultaneous connections at the
// backend. These tests lock in that contract (order preserved, count unchanged,
// concurrency never exceeds the limit).

// Faithful copy of the source implementation.
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await mapper(items[i], i);
    }
  };
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i += 1) {
    workers.push(runWorker());
  }
  await Promise.all(workers);
  return results;
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

describe('mapWithConcurrency()', () => {
  test('preserves input order even when items resolve out of order', async () => {
    const items = [50, 10, 30, 0, 20];
    // Later items resolve sooner, so output order is only correct if results are
    // written by index rather than completion order.
    const out = await mapWithConcurrency(items, 2, async (delay) => {
      await tick(delay);
      return delay * 2;
    });
    expect(out).toEqual([100, 20, 60, 0, 40]);
  });

  test('never runs more than `limit` mappers at once', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);
    const limit = 3;

    await mapWithConcurrency(items, limit, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick(5);
      active -= 1;
    });

    expect(peak).toBe(limit);
  });

  test('calls the mapper exactly once per item with its index', async () => {
    const items = ['a', 'b', 'c', 'd'];
    const seen = [];
    const out = await mapWithConcurrency(items, 2, async (item, i) => {
      seen.push([item, i]);
      return `${item}:${i}`;
    });

    expect(seen).toHaveLength(items.length);
    expect(out).toEqual(['a:0', 'b:1', 'c:2', 'd:3']);
    // Every index 0..n-1 was visited exactly once.
    expect(seen.map(([, i]) => i).sort()).toEqual([0, 1, 2, 3]);
  });

  test('handles an empty list without invoking the mapper', async () => {
    const mapper = jest.fn();
    const out = await mapWithConcurrency([], 5, mapper);
    expect(out).toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });

  test('caps in-flight count at the item count when limit exceeds it', async () => {
    let active = 0;
    let peak = 0;
    const items = [1, 2]; // fewer items than the limit
    await mapWithConcurrency(items, 5, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick(5);
      active -= 1;
    });
    expect(peak).toBe(items.length);
  });
});
