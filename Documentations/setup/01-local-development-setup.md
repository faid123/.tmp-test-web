# Scenario: Local development setup (from scratch)

For a brand-new machine that has never had this project on it before.

## Prerequisites

- **Node.js 22.x** and npm (bundled with Node). This matches the version CI uses
  (`.github/workflows/deploy.yml` pins `node-version: 22`) — using the same major version avoids
  "works in CI, not locally" surprises.
- **Git**.
- A GitHub account with access to `faid123/.tmp-test-web`.
- Recommended: [GitHub CLI](https://cli.github.com/) (`gh`), authenticated with `gh auth login`.
  Plain HTTPS+password won't work (GitHub requires a token); `gh` sets up a credential helper for
  you. Make sure the token includes the `workflow` scope if you'll ever touch
  `.github/workflows/*.yml` (see [03](03-cicd-and-deployment-setup.md)) —
  `gh auth login` prompts for scopes, or add it later with `gh auth refresh -s workflow`.
- macOS, Linux, or Windows all work — this is a plain Node/npm project, nothing platform-specific.

## 1. Clone

```bash
git clone https://github.com/faid123/.tmp-test-web.git
cd .tmp-test-web
```

## 2. Install dependencies

```bash
npm install
```

If `npm run build` later fails with a permission error on the webpack binary, see
[Troubleshooting](04-troubleshooting.md).

## 3. Run the dev server

```bash
npm run dev
```

This starts Vite on port 8089. Open **http://localhost:8089/index.html** — that's the login page.

This app has **no local backend**. Every screen talks to the live API at
`https://live.api.smartrpdai.com/api/smartrpd`, so you need working network access to that host
and a valid SmartRPD login. Dev/test identifiers (machine ID, viewer UUID, a login credential)
are already centralized in `src/js/shared/config.js` — that file is flagged in its own comments
as a known security item (credentials shipped to the browser bundle are readable in DevTools, not
actually secret), so don't extend that pattern and don't copy those values into other files or
docs.

If you just want to exercise the API directly without the UI, there's a Postman collection +
environment in `postman/` (`smartrpd.postman_collection.json`,
`smartrpd-env.postman_environment.json`).

## 4. Run tests

```bash
npm test          # Jest, local/watch-friendly
npm run test:ci   # Jest --ci --coverage — what CI actually runs before it will deploy
```

As of this writing: **13 suites / 221 tests**, all passing, and every suite imports the real
`src/` module it claims to test (no hardcoded-placeholder or hand-copied-logic suites in the
current tree). Covers login/password-reset, dashboard, case enrichment, 2D annotation (jaw-struct
codec, clinical info, reciprocating-component rules), the artificial-teeth 3D decode layer, the
help assistant, and a repo-wide import-resolution check. It does **not** yet cover case creation,
chat/notifications, STL upload, version history, download/export, or responsive layout — those
rely on manual UAT for now.

To get a suite-by-suite breakdown mapped against the app's 12 standing UAT workflow cases (which
suites are real vs. placeholder, which UAT workflows have zero automated coverage), run:

```bash
node tools/weekly-doc-review.mjs
```

This branch does not carry a `tools/run-uat-automated-tests.mjs` wrapper script (some other
branches do) — `weekly-doc-review.mjs` invokes the underlying Jest/`npm audit` commands directly
and regenerates `Documentations/AutoTest Results/automated-test-run.json` (structured),
`automated-test-run-log.txt` (full Jest output), and an `npm-audit-run.json`/`.txt` pair. It also
writes a dated review report (`Documentations/AutoTest Results/weekly-review-YYYY-MM-DD.md`)
flagging which of the narrative `.docx` documents likely need a manual update given what changed
since the last run — see [Documentations/WEEKLY_DOC_REVIEW.md](../WEEKLY_DOC_REVIEW.md) for the
full process. `UAT_Report.docx` §2 (the UAT-mapped automated rollup) and the other narrative
reports are authored separately, not auto-generated — re-run the script, read its report, then
update the relevant `.docx` files (by hand, or by asking whoever/whatever last built them to redo
it) so neither goes stale.

## 5. Production build

```bash
npm run build
```

This runs Webpack and produces `dist/bundle.js` — the single artifact that actually ships to the
live site (see [03](03-cicd-and-deployment-setup.md)). A few things worth knowing:

- `dist/bundle.js` is **tracked in git** (a legacy habit from before CI existed). Running a local
  build will typically show it as modified in `git status` — that's expected, and you don't need
  to commit it yourself; the deploy pipeline rebuilds and publishes its own copy on every deploy.
- `webpack.config.js` loads a local `.env` file (via `dotenv`) and injects the **entire**
  `process.env` into the bundle via `DefinePlugin`. There's no `.env` file in this repo today —
  keep it that way, or scope it carefully. If you ever add one for local convenience, anything in
  it becomes visible in the shipped, public bundle the next time someone builds and deploys.

## 6. Optional: preview the production build locally

```bash
npm run build
npm start   # npx serve, serves the repo root including dist/bundle.js
```

Or, closer to a real static host (this is **not** how the live site is actually hosted — see
[03](03-cicd-and-deployment-setup.md) — but useful for sanity-checking nginx-style serving):

```bash
docker build -t smartrpd-web .
docker run --rm -p 8080:80 smartrpd-web
```

Then open http://localhost:8080.
