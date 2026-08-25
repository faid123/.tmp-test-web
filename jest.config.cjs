// Pin the clock east of UTC so the local-vs-UTC date regression tests
// (localDateFormatting.test.mjs) reproduce on any machine, incl. UTC CI runners.
// Must live here: V8 caches the zone before setupFiles or a test body runs.
process.env.TZ = 'Asia/Singapore';

module.exports = {
  transform: {
    '^.+\\.m?[jt]s$': 'babel-jest' // ✅ 支持 .js 和 .mjs（甚至 .ts）
  },
  testMatch: ['**/__tests__/**/*.test.mjs'], // ✅ 匹配你的 crypt.test.mjs 测试文件；helpers/ 与 fixtures/ 不算测试
  setupFiles: ['<rootDir>/jest.setup.cjs'] // 静音 src 的调试日志
};
