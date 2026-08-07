# SmartRPD Web — Setup Documentation

This folder is the current, git-trackable setup guide for this repo. It replaces the setup
steps in `Documentations/backup/How to setup.docx` and `Github Pages setup information.docx`,
which describe an older, retired repo (`Wyl-ASG/webrpd_code` → `Wyl-ASG/finale`) with a
hardcoded IP API endpoint and a manual two-repo copy/paste deploy. None of that applies here
anymore — everything below reflects what's actually running today.

## What this app is

SmartRPD Web is a static frontend (Three.js 3D viewer, 2D annotation, case management) built
with Vite (dev) and Webpack (production bundle). It has **no backend of its own** — it talks to
a live API at `https://live.api.smartrpdai.com/api/smartrpd`.

## Quick facts

| | |
|---|---|
| Repo | `https://github.com/faid123/.tmp-test-web` |
| Live/UAT site | `https://faid123.github.io/.tmp-test-web/` |
| Local dev server | `npm run dev` → `http://localhost:8089/index.html` |
| Node version | 22 (matches CI) |
| Deploy trigger branch | `nyunt/dev-deploy` |
| Pages source branch | `nyunt/dev-W7.1` (root) |

## Scenarios covered

1. **[Local development setup](01-local-development-setup.md)** — setting up this project from
   scratch on a new machine: prerequisites, install, run, test, build.
2. **[Branching and collaboration](02-branching-and-collaboration.md)** — picking up an existing
   branch, starting a new one, and how this repo's branch naming/flow works.
3. **[CI/CD and deployment setup](03-cicd-and-deployment-setup.md)** — how the current GitHub
   Actions → GitHub Pages pipeline works, how to point it at different branches, and how to
   rebuild the whole pipeline from scratch on a new repo.
4. **[Troubleshooting](04-troubleshooting.md)** — known setup gotchas and how to resolve them.

If you're setting this up for the first time, read them in order (1 → 4). If you already have
the project running and just need one specific thing, jump straight to the relevant doc.

## See also

Once your environment is running, [Documentations/onboarding/](../onboarding/2d-annotation.md)
covers the codebase itself — architecture and feature deep-dives, starting with 2D Annotation
(the RPD framework design workspace).

The `.docx` documents in `Documentations/` (UAT reports, security protocol, traceability, etc.)
are kept current by an automated check — refreshed on every deploy, plus available on demand —
rather than by memory. See [Weekly Documentation Review](../WEEKLY_DOC_REVIEW.md) for how that
works and what to do with its reports.
