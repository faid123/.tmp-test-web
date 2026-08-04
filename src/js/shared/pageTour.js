// Guided start-up journey — a spotlight walk through the current page.
//
// Opened from the About item (appSidebar.js), and once automatically the first
// time someone lands on a page that has a tour. The overlay, its markup and its
// stylesheet are built on first run, so a page whose tour never runs pays
// nothing.
//
// The steps come from tourSteps.js, keyed by the same page ids helpBot.js uses.
// Steps whose control isn't on the page are dropped before the tour starts —
// admin buttons, the components panel before the arches are locked, anything
// that needs a selected case — so the numbering never counts a step that will
// be skipped over.
//
// While a tour runs the page underneath is not interactive: the overlay swallows
// clicks. That keeps the app from changing shape halfway through a walkthrough
// that is describing it.

import { PAGE_LABELS } from "./helpTopics.js";
import { tourFor, tourStorageKey } from "./tourSteps.js";

const REVEAL_TIMEOUT_MS = 1500;
const AUTOSTART_TIMEOUT_MS = 4000;
const CARD_GAP = 14;      // space between the spotlight and the card
const VIEWPORT_PAD = 12;  // keep the card this far off every edge

// Below either of these the card stops being a floating card and becomes a
// full-width sheet against one edge. Height counts as much as width: a phone
// held sideways is around 390px tall — wide enough to miss a width-only
// breakpoint, far too short for a card that has to clear a spotlight.
const SHEET_MAX_WIDTH = 560;
const SHEET_MAX_HEIGHT = 520;
const SHEET_MAX_FRACTION = 0.6; // the sheet never eats more of the screen than this

let root = null;      // #page-tour, built on first run
let maskEl = null;
let cardEl = null;
let steps = [];
let index = 0;
let running = false;
let reflowFrame = 0;
let currentTarget = null;
let openedByTour = null;  // { reveal, dismiss } for a panel this tour opened

// ---------------------------------------------------------------- page context

// Same page ids as the help assistant. Duplicated rather than imported so the
// tour does not pull the help bot's knowledge base into its bundle.
export function currentPageId(pathname = window.location.pathname) {
  const file = pathname.split("/").pop() || "index.html";
  if (/\/admin\//.test(pathname)) {
    if (/admin_users/i.test(file)) return "admin_users";
    if (/admin_machineid/i.test(file)) return "admin_machineid";
    if (/admin_case_list/i.test(file)) return "admin_case_list";
  }
  if (/^case_list/i.test(file)) return "case_list";
  if (/^2DAnnotation/i.test(file)) return "annotation_2d";
  if (/^ThreeDViewer/i.test(file)) return "viewer_3d";
  if (/^AnnotationHistory/i.test(file)) return "annotation_history";
  if (/^VersionHistory/i.test(file)) return "version_history";
  return "login";
}

