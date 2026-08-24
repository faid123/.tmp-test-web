# Deploy Documentation Review

*(Renamed 2026-08-24 from `WEEKLY_DOC_REVIEW.md` — the refresh is deploy-triggered, not
calendar-scheduled. The manual-trigger workflow, `.github/workflows/weekly-doc-review.yml`, was
renamed the same day to `deploy-review.yml` for the same reason — see "What runs it" below. The
dated `weekly-review-<date>.md` reports keep their existing name for now, unchanged by this pass.)*

**`Documentations/` itself now lives on `nyunt/dev-W7.1` as the primary copy (since 2026-08-20),
mirrored by hand to `dev-deploy-documentation`.** What this page describes hasn't changed, though:
`Documentations/AutoTest Results/`'s raw data (test counts, coverage, dependency-audit) is still
refreshed automatically on `dev-deploy-documentation` specifically, whenever there's a push to the
live deploy branch — that part of the pipeline was built before the primary-copy move and hasn't
been re-pointed at `nyunt/dev-W7.1`. In practice this means the auto-refreshed data lands on the
*backup* branch first; carry it over to `nyunt/dev-W7.1` by hand (or re-run
`node tools/deploy-review.mjs` directly against `nyunt/dev-W7.1`, as this session did on
2026-08-20) until/unless the pipeline itself gets updated to target the new primary branch. This
exists because documentation can silently drift from what's actually live if nothing is checking —
see `git log` for what that looked like in practice before this process existed.

## What runs it

- **Automatic:** a step at the end of [`.github/workflows/deploy.yml`]
  (../.github/workflows/deploy.yml) on `nyunt/dev-deploy`. After every successful deploy it checks
  out `dev-deploy-documentation`, runs the script, and pushes back whatever changed — this checks
  alignment at the moment code actually goes live, rather than on any kind of fixed clock. *(Live as
  of 2026-08-20 — the `ci/deploy-doc-refresh` step is merged into `nyunt/dev-deploy`'s
  `deploy.yml`; no manual step needed for this path anymore.)*
- **Manual, on demand:** [`​.github/workflows/deploy-review.yml`]
  (../.github/workflows/deploy-review.yml) via **Actions → Deploy Documentation Review (Manual
  Trigger) → Run workflow**, or `node tools/deploy-review.mjs` locally. Useful for anything the
  automatic path wouldn't catch — e.g. `npm audit` output can change with zero code changes (the advisory database
  updates on its own), so a review can be worth running even in a week with no deploys at all.
- **Branch it runs on:** both checkout and push back to `dev-deploy-documentation` (this branch) —
  set via `DOCS_BRANCH` in `deploy.yml`, or `REVIEW_BRANCH` in the manual-trigger workflow.

Each run:

1. **Checks live-branch alignment — two signals.** First, parses the commit SHA out of
   `nyunt/dev-W7.1`'s latest `Deploy <sha> (run N)` commit message and confirms that SHA is still
   an ancestor of this branch's `HEAD`. If it isn't, the report says so loudly at the top — the docs
   branch has fallen behind what's actually live, and everything else in the report should be
   treated as reviewing the wrong code until that's resolved. Second, and independently, checks
   whether `nyunt/dev-deploy` (the branch that triggers a deploy) has moved past that deployed SHA
   — if so, a deploy is pending/overdue, which is informational rather than alarming on its own.
2. **Re-runs the real test suite** (`npx jest --ci --coverage --coverageReporters=json-summary
   --verbose --testLocationInResults --json`) and rebuilds
   `Documentations/AutoTest Results/automated-test-run.json` and `-log.txt` from the actual
   result — not copied from memory.
3. **Re-runs `npm audit`** and stores the raw output as `npm-audit-run.json` / `.txt`. Vulnerability
   counts can change even with zero code changes (the advisory database updates on its own), so
   this is re-run fresh every time rather than assumed stable.
4. **Diffs against the last recorded review** (`Documentations/AutoTest Results/
   .deploy-review-state.json`, renamed 2026-08-21 from `.weekly-review-state.json` — the refresh
   is deploy-triggered, not calendar-scheduled, so the old name was misleading) to list what
   commits landed since then, and heuristically flags which `.docx` documents likely need a
   manual update as a result (see `DOC_FLAG_RULES` in the script if you need to tune the mapping).
5. **Writes a dated report:** `Documentations/AutoTest Results/weekly-review-<YYYY-MM-DD>.md`, plus
   two ways to notice it without going and finding that file:
   - **`Documentations/AutoTest Results/DOCS_TO_UPDATE.md`** — a second copy of just the alignment
     status and the flagged-docs checklist, overwritten every run at a fixed filename. Unlike the
     dated report, there's no "which date is latest" to figure out — it's just always current.
   - When running in GitHub Actions, the full report is also appended straight into that run's own
     Summary tab (`$GITHUB_STEP_SUMMARY`) — visible on the deploy's Actions run page directly.
