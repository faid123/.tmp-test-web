# SmartRPD Web Application — Project Status Report

Report date: 25 June 2026  
Comparison: `main` (`d7d3fbe`) → `shafik_nyunt_2_integration` (`93a2c37`)  
Common ancestor: `09ddd8b`  
Overall phase: **Integration and stabilisation — In progress**

## Status Legend

- **C** — Completed with supporting repository evidence.
- **I** — Started or implemented but still being integrated, stabilised or tested.
- **—** — Not verified from Git history or repository evidence; confirmation is required.

The Requirements, Specification & Design, UAT and Production columns are deliberately not inferred from implementation alone. A successful production-mode build does not prove that the application has passed UAT or been deployed to production.

## Project Status Checklist

| Technologies | Feature | Requirements | Specification & Design | Implementation | Development | Integration | UAT | Production | Git/Test Evidence |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| JavaScript, HTML, CSS, REST API, local storage | Login, authentication guard and OTP verification | — | — | C | C | C | — | — | Login and authentication tests pass; OTP restore and login fixes are present. |
| JavaScript, HTML, CSS, REST API | Case list, case details, sorting, rename, duplicate and delete | — | — | C | C | C | — | — | Case-management implementation is integrated; sorting and case-creation tests pass. |
| JavaScript, HTML, CSS, REST API | Case creation, user/role assignment and invitation flow | — | — | C | C | C | — | — | Create-case tests pass; role and alert endpoints are integrated. |
| JavaScript, HTML, CSS, REST API, STL upload | Upload upper/lower jaw files and reference images | — | — | C | C | C | — | — | Upload endpoints and dashboard/create-case upload interfaces are present. |
| JavaScript, HTML, CSS, REST API | Case dashboard, previews, 3D upload and screen capture | — | — | C | I | I | — | — | Dashboard is implemented, but its Jest suite currently fails because `window.matchMedia` is not mocked. |
| JavaScript, Canvas/SVG, HTML, CSS, REST API | 2D jaw annotation workspace | — | — | C | C | C | — | — | 2D annotation, jaw mapping and component placement are integrated. |
| JavaScript, SVG assets, REST API | Rest, clasp, bar, mesh, plate, minor- and major-connector placement | — | — | C | I | I | — | — | Main component flows are present; the lingual plate-to-bar regression test is failing. |
| JavaScript, REST API | Jaw-structure encoding, decoding and round-trip persistence | — | — | C | C | C | — | — | Major-switch and round-trip test suites pass. |
| JavaScript, SVG assets, REST API | Clinical information and tooth-status annotation | — | — | C | C | C | — | — | Clinical-information codec test suite passes. |
| JavaScript, Canvas, REST API | 2D instruction editor and annotated-image workflow | — | — | C | C | C | — | — | Editor integration and instruction-merging tests are present; merge tests pass. |
| Three.js, JavaScript, WebGL, REST API | 3D upper/lower jaw and design-mesh rendering | — | — | C | C | C | — | — | OFF/STL parsing and rendering are integrated; STL-loading tests pass. |
| Three.js, JavaScript, WebGL | STL and OFF endpoint fallback handling | — | — | C | C | C | — | — | `/stl/get` accepts STL and OFF payloads; endpoint and STL-load tests pass. |
| Three.js, JavaScript, WebGL | Camera rotation, zoom, reset, lock and preset views | — | — | C | C | I | — | — | Orbit-control tests pass; lock-icon path and fit/zoom behaviour were changed in the latest commits. |
| Three.js, JavaScript, CSS | Responsive 3D viewer for desktop, tablet and mobile | — | — | C | C | I | — | — | Mobile layout, compact-fit and maximum zoom were updated at `93a2c37`; formal acceptance is not recorded. |
| Three.js, JavaScript, WebGL | Objects menu: visibility, opacity, wireframe, undercut and occlusion | — | — | C | C | C | — | — | Upper/lower jaw, surface, polylines and artificial-teeth controls are integrated. |
| Three.js, JavaScript, REST API | Polyline loading and component rendering | — | — | C | C | C | — | — | `/polylines/getall`, component normalisation, segmentation and coloured rendering are present. |
| Three.js, JavaScript, WebGL | Polyline point editing, visibility, reset, undo and redo | — | — | C | C | C | — | — | Drag handles and bounded undo/redo history are integrated. |
| Three.js, JavaScript, REST API | Artificial teeth and placement guidelines | — | — | C | C | C | — | — | Upper/lower tooth meshes, transforms, guidelines and audit helpers are integrated. |
| Three.js, JavaScript, WebGL | Undercut/occlusion heatmaps and measurement legend | — | — | C | C | C | — | — | Analysis materials and toggleable measurement legend are present. |
| JavaScript, HTML, CSS, REST API | Case chat with text, images and slide-in viewer panel | — | — | C | C | C | — | — | Chat test suite passes; 2D/3D chat layout and data flow are integrated. |
| JavaScript, HTML, CSS, REST API | Version History modal and history data | — | — | C | C | C | — | — | Version History was moved from the inline panel to an integrated modal. |
| JavaScript, HTML, CSS, REST API | Notifications and alert status | — | — | C | C | C | — | — | Alert retrieval/read-status endpoints and UI integration are present. |
| JavaScript, HTML, CSS, REST API | Case notes, due-date update and report generation | — | — | C | C | C | — | — | Case-note endpoint, request-date update and DOCX report generation are integrated. |
| JavaScript, REST API, browser download APIs | Download OFF, 2D image and report files | — | — | C | C | C | — | — | Dashboard/case-list download workflow is present in integration history. |
| JavaScript, HTML, CSS | 3D viewer launch, copy-link and Export/Share auto-login | — | — | C | C | C | — | — | Icon entry point, link copy and encoded temporary viewer identity are integrated. |
| JavaScript, HTML, CSS | Viewer footer, navigation drawer and right-panel toggle | — | — | C | C | C | — | — | Viewer shell, return navigation, user/connection state and panel toggle are present. |
| JavaScript, REST API, browser streams | ApiClient session login, streaming progress and fallback JSON loading | — | — | C | C | I | — | — | Shared session-login promise, streaming progress and missing `Content-Length` fallback are documented in the current architecture summary. |
| Three.js, JavaScript, REST API | Progressive 3D loading and background overlay fetch | — | — | C | C | I | — | — | Jaw mesh renders first; polylines and artificial teeth load asynchronously after viewer readiness. |
| Webpack, Vite, Babel, Docker, Nginx | Local development and production-mode build | — | — | C | C | C | — | — | `npm.cmd run build` succeeds; Webpack reports three bundle-size warnings. |
| Jest, jsdom | Automated unit/integration test suite | — | — | C | I | I | — | — | 18/20 suites and 76/77 tests pass on 24 June 2026. |

