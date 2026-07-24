// __tests__/helpBot.test.mjs
//
// Guards the help assistant's ranking layer (src/js/shared/helpMatcher.js) and
// the integrity of its knowledge base (src/js/shared/helpTopics.js). The panel
// itself is DOM-only wiring; everything that decides WHICH answer a user gets
// lives in these two pure modules, so that is what's tested here.
//
// Runs in the default node environment — neither module touches the DOM.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalize,
  tokenize,
  canonicalize,
  scoreTopic,
  findMatches,
  relatedTopics,
  suggestionsFor,
  localProvider,
  MIN_SCORE,
} from "../src/js/shared/helpMatcher.js";
import { HELP_TOPICS, TOPIC_BY_ID, PAGE_LABELS, PAGE_PATHS } from "../src/js/shared/helpTopics.js";

const idsOf = (matches) => matches.map((m) => m.topic.id);

describe("text preparation", () => {
  test("normalize lowercases and strips punctuation", () => {
    expect(normalize("How do I CREATE a case?!")).toBe("how do i create a case");
  });

  test("tokenize drops stopwords", () => {
    expect(tokenize("how do i create a case")).toEqual(["create", "case"]);
  });

  test("canonicalize folds a word onto its canonical form", () => {
    expect(canonicalize(["photos"])).toEqual(["image"]);
  });

  test("canonicalize replaces rather than adds, so one word can only score once", () => {
    // Keeping both "photos" and "image" would let a single query word hit the
    // same topic twice.
    expect(canonicalize(["photos"])).not.toContain("photos");
  });

  test("canonicalize dedupes words that fold onto the same form", () => {
    expect(canonicalize(["photo", "photos", "picture"])).toEqual(["image"]);
  });
});

describe("findMatches()", () => {
  test("plain phrasing finds the create-case topic", () => {
    expect(idsOf(findMatches("how do i create a case"))[0]).toBe("create-case");
  });

  test("synonyms route an unseen phrasing to the same topic", () => {
    // "make" → create, "patient" → case: neither word is in the topic verbatim.
    expect(idsOf(findMatches("how do i make a new patient"))[0]).toBe("create-case");
  });

  test("finds the undercut topic from the colour question a user would actually ask", () => {
    expect(idsOf(findMatches("what do the colours mean", HELP_TOPICS, { pageId: "viewer_3d" })))
      .toContain("undercut-heatmap");
  });

  test("returns nothing for a question made only of stopwords", () => {
    expect(findMatches("how do i")).toEqual([]);
  });

  test("respects the limit", () => {
    expect(findMatches("case", HELP_TOPICS, { limit: 2 })).toHaveLength(2);
  });

  test("ranking is stable across identical calls", () => {
    expect(idsOf(findMatches("how do i save"))).toEqual(idsOf(findMatches("how do i save")));
  });
});

describe("page context", () => {
  // "Where do I write notes" has a different right answer on each screen: the
  // case-instructions box, the 2D case note, or the 3D clinical notes.
  test("an ambiguous question answers with the notes box on the page you're on", async () => {
    const onList = await localProvider("where do i write notes", { pageId: "case_list" });
    const on2d = await localProvider("where do i write notes", { pageId: "annotation_2d" });
    const on3d = await localProvider("where do i write notes", { pageId: "viewer_3d" });
    expect(onList.topic.id).toBe("case-instructions");
    expect(on2d.topic.id).toBe("case-note");
    expect(on3d.topic.id).toBe("clinical-notes-3d");
  });

  test("a question whose answer lives elsewhere still resolves across pages", async () => {
    // Asked from the 3D viewer, this must still reach the case-list topic —
    // the page boost must not become an off-page penalty.
    const result = await localProvider("how do i create a case", { pageId: "viewer_3d" });
    expect(result.topic.id).toBe("create-case");
  });

  test("a partial phrase earns less than the whole phrase it came from", () => {
    // "where do i write notes" is a prefix of clinical-notes-3d's phrase; the
    // words it drops are the ones that discriminate, so it must not earn full
    // credit for them.
    const topic = TOPIC_BY_ID.get("clinical-notes-3d");
    const tokens = ["write", "note"];
    const partial = scoreTopic(tokens, topic, {}, "where do i write notes");
    const whole = scoreTopic(tokens, topic, {}, "where do i write notes in the 3d viewer");
    expect(partial).toBeLessThan(whole);
  });

  test("the same-page boost only applies to topics that already scored", () => {
    const topic = TOPIC_BY_ID.get("save-2d");
    const tokens = ["banana"];
    expect(scoreTopic(tokens, topic, { pageId: "annotation_2d" })).toBe(0);
  });

  test("an exact phrase outranks scattered keyword hits", () => {
    const topic = TOPIC_BY_ID.get("delete-case");
    const withPhrase = scoreTopic(["delete", "case"], topic, {}, "how do i delete a case");
    const withoutPhrase = scoreTopic(["delete", "case"], topic, {}, "delete case");
    expect(withPhrase).toBeGreaterThan(withoutPhrase);
  });
});

