/**
 * @jest-environment jsdom
 */

describe('sortCases function', () => {
  const originalCases = [
    { case_id: 101, creation_date: 1700000000, username: 'Zoe' },
    { case_id: 99, creation_date: 1600000000, username: 'Alice' }
  ];

  // 修复排序逻辑：数字字段不转小写
  const sortCases = (list, key, order = 'asc') => {
    return [...list].sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      // 时间字段转 Date
      if (key.includes('date')) {
        valA = new Date(valA * 1000);
        valB = new Date(valB * 1000);
      }

      // 字符串字段统一为小写比较
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      const result = valA < valB ? -1 : valA > valB ? 1 : 0;
      return order === 'asc' ? result : -result;
    });
  };

  test('should sort by case_id ascending', () => {
    const sorted = sortCases(originalCases, 'case_id', 'asc');
    expect(sorted[0].case_id).toBe(99);
    expect(sorted[1].case_id).toBe(101);
  });

  test('should sort by username descending', () => {
    const sorted = sortCases(originalCases, 'username', 'desc');
    expect(sorted[0].username).toBe('Zoe');
    expect(sorted[1].username).toBe('Alice');
  });

  test('should sort by creation_date ascending', () => {
    const sorted = sortCases(originalCases, 'creation_date', 'asc');
    expect(sorted[0].creation_date).toBe(1600000000);
  });
});
