// In-app help assistant — a slide-in panel that answers "how do I…" questions
// about the app, links to the screen involved, and can point at the control it
// is describing.
//
// Opened from the sidebar Help item (appSidebar.js), so it is available on
// every page that carries #appSidebar. The panel, its markup and its stylesheet
// are all created on first open — a page that never opens Help pays nothing.
//
// Answers come from `provider`, which defaults to the offline knowledge base in
// helpMatcher.js. The contract is async so a server-backed provider can replace
// it through setAnswerProvider() without any change here.
//
// A conversation lasts one open: dismissing the panel clears it, and nothing is
// stored, so Help always starts at the page greeting.

import { PAGE_LABELS, PAGE_PATHS, TOPIC_BY_ID } from "./helpTopics.js";
import { localProvider, relatedTopics, suggestionsFor } from "./helpMatcher.js";

const TRANSCRIPT_MAX = 30;
const HIGHLIGHT_MS = 3200;
const CLOSE_MS = 220;
const REVEAL_TIMEOUT_MS = 1500;

let provider = localProvider;
let root = null;          // #help-bot, built on first open
let logEl = null;
let inputEl = null;
let transcript = [];      // [{ role: "bot" | "user", text, topicId? }]
let clearHighlight = null;
let closeTimer = null;

// Swap the answer engine (e.g. a backend-backed one). Contract:
//   async (question, { pageId }) => { confident, topic, alternates }
export function setAnswerProvider(fn) {
  if (typeof fn === "function") provider = fn;
}

// ---------------------------------------------------------------- page context