describe("localProvider()", () => {
  test("a confident answer carries a topic and alternates", async () => {
    const result = await localProvider("how do i share the 3d link", { pageId: "case_list" });
    expect(result.confident).toBe(true);
    expect(result.topic.id).toBe("share-3d-link");
    expect(result.alternates.length).toBeGreaterThan(0);
  });

  test("gibberish is not answered confidently but still offers somewhere to go", async () => {
    const result = await localProvider("asdfgh qwerty", { pageId: "case_list" });
    expect(result.confident).toBe(false);
    expect(result.topic).toBeNull();
    expect(result.alternates.length).toBeGreaterThan(0);
  });

  test("a single weak keyword falls below the confidence floor", async () => {
    const result = await localProvider("thing", { pageId: null });
    expect(result.confident).toBe(false);
  });

  test("MIN_SCORE is the floor a confident answer must clear", async () => {
    const result = await localProvider("how do i create a case", { pageId: "case_list" });
    const [best] = findMatches("how do i create a case", HELP_TOPICS, { pageId: "case_list" });
    expect(result.confident).toBe(true);
    expect(best.score).toBeGreaterThanOrEqual(MIN_SCORE);
  });
});

describe("suggestionsFor()", () => {
  test("puts topics from the current page first", () => {
    const suggestions = suggestionsFor("viewer_3d");
    expect(suggestions[0].page).toBe("viewer_3d");
  });

  test("falls back to global topics on a page with none of its own", () => {
    expect(suggestionsFor("admin_case_list").length).toBeGreaterThan(0);
  });
});

// The knowledge base is hand-maintained, so these guard the shape a topic must
// keep for the panel to render it and for matching to reach it.
describe("knowledge base integrity", () => {
  test("topic ids are unique", () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every topic has a title, an answer and keywords", () => {
    for (const topic of HELP_TOPICS) {
      expect(typeof topic.title).toBe("string");
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.answer.length).toBeGreaterThan(0);
      expect(topic.keywords.length).toBeGreaterThan(0);
    }
  });

  test("every related id resolves to a real topic", () => {
    for (const topic of HELP_TOPICS) {
      expect(relatedTopics(topic)).toHaveLength(topic.related.length);
    }
  });

  test("no topic lists itself as related", () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.related).not.toContain(topic.id);
    }
  });

  test("every page a topic claims has a label and a path", () => {
    for (const topic of HELP_TOPICS) {
      if (topic.page === null) continue;
      expect(PAGE_LABELS[topic.page]).toBeTruthy();
      expect(PAGE_PATHS[topic.page]).toBeTruthy();
    }
  });

  test("every topic is reachable by at least one of its own phrases", async () => {
    for (const topic of HELP_TOPICS) {
      for (const phrase of topic.phrases || []) {
        const matches = findMatches(phrase, HELP_TOPICS, { pageId: topic.page });
        expect(idsOf(matches)).toContain(topic.id);
      }
    }
  });

  test("TOPIC_BY_ID covers every topic", () => {
    expect(TOPIC_BY_ID.size).toBe(HELP_TOPICS.length);
  });
});

// The 3D jaw preview (preview3D.js, inside the 2D design) and the standalone
// 3D Viewer page are different surfaces with different capabilities. Conflating
// them sent people asking about surveying to a page that cannot survey, so the
// split is pinned here.
describe("3D surfaces are not conflated", () => {
  test("surveying belongs to the 2D design, where the jaw preview lives", () => {
    expect(TOPIC_BY_ID.get("survey-angle").page).toBe("annotation_2d");
  });

  test("asking about the survey angle never routes to the 3D Viewer", async () => {
    for (const pageId of ["case_list", "annotation_2d", "viewer_3d"]) {
      const result = await localProvider("how do i set the survey angle", { pageId });
      expect(result.topic.id).toBe("survey-angle");
      expect(result.topic.page).not.toBe("viewer_3d");
    }
  });

  test("no topic on the 3D Viewer claims the viewer can survey", () => {
    const viewerTopics = HELP_TOPICS.filter((t) => t.page === "viewer_3d");
    expect(viewerTopics.length).toBeGreaterThan(0);
    for (const topic of viewerTopics) {
      const claimsSurveying = /\bsurvey(ing)?\b/i.test(`${topic.title} ${topic.steps.join(" ")}`);
      expect(claimsSurveying).toBe(false);
    }
  });

  test("each screen answers the heatmap question with its own heatmap", async () => {
    const inPreview = await localProvider("what do the colours mean", { pageId: "annotation_2d" });
    const inViewer = await localProvider("what do the colours mean", { pageId: "viewer_3d" });
    expect(inPreview.topic.id).toBe("undercut-heatmap");
    expect(inViewer.topic.id).toBe("heatmap-viewer");
  });
});

// A "Show me" button is only offered when the topic's selector resolves on the
// page, so a stale selector fails silently — the answer just loses its button.
// This catches the rename that would cause it.
describe("highlight selectors still exist in the source", () => {
  const SOURCES = [
    "src/pages/case_list.html",
    "src/pages/2DAnnotation.html",
    "src/pages/ThreeDViewer.html",
    "src/pages/admin/admin_users.html",
    "src/js/2D/preview3D.js",
    "src/js/2D/preview3DSurvey.js",
    "src/js/2D/annotationCatalog.js",
    "src/viewer3d/index.js",
  ]
    .map((f) => {
      // Resolved from the repo root (jest runs there), matching
      // importResolution.test.mjs — these files are transpiled to CJS, so
      // import.meta is not available here.
      try {
        return readFileSync(join(process.cwd(), f), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");

  const selectors = [...new Set(HELP_TOPICS.map((t) => t.selector).filter(Boolean))];

  test("there are selectors to check", () => {
    expect(selectors.length).toBeGreaterThan(5);
  });

  test.each(selectors)("%s is defined somewhere in the app", (selector) => {
    // Check the last simple part ("#id", ".class") — compound selectors like
    // ".cm-detail .dropdown-toggle" are positional, only the target matters.
    const target = selector.trim().split(/\s+/).pop();
    const name = target.replace(/^[#.]/, "");
    expect(SOURCES).toContain(name);
  });
});
