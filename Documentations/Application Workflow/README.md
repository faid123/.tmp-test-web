11# Application Workflow — how this folder was built

**Generated:** 2026-08-06

## Source basis — read this before trusting these files

These files describe the app as it exists at commit **`d5d5121f12287c45b91d7a0d62acf017d6d98c64`** —
the commit `nyunt/dev-deploy` actually deployed today (2026-08-06T08:55:00Z, build 23) to
`nyunt/dev-W7.1`, i.e. what's live right now at https://faid123.github.io/.tmp-test-web/.

**That commit is *not* on the `dev-deploy-documentation` branch these files live on.** At the time
of writing, `dev-deploy-documentation` is 30 commits / 73 files behind what's actually deployed
(`caseManagement.js`, `createCase.js`, `preview3D.js`, `appSidebar.js`, `pageTour.js`,
`accessibility.js`, and more all differ). Running `node tools/weekly-doc-review.mjs` on this branch
confirms it, loudly:

> ⚠️ **This branch has diverged from `nyunt/dev-W7.1`.** The deployed commit `d5d5121` is not an
> ancestor of HEAD.

This is the same class of drift `Documentations/WEEKLY_DOC_REVIEW.md`'s automated checks exist to
catch. It was deliberately **not** auto-fixed by merging branches —
that's a judgment call for a human, not something to do silently while writing docs. If you're
reading this later and want to confirm it's still accurate, re-run the alignment check or diff
`dev-deploy-documentation` against `nyunt/dev-deploy`.

## Files in this folder

| File | Contents |
|---|---|
| `Application_Workflow.docx` | The detailed + summary workflow document, with every diagram below embedded as an image next to the section it illustrates. |
| `flowchart-summary.mmd.txt` / `.png` | Condensed flowchart — the top-level user journey only. |
| `flowchart-01-authentication.mmd.txt` / `.png` | Section 1 — login, sign-up, forgot-password, role routing. |
| `flowchart-02-case-list-and-lifecycle.mmd.txt` / `.png` | Section 2 — case list, Create Case, the Case Detail dropdown, the Dashboard overlay. |
| `flowchart-03-2d-annotation.mmd.txt` / `.png` | Section 3 — the RPD design workspace and its adjacent tools. |
| `flowchart-04-viewer-and-admin.mmd.txt` / `.png` | Section 4 — standalone 3D viewer + the admin console. |
| `flowchart-detailed.mmd.txt` / `.png` | All four sections combined on one canvas — accurate but ~24000×5300px, so it's a *reference*, not something to actually read; use the split files above for that. |

Each `.mmd.txt` starts with a `%%{init: ...}%%` directive plus `classDef`/`class` lines, so the same
colour coding (teal = screen/page, amber diamond = decision, red = destructive action, dashed blue =
network call) reproduces automatically wherever it's rendered. Paste any of them into
[mermaid.live](https://mermaid.live) (or a Markdown renderer that supports Mermaid, e.g. GitHub) to
view or edit — that's also how the `.png` files were produced (headless Chromium + mermaid.js via
Playwright, already a devDependency of this repo).

## Want to go further than Mermaid can?

Mermaid buys consistency (the source is the diagram, so it can never drift) but its auto-layout only
goes so far — it won't hand-tune spacing or add icons. If you want a more polished, presentation-grade
version of one of these diagrams:

- **[Mermaid Chart](https://www.mermaidchart.com/)** — the Mermaid team's own hosted editor. Same
  syntax as the `.mmd.txt` files here (paste one straight in), but with better auto-layout, more
  themes, and live collaboration. Lowest-effort upgrade path since nothing needs re-drawing.
- **[draw.io / diagrams.net](https://app.diagrams.net/)** (free) — import an SVG export of any diagram
  here and manually reposition/restyle nodes. The right choice if you want full manual control over
  layout, icons, and branding, and don't mind hand-arranging.
- **[Excalidraw](https://excalidraw.com/)** (free) — quick hand-drawn-style redraw, good for a
  stakeholder-facing summary slide rather than an exhaustive reference.
- **Whimsical / Lucidchart / Miro** (paid tiers) — worth it only if the team wants to co-edit these
  diagrams going forward rather than regenerating them from source each time the app changes.

## How it was built

Read directly from a `git archive` extraction of `d5d5121f12287c45b91d7a0d62acf017d6d98c64`'s
`index.html`, `src/pages/*.html`, and `src/js/**` — not from memory, not from the existing `.docx`
bundle. Cross-checked against `Documentations/onboarding/2d-annotation.md` for terminology.
