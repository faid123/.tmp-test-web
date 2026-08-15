// Flat config (.mjs — the package is CommonJS, so a .js config written as ESM
// would crash ESLint's loader; the previous eslint.config.js did exactly that
// and was never actually runnable).
//
// Philosophy: no-undef is the closest thing this no-build codebase has to a
// compiler — typo'd globals and missing imports otherwise surface only when a
// user opens the page. Correctness rules gate CI (errors); style-adjacent
// rules stay warnings so they never block a deploy.
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/",
      "coverage/",
      "vendor/",           // pinned third-party builds — not ours to lint
      "assets/",
      "postman/",
      "docs/",
      "Documentations/",
      "tools/",            // C# utility, no JS
      "Sort case list/",   // static design reference, not app code
      "**/*.bak*",
    ],
  },

  js.configs.recommended,

  {
    rules: {
      // The codebase deliberately keeps empty catches ("offline is fine here").
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Signals, not crashes: dead stores are mostly defensive `= null` inits,
      // and the escapes are semantics-neutral by the rule's own definition.
      "no-useless-assignment": "warn",
      "no-useless-escape": "warn",
    },
  },

  // App code: browser ES modules, no build step.
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        // <script>-tag libraries (vendor/): declared per page, global at runtime.
        JSZip: "readonly",
        QRCode: "readonly",
        html2canvas: "readonly",
        // Injected by webpack DefinePlugin into the viewer bundle.
        process: "readonly",
      },
    },
  },

  // Dual-environment base64: atob/btoa in the browser, Buffer under Node-run tests.
  {
    files: ["src/js/2D/dotnetBinaryFormatter.js", "src/js/2D/jawStructCodec.js"],
    languageOptions: { globals: { Buffer: "readonly" } },
  },

  // Jest suites (jsdom + node mixed via per-file docblocks).
  {
    files: ["__tests__/**"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.jest, ...globals.node, ...globals.browser },
    },
  },

  // k6 load-test script, not a Jest suite — k6 injects its own globals.
  {
    files: ["__tests__/stress-test.js"],
    languageOptions: { globals: { __VU: "readonly", __ITER: "readonly" } },
  },

  // Root-level tooling: webpack/babel/jest configs are CommonJS…
  {
    files: ["*.js", "*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  // …and the .mjs scripts (vite config, one-off node tools) are ESM.
  {
    files: ["*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.node,
    },
  },
];