6. **Commits and pushes** the refreshed `Documentations/AutoTest Results/` files back to
   `dev-deploy-documentation`. It does **not** touch anything under `.docx` itself.

## What this does *not* do

The script updates data — test counts, coverage, vulnerability numbers, a list of what changed.
It does **not** rewrite the narrative `.docx` documents (security findings, TSK triage rows, UAT
case text). That content requires judgment a script can't safely automate: re-verifying which
findings still apply, writing new TSK rows for untriaged commits, and reconciling npm-audit deltas
against what actually changed in code versus what the advisory database changed on its own.

**How to act on a weekly report:**

1. Open the newest `Documentations/AutoTest Results/weekly-review-<date>.md`.
2. If the live-branch alignment check failed (⚠️), stop and resolve that first — figure out which
   branch actually contains what's deployed, and retarget the docs branch properly rather than
   refreshing data on top of the wrong code.
3. Otherwise, work through the "Docs likely needing a manual/AI-assisted update" checklist. For
   each flagged document, open it, compare against the current commits/test data, and update the
   prose table by table, verifying each claim against the actual code/data rather than
   search-and-replacing branch names.
4. Commit the `.docx` changes yourself (or ask an AI assistant to, pointing it at the week's
   report) — this part is intentionally not automated.

## Automatic path status

The former `ci/deploy-doc-refresh` step is merged into `nyunt/dev-deploy`'s `deploy.yml` (confirmed
2026-08-20). It's a `push` trigger on `deploy.yml`, so — unlike a `schedule:` trigger, which GitHub
Actions only reads from the repository's default branch — it fires on every deploy regardless of
which branch is actually the default. The manual trigger below still exists for anything the
automatic path wouldn't catch (e.g. weeks with no deploy at all).

## Local / manual run

```bash
npm ci                        # or npm install, if you haven't already
node tools/deploy-review.mjs
```

Requires `git fetch` access to `origin` for the live-branch alignment check (step 1); it degrades
gracefully (skips that check with a note) if there's no remote access, so it still works fully
offline for the test/audit refresh.

## Files this process owns

| File | Purpose |
|---|---|
| `tools/deploy-review.mjs` | The script CI actually runs. Renamed 2026-08-21 from `weekly-doc-review.mjs` — the refresh is deploy-triggered, not calendar-scheduled, so the old name was misleading. |
| `DevOps and Deployment.docx` §6 (Appendix) | Full source of `tools/deploy-review.mjs`, reproduced for reference. Replaced a same-named `Documentations/deploy-review.mjs` file on 2026-08-21 (too easy to confuse with the real script, and it risked drifting since the two weren't symlinked). **Not** what CI runs and has no automatic sync — re-paste it here if the script changes. |
| `.github/workflows/deploy-review.yml` | Manual/on-demand trigger only (Run workflow button) — see "Automatic path status" above. Renamed 2026-08-24 from `weekly-doc-review.yml`, same reasoning as the script rename. |
| `.github/workflows/deploy.yml` | Also runs this, from its last few steps, after every successful deploy (see "What runs it" above) — not owned by this process, but a change here can affect it. |
| `Documentations/AutoTest Results/automated-test-run.json` | Structured Jest results, UAT-mapped. |
| `Documentations/AutoTest Results/automated-test-run-log.txt` | Full Jest console output. |
| `Documentations/AutoTest Results/npm-audit-run.json` / `.txt` | Raw `npm audit` output. |
| `Documentations/AutoTest Results/weekly-review-<date>.md` | One dated report per run — kept, not overwritten, so there's a history to look back on. |
| `Documentations/AutoTest Results/DOCS_TO_UPDATE.md` | Always-current snapshot of just the alignment status + flagged-docs checklist, overwritten every run — the fixed-filename version of the dated report above. |
| `Documentations/AutoTest Results/.deploy-review-state.json` | Last-reviewed commit/date/counts, used to compute the diff each run. Commit this file — deleting it just means the next run has nothing to diff against. Renamed from `.weekly-review-state.json` on 2026-08-21, alongside the matching `STATE_PATH` fix in `tools/deploy-review.mjs`. |

## Extending the suite→UAT mapping

`tools/deploy-review.mjs`'s `SUITE_META` object maps each `__tests__/*.test.mjs` file to the
UAT workflow(s) it backs. When a new test file is added, add an entry there — otherwise the script
will still count its tests correctly but won't know which UAT workflow (if any) it covers, and will
flag it as having no metadata registered.
