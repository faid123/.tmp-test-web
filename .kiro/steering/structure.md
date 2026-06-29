# Project Structure

```
/
├── index.html                  # Login page (app entry point)
├── src/
│   ├── index.js                # Main 3D viewer entry (Three.js scene, polylines, controls)
│   ├── ApiClient.js            # HTTP client for SmartRPD backend API
│   ├── config.js               # Centralized client-side config & credentials
│   ├── STLMeshLoader.js        # Custom STL file loader
│   ├── OFFLoader.js            # Custom OFF file loader
│   ├── artificialTeeth.js      # Artificial teeth rendering module
│   ├── newControls.js          # Visibility & transparency UI controls
│   ├── control.js              # Legacy control utilities
│   ├── crypt.js                # URL param encryption/decryption
│   ├── resetButton.js          # Camera reset button
│   ├── js/                     # Feature modules (page-specific logic)
│   │   ├── login.js
│   │   ├── dashboard.js
│   │   ├── createCase.js
│   │   ├── caseManagement.js
│   │   ├── chat.js
│   │   ├── 2Dannotation.js
│   │   ├── authGuard.js
│   │   ├── appSidebar.js
│   │   ├── viewerShell.js
│   │   ├── notifications.js
│   │   ├── versionHistory.js
│   │   ├── ThreeDMobile.js
│   │   ├── accessibility.js
│   │   ├── apiLog.js
│   │   └── toast.js
│   └── pages/                  # HTML page templates
│       ├── case_list.html
│       ├── ThreeDViewer.html
│       ├── 2DAnnotation.html
│       ├── AnnotationHistory.html
│       └── VersionHistory.html
├── css/                        # Page-specific stylesheets
├── assets/                     # Icons, images, RPD component graphics
├── dist/                       # Webpack production bundle output
├── __tests__/                  # Jest unit tests (*.test.mjs)
├── postman/                    # API test collections
├── tools/                      # Internal utilities (MetaInspect)
├── Documentations/             # Project documentation (Word/PDF)
├── Sort case list/             # Separate React/Tailwind app (case sorting UI)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── app/App.tsx
│   │   └── app/components/ui/  # shadcn/ui components
│   └── package.json            # Uses pnpm, Vite, React 18, Tailwind 4
├── vite.config.mjs             # Dev server config (main app)
├── webpack.config.js           # Production build config
├── jest.config.cjs             # Test runner config
├── eslint.config.js            # Lint rules (flat config)
├── Dockerfile                  # nginx:alpine production image
├── Jenkinsfile                 # CI/CD pipeline
└── nginx.conf                  # Production server config
```

## Architecture Notes

- The main app is a **multi-page static site**. Each page loads its own JS module via `<script>` tags.
- `src/index.js` is the 3D viewer entry point — it is bundled by webpack into `dist/bundle.js` for production.
- Page-specific JS lives in `src/js/` and is loaded directly by HTML pages (not bundled).
- The `Sort case list/` directory is a **standalone React app** with its own build pipeline (pnpm + Vite). It is not part of the main webpack build.
- CSS is organized per-page in the `css/` directory and linked via `<link>` tags.
- Tests use `.mjs` extension and live in `__tests__/` at the project root.
