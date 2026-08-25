# Scenario: CI/CD and deployment setup

Covers three things: how the current pipeline works, how to point it at different branches, and
how to rebuild the whole thing from scratch on a new repo.

## What actually runs today

CI/CD is **GitHub Actions only** — `.github/workflows/deploy.yml`. There is a `Jenkinsfile` still
sitting in the repo root; it's retired history, not live. Local Jenkins was uninstalled
2026-07-17. Don't reference Jenkins commands, `~/.jenkins` paths, or the nginx/EC2 production
split described in `.kiro/specs/git-based-uat-deployment/design.md` — that design doc's UAT/prod
nginx split was never actually built. What's live is simpler:

**GitHub Pages *is* the UAT/test site.** `https://faid123.github.io/.tmp-test-web/` is not a
staging step in front of something else — it's the thing itself.

### The pipeline, step by step

Trigger: push to **`nyunt/dev-deploy`**, or manual `workflow_dispatch` from the Actions tab.

1. Checkout the pushed commit.
2. Set up Node 22.
3. `npm ci` (deterministic install from `package-lock.json`).
4. `npm run test:ci` — **fail-closed gate**. If tests fail, the job stops here; nothing deploys.
5. `npm run build`, then verify `dist/bundle.js` exists.
6. Build `manifest.json`: revision SHA, run number, a sha256 digest over every tracked file plus
   the freshly built `dist/bundle.js`, timestamp, site URL. (The digest step null-delimits
   filenames — several asset directories have spaces in their names, e.g. `instruction editor/`.)
7. Check out the Pages branch (`nyunt/dev-W7.1`) into a separate path.
8. Wipe that branch's contents (except `.git`), replace them with `git archive` of the verified
   commit, drop in the freshly built `dist/bundle.js` and `manifest.json`, touch `.nojekyll`.
9. Commit and push to `nyunt/dev-W7.1`. History is preserved, so any previous deploy is one commit
   back if you need to roll back.
10. Explicitly `POST /repos/{repo}/pages/builds` — pushes made with the built-in `GITHUB_TOKEN`
    don't auto-trigger GitHub's legacy Pages build, so this call is required, not optional.

Auth is the built-in `GITHUB_TOKEN` (`permissions: contents: write, pages: write` in the
workflow) — no personal access token needed for the pipeline itself. A `concurrency` group
serializes runs so two deploys can't race and push the Pages branch at the same time.

GitHub Pages' **source branch/path is set in repo Settings → Pages** (`nyunt/dev-W7.1`, root `/`)
— that's not visible in this repo's files, only in GitHub's UI, and only an admin can change it.

### How to trigger a deploy

Push (or fast-forward) your integration branch's tip onto `nyunt/dev-deploy`:

```bash
git push origin nyunt/integration_3:nyunt/dev-deploy
```

Or go to Actions → "Deploy Test Site" → Run workflow.

## Pointing the pipeline at different branches

If `nyunt/dev-deploy` or `nyunt/dev-W7.1` ever need to change (retired, renamed, or you're setting
up a second, independent deploy target):

1. Edit `.github/workflows/deploy.yml`:
   - `on.push.branches` — the trigger branch (currently `[nyunt/dev-deploy]`).
   - `env.PAGES_BRANCH` — the branch GitHub Pages actually serves (currently `nyunt/dev-W7.1`).
   - `env.SITE_URL` — cosmetic, goes into `manifest.json`.
2. Make sure the new Pages branch exists. If it doesn't yet:
   ```bash
   git checkout --orphan <new-pages-branch>
   git rm -rf .
   git commit --allow-empty -m "init pages branch"
   git push origin <new-pages-branch>
   ```
3. Update **Settings → Pages → Build and deployment → source branch** to match (needs admin
   access on the repo — see note below).
4. Push a commit to the new trigger branch and confirm the Action runs green end-to-end.

Pushing changes to `.github/workflows/*.yml` yourself requires a git credential with the
`workflow` OAuth scope — see [Troubleshooting](04-troubleshooting.md) if that push is rejected.

## Setting this up from scratch on a brand-new repo

For a fork, a migrated repo, or disaster recovery where the GitHub-side config is gone even
though the code is intact:

1. Push the codebase to the new repo (all branches you care about, or at least a trigger branch
   and a Pages branch — they can be the same branch if you don't need the separate-branch
   indirection this repo uses).
2. Copy `.github/workflows/deploy.yml` in, and update `branches`, `PAGES_BRANCH`, and `SITE_URL`
   for the new repo.
3. **Settings → Actions → General → Workflow permissions**: set to "Read and write permissions".
   This is what lets the built-in `GITHUB_TOKEN` satisfy the workflow's `contents: write` and
   `pages: write` — no PAT/secret needs to be created for this pipeline.
4. **Settings → Pages**: set source = your Pages branch, folder `/`.
5. Push to the trigger branch (or run the workflow manually) and confirm: green run → commit
   lands on the Pages branch → site loads at the new Pages URL.

## Access note

Push access to this repo does **not** imply admin access. Changing the Pages source branch,
adding webhooks, or changing Actions permissions requires a repo admin — if you hit a wall on any
of the Settings-based steps above, that's why.

## Superseded documentation

`Documentations/backup/How to setup.docx` and `Github Pages setup information.docx` describe an
earlier, different repo (`Wyl-ASG/webrpd_code` → `Wyl-ASG/finale`), a hardcoded IP-based API
endpoint, and a manual two-repo (source repo + separate build repo, copy-pasted `bundle.js`)
deploy process. None of that reflects this repo. This document is the current source of truth for
deployment.
