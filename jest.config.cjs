module.exports = {
  transform: {
    '^.+\\.m?[jt]s$': 'babel-jest' // ✅ 支持 .js 和 .mjs（甚至 .ts）
  },
  testMatch: ['**/__tests__/**/*.test.mjs'] // ✅ 匹配你的 crypt.test.mjs 测试文件
};
