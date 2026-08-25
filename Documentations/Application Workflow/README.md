# Application Workflow — how this folder was built

**Generated:** 2026-08-06. **Reviewed and updated:** 2026-08-21 (diagram accuracy pass — see
"How it was built" below for what that pass actually checked).

## Source basis — read this before trusting these files

These files were originally built against commit **`d5d5121f12287c45b91d7a0d62acf017d6d98c64`** —
the commit `nyunt/dev-deploy` had deployed on 2026-08-06 (08:55 UTC, build 23) to `nyunt/dev-W7.1`.
That framing is now historical, not current — treat it as "when this folder was first drawn," not
"what these files currently describe." Two things have changed since:

- **Where `Documentations/` lives.** As of 2026-08-20, `Documentations/` (this folder included) is
  maintained directly on `nyunt/dev-W7.1` as the primary copy, with `dev-deploy-documentation` kept
  as a mirrored backup rather than the source of truth. The original divergence warning below (about
  `dev-deploy-documentation` being behind what's deployed) described a real problem at the time, but
  it's about a branch relationship that no longer applies the same way — don't use it to judge
  current accuracy.
- **The diagrams themselves.** A 2026-08-21 review (prompted by a user spot-check that some figures
  looked out of date) found and fixed real gaps against current `src/` — see "How it was built."

<details>
<summary>Original 2026-08-06 divergence note (historical, kept for context)</summary>

That commit was *not* on the `dev-deploy-documentation` branch these files lived on at the time.
`dev-deploy-documentation` was then 30 commits / 73 files behind what was actually deployed
(`caseManagement.js`, `createCase.js`, `preview3D.js`, `appSidebar.js`, `pageTour.js`,
`accessibility.js`, and more all differed). Running the deploy-review script on that branch
confirmed it, loudly:

> ⚠️ **This branch has diverged from `nyunt/dev-W7.1`.** The deployed commit `d5d5121` is not an
> ancestor of HEAD.

This was the same class of drift `Documentations/DEPLOY_DOC_REVIEW.md`'s automated checks exist to
catch. It was deliberately **not** auto-fixed by merging branches at the time — that was a judgment
call for a human, not something to do silently while writing docs.

</details>

## Files in this folder

**As of 2026-08-21, this folder's workflow document is split into two files instead of one —
this is now the standing convention going forward, not a one-off:**

- **`Application_Workflow - Summary.docx`** — the condensed top-level user journey only (Figure 1 /
  `flowchart-summary.mmd.txt`). Short enough to hand to someone who needs the shape of the app, not
  the mechanics of every screen.
- **`Application_Workflow - Detailed.docx`** — the full section-by-section breakdown (Figures 2–5 /
  `flowchart-01`–`04`), with every diagram embedded next to the prose it illustrates.

Keep both in sync when either changes — the Summary isn't a stub of the Detailed doc, it's meant to
stand alone. When this workflow next gets updated, replace both files rather than reintroducing a
single combined `Application_Workflow.docx`.

| File | Contents |
|---|---|
| `Application_Workflow - Summary.docx` | Condensed workflow — the top-level user journey only, one diagram. |
| `Application_Workflow - Detailed.docx` | Full section-by-section workflow, all four section diagrams embedded. |
| `flowchart-summary.mmd.txt` / `.png` | Condensed flowchart — the top-level user journey only. |
| `flowchart-01-authentication.mmd.txt` / `.png` | Section 1 — login, sign-up, forgot-password, role routing. |
| `flowchart-02-case-list-and-lifecycle.mmd.txt` / `.png` | Section 2 — case list, Create Case, the Case Detail dropdown, the Dashboard overlay. |
| `flowchart-03-2d-annotation.mmd.txt` / `.png` | Section 3 — the RPD design workspace and its adjacent tools. |
| `flowchart-04-viewer-and-admin.mmd.txt` / `.png` | Section 4 — standalone 3D viewer + the admin console. |
| `flowchart-detailed.mmd.txt` / `.png` | All four sections combined on one canvas — a *reference*, not something to actually read at normal zoom; use the split files above for that. Currently ~14900×3400px (re-rendered 2026-08-21; the exact pixel size shifts a little each time it's regenerated, since it's auto-laid-out from the diagram content, not fixed). |

Every `.mmd.txt` in this folder currently carries a `DRAFT` header comment: they were corrected
against a diff of current `src/` on 2026-08-21 (see "How it was built"), not re-verified from a
fresh full extraction the way the originals were. Treat them as a strong starting point, not a
final pass, until that header is removed.

Each `.mmd.txt` starts with a `%%{init: ...}%%` directive plus `classDef`/`class` lines, so the same
colour coding (teal = screen/page, amber diamond = decision, red = destructive action, dashed blue =
network call) reproduces automatically wherever it's rendered. Paste any of them into
[mermaid.live](https://mermaid.live) (or a Markdown renderer that supports Mermaid, e.g. GitHub) to
view or edit. The `.png` files are produced the same way each time: a headless-Chromium page (via
Playwright, a real devDependency of this repo) loads Mermaid from a CDN at render time — Mermaid
itself isn't vendored into the repo — parses the `.mmd.txt` text, and screenshots the resulting SVG
at its native size. There's no committed script for this in the repo; it's a short throwaway utility
re-created each time diagrams need regenerating (ask whoever/whatever last ran it, or see the
2026-08-21 chat history, for the ~60-line version used for this pass).

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

**Original build (2026-08-06):** read directly from a `git archive` extraction of
`d5d5121f12287c45b91d7a0d62acf017d6d98c64`'s `index.html`, `src/pages/*.html`, and `src/js/**` — not
from memory, not from the existing `.docx` bundle. Cross-checked against
`Documentations/setup/05-2d-annotation.md` for terminology (moved from `Documentations/onboarding/`
on 2026-08-21).

**2026-08-21 review pass:** narrower in method than the original build — this was a diff against
this branch's current `src/` (new DOM ids in `2DAnnotation.html`, new/changed files under
`src/js/2D/` and `src/js/shared/`), not a fresh full `git archive` extraction. It found and fixed
four confirmed gaps: the DLL-backed **Load Proposed Design** flow (added entirely, was missing from
every diagram including `flowchart-detailed`), the embedded preview's real **3-tab structure** (3D
Preview / Extra 3D / Reference Images, previously shown as one blob), signed-in **Change Password**
(missing from the authentication diagram), and **Help Bot** being inconsistent between files (present
in `flowchart-detailed`, absent from `01`–`04`). `flowchart-04-viewer-and-admin` was reviewed and
found accurate as-is — internal `viewer3d`/admin changes since 2026-08-06 were implementation
refactors, not new user-facing flows. Because this was diff-based rather than a full re-read, it may
have missed something a fresh extraction would catch — that's why every `.mmd.txt` still carries a
`DRAFT` header rather than being stamped as re-verified.
