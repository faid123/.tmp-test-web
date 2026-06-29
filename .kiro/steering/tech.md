# Tech Stack & Build System

## Core Technologies

| Layer | Technology |
|-------|-----------|
| 3D Rendering | Three.js (v0.165) with OrbitControls, TrackballControls |
| Language | Vanilla JavaScript (ES modules, ECMAScript 2022) |
| Bundler (prod) | Webpack 5 → `dist/bundle.js` (UMD) |
| Dev Server | Vite (port 8089, no-cache headers) |
| Styling | Plain CSS (per-page stylesheets in `css/`) |
| Testing | Jest (jsdom) with Babel transpilation |
| E2E | Playwright |
| Linting | ESLint (flat config, recommended rules) |
| Deployment | Docker (nginx:alpine), Jenkins CI |
| Secondary UI | React + Vite + Tailwind CSS 4 + shadcn/ui (in `Sort case list/`) |

## Key Libraries

- `three` / `three-stdlib` – 3D scene, loaders, controls
- `dat.gui` – Debug UI panels
- `dotenv` – Environment variable loading at build time

## Commands

```bash
# Development server (main app)
npm run dev            # vite --port 8089

# Production build (webpack bundle)
npm run build          # npx webpack --mode production

# Run unit tests
npm test               # jest
npm run test:ci        # jest --ci --coverage

# Serve production build
npm start              # npx serve

# Secondary app (Sort case list)
cd "Sort case list"
pnpm run dev           # vite dev server
pnpm run build         # vite build
```

## Code Style Rules (ESLint)

- Semicolons required
- Single quotes enforced
- `no-undef` is an error
- Unused vars are warnings (prefix unused args with `_`)

## Environment & Config

- `src/config.js` – Centralized client-side identifiers (machine ID, viewer UUID, login credentials). These are NOT secret; they ship to the browser.
- Webpack injects `process.env` via `DefinePlugin`
- Vite config disables caching for rapid CSS/JS iteration during dev
