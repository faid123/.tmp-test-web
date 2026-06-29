# SmartRPD 3D Viewer — Integration Changelog

Comparison: `main` (`d7d3fbe`) → `shafik_nyunt_2_integration` (`3b120b0`)  
Common ancestor: `09ddd8b`  
Period covered: 6 April–23 June 2026  
Scope: viewer-facing features and the case-management entry points that open the viewer. Unrelated 2D editor, dashboard and case-management changes are excluded.

---

## 1. 3D Jaw and Design Rendering

- Added loading and rendering of upper- and lower-jaw geometry, surface/design meshes and uploaded STL slots.
- Added support for both **OFF and STL payloads**, including endpoint fallbacks for cases whose mesh data is returned in a different format.
- Corrected jaw transforms, rotations, centring and upper/lower alignment across the integration work.
- Kept solid jaw meshes opaque and improved lighting/material handling for clearer model viewing.
- Added framework/denture mesh loading and the ability to switch to alternative STL data, then return to the original jaw.

## 2. Data Loading and Viewer Performance

- Separated the 2D jaw-data request from the 3D jaw-mesh request.
- Decoupled case-chat loading from jaw loading so chat failures or delays do not block the scene.
- Parallelised independent case, thumbnail, jaw, surface/design, polyline and artificial-teeth requests where possible.
- Added staged loading status and internal timing/audit data for mesh decoding, parsing and rendering.
- Added resilient handling for missing or empty overlay data so the base 3D scene can still load.

## 3. Loading Screen

- Replaced the baseline page/loading fallback with a centralised branded loading card.
- Added the SmartRPD logo, status text, real download progress, percentage and current-file label.
- Removed the displayed indeterminate shimmer during initialisation; only measurable download progress is shown.
- Corrected the progress row to show the file/status label on the left and percentage on the right.
- Increased the real progress bar to **14 px** and added a smooth fade-out when the scene is ready.

## 4. Scene, Camera and Navigation

- Changed the scene to a light neutral background consistent with the 2D annotation workspace.
- Added model-aware camera centring and a stable rotation origin based on the loaded jaw bounds.
- Added **Front, Rear, Top, Bottom, Left, Right and Centre** preset views.
- Added camera reset and rotation lock/unlock controls.
- Kept the jaw centred while allowing rotation and wheel/pinch zoom; touch gestures were refined for mobile use.
- Added a control to hide or restore the right-side viewer controls for an unobstructed scene.
- Updated resize handling so the renderer and orthographic camera track the available viewer area.

## 5. Objects Menu

- Renamed the viewer menu from **Components** to **Objects**.
- Added separate rows for each available upper/lower jaw, surface mesh, polyline set and artificial-teeth set.
- Added per-object **visibility** and **opacity** controls.
- Added jaw **undercut** and **occlusion** material modes.
- Added vertex/wireframe overlays for jaw and surface meshes.
- Added working **Show All / Hide All** behaviour and corrected the corresponding icon state.
- The Objects popup starts closed, and the panel manager keeps only one viewer popup open/highlighted at a time.

## 6. Polyline Rendering

- Added polyline loading from `/polylines/getall`, with normalisation for structured and encoded/text payload variants.
- Added upper- and lower-jaw polyline rendering for Retainer, Lingual Clasp, Major Connector, Proximal Plate, Rest, Minor Connector, Mesh, Reversal Line and Gingival Points data.
- Assigned distinct component colours and rendered the lines above solid geometry for visibility.
- Removed duplicate points and improved segment/edge construction for cleaner continuous paths.
- Added coordinate-space detection and seating logic for polyline data that must follow the jaw surface.
- Added diagnostic/audit support for source point counts, rendered points and missing edges.

## 7. Polyline Editing and Menu

- Added draggable polyline point handles directly in the 3D scene.
- Added **Undo, Redo and Reset** for polyline edits, with bounded edit history.
- Added per-component visibility controls plus jaw-level visibility and opacity through the Objects menu.
- Added Show All / Hide All controls for the complete polyline overlay.
- The Polylines popup lists only components with generated segments/points; zero-point entries are omitted.
- The popup starts closed and participates in the single-popup-at-a-time behaviour.

## 8. Artificial Teeth and Guidelines

- Added artificial-teeth loading from the tooth-placement API and decoding of upper/lower tooth craft data.
- Added generated tooth meshes for both arches, including placement, scale, orientation and jaw-reference-space corrections developed across the integration branches.
- Added upper/lower guideline rendering from the placement payload.
- Added per-arch visibility and opacity controls in the Objects menu.
- Synchronised artificial-teeth visibility with the corresponding jaw state.
- Added alignment and mapping audits to help detect missing, displaced or outlying generated teeth.

