# Troubleshooting setup issues

**`npm run build` fails with a permission error on webpack**
`chmod +x node_modules/.bin/webpack`, then retry. Seen on some hosts after `npm install`; the
current GitHub Actions runners haven't needed this, but it's a known one from earlier
Jenkins-based deploys.

**Push to `.github/workflows/*.yml` gets rejected**
Your git credential lacks the `workflow` OAuth scope (a plain `repo` scope isn't enough for
GitHub to accept changes under `.github/workflows/`). If you're using `gh`:
```bash
gh auth refresh -s workflow
```
Then retry the push.

**The Action runs green but https://faid123.github.io/.tmp-test-web/ doesn't show the change**
The workflow's last step explicitly requests a Pages rebuild
(`POST /repos/{repo}/pages/builds`) because pushes made with `GITHUB_TOKEN` don't auto-trigger
GitHub's legacy Pages build — check that step's log for a failure. If it succeeded, also confirm
in **Settings → Pages** that the source branch is still `nyunt/dev-W7.1` / `/` — only a repo admin
can see/change this, so ask one if you don't have access.

**Local dev server loads, but nothing works (login fails, case list empty, etc.)**
This app has no local backend. Everything goes through the live API at
`https://live.api.smartrpdai.com/api/smartrpd` — confirm you have network access to that host and
a valid SmartRPD login. This is expected behavior, not a broken local setup.

**You added a `.env` file for convenience and now secrets show up in `dist/bundle.js`**
`webpack.config.js` loads `.env` via `dotenv` and injects the *entire* `process.env` into the
bundle via `DefinePlugin`. There's currently no `.env` in this repo — keep it that way, or be
deliberate about what you put in one. This bundle ships to a public GitHub Pages URL.

**A script you wrote to loop over repo files skips files with spaces in their names**
Some asset directories legitimately contain spaces (e.g. `instruction editor/`,
`Plalatal Plate/`). Use null-delimited iteration (`find -print0`, `git ls-files -z`, `xargs -0`),
not newline-splitting — the deploy workflow's own manifest-digest step does this for the same
reason.

**You can't change GitHub Pages settings, add a webhook, or edit Actions permissions**
Push access to this repo doesn't include admin access. Those are admin-only settings — ask
someone with admin on `faid123/.tmp-test-web`.

**You're not sure which branch has "the real" current code**
`main` is stale/diverged — see [02 — Branching and collaboration](02-branching-and-collaboration.md).
Check the latest `nyunt/integration_N` branch instead.

**`Documentations/AutoTest Results/` looks stale after a deploy**
The deploy-triggered refresh step is merged and live in `deploy.yml` (confirmed 2026-08-20), so
first check whether it actually ran (Actions tab, the deploy run's last few steps) — a failed
alignment check or `npm ci` error there would skip the rest silently-ish. If it ran clean, it may
just have found nothing changed (`npm audit`/test output can be identical between two deploys —
that's not a bug). Run it manually to force a check: `node tools/deploy-review.mjs` from a
`dev-deploy-documentation` checkout. Remember: this only refreshes `AutoTest Results/`'s raw data,
never the narrative `.docx` documents — and since 2026-08-20, `Documentations/` itself lives on
`nyunt/dev-W7.1` as the primary copy, with `dev-deploy-documentation` as a mirrored backup, not
the source of truth. See [Deploy Documentation Review](../DEPLOY_DOC_REVIEW.md).