// Which screen the user is on — drives the greeting, the starter chips and the
// same-page boost in scoring.
export function currentPageId(pathname = window.location.pathname) {
  const file = pathname.split("/").pop() || "index.html";
  const inAdminDir = /\/admin\//.test(pathname);
  if (inAdminDir) {
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

// Path back to the repo root from whatever page we're on. Same depth check as
// appSidebar.js — resolving against the page (not import.meta.url) keeps links
// correct however the modules are served.
function appRoot() {
  const path = window.location.pathname;
  if (/\/src\/pages\/admin\//.test(path)) return "../../../";
  if (/\/src\/pages\//.test(path)) return "../../";
  return "./";
}

function hrefForPage(pageId) {
  const path = PAGE_PATHS[pageId];
  return path ? new URL(appRoot() + path, window.location.href).href : null;
}

// ------------------------------------------------------------------ highlight

function isVisible(el) {
  return !!el && el.getClientRects().length > 0;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// Poll until a control is on screen. Used after opening the view that contains
// it — the create-case panes and the case-actions menu both appear synchronously
// today, but a frame or two of slack costs nothing and survives an animation.
function waitForVisible(selector, timeout = REVEAL_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeout;
    const tick = () => {
      const el = safeQuery(selector);
      if (isVisible(el)) return resolve(el);
      if (Date.now() >= deadline) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

// Get the topic's control on screen, opening its container if that's what it
// takes. `reveal` names the control that opens the view the target lives in (the
// Create Case button, the ☰ case-actions toggle); we click it and wait for the
// real target rather than highlighting the opener and calling it done.
//
// The opener is only clicked when the target isn't already visible — reopening
// the create-case view calls resetCreateCaseForm(), which would throw away
// whatever the user had already typed.
async function resolveTarget(topic) {
  const existing = safeQuery(topic.selector);
  if (isVisible(existing)) return existing;
  if (!topic.reveal) return null;
  const opener = safeQuery(topic.reveal);
  if (!isVisible(opener)) return null;

  // Wait out the click that got us here before opening anything. The case-actions
  // dropdown closes on any click outside itself, and our own "Show me" click is
  // outside it — clicking the toggle mid-dispatch opens the menu only for that
  // same event to close it again, leaving the ring on a control nobody can see.
  await nextFrame();
  opener.click();

  const el = await waitForVisible(topic.selector);
  // Confirm it stayed put: a container that opens and immediately closes again
  // must count as a failed reveal, not a highlight on something invisible.
  await nextFrame();
  return isVisible(el) ? el : null;
}

// Scroll the topic's control into view and ring it briefly. Returns false when
// it isn't reachable on this page, so the caller can offer a deep link instead.
async function showControl(topic) {
  // Resolved before the panel closes: a reveal that fails must not leave the
  // user with a dismissed panel and nothing highlighted.
  const el = await resolveTarget(topic);
  if (!isVisible(el)) return false;

  closePanel({ keepTranscript: true });
  clearHighlight?.();
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  el.classList.add("hb-highlight");

  const done = () => {
    el.classList.remove("hb-highlight");
    document.removeEventListener("pointerdown", done, true);
    clearHighlight = null;
  };
  clearHighlight = done;
  document.addEventListener("pointerdown", done, true);
  setTimeout(() => clearHighlight === done && done(), HIGHLIGHT_MS);
  return true;
}

// --------------------------------------------------------------- panel markup

function ensureStylesheet() {
  const href = new URL(`${appRoot()}css/helpBot.css`, window.location.href).href;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function buildPanel() {
  ensureStylesheet();

  root = document.createElement("div");
  root.id = "help-bot";
  root.className = "hb-root is-hidden";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="hb-backdrop" data-hb-close></div>
    <aside class="hb-panel" role="dialog" aria-label="Help assistant">
      <header class="hb-header">
        <div class="hb-heading">
          <span class="hb-title">Help</span>
          <span class="hb-context" id="hbContext"></span>
        </div>
        <button type="button" class="hb-icon-btn" id="hbClearBtn" aria-label="Clear conversation" title="Clear conversation">&#8635;</button>
        <button type="button" class="hb-icon-btn hb-close" data-hb-close aria-label="Close help">&times;</button>
      </header>
      <div class="hb-log" id="hbLog" role="log" aria-live="polite"></div>
      <form class="hb-input" id="hbForm" autocomplete="off">
        <input type="text" id="hbInput" class="hb-field" placeholder="Ask how to do something…" aria-label="Ask a question" />
        <button type="submit" class="hb-send">Ask</button>
      </form>
    </aside>
  `;
  document.body.appendChild(root);

  logEl = root.querySelector("#hbLog");
  inputEl = root.querySelector("#hbInput");
  root.querySelector("#hbContext").textContent = PAGE_LABELS[currentPageId()] || "";

  // Wrapped, not passed by reference: the click event must not land in the
  // options argument of either function.
  root.querySelectorAll("[data-hb-close]").forEach((el) =>
    el.addEventListener("click", () => closePanel())
  );
  root.querySelector("#hbClearBtn").addEventListener("click", () => resetConversation());
  root.querySelector("#hbForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const question = inputEl.value.trim();
    if (!question) return;
    inputEl.value = "";
    ask(question);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.classList.contains("is-open")) closePanel();
  });
}

// ------------------------------------------------------------------ rendering

function bubble(role) {
  const el = document.createElement("div");
  el.className = `hb-msg is-${role}`;
  logEl.appendChild(el);
  return el;
}

function scrollToEnd() {
  logEl.scrollTop = logEl.scrollHeight;
}

function renderUser(text) {
  bubble("user").textContent = text;
  scrollToEnd();
}

// A row of clickable topic chips; asking one replays it as a question.
function renderChips(parent, topics, label) {
  if (!topics.length) return;
  if (label) {
    const caption = document.createElement("div");
    caption.className = "hb-chips-label";
    caption.textContent = label;
    parent.appendChild(caption);
  }
  const wrap = document.createElement("div");
  wrap.className = "hb-chips";
  for (const topic of topics) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "hb-chip";
    chip.textContent = topic.title;
    chip.addEventListener("click", () => answerTopic(topic, { echo: topic.title }));
    wrap.appendChild(chip);
  }
  parent.appendChild(wrap);
  scrollToEnd();
}

// One answer: heading, prose, numbered steps, then the actions it supports on
// this page (point at the control, or open the page it lives on).
function renderAnswer(topic) {
  const el = bubble("bot");

  const heading = document.createElement("div");
  heading.className = "hb-answer-title";
  heading.textContent = topic.title;
  el.appendChild(heading);

  const body = document.createElement("p");
  body.className = "hb-answer-text";
  body.textContent = topic.answer;
  el.appendChild(body);

  if (topic.steps?.length) {
    const list = document.createElement("ol");
    list.className = "hb-steps";
    for (const step of topic.steps) {
      const item = document.createElement("li");
      item.textContent = step;
      list.appendChild(item);
    }
    el.appendChild(list);
  }

  const actions = document.createElement("div");
  actions.className = "hb-actions";

  const onThisPage = !topic.page || topic.page === currentPageId();
  // Reachable either directly, or by opening the view it lives in.
  const canPoint =
    onThisPage &&
    topic.selector &&
    (isVisible(safeQuery(topic.selector)) || (topic.reveal && isVisible(safeQuery(topic.reveal))));
  if (canPoint) {
    const show = document.createElement("button");
    show.type = "button";
    show.className = "hb-action";
    show.textContent = "Show me";
    show.addEventListener("click", () => showControl(topic));
    actions.appendChild(show);
  }

  if (topic.page && !onThisPage) {
    const href = hrefForPage(topic.page);
    if (href) {
      const open = document.createElement("a");
      open.className = "hb-action";
      open.href = href;
      open.textContent = `Open ${PAGE_LABELS[topic.page]}`;
      actions.appendChild(open);
    }
  }

  if (actions.children.length) el.appendChild(actions);

  renderChips(el, relatedTopics(topic), "Related");
  scrollToEnd();
  return el;
}

function safeQuery(selector) {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function renderUnsure(alternates) {
  const el = bubble("bot");
  const text = document.createElement("p");
  text.className = "hb-answer-text";
  text.textContent =
    "I don't have an answer for that one. These are the closest things I know about — or use Feedback in the menu to reach the team.";
  el.appendChild(text);
  renderChips(el, alternates, null);
  scrollToEnd();
}

function renderGreeting() {
  const pageId = currentPageId();
  const el = bubble("bot");
  const text = document.createElement("p");
  text.className = "hb-answer-text";
  text.textContent = `You're on ${PAGE_LABELS[pageId] || "SmartRPD"}. Ask me how to do something, or start with one of these.`;
  el.appendChild(text);
  renderChips(el, suggestionsFor(pageId), null);
  scrollToEnd();
}

// ------------------------------------------------------------------- asking

async function ask(question) {
  renderUser(question);
  transcript.push({ role: "user", text: question });

  const typing = bubble("bot");
  typing.classList.add("hb-typing");
  typing.textContent = "…";
  scrollToEnd();

  let result;
  try {
    result = await provider(question, { pageId: currentPageId() });
  } catch (err) {
    console.error("[helpBot] answer provider failed:", err);
    result = { confident: false, topic: null, alternates: suggestionsFor(currentPageId(), undefined, 3) };
  }
  typing.remove();

  if (result?.confident && result.topic) {
    const answerEl = renderAnswer(result.topic);
    transcript.push({ role: "bot", text: result.topic.answer, topicId: result.topic.id });
    if (result.alternates?.length) {
      renderChips(answerEl, result.alternates, "You might also mean");
    }
  } else {
    renderUnsure(result?.alternates || []);
    transcript.push({ role: "bot", text: "No confident answer." });
  }
  transcript = transcript.slice(-TRANSCRIPT_MAX);
}

// Answer a topic directly (chip click), echoing it as though it were asked.
function answerTopic(topic, { echo } = {}) {
  if (echo) {
    renderUser(echo);
    transcript.push({ role: "user", text: echo });
  }
  renderAnswer(topic);
  transcript.push({ role: "bot", text: topic.answer, topicId: topic.id });
  transcript = transcript.slice(-TRANSCRIPT_MAX);
}

// Back to a blank conversation and the page greeting. `focus` is for the header
// button — a reset running behind a closing panel must not pull focus back.
function resetConversation({ focus = true } = {}) {
  transcript = [];
  logEl.innerHTML = "";
  if (inputEl) inputEl.value = "";
  renderGreeting();
  if (focus) inputEl?.focus();
}

// -------------------------------------------------------------- open / close

// Same open/close choreography as the app sidebar and case chat: reveal, then
// transform on the next frame; on close, wait for the transition before hiding.
// `topicId` opens straight onto one answer instead of the page greeting — the
// hand-off from a guided tour step's "Read more", where the question has
// already been chosen for the user.
export function openHelpBot({ topicId } = {}) {
  if (!root) {
    buildPanel();
    renderGreeting();
  } else {
    root.querySelector("#hbContext").textContent = PAGE_LABELS[currentPageId()] || "";
  }

  const topic = topicId ? TOPIC_BY_ID.get(topicId) : null;
  if (topic) answerTopic(topic, { echo: topic.title });
  // Reopening inside the close animation: drop the pending hide-and-reset, or it
  // would fire on the panel we just brought back.
  clearTimeout(closeTimer);
  closeTimer = null;
  root.classList.remove("is-hidden");
  requestAnimationFrame(() => root.classList.add("is-open"));
  root.setAttribute("aria-hidden", "false");
  setTimeout(() => inputEl?.focus(), 60);
  scrollToEnd();
}

// Dismissing the panel ends the conversation — the next open starts fresh. The
// reset runs after the slide-out so the log is never seen being emptied.
// `keepTranscript` is for "Show me", which closes the panel to uncover the
// control it is describing; that is a hand-off within one answer, not a
// dismissal, so the conversation has to survive it.
export function closePanel({ keepTranscript = false } = {}) {
  if (!root) return;
  root.classList.remove("is-open");
  root.setAttribute("aria-hidden", "true");
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    root.classList.add("is-hidden");
    closeTimer = null;
    if (!keepTranscript) resetConversation({ focus: false });
  }, CLOSE_MS);
}