## Chronological Work Summary

The internship web development work can be read as two connected streams. Nyunt focused on the HTML application screens, case-management flow and 2D design workspace. Shafik focused on the Three.js 3D viewer, 3D rendering architecture and loading/performance improvements. Both streams share the same case data, authentication model, page shell, chat/version-history features and REST API backend.

### Application Foundation

The application is a multi-page web app served as static files through nginx, rather than a single-page application. The main pages are:

| Page | File | Purpose |
|---|---|---|
| Login | `index.html` | Authentication entry point. |
| Case List | `src/pages/case_list.html` | Browse, manage, create and open cases. |
| 2D Annotation | `src/pages/2DAnnotation.html` | 2D jaw annotation and RPD design planning. |
| 3D Viewer | `src/pages/ThreeDViewer.html` | 3D jaw, design overlay and artificial-teeth visualisation. |

Navigation between pages happens through URL redirects. Case identity is passed using an obfuscated encrypted `?id=` query parameter, decoded through `src/crypt.js`. Shared UI modules provide the sidebar, footer, chat panel, notifications, toast messages, confirmation dialogs and version history access.

## 2D and HTML Workstream: Nyunt

### 1. Case Management and HTML Page Structure

Nyunt's work begins at the HTML application layer. The case list page provides the main operational workspace for users to browse and manage cases. It includes case search, status filtering, sortable case tables, thumbnail preview, case-detail display, case rename, case duplicate, case delete, 3D viewer launch, copy-link/export actions and the create-case workflow.

The create-case interface supports case metadata entry, upper/lower STL upload, reference image upload, user invitation and progress feedback while backend requests are running. This makes the case list page the starting point for most user workflows before moving into either 2D design or 3D review.

### 2. Shared Front-End Shell and Collaboration Features

After the main case-management flow, the HTML pages were connected through shared application UI. The app sidebar, footer status bar, notification styles, toast messages, confirmation dialogs and version-history entry points are reused across the case list, 2D annotation page and 3D viewer shell.

The shared chat/notes panel is available across the case list, 2D annotation page and 3D viewer. It opens as a slide-in side panel, fetches case notes, supports text and image messages, and polls for updates so collaborators can review case-specific discussion without leaving the current workspace.

### 3. 2D Annotation Workspace

