# Docs to update — current status

_Always-current snapshot, overwritten every run -- not a dated history file like
`weekly-review-<date>.md`. For full test/audit deltas and commit history, see this run's dated
copy: `weekly-review-2026-08-07.md`._

Last checked: 2026-08-07 — branch `dev-deploy-documentation` @ `27799c1`

## Live-branch alignment

⚠️ **This branch has diverged from `nyunt/dev-W7.1`.** The deployed commit `4f034f6` is not an ancestor of HEAD. Everything below reflects this branch's code, which is not what's currently live -- find and review from whichever branch actually contains that commit before trusting this report, or treat this as the signal to re-run the branch-retargeting pass done on 2026-07-31.

✅ `nyunt/dev-deploy` matches what's live -- no deploy pending.

## Docs likely needing a manual/AI-assisted update

- [ ] **Documentations/WEEKLY_DOC_REVIEW.md**
  - .github/workflows/weekly-doc-review.yml (changes the weekly-doc-review process itself -- re-read WEEKLY_DOC_REVIEW.md to keep its description of the process in sync)
  - tools/weekly-doc-review.mjs (changes the weekly-doc-review process itself -- re-read WEEKLY_DOC_REVIEW.md to keep its description of the process in sync)

- [ ] **How to Setup.docx**
  - Documentations/setup/02-branching-and-collaboration.md (How to Setup.docx is regenerated from Documentations/setup/*.md and mirrors deploy.yml's pipeline steps -- keep it in sync with whichever changed)
  - Documentations/setup/04-troubleshooting.md (How to Setup.docx is regenerated from Documentations/setup/*.md and mirrors deploy.yml's pipeline steps -- keep it in sync with whichever changed)
  - Documentations/setup/README.md (How to Setup.docx is regenerated from Documentations/setup/*.md and mirrors deploy.yml's pipeline steps -- keep it in sync with whichever changed)

See [Documentations/WEEKLY_DOC_REVIEW.md](../WEEKLY_DOC_REVIEW.md) for the full process.
