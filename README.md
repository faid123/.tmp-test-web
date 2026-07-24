# SmartRPD Web

A static frontend (Three.js 3D viewer, 2D annotation, case management) for the SmartRPD dental-lab
RPD design workflow. Built with Vite (dev) and Webpack (production bundle). No backend of its own
— it talks to a live API at `https://live.api.smartrpdai.com/api/smartrpd`.

|                       |                                                          |
| --------------------- | -------------------------------------------------------- |
| Live/UAT site         | https://faid123.github.io/.tmp-test-web/                  |
| Local dev server      | `npm run dev` → http://localhost:8089/index.html           |
| Node version          | 22                                                        |
| Deploy trigger branch | `nyunt/dev-deploy`                                        |
| Pages source branch   | `nyunt/dev-W7.1` (root)                                    |

## Getting started

New to this repo? Start at [`Documentations/setup/`](Documentations/setup/README.md) — it covers
local setup, branching/collaboration conventions, the CI/CD pipeline, and troubleshooting, in that
order. [`Documentations/onboarding/`](Documentations/onboarding/2d-annotation.md) covers the
codebase itself, feature by feature.

```bash
git clone https://github.com/faid123/.tmp-test-web.git
cd .tmp-test-web
npm install
npm run dev
```

## Testing

```bash
npm test          # Jest, local/watch-friendly
npm run test:ci   # Jest --ci --coverage — what CI actually runs before it will deploy
```

Current state: **13 suites / 198 tests**, all passing, every suite importing the real `src/`
module it tests. Covers login/password-reset, dashboard, case enrichment, 2D annotation, the
artificial-teeth 3D decode layer, and the help assistant. Case creation, chat/notifications, STL
upload, version history, download/export and responsive layout are not yet covered by automated
tests and rely on manual UAT.

Run `node tools/run-uat-automated-tests.mjs` for a suite-by-suite breakdown mapped against the
app's 12 standing UAT workflow cases — output goes to `Documentations/AutoTest Results/`. See
[01-local-development-setup.md](Documentations/setup/01-local-development-setup.md#4-run-tests)
for details.

## Deployment

Push to `nyunt/dev-deploy` (or run the "Deploy Test Site" GitHub Action manually) to build, test
and publish to the live site above. Full details in
[03-cicd-and-deployment-setup.md](Documentations/setup/03-cicd-and-deployment-setup.md).

## Security

`Documentations/Cybersecurity_Protocol_Document.docx` tracks the current known security posture
and findings — read it before shipping anything that touches authentication, credentials, or
third-party scripts.