The 2D annotation workspace is implemented through `src/pages/2DAnnotation.html` and the modules under `src/js/2D/`. It provides the visual surface for jaw annotation and RPD component planning. The workspace includes upper/lower jaw display, component catalog tabs, tooth-level placement interactions, undo/redo history, save/back handling, clinical information panels, case notes, noticeboard content, chat access and a linked 3D preview area.

The 2D code is split by responsibility. `2DAnnotation.js` coordinates page state, case loading, history, save flow and layout behaviour. `annotationCatalog.js` manages the selectable component catalog. `annotationPlacement.js`, `annotationRender.js`, `annotationTeethModel.js` and `annotationVisuals.js` handle component placement and visual rendering. Component-specific modules cover rests, clasps, bars, meshes, plates, minor connectors and major connectors.

### 4. Clinical Information and Jaw-Structure Persistence

The 2D workflow also includes clinical information and tooth-status annotation using dedicated clinical assets and `clinicalInfo.js`. Case notes are handled through the case-note workflow, while jaw-structure modules encode, decode, apply and save the 2D design structure for backend persistence.

This makes the 2D workspace more than a drawing screen: it records structured RPD design information that can be reloaded, edited and round-tripped through the API.

### 5. 2D-to-3D Preview Link

The 2D page includes a 3D preview module through `preview3D.js`. This preview supports STL/OFF rendering, jaw visibility controls, upload handling, undercut/heatmap display, camera controls, screen capture and view presets. It connects the 2D planning workflow with immediate 3D visual feedback without requiring the user to leave the 2D annotation workspace.

## 3D Workstream: Shafik

### 1. Three.js Viewer Foundation

Shafik's work begins with the dedicated 3D viewer architecture in `src/index.js`. The viewer is built with Three.js and uses an orthographic camera so jaw models and design overlays remain at a consistent scale while zooming. The scene contains jaw meshes, design polylines, artificial-teeth overlays, lights, camera controls and the WebGL renderer.

The main scene structure is:

```text
THREE.Scene
├─ parentObject
│  ├─ upper/lower jaw mesh objects
│  └─ loaded STL/OFF mesh variants
├─ polylineOverlayGroup
│  ├─ upper/lower component polyline groups
│  │  ├─ tube geometry group
│  │  └─ edit handle group
├─ artificial-tooth-overlay-group
│  ├─ upper-artificial-teeth group
│  └─ lower-artificial-teeth group
├─ lights
└─ camera
```

### 2. Jaw Mesh Loading and Surface Rendering

Jaw meshes are loaded from backend endpoints including `/parameterisation/mesh/getall`, `/surface/getall` and `/stl/get`. The viewer supports both OFF and STL mesh formats. `src/OFFLoader.js` parses OFF data into `THREE.BufferGeometry`, while `src/STLMeshLoader.js` parses STL data, merges vertices and creates mesh objects.

The main anatomical jaw mesh uses `MeshPhongMaterial` with vertex colours. Surface or denture meshes use `MeshStandardMaterial`. Jaw meshes are forced to remain opaque through `enforceOpaqueJawMesh()` so that user transparency controls do not accidentally affect the main anatomical surface.

One important legacy detail is that some upper OFF meshes are rotated and shifted after loading. Because of this, overlay data may arrive either in jaw-local coordinates or already transformed into scene-world coordinates.

### 3. Polyline Rendering and Coordinate-Space Handling

The polyline system loads design components from `/polylines/getall`, normalises the response, extracts polyline segments, renders tube geometry and creates draggable edit handles. Polyline objects are stored under `polylineOverlayGroup`.

The polyline renderer detects whether each segment is in jaw-local or scene-world coordinates by comparing the segment against jaw vertices in both spaces. If the data is jaw-local, the jaw mesh transform is copied onto the polyline group. If the data is already in scene-world space, the group transform is left unchanged to avoid double-transforming.

This coordinate-space handling belongs in the polyline renderer, not the artificial-teeth renderer. That separation keeps design polylines independent from prosthetic tooth rendering.

### 4. Artificial Teeth Rendering

Artificial teeth are handled separately in `src/artificialTeeth.js`. They are rendered as a separate overlay layer and do not modify the jaw mesh or polyline system.

The artificial-teeth data flow is:

```text
/toothPlacementData/get
→ decode MessagePack / StageDataManager
→ map upper/lower tooth craft data
→ choose geometry source
→ choose matching placement source
→ renderData()
→ artificial-tooth-overlay-group
```