function appRoot() {
  const path = window.location.pathname;
  if (/\/src\/pages\/admin\//.test(path)) return "../../../";
  if (/\/src\/pages\//.test(path)) return "../../";
  return "./";
}

// -------------------------------------------------------------------- storage

// Private-mode browsers throw on localStorage; a tour that can't remember it ran
// is better than one that breaks the page.
function hasSeen(pageId) {
  try {
    return localStorage.getItem(tourStorageKey(pageId)) === "1";
  } catch {
    return false;
  }
}

function markSeen(pageId) {
  try {
    localStorage.setItem(tourStorageKey(pageId), "1");
  } catch {
    /* nothing to do — the tour just offers itself again next time */
  }
}

// Clears the "seen" flag so the tour auto-runs again. Exposed for support and
// for a future "replay the tours" preference.
export function resetTourProgress(pageId = currentPageId()) {
  try {
    localStorage.removeItem(tourStorageKey(pageId));
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------------- targeting

function safeQuery(selector) {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function isVisible(el) {
  return !!el && el.getClientRects().length > 0;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function waitForVisible(selectors, timeout = REVEAL_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeout;
    const tick = () => {
      const el = firstVisible(selectors);
      if (el) return resolve(el);
      if (Date.now() >= deadline) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

// The 3D viewer covers its whole stage until the case's 3D files have
// downloaded — tens of MB, so tens of seconds. Highlighting controls nobody can
// see yet is worse than starting late, so hold the tour until the screen lifts.
// Resolves false if it is still up after the cap, which skips the tour for this
// visit and leaves it unseen for the next one.
// Two stages cover the viewer: its own loading screen while the scene builds,
// then the slot manager while the case's 3D files download into it.
const LOADING_SCREEN_SELECTOR =
  "#viewer-loading-screen, #design-upload-prompt.is-loading";
const LOADING_SCREEN_TIMEOUT_MS = 180000;

function waitForLoadingScreen(timeout = LOADING_SCREEN_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeout;
    const tick = () => {
      if (!document.querySelector(LOADING_SCREEN_SELECTOR)) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(tick, 250);
    };
    tick();
  });
}

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// First of these selectors that is actually on screen. Order is the preference
// order, which is why this is not a CSS selector list — `querySelector("a, b")`
// returns whichever comes first in the document, not whichever we asked for
// first, and the case-table step wants a data row ahead of the header above it.
const firstVisible = (selectors) => asList(selectors).map(safeQuery).find(isVisible) || null;

// `selector` and `reveal` may each name several alternatives. The 2D design puts
// the Case Note behind the CASE NOTE tab on a desktop and a footer button on a
// tablet — which one exists is a media query — and the case table is worth
// pointing at by its first row when the list has one, or its header when empty.
const selectorList = (step) => asList(step.selector);
const revealList = (step) => asList(step.reveal);

// Identifies the run of steps sharing one panel. A string, not the array itself:
// each step carries its own copy of the list, so comparing by reference would
// close the panel between two steps that are both inside it.
const revealKey = (step) => revealList(step).join("|");

// Can this step be shown at all? A step with no selector is a centred card and
// always qualifies; otherwise the control must be ON SCREEN now, or reachable by
// opening one of the views named in `reveal`.
//
// Visibility, not existence: the 2D design ships #componentTabs inside a panel
// that is display:none until the arches are locked, and the case detail panel's
// controls are in the document before a case is picked. Testing for existence
// kept those steps in the tour and then handed the resolver a target it could
// never show — a step that arrived with no spotlight and nothing to look at.
function stepIsReachable(step) {
  if (!selectorList(step).length) return true;
  if (firstVisible(selectorList(step))) return true;
  return !!firstVisible(revealList(step));
}

// Get the step's control on screen, opening its container first when that's
// what it takes — same contract as the help assistant's "Show me".
async function resolveTarget(step) {
  if (!selectorList(step).length) return null;
  const existing = firstVisible(selectorList(step));
  if (existing) return existing;

  // The panel this step lives in is already open, because this tour opened it.
  // A target still not found is genuinely missing — and pressing the opener
  // again would re-run whatever it does on the way in: Create Case calls
  // resetCreateCaseForm(), the Case Note rebuilds its form from scratch. Both
  // would throw away what the user had typed. Show the step without a spotlight
  // rather than reopening.
  if (openedByTour && revealKey(step) === openedByTour.key) return null;

  const opener = firstVisible(revealList(step));
  if (!opener) return null;

  // Wait out the click that got us here before opening anything. The
  // case-actions dropdown closes on any click outside itself, and the Next
  // button is outside it — clicking the toggle mid-dispatch would open the menu
  // only for that same event to close it again.
  await nextFrame();
  opener.click();
  // Remember what we opened so the tour can shut it again on the way out. Only
  // panels that name a `dismiss` are tracked — the padlock opens design mode,
  // which is a mode the user keeps, not a panel to be tidied away.
  if (step.dismiss) openedByTour = { key: revealKey(step), dismiss: step.dismiss };
  return waitForVisible(selectorList(step));
}

// Shut the panel this tour opened. Called when the tour moves off the run of
// steps that share it, and when the tour ends — a walkthrough should leave the
// screen the way it found it.
function closeOpenedContainer() {
  const dismiss = openedByTour?.dismiss;
  openedByTour = null;
  if (!dismiss) return;
  const el = safeQuery(dismiss);
  if (isVisible(el)) el.click();
}

// -------------------------------------------------------------------- overlay

function ensureStylesheet() {
  const href = new URL(`${appRoot()}css/pageTour.css`, window.location.href).href;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function buildOverlay() {
  ensureStylesheet();

  root = document.createElement("div");
  root.id = "page-tour";
  root.className = "pt-root is-hidden";
  // Div-only markup, deliberately: ThreeDViewer.html loads style.css, which
  // styles bare <header> — a semantic tag here would inherit that page's own
  // chrome. Roles carry the semantics instead.
  root.innerHTML = `
    <div class="pt-mask" id="ptMask"></div>
    <div class="pt-card" id="ptCard" role="dialog" aria-modal="true" aria-labelledby="ptTitle">
      <div class="pt-card-head">
        <span class="pt-step-count" id="ptCount"></span>
        <button type="button" class="pt-skip" id="ptSkip">Skip tour</button>
      </div>
      <div class="pt-title" id="ptTitle" role="heading" aria-level="2"></div>
      <div class="pt-text" id="ptText"></div>
      <ul class="pt-list" id="ptList" hidden></ul>
      <div class="pt-dots" id="ptDots" aria-hidden="true"></div>
      <div class="pt-card-foot">
        <button type="button" class="pt-btn pt-btn-ghost" id="ptMore" hidden>Read more</button>
        <span class="pt-spacer"></span>
        <button type="button" class="pt-btn pt-btn-quiet" id="ptBack">Back</button>
        <button type="button" class="pt-btn pt-btn-primary" id="ptNext">Next</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  maskEl = root.querySelector("#ptMask");
  cardEl = root.querySelector("#ptCard");

  root.querySelector("#ptSkip").addEventListener("click", () => endTour());
  root.querySelector("#ptBack").addEventListener("click", () => goTo(index - 1));
  root.querySelector("#ptNext").addEventListener("click", () => goTo(index + 1));
  root.querySelector("#ptMore").addEventListener("click", openTopicInHelp);

  // Clicking the dimmed page moves on rather than doing nothing — the overlay is
  // swallowing that click anyway, and a stuck-looking tour is worse than one
  // that advances a step early. Bound on the root, not the mask: the mask is only
  // the hole, so the dimming (which is its shadow, and belongs to the root as far
  // as hit-testing goes) took no clicks at all. Matters most on a phone, where
  // tapping the veil is how people expect to move on.
  root.addEventListener("click", (e) => {
    if (e.target === root || e.target === maskEl) goTo(index + 1);
  });

  document.addEventListener("keydown", onKeydown, true);
  window.addEventListener("resize", scheduleReflow);
  // Mobile browsers resize the visual viewport, not the window, when the address
  // bar slides away or a keyboard opens — without these the sheet is left
  // measuring a window that is no longer the size of the screen.
  window.visualViewport?.addEventListener("resize", scheduleReflow);
  window.visualViewport?.addEventListener("scroll", scheduleReflow);
  // Capture phase: the spotlight has to follow the target through a scrolling
  // pane, not just the window.
  document.addEventListener("scroll", scheduleReflow, true);
}

function onKeydown(e) {
  if (!running) return;
  if (e.key === "Escape") {
    e.preventDefault();
    endTour();
  } else if (e.key === "ArrowRight" || e.key === "Enter") {
    e.preventDefault();
    goTo(index + 1);
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    goTo(index - 1);
  }
}

// ------------------------------------------------------------------ positioning

function scheduleReflow() {
  if (!running || reflowFrame) return;
  reflowFrame = requestAnimationFrame(() => {
    reflowFrame = 0;
    positionFor(currentTarget);
  });
}

// The mask is a hole in a page-sized shadow: sizing it to the target cuts the
// spotlight, and collapsing it to a point in the middle dims the whole page for
// the steps that have no control to point at.
function positionFor(el) {
  if (!maskEl || !cardEl) return;

  if (!isVisible(el)) {
    currentTarget = null;
    maskEl.classList.add("is-empty");
    maskEl.style.top = `${window.innerHeight / 2}px`;
    maskEl.style.left = `${window.innerWidth / 2}px`;
    maskEl.style.width = "0px";
    maskEl.style.height = "0px";
    centreCard();
    return;
  }

  const r = el.getBoundingClientRect();
  const pad = 6;
  maskEl.classList.remove("is-empty");
  maskEl.style.top = `${r.top - pad}px`;
  maskEl.style.left = `${r.left - pad}px`;
  maskEl.style.width = `${r.width + pad * 2}px`;
  maskEl.style.height = `${r.height + pad * 2}px`;
  if (isSheetLayout()) placeCardAsSheet(r);
  else placeCardNear(r);
}

function centreCard() {
  clearSheet();
  cardEl.style.top = "50%";
  cardEl.style.left = "50%";
  cardEl.style.transform = "translate(-50%, -50%)";
}

// Phone-shaped viewport — by width, or by height for a phone held sideways.
function isSheetLayout() {
  return window.innerWidth <= SHEET_MAX_WIDTH || window.innerHeight <= SHEET_MAX_HEIGHT;
}

function clearSheet() {
  cardEl.classList.remove("is-sheet", "is-sheet-top");
  cardEl.style.bottom = "";
  cardEl.style.maxHeight = "";
}

// Full-width sheet against whichever edge the target leaves most room beside, so
// the card cannot land on the control the step is describing. The 3D viewer is
// the case that forces this: its pen, notes and chat buttons are all in a 35px
// footer, and a sheet pinned to the bottom covered every one of them.
//
// Capped to a share of the window as well as to the free space, so a step
// against a full-bleed target — the viewer's #container3D is the whole stage —
// gets a short sheet with the model still visible above it rather than a card
// filling the screen.
function placeCardAsSheet(r) {
  cardEl.classList.add("is-sheet");
  cardEl.style.transform = "none";
  cardEl.style.left = "0px";

  const above = Math.max(0, r.top);
  const below = Math.max(0, window.innerHeight - r.bottom);
  const toTop = above > below;

  // Free space is what the sheet gets, but never less than the card needs to
  // show its own buttons: against a full-bleed target — the viewer's #container3D
  // is the whole stage — there is no free space at all, and a sheet sized to it
  // pushed Back and Next off the bottom of the screen.
  cardEl.style.maxHeight = "";
  const natural = cardEl.scrollHeight;
  const cap = Math.min(window.innerHeight - VIEWPORT_PAD * 2, Math.round(window.innerHeight * SHEET_MAX_FRACTION));
  const room = Math.round((toTop ? above : below) - CARD_GAP);
  cardEl.style.maxHeight = `${Math.min(cap, Math.max(natural, room))}px`;

  // One edge is pinned and the other is cleared rather than set to "auto" — an
  // inline top left over from the previous step would otherwise win over bottom
  // and leave the sheet floating mid-screen.
  cardEl.classList.toggle("is-sheet-top", toTop);
  cardEl.style.top = toTop ? "0px" : "";
  cardEl.style.bottom = toTop ? "" : "0px";
}

// Below the spotlight by preference, then above, then beside it — and only as a
// last resort on top of it.
//
// The side placements matter for the tall panels: the 2D design's Components
// panel and 3D preview are most of the window's height, so below and above both
// fail and a card centred over the target would hide the very thing the step is
// pointing at.
function placeCardNear(r) {
  clearSheet();
  cardEl.style.transform = "none";
  const box = cardEl.getBoundingClientRect();
  const clampX = (x) => Math.min(Math.max(x, VIEWPORT_PAD), window.innerWidth - box.width - VIEWPORT_PAD);
  const clampY = (y) => Math.min(Math.max(y, VIEWPORT_PAD), window.innerHeight - box.height - VIEWPORT_PAD);
  const centredX = clampX(r.left + r.width / 2 - box.width / 2);
  const centredY = clampY(r.top + r.height / 2 - box.height / 2);

  let top;
  let left;
  if (window.innerHeight - r.bottom - CARD_GAP - VIEWPORT_PAD >= box.height) {
    top = r.bottom + CARD_GAP;
    left = centredX;
  } else if (r.top - CARD_GAP - VIEWPORT_PAD >= box.height) {
    top = r.top - CARD_GAP - box.height;
    left = centredX;
  } else if (window.innerWidth - r.right - CARD_GAP - VIEWPORT_PAD >= box.width) {
    top = centredY;
    left = r.right + CARD_GAP;
  } else if (r.left - CARD_GAP - VIEWPORT_PAD >= box.width) {
    top = centredY;
    left = r.left - CARD_GAP - box.width;
  } else {
    // Nowhere clear: sit in whichever corner leaves most of the target visible.
    top = r.top + r.height / 2 > window.innerHeight / 2 ? VIEWPORT_PAD : window.innerHeight - box.height - VIEWPORT_PAD;
    left = centredX;
  }

  cardEl.style.top = `${Math.round(clampY(top))}px`;
  cardEl.style.left = `${Math.round(clampX(left))}px`;
}

// ------------------------------------------------------------------- rendering

// A step that describes several things at once — the Components tabs and what
// each of them is for — lists them under the prose rather than in it.
function renderBullets(bullets) {
  const list = root.querySelector("#ptList");
  list.innerHTML = "";
  list.hidden = !bullets?.length;
  for (const line of bullets || []) {
    const item = document.createElement("li");
    // "LABEL — what it does": the label is emphasised so the list can be
    // skimmed for the tab you are looking for.
    const [label, ...rest] = line.split(" — ");
    if (rest.length) {
      const strong = document.createElement("b");
      strong.textContent = label;
      item.append(strong, ` — ${rest.join(" — ")}`);
    } else {
      item.textContent = line;
    }
    list.appendChild(item);
  }
}

function renderDots() {
  const dots = root.querySelector("#ptDots");
  dots.innerHTML = "";
  steps.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = `pt-dot${i === index ? " is-active" : ""}${i < index ? " is-done" : ""}`;
    dots.appendChild(dot);
  });
}

// The current step's help topic, opened in the assistant. Imported on click so
// the knowledge base only loads for someone who asks for it.
async function openTopicInHelp() {
  const topicId = steps[index]?.topic;
  if (!topicId) return;
  endTour();
  try {
    const { openHelpBot } = await import("./helpBot.js");
    openHelpBot({ topicId });
  } catch (err) {
    console.error("[pageTour] help assistant failed to load:", err);
  }
}

async function renderStep() {
  const step = steps[index];
  if (!step) return;

  // Leaving the run of steps that share a panel closes it — including when the
  // move is backwards, where the next step reopens whatever it needs.
  if (openedByTour && revealKey(step) !== openedByTour.key) closeOpenedContainer();

  root.querySelector("#ptCount").textContent = `Step ${index + 1} of ${steps.length}`;
  root.querySelector("#ptTitle").textContent = step.title;
  root.querySelector("#ptText").textContent = step.text;
  renderBullets(step.bullets);
  root.querySelector("#ptBack").disabled = index === 0;
  root.querySelector("#ptNext").textContent = index === steps.length - 1 ? "Done" : "Next";
  root.querySelector("#ptMore").hidden = !step.topic;
  renderDots();

  const target = await resolveTarget(step);
  // The tour may have been ended (or moved on) while we waited for a container
  // to open — drop the stale result rather than spotlighting the wrong thing.
  if (!running || steps[index] !== step) return;

  currentTarget = target;
  if (isVisible(target)) {
    target.classList.add("pt-target");
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }
  positionFor(target);
}

function clearTargetMark() {
  document.querySelectorAll(".pt-target").forEach((el) => el.classList.remove("pt-target"));
  currentTarget = null;
}

function goTo(next) {
  if (!running) return;
  if (next < 0) return;
  if (next >= steps.length) return endTour({ completed: true });
  clearTargetMark();
  index = next;
  renderStep();
}

// ---------------------------------------------------------------- start / end

// Run the tour for this page. Returns false when there is nothing to show, so
// the caller can say so rather than flashing an empty overlay.
export function startPageTour({ pageId = currentPageId() } = {}) {
  const script = tourFor(pageId);
  if (!script?.length) return false;

  const usable = script.filter(stepIsReachable);
  // A tour that has lost everything but its own welcome card is not a tour.
  if (usable.filter((s) => s.selector).length === 0) return false;

  if (!root) buildOverlay();
  closeHelpPanel();

  steps = usable;
  index = 0;
  running = true;
  root.dataset.page = pageId;
  root.classList.remove("is-hidden");
  requestAnimationFrame(() => root.classList.add("is-open"));
  renderStep();
  markSeen(pageId);
  return true;
}

// The help panel and the tour both own the screen; opening one closes the other.
// Poked through the DOM rather than imported so the tour doesn't pull the help
// assistant into its bundle.
function closeHelpPanel() {
  document.querySelector("#help-bot.is-open .hb-close")?.click();
}

export function endTour({ completed = false } = {}) {
  if (!running) return;
  running = false;
  closeOpenedContainer();
  clearTargetMark();
  cancelAnimationFrame(reflowFrame);
  reflowFrame = 0;
  root.classList.remove("is-open");
  root.classList.add("is-hidden");
  if (completed) root.dispatchEvent(new CustomEvent("tour:completed", { bubbles: true }));
}

export function isTourRunning() {
  return running;
}

// Names the page in About's "no tour here yet" message.
export function tourPageLabel(pageId = currentPageId()) {
  return PAGE_LABELS[pageId] || "this page";
}

// First visit to a page that has a tour: run it once, unprompted. Waits for the
// first anchored step's control to exist, because the case list and the 2D
// design both build their toolbars after data arrives — starting before that
// would drop half the steps as unreachable.
export async function maybeAutoStartTour({ pageId = currentPageId() } = {}) {
  const script = tourFor(pageId);
  if (!script?.length || hasSeen(pageId)) return false;

  const anchor = script.find((s) => s.selector && !s.reveal);
  if (anchor) {
    const el = await waitForVisible(anchor.selector, AUTOSTART_TIMEOUT_MS);
    if (!el) return false;
    // One more frame so the rest of the toolbar lands before we filter steps.
    await nextFrame();
  }
  // Checked after the anchor wait, not before: this module is imported
  // dynamically, so on a fast connection it can get here before the viewer has
  // even put its loading screen up.
  if (!(await waitForLoadingScreen())) return false;
  // Someone who started working (or opened Help) in the meantime is not waiting
  // for a tour to take over their screen.
  if (running || document.querySelector("#help-bot.is-open")) return false;
  return startPageTour({ pageId });
}
