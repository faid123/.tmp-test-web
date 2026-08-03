// Vite is BOTH the dev server (`npm run dev`) and the production build
// (`npm run build`) — webpack is gone. Every HTML page is an entry; the build
// mirrors the source URL structure into dist/ so cross-page links, the
// github.io subpath, and every runtime-computed path keep working unchanged.
//
// Three directories ship VERBATIM alongside the hashed bundles because JS
// builds paths to them as runtime strings Vite cannot see:
//   assets/  — icon/image paths concatenated in JS ("../../assets/…")
//   css/     — pageTour/helpBot/changePassword inject <link>s at runtime
//   vendor/  — classic-script libs (jszip, qrcode…) + FA webfonts
// The <link>/<img> references Vite CAN see still get hashed — only the
// runtime-string stragglers load from the verbatim copies.
import { defineConfig } from "vite";
import { resolve } from "node:path";
import { cpSync } from "node:fs";

const r = (p) => resolve(import.meta.dirname, p);

export default defineConfig({
  // Relative asset URLs: the site runs at / locally and /.tmp-test-web/ on
  // GitHub Pages — a fixed base would break one of them.
  base: "./",

  // This project loads its stylesheets via plain <link href="..."> tags rather
  // than JS imports, so Vite does NOT hot-reload them — no-store makes every
  // reload fetch fresh files during development.
  server: { headers: { "Cache-Control": "no-store" } },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        login: r("index.html"),
        annotation2d: r("src/pages/2DAnnotation.html"),
        caseList: r("src/pages/case_list.html"),
        viewer3d: r("src/pages/ThreeDViewer.html"),
        annotationHistory: r("src/pages/AnnotationHistory.html"),
        versionHistory: r("src/pages/VersionHistory.html"),
        testPage: r("src/pages/test.html"),
        testViewEdited: r("src/pages/test_view_edited.html"),
        adminUsers: r("src/pages/admin/admin_users.html"),
        adminCaseList: r("src/pages/admin/admin_case_list.html"),
        adminMachineId: r("src/pages/admin/admin_machineid.html"),
      },
    },
  },

  plugins: [
    {
      name: "copy-runtime-referenced-dirs",
      apply: "build",
      closeBundle() {
        for (const dir of ["assets", "css", "vendor"]) {
          cpSync(r(dir), r(`dist/${dir}`), { recursive: true });
        }
      },
    },
  ],
});
