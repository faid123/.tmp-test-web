# Weekly Documentation Review

Why this exists: on 2026-07-31, most of the `.docx` documents in `Documentations/` turned out to
be describing `dev-deploy-shafik-2` — a branch that had quietly stopped being what's actually live
on `nyunt/dev-W7.1` days earlier. Test counts, security findings, and TSK triage rows had all
drifted from reality without anyone noticing, because nothing was checking. This process exists so
that doesn't happen silently again.

## What runs it

This runs via **two independent triggers** now — neither depends on the other:

- **Deploy-triggered (primary):** a step at the end of [`.github/workflows/deploy.yml`]
  (../.github/workflows/deploy.yml) on `nyunt/dev-deploy`, added because the schedule below can
  never fire on its own. After every successful deploy it checks out `dev-deploy-documentation`,
  runs the script, and pushes back whatever changed. More accurate than a fixed weekly clock too:
  it checks alignment at the moment code actually goes live, not up to 6 days later. *(As of
  2026-08-07 this is on the `ci/deploy-doc-refresh` branch, not yet merged into `nyunt/dev-deploy`
  — until it merges, this trigger doesn't fire either; see "Making the schedule actually fire"
  below for the interim.)*
- **Schedule (secondary/backstop):** [`​.github/workflows/weekly-doc-review.yml`]
  (../.github/workflows/weekly-doc-review.yml) — every Friday, 01:00 UTC (09:00 SGT), plus
  on-demand via **Actions → Weekly Documentation Review → Run workflow**. Still useful even once
  the deploy trigger is live: `npm audit` output can change with zero code changes (the advisory
  database updates on its own), so a review can be worth re-running in a quiet week with no
  deploys at all.
- **Branch it runs on:** checks out and pushes back to `dev-deploy-documentation` (this branch) —
  set via `REVIEW_BRANCH` in the schedule workflow, or `DOCS_BRANCH` in `deploy.yml`.

Each run:

1. **Checks live-branch alignment — two signals.** First, parses the commit SHA out of
   `nyunt/dev-W7.1`'s latest `Deploy <sha> (run N)` commit message and confirms that SHA is still
   an ancestor of this branch's `HEAD`. If it isn't, the report says so loudly at the top — that's
   the exact signal that would have caught the `dev-deploy-shafik-2` drift a week earlier instead
   of a week late. Second, and independently, checks whether `nyunt/dev-deploy` (the branch that
   triggers a deploy) has moved past that deployed SHA — if so, a deploy is pending/overdue, which
   is informational rather than alarming on its own.
2. **Re-runs the real test suite** (`npx jest --ci --coverage --coverageReporters=json-summary
   --verbose --testLocationInResults --json`) and rebuilds
   `Documentations/AutoTest Results/automated-test-run.json` and `-log.txt` from the actual
   result — not copied from memory.
3. **Re-runs `npm audit`** and stores the raw output as `npm-audit-run.json` / `.txt`. Vulnerability
   counts can change even with zero code changes (the advisory database updates on its own), so
   this is re-run fresh every time rather than assumed stable.
4. **Diffs against the last recorded review** (`Documentations/AutoTest Results/
   .weekly-review-state.json`) to list what commits landed since then, and heuristically flags
   which `.docx` documents likely need a manual update as a result (see `DOC_FLAG_RULES` in the
   script if you need to tune the mapping).
5. **Writes a dated report:** `Documentations/AutoTest Results/weekly-review-<YYYY-MM-DD>.md`.
6. **Commits and pushes** the refreshed `Documentations/AutoTest Results/` files back to
   `dev-deploy-documentation`. It does **not** touch anything under `.docx` itself.

## What this does *not* do

The script updates data — test counts, coverage, vulnerability numbers, a list of what changed.
It does **not** rewrite the narrative `.docx` documents (security findings, TSK triage rows, UAT
case text). That content requires judgment a script can't safely automate — see the 2026-07-31
re-audit for what that judgment work actually looks like (re-verifying which findings still apply
after a branch retarget, writing new TSK rows for previously-untriaged commits, reconciling
npm-audit deltas against what actually changed vs. what the registry changed on its own).

**How to act on a weekly report:**

1. Open the newest `Documentations/AutoTest Results/weekly-review-<date>.md`.
2. If the live-branch alignment check failed (⚠️), stop and resolve that first — figure out which
   branch actually contains what's deployed, and treat this as a signal to re-run a full
   branch-retargeting pass (the same shape of work done 2026-07-31), not just a data refresh.
3. Otherwise, work through the "Docs likely needing a manual/AI-assisted update" checklist. For
   each flagged document, open it, compare against the current commits/test data, and update the
   prose the same way the 2026-07-31 pass did — table by table, verifying each claim against the
   actual code/data rather than search-and-replacing branch names.
4. Commit the `.docx` changes yourself (or ask an AI assistant to, pointing it at the week's
   report) — this part is intentionally not automated.

## Making the schedule actually fire

GitHub Actions only reads `schedule:` triggers from workflow files that exist on the repository's
**default branch** (`main`), regardless of which branch the file lives on. Right now this workflow
file only exists on `dev-deploy-documentation`, so the Friday cron will **not** fire until either:

- this branch (or at least `.github/workflows/weekly-doc-review.yml`) is merged into `main`, or
- an equivalent copy of the workflow file is added to `main` directly, pointing `REVIEW_BRANCH` at
  `dev-deploy-documentation`.

This is exactly why the deploy-triggered path in `deploy.yml` (see "What runs it" above) exists —
`push` triggers don't have this default-branch restriction, so it sidesteps the problem instead of
needing `main` at all. It's the recommended fix once `ci/deploy-doc-refresh` is merged; the schedule
staying broken stops mattering much at that point, since every deploy already reruns this.

Until either lands, run it on demand: **Actions → Weekly Documentation Review → Run workflow**, or
locally:

```bash
node tools/weekly-doc-review.mjs
```

## Local / manual run

```bash
npm ci                        # or npm install, if you haven't already
node tools/weekly-doc-review.mjs
```

Requires `git fetch` access to `origin` for the live-branch alignment check (step 1); it degrades
gracefully (skips that check with a note) if there's no remote access, so it still works fully
offline for the test/audit refresh.

## Files this process owns

| File | Purpose |
|---|---|
| `tools/weekly-doc-review.mjs` | The script itself. |
| `.github/workflows/weekly-doc-review.yml` | The Friday schedule + manual trigger. |
| `.github/workflows/deploy.yml` | Also runs this, from its last few steps, after every successful deploy (see "What runs it" above) — not owned by this process, but a change here can affect it. |
| `Documentations/AutoTest Results/automated-test-run.json` | Structured Jest results, UAT-mapped. |
| `Documentations/AutoTest Results/automated-test-run-log.txt` | Full Jest console output. |
| `Documentations/AutoTest Results/npm-audit-run.json` / `.txt` | Raw `npm audit` output. |
| `Documentations/AutoTest Results/weekly-review-<date>.md` | One dated report per run — kept, not overwritten, so there's a history to look back on. |
| `Documentations/AutoTest Results/.weekly-review-state.json` | Last-reviewed commit/date/counts, used to compute the diff each run. Commit this file — deleting it just means the next run has nothing to diff against. |

## Extending the suite→UAT mapping

`tools/weekly-doc-review.mjs`'s `SUITE_META` object maps each `__tests__/*.test.mjs` file to the
UAT workflow(s) it backs. When a new test file is added, add an entry there — otherwise the script
will still count its tests correctly but won't know which UAT workflow (if any) it covers, and will
flag it as having no metadata registered.