## 9. Heatmaps and Measurement Legend

- Added undercut and occlusion analysis modes to supported jaw objects.
- Added a toggleable heatmap legend describing the colour bands and measurement ranges for undercut and occlusion.
- Integrated the heatmap control with the responsive viewer toolbar.

## 10. Responsive Toolbar and Viewer Shell

- Reworked the viewer shell and controls for desktop, tablet and mobile breakpoints.
- Added a persistent footer containing the case name, current user, connection state, menu, case chat and right-panel toggle.
- Pinned the compact tablet/mobile controls to the bottom-left above the footer and safe-area inset.
- Replaced long mobile/tablet labels with compact icons while retaining titles and accessible labels.
- Kept the fuller labelled/control layout on desktop.
- Updated the document title from **SmartRPD Web Lite** to **SmartRPD 3D Web Viewer** and changed the favicon to the SmartRPD profile logo.

## 11. Case Chat

- Added a case-specific slide-in chat panel, opened from the viewer footer.
- Matched the 2D Annotation chat layout: header flush to the top, consistent side/bottom spacing and a message area that fills the remaining height.
- Added text comments, image attachment/upload, image preview and an auto-growing message field.
- Moved the chat widget to the viewer-shell level so its fixed overlay covers the full viewer correctly.
- Scoped the generic `header` styling so it no longer creates an orange gap above the 3D chat header.

## 12. 2D Design Integration and Review Actions

- Added the case's 2D thumbnail/design to the 3D viewer with an enlarged overlay.
- Added a mobile/tablet 2D-design shortcut.
- Added **Approve 2D**, **Edit 2D** and **Annotate** actions from the 2D overlay.
- Added **Approve 3D**, **Edit 3D**, **Add to Mail** and heatmap actions alongside the 3D review controls.
- Added transfer of the selected 2D image into the annotation workflow through a stored annotation background.

## 13. Case Title and Watermarks

- Added a floating in-scene case title in the form `🦷 Case: <name>`.
- Moved the title from the lower/centrally offset scene position to **8 px from the top** on desktop, tablet and mobile.
- Reduced the title/watermark styling to **16 px black text** for the 2D fullscreen overlay and captured/fullscreen image views.
- Removed dynamic vertical-centring logic from the fullscreen watermark.

## 14. Version History and Navigation Drawer

- Added a SmartRPD navigation drawer with return-to-case-selection, Version History and account/help entries.
- Changed Version History from the old inline annotation-history area to a modal overlay inside the viewer.
- Added return behaviour that focuses/closes back to the originating case-list tab when possible, with normal navigation as fallback.

## 15. Case-Management Entry Points and Sharing

- Added a direct 3D-viewer entry point to the selected case in case management.
- Replaced the URL/globe graphic with `Icon_objects2.png` and styled it as a **32 × 32 px icon-only button**.
- Retained the separate **Copy 3D viewer link** action.
- Added an **Export/Share** action in case management that opens the viewer in a new tab with a temporary encoded viewer identity for auto-login.
- Expanded the case-detail action controls to use the available panel width.

> Note: Export/Share is a case-management action that opens the 3D viewer; there is no separate Export button in the viewer toolbar at this branch endpoint.

## 16. Visual Assets and Polish

- Added custom assets for Objects, polylines, artificial teeth, jaw/surface meshes, preset views, reset, lock, undo/redo, heatmap and right-panel state.
- Normalised footer, toolbar and sidebar icon sizing across responsive breakpoints.
- Added active/highlighted states and accessible labels/tooltips to the main viewer controls.
- Fixed stale `/smartrpd_viewer` base-path in `resetButton.js` — corrected to `/.tmp-test-web` so lock/unlock rotation icons load correctly on GitHub Pages (was returning 404).

---

## Audit Corrections to the Previous Draft

- The checked-out page title is **SmartRPD 3D Web Viewer**, not `SMARTRPD 3D VIEW`.
- Export is located in the **case-management panel**, not the 3D viewer toolbar.
- `src/js/apiLog.js` and its imports are present at `3b120b0`; it was removed in an earlier development commit but reintroduced by later integration work, so removal is not listed as a final integrated feature.
- Commit `3b120b0` changes plate placement in the **2D editor/case workflow**, not the 3D viewer, and is therefore outside this feature list.

---

*Audited against Git history and the repository state at `3b120b0`, with post-commit fixes applied 23 June 2026.*
