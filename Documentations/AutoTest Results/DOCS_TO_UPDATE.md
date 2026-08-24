# Docs to update — current status

_Always-current snapshot, overwritten every run -- not a dated history file like
`weekly-review-<date>.md`. For full test/audit deltas and commit history, see this run's dated
copy: `weekly-review-2026-08-24.md`._

Last checked: 2026-08-24 — branch `nyunt/dev-W7.1` @ `9bebf47`

## Live-branch alignment

_The automated check couldn't parse a deployed SHA off `nyunt/dev-W7.1`'s tip (its last commit is a
direct feature push, not a `Deploy <sha> (run N)` commit — a known gap in the check, not a real
problem) and skipped itself. Manually verified instead: the last real deploy (`6107a90`, run 35,
matching `origin/nyunt/dev-deploy`'s current tip) is contained in this branch's history via commit
`411c786`, and no deploy is pending._

✅ Manually confirmed aligned as of 2026-08-24 (see note above) — `nyunt/dev-deploy` matches what's
live, no deploy pending.

## Docs likely needing a manual/AI-assisted update

None of the changed files matched a known flag rule.

See [Documentations/DEPLOY_DOC_REVIEW.md](../DEPLOY_DOC_REVIEW.md) for the full process.
