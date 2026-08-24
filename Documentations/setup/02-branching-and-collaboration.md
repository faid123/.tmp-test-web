# Scenario: Working on (or setting up) a different branch

## `main` is not where active work happens

`main` has diverged a long way from the active development line — it's not an ancestor of the
current work. Don't branch from `main` expecting to get today's app; branch from the latest
integration branch instead (see below). Treat `main` as legacy/historical unless you've confirmed
otherwise with the team.

## Branch naming you'll see in this repo

- `nyunt/dev-W<n>[.<m>]` — Nyunt's weekly dev branches (e.g. `nyunt/dev-W7.1`).
- `devNN_description` / `shafik-devNN_description` — individual feature branches.
- `nyunt/integration_N`, `shafik_nyunt_2_integration` — integration branches that merge multiple
  feature branches together before they go out.
- `nyunt/dev-deploy` — **not a dev branch**. It's a plain code branch that only exists as the CI
  deploy trigger. Nobody develops on it directly; it gets reset to an integration branch's tip
  when that revision is ready to deploy. See
  [03 — CI/CD and deployment setup](03-cicd-and-deployment-setup.md).

Run `git branch -a` for the current full list — branches get created and retired often enough
that this doc won't try to enumerate all of them.

## Picking up an existing branch

```bash
git fetch origin
git checkout <branch-name>
npm install     # dependencies may have changed since you last had this branch
npm run dev
```

## Starting a new branch

Branch from the integration branch you're building on top of (ask the team which one is current
if unsure — at the time of writing it's `nyunt/integration_3`/`nyunt/integration_4`):

```bash
git fetch origin
git checkout -b nyunt/dev-W<next-number> origin/nyunt/integration_4
git push -u origin nyunt/dev-W<next-number>
```

## How work eventually ships

Feature branch → merged into an integration branch → integration branch's tip is pushed onto
`nyunt/dev-deploy` → that push triggers the deploy pipeline. The full mechanics (and how to point
this at different branches) are in
[03 — CI/CD and deployment setup](03-cicd-and-deployment-setup.md).

That same push also refreshes `Documentations/AutoTest Results/` on `dev-deploy-documentation` —
test counts, coverage, and dependency audit re-run against whatever the deploy just shipped. This
step is merged and live in `deploy.yml` on `nyunt/dev-deploy` (confirmed 2026-08-20). See
[Deploy Documentation Review](../DEPLOY_DOC_REVIEW.md) for how that works.
