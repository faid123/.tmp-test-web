// A spotlight walk through the current page, from About or a first visit. Steps
// come from tourSteps.js, with unreachable ones dropped before the numbering is
// fixed. The overlay swallows clicks so the page can't change shape mid-walk.

import { PAGE_LABELS } from "./helpTopics.js";
import { tourFor, tourStorageKey } from "./tourSteps.js";
import { currentPageId, ensureStylesheet } from "./pageContext.js";

export { currentPageId };

const REVEAL_TIMEOUT_MS = 1500;
const AUTOSTART_TIMEOUT_MS = 4000;
const CARD_GAP = 14;      // space between the spotlight and the card
const VIEWPORT_PAD = 12;  // keep the card this far off every edge

// Below either of these the card becomes a full-width sheet. Height counts as
// much as width: a phone held sideways is ~390px tall.
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

// The 3D viewer covers its stage while the case downloads, so wait for both its
// loading screen and the slot manager. False past the cap skips this visit only.
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

// First selector actually on screen, in preference order — NOT a CSS list, since
// `querySelector("a, b")` returns document order, not the order asked for.
const firstVisible = (selectors) => asList(selectors).map(safeQuery).find(isVisible) || null;

// Each may name several alternatives: the 2D Case Note sits behind a tab or a
// footer button depending on a media query, and the case table prefers a row.
const selectorList = (step) => asList(step.selector);
const revealList = (step) => asList(step.reveal);

// Identifies the run of steps sharing one panel. A string, not the array — each
// step has its own copy, so a reference compare would close the panel between them.
const revealKey = (step) => revealList(step).join("|");

// No selector means a centred card, which always qualifies. Otherwise test
// VISIBILITY, not existence — display:none controls are in the document early.
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

  // The panel is already open, so a missing target is genuinely missing — and
  // re-pressing the opener would reset the form and discard what was typed.
  if (openedByTour && revealKey(step) === openedByTour.key) return null;

  const opener = firstVisible(revealList(step));
  if (!opener) return null;

  // Wait out the click that got us here: the case-actions dropdown closes on any
  // outside click, and Next is outside it.
  await nextFrame();
  opener.click();
  // Only panels naming a `dismiss` are tracked — the padlock opens design mode,
  // which the user keeps, rather than a panel to tidy away.
  if (step.dismiss) openedByTour = { key: revealKey(step), dismiss: step.dismiss };
  return waitForVisible(selectorList(step));
}

// Shuts the panel this tour opened, on leaving its run of steps and at the end —
// a walkthrough should leave the screen the way it found it.
function closeOpenedContainer() {
  const dismiss = openedByTour?.dismiss;
  openedByTour = null;
  if (!dismiss) return;
  const el = safeQuery(dismiss);
  if (isVisible(el)) el.click();
}

// -------------------------------------------------------------------- overlay

function buildOverlay() {
  ensureStylesheet("pageTour.css");

  root = document.createElement("div");
  root.id = "page-tour";
  root.className = "pt-root is-hidden";
  // Div-only, deliberately: style.css styles bare <header>, so a semantic tag
  // would inherit the viewer page's chrome. Roles carry the semantics instead.
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

  // Tapping the dimmed page advances. Bound on the root, not the mask: the mask
  // is only the hole, so the dimming (its shadow) hit-tests against the root.
  root.addEventListener("click", (e) => {
    if (e.target === root || e.target === maskEl) goTo(index + 1);
  });

  document.addEventListener("keydown", onKeydown, true);
  window.addEventListener("resize", scheduleReflow);
  // Mobile resizes the visual viewport, not the window, when the address bar
  // slides away — without these the sheet measures a stale screen size.
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

// The mask is a hole in a page-sized shadow: sized to the target it cuts the
// spotlight; collapsed to a point it dims everything for a step with no target.
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

// Sheet takes whichever edge leaves most room, so it can't cover the control.
// Capped to a share of the window, so a full-bleed target still shows through.
function placeCardAsSheet(r) {
  cardEl.classList.add("is-sheet");
  cardEl.style.transform = "none";
  cardEl.style.left = "0px";

  const above = Math.max(0, r.top);
  const below = Math.max(0, window.innerHeight - r.bottom);
  const toTop = above > below;

  // Never less than the card needs for its own buttons: a full-bleed target
  // leaves no free space, and sizing to it pushed Back/Next off the screen.
  cardEl.style.maxHeight = "";
  const natural = cardEl.scrollHeight;
  const cap = Math.min(window.innerHeight - VIEWPORT_PAD * 2, Math.round(window.innerHeight * SHEET_MAX_FRACTION));
  const room = Math.round((toTop ? above : below) - CARD_GAP);
  cardEl.style.maxHeight = `${Math.min(cap, Math.max(natural, room))}px`;

  // The opposite edge is cleared, not set to "auto": an inline top left from the
  // previous step would win over bottom and float the sheet mid-screen.
  cardEl.classList.toggle("is-sheet-top", toTop);
  cardEl.style.top = toTop ? "0px" : "";
  cardEl.style.bottom = toTop ? "" : "0px";
}

// Below by preference, then above, then beside, and only last on top. The side
// placements carry the tall panels, where below and above both fail.
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

// Both own the screen, so opening one closes the other. Poked through the DOM
// rather than imported, to keep the help assistant out of the tour's bundle.
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

// First visit runs the tour once, unprompted. Waits for the first anchored step's
// control, since toolbars are built after data arrives.
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
  // Checked after the anchor wait: this module loads dynamically and can arrive
  // before the viewer has even put its loading screen up.
  if (!(await waitForLoadingScreen())) return false;
  // Someone who started working (or opened Help) in the meantime is not waiting
  // for a tour to take over their screen.
  if (running || document.querySelector("#help-bot.is-open")) return false;
  return startPageTour({ pageId });
}