Each artificial tooth is rendered as a full 3D mesh object with its own geometry, material, position, rotation and transform. The core rule is that geometry source and placement source must match. Surface-mesh geometry uses the API mesh centre as its placement source. Tooth-data geometry uses the matching tooth-data placement fields. Fields `[9]` and `[12]` are not used as tooth positions.

Guidelines such as buccal and gingival curves are visual references only. They do not place, snap, constrain, scale or orient artificial teeth.

### 5. Viewer Controls and Interaction

Viewer controls are managed mainly through `src/newControls.js`. They include upper/lower jaw visibility, jaw transparency, undercut and occlusion heatmap modes, polyline visibility controls, artificial-teeth visibility controls and workflow buttons such as Approve 3D, Edit 3D, Add to Mail and Show RPD Design.

The render loop updates controls, anchors the rotation target, clamps the control target, synchronises artificial-teeth overlay groups to the jaw meshes and renders the scene. This keeps the model centred during rotation and keeps overlay layers aligned with the corresponding jaw meshes.

### 6. Loading, Reliability and Performance Optimisation

The viewer loading strategy was then improved so the user can interact with the jaw as early as possible. The current sequence is:

1. Establish the shared login/session.
2. Fetch case information and thumbnails.
3. Start jaw mesh and denture mesh requests in parallel.
4. Render the jaw mesh and make the viewer interactive.
5. Load design overlays such as polylines and artificial teeth in the background.

`src/ApiClient.js` supports streaming progress when a `Content-Length` header is available. If the API or GCP proxy omits that header, the client falls back to direct JSON parsing instead of failing. This fixes a refresh-reliability issue where missing `Content-Length` could previously abort API calls before the response body was read.

Another reliability fix guards case metadata display when `positionData` is unavailable. If case information fails to load, the viewer can still continue loading STL and overlay data instead of throwing an uncaught `TypeError`.

The main remaining performance limitation is large payload size. Some API responses are approximately 16 MB to 30 MB. Current mitigations include progressive loading, parallel mesh requests, lazy chat loading, gzip-compressed static JS/CSS, long-lived asset cache headers and quieter diagnostic logging.

## Integration Summary

Nyunt's 2D and HTML work provides the application-facing layer for case management, clinical annotation and RPD design authoring. Shafik's 3D work provides the dedicated Three.js viewer, mesh rendering pipeline, design-overlay rendering, artificial-teeth visualisation and progressive loading behaviour.

The two workstreams meet through shared case IDs, shared navigation/sidebar components, chat and version-history integration, common REST API endpoints and the 2D-to-3D preview flow. Together, they form the current SmartRPD web application workflow: create or select a case, perform 2D design and clinical annotation, preview or review the design in 3D, collaborate through notes/chat, and continue stabilising the integrated build for UAT and production validation.

## Verification Summary

- [x] Production-mode Webpack build completes successfully.
- [x] 18 of 20 Jest test suites pass.
- [x] 76 of 77 executable tests pass.
- [x] 3D viewer architecture, overlay separation and progressive loading model are documented.
- [x] Refresh-reliability fixes are recorded for missing `Content-Length` and unavailable case metadata.
- [x] Nyunt's HTML, case-management and 2D annotation work is documented as a separate application-layer update.
- [ ] Fix the dashboard test environment by providing a `window.matchMedia` mock or compatibility wrapper.
- [ ] Fix the lower lingual plate → bar round-trip regression (`plate-prox` entries remain unexpectedly).
- [ ] Re-run the complete test suite with all suites passing.
- [ ] Perform and record formal desktop, tablet, Android and iOS UAT.
- [ ] Confirm deployment environment, release identifier and production smoke-test results.
- [ ] Review Webpack's **818 KiB** bundle and code-splitting warnings.

## Current Release Assessment

| Gate | Status | Assessment |
|---|:---:|---|
| Requirements approval | — | No feature-level approval evidence was found in Git. |
| Specification & design approval | — | UI assets and implementation exist, but formal design sign-off was not found. |
| Implementation | C | The listed application features are implemented in the integration branch. |
| Development verification | I | Build passes, but two test suites still require attention. |
| Integration | I | Features are merged, with stabilisation commits continuing through `93a2c37`. |
| User Acceptance Testing | — | Device-related commits exist, but formal UAT results/sign-off were not found. |
| Production | — | Production-mode compilation succeeds; deployment and production validation are unverified. |

---

*Prepared from repository history, current source code, the Webpack build, Jest results at `93a2c37`, the 3D viewer architecture summary attached on 25 June 2026, and the HTML/2D application files in `src/pages/` and `src/js/2D/`.*
