#!/usr/bin/env node
// Weekly documentation review — see Documentations/WEEKLY_DOC_REVIEW.md for the full process.
//
// What this script does:
//   1. Verifies this branch's HEAD still contains the commit actually deployed to
//      nyunt/dev-W7.1 (the live branch) — if it doesn't, the docs would be reviewed
//      against the wrong code, so it says so loudly instead of failing silently.
//   2. Runs the real Jest suite and rebuilds the UAT-mapped rollup
//      (Documentations/AutoTest Results/automated-test-run.json + -log.txt).
//   3. Runs `npm audit` and stores the raw result
//      (Documentations/AutoTest Results/npm-audit-run.json + .txt).
//   4. Diffs against the last recorded review (.weekly-review-state.json) to list what
//      commits landed since then, and heuristically flags which narrative .docx files
//      likely need a manual/AI-assisted update as a result.
//   5. Writes a dated report (Documentations/AutoTest Results/weekly-review-<date>.md)
//      and updates the state file.
//
// What this script deliberately does NOT do: it does not edit the narrative .docx
// documents itself. Editing prose that requires judgment (security findings, TSK
// triage, UAT case text) is a human/AI-assisted step guided by the report this script
// produces — see the "How to act on a report" section in WEEKLY_DOC_REVIEW.md.

import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTOTEST_DIR = path.join(ROOT, "Documentations", "AutoTest Results");
const STATE_PATH = path.join(AUTOTEST_DIR, ".weekly-review-state.json");
const LIVE_BRANCH = process.env.LIVE_BRANCH || "nyunt/dev-W7.1";
const PAGES_TRIGGER_BRANCH = process.env.TRIGGER_BRANCH || "nyunt/dev-deploy";

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}

function tryRun(cmd, opts = {}) {
  try {
    return run(cmd, opts);
  } catch (err) {
    return err.stdout ? String(err.stdout) : "";
  }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// -- Step 1: verify this branch still matches what's actually live -----------------

function checkLiveBranchAlignment() {
  console.log(`\n== Checking alignment with ${LIVE_BRANCH} (the live branch) ==`);
  let fetchOk = true;
  try {
    run(`git fetch origin ${LIVE_BRANCH} ${PAGES_TRIGGER_BRANCH}`, { stdio: "pipe" });
  } catch {
    fetchOk = false;
    console.log(`  (could not fetch origin/${LIVE_BRANCH} — running offline / no remote access; skipping alignment check)`);
  }

  if (!fetchOk) return { checked: false, aligned: null, liveSha: null };

  const lastPagesCommitMsg = tryRun(`git log -1 --format=%s origin/${LIVE_BRANCH}`).trim();
  const match = lastPagesCommitMsg.match(/Deploy ([0-9a-f]{40})/);
  if (!match) {
    console.log(`  Could not parse a deployed SHA out of origin/${LIVE_BRANCH}'s last commit message`);
    console.log(`  ("${lastPagesCommitMsg}") — skipping alignment check.`);
    return { checked: false, aligned: null, liveSha: null };
  }
  const liveSha = match[1];
  let aligned = false;
  try {
    run(`git merge-base --is-ancestor ${liveSha} HEAD`);
    aligned = true;
  } catch {
    aligned = false;
  }

  if (aligned) {
    console.log(`  OK: the deployed commit (${liveSha.slice(0, 7)}) is an ancestor of this branch's HEAD.`);
    console.log(`  This branch is still authoritative for what's live on ${LIVE_BRANCH}.`);
  } else {
    console.log(`  ⚠️  WARNING: the deployed commit (${liveSha.slice(0, 7)}) is NOT an ancestor of this`);
    console.log(`  branch's HEAD. ${LIVE_BRANCH} is currently being fed by a different line of`);
    console.log(`  development than this branch. Everything below reflects THIS branch's code,`);
    console.log(`  which is not (or no longer) what's live -- this is exactly the situation that`);
    console.log(`  required the 2026-07-31 documentation re-audit (see git log). Before trusting`);
    console.log(`  this run, find which branch actually contains ${liveSha.slice(0, 7)} and either`);
    console.log(`  review from there, or treat this as a signal to re-target the docs again.`);
  }
  return { checked: true, aligned, liveSha };
}

// -- Step 2: run Jest and rebuild the UAT-mapped rollup -----------------------------

// Suite -> UAT workflow mapping. Extend this when a new __tests__/*.test.mjs file is
// added; the script has no way to infer which UAT case a suite belongs to on its own.
const SUITE_META = {
  "mergeInstructions.test.mjs": { uat: ["UAT-06"], crossCutting: false, note: "Imports real src/js/2D/mergeInstructions.js." },
  "crypt.test.mjs": { uat: [], crossCutting: true, note: "Imports real src/js/shared/crypt.js. Case-ID URL obfuscation used across case list, chat, viewer, version history, annotation and create-case links -- cross-cutting, not tied to one workflow." },
  "caseEnrichment.test.mjs": { uat: ["UAT-02"], crossCutting: false, note: "Imports real src/js/shared/caseEnrichment.js. Case-detail and co-owner request/fold layer behind the case list." },
  "importResolution.test.mjs": { uat: [], crossCutting: true, note: "Walks src/, __tests__/ and the HTML pages checking every relative import/script-src resolves. Repo-wide build-integrity check, not tied to one workflow." },
  "passwordReset.test.mjs": { uat: ["UAT-01"], crossCutting: false, note: "Imports real src/js/shared/passwordReset.js. Change-password/reset-password feature -- an extension of the Login & Authentication workflow." },
  "reciprocatingExclusivity.test.mjs": { uat: ["UAT-06"], crossCutting: false, note: "Imports real src/js/2D/criteria.js, components.js and annotationTeethModel.js." },
  "helpBot.test.mjs": { uat: [], crossCutting: false, note: "Imports real src/js/shared/helpMatcher.js and helpTopics.js (AI-powered help assistant). No standing UAT-xx case yet -- see Traceability_Document.docx." },
  "artificialTeethDecode.test.mjs": { uat: ["UAT-07", "UAT-08"], crossCutting: false, note: "Imports real src/viewer3d/artificialTeeth.js MessagePack/coordinate decode layer used by both the embedded 3D preview and the standalone 3D viewer." },
  "dashboard.test.mjs": { uat: ["UAT-04"], crossCutting: false, note: "Imports real dashboard.js pipeline functions." },
  "clinicalInfoCodec.test.mjs": { uat: ["UAT-06"], crossCutting: false, note: "Imports real src/js/2D/clinicalInfo.js (.NET-compatible clinical-info envelope codec)." },
  "jawStructRoundTrip.test.mjs": { uat: ["UAT-06"], crossCutting: false, note: "Imports real src/js/2D/jawStructApply.js against fixture desktop files." },
  "jawStructLingualPlate.test.mjs": { uat: ["UAT-06"], crossCutting: false, note: "Imports real src/js/2D/jawStructApply.js against fixture desktop files." },
  "jawStructMajorSwitch.test.mjs": { uat: ["UAT-06"], crossCutting: false, note: "Imports real src/js/2D/jawStructApply.js." },
};

const UAT_WORKFLOWS = [
  ["UAT-01", "Login & Authentication"],
  ["UAT-02", "Case List"],
  ["UAT-03", "Case Creation"],
  ["UAT-04", "Dashboard"],
  ["UAT-05", "Collaboration (Chat/Notifications)"],
  ["UAT-06", "2D Annotation"],
  ["UAT-07", "Embedded 3D Preview"],
  ["UAT-08", "3D Viewer"],
  ["UAT-09", "Add STL Files"],
  ["UAT-10", "Version History"],
  ["UAT-11", "Download / Export / Share"],
  ["UAT-12", "Responsive (Tablet + Mobile)"],
];

function runTestsWithLog() {
  console.log("\n== Running Jest (this branch's actual test:ci command) ==");
  // Jest's human-readable --verbose reporter goes to stderr; --json goes to stdout.
  // spawnSync (rather than execSync) lets us capture both streams from one invocation
  // regardless of whether Jest exits non-zero (a failing suite must still be reported).
  const args = [
    "jest", "--ci", "--coverage", "--coverageReporters=json-summary",
    "--verbose", "--testLocationInResults", "--json",
  ];
  // shell: true is required on Windows -- spawnSync can't exec npx.cmd directly
  // (EINVAL), and it's harmless on POSIX where npx is a plain executable.
  const result = spawnSync("npx", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    console.error("Could not parse Jest JSON output -- aborting.");
    console.error(stdout.slice(0, 2000));
    console.error(stderr.slice(0, 2000));
    process.exit(1);
  }
  return { parsed, log: stderr };
}

function buildRollup(parsed) {
  const suites = parsed.testResults.map((tr) => {
    const file = path.basename(tr.name);
    const meta = SUITE_META[file] || { uat: [], crossCutting: false, note: "(no metadata registered for this suite in tools/weekly-doc-review.mjs -- add an entry to SUITE_META)" };
    const tests = tr.assertionResults.length;
    const pass = tr.assertionResults.filter((a) => a.status === "passed").length;
    const fail = tr.assertionResults.filter((a) => a.status === "failed").length;
    const skip = tests - pass - fail;
    return {
      file,
      status: tr.status,
      tests,
      pass,
      fail,
      skip,
      durationMs: (tr.endTime || 0) - (tr.startTime || 0),
      uat: meta.uat,
      category: "real",
      crossCutting: meta.crossCutting,
      note: meta.note,
      failureMessages: tr.assertionResults.filter((a) => a.status === "failed").flatMap((a) => a.failureMessages || []),
    };
  });

  const uatRollup = UAT_WORKFLOWS.map(([id, name]) => {
    const matching = suites.filter((s) => s.uat.includes(id));
    const tests = matching.reduce((n, s) => n + s.tests, 0);
    const pass = matching.reduce((n, s) => n + s.pass, 0);
    const fail = matching.reduce((n, s) => n + s.fail, 0);
    return {
      id,
      name,
      suites: matching.map((s) => s.file),
      tests,
      pass,
      fail,
      automationConfidence: matching.length ? "Real source coverage" : "No automated coverage",
    };
  });

  const uatWorkflowsWithNoAutomatedCoverage = uatRollup
    .filter((u) => u.suites.length === 0)
    .map((u) => `${u.id} ${u.name}`);

  const suitesForFeaturesWithNoStandingUatCase = suites
    .filter((s) => s.uat.length === 0 && !s.crossCutting)
    .map((s) => ({ file: s.file, note: s.note }));

  let coverageTotal = null;
  const covPath = path.join(ROOT, "coverage", "coverage-summary.json");
  if (existsSync(covPath)) {
    const cov = JSON.parse(readFileSync(covPath, "utf8"));
    coverageTotal = cov.total;
  }

  return {
    runAt: new Date().toISOString(),
    command: "npx jest --ci --coverage --coverageReporters=json-summary --verbose --testLocationInResults --json",
    commandFailed: parsed.success === false,
    numTotalTestSuites: parsed.numTotalTestSuites,
    numPassedTestSuites: parsed.numPassedTestSuites,
    numFailedTestSuites: parsed.numFailedTestSuites,
    numTotalTests: parsed.numTotalTests,
    numPassedTests: parsed.numPassedTests,
    numFailedTests: parsed.numFailedTests,
    suites,
    uatRollup,
    uatWorkflowsWithNoAutomatedCoverage,
    suitesForFeaturesWithNoStandingUatCase,
    coverageTotal,
  };
}

// -- Step 3: npm audit ---------------------------------------------------------------

function runAudit() {
  console.log("\n== Running npm audit ==");
  const json = tryRun("npm audit --json");
  const text = tryRun("npm audit");
  let parsed = {};
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = { metadata: { vulnerabilities: {} } };
  }
  return { json, text, totals: parsed.metadata ? parsed.metadata.vulnerabilities : {} };
}

// -- Step 4/5: diff against last review, write report, update state -----------------

function loadState() {
  if (!existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return null;
  }
}

const DOC_FLAG_RULES = [
  {
    test: (f) => /^(src\/js\/shared\/config|src\/viewer3d\/ApiClient|src\/js\/pages\/login|src\/js\/shared\/passwordReset|src\/js\/admin\/|webpack\.config|nginx\.conf|package-lock\.json|src\/pages\/case_list\.html|src\/js\/shared\/crypt)\.?/.test(f) || f === "package-lock.json",
    docs: ["Cybersecurity_Protocol_Document.docx"],
    why: "touches an authentication, credential, dependency, or CDN-script surface this document audits",
  },
  {
    test: (f) => f.startsWith("__tests__/") || f === "package.json",
    docs: ["Automated_Test_Suite_Report.docx", "UAT_Report.docx (§2)", "SmartRPD_Documentation.docx (§4, §11)"],
    why: "changes the test suite this document reports counts/breakdown for",
  },
  {
    test: (f) => f === ".github/workflows/deploy.yml",
    docs: ["DevOps and Deployment.docx", "UAT_Protocol_SOP.docx", "Maintenance and Operational Runbook.docx"],
    why: "changes the deploy pipeline these documents describe step-by-step",
  },
  {
    test: (f) => f.startsWith("src/") || f.startsWith("css/"),
    docs: ["Feedback_Triage_Report.docx (new TSK candidate?)", "Traceability_Document.docx", "SmartRPD_Documentation.docx"],
    why: "is a feature-code change not already covered above -- check whether it needs a new TSK row",
  },
];

function flagDocsForCommit(changedFiles) {
  const flagged = new Map();
  for (const f of changedFiles) {
    for (const rule of DOC_FLAG_RULES) {
      if (rule.test(f)) {
        for (const doc of rule.docs) {
          if (!flagged.has(doc)) flagged.set(doc, new Set());
          flagged.get(doc).add(`${f} (${rule.why})`);
        }
      }
    }
  }
  return flagged;
}

function main() {
  mkdirSync(AUTOTEST_DIR, { recursive: true });
  const date = todayIso();
  const headSha = run("git rev-parse HEAD").trim();
  const branch = tryRun("git rev-parse --abbrev-ref HEAD").trim();

  const alignment = checkLiveBranchAlignment();

  const { parsed, log: jestLog } = runTestsWithLog();
  const rollup = buildRollup(parsed);

  writeFileSync(
    path.join(AUTOTEST_DIR, "automated-test-run.json"),
    JSON.stringify(rollup, null, 2),
  );
  writeFileSync(path.join(AUTOTEST_DIR, "automated-test-run-log.txt"), jestLog);

  const audit = runAudit();
  writeFileSync(path.join(AUTOTEST_DIR, "npm-audit-run.json"), audit.json);
  writeFileSync(path.join(AUTOTEST_DIR, "npm-audit-run.txt"), audit.text);

  const prevState = loadState();
  let commitsSection = "_No prior review state found -- this is the first run, so there's nothing to diff against._";
  let flaggedSection = "";
  if (prevState && prevState.headSha) {
    const range = `${prevState.headSha}..HEAD`;
    const commitLog = tryRun(`git log --oneline ${range}`).trim();
    const changedFiles = tryRun(`git diff --name-only ${range}`).trim().split("\n").filter(Boolean);
    commitsSection = commitLog
      ? "```\n" + commitLog + "\n```"
      : "_No new commits on this branch since the last review._";

    const flagged = flagDocsForCommit(changedFiles);
    if (flagged.size) {
      flaggedSection = "\n## Docs likely needing a manual/AI-assisted update\n\n" +
        [...flagged.entries()].map(([doc, reasons]) =>
          `- [ ] **${doc}**\n${[...reasons].map((r) => `  - ${r}`).join("\n")}`
        ).join("\n\n") + "\n";
    } else {
      flaggedSection = "\n## Docs likely needing a manual/AI-assisted update\n\nNone of the changed files matched a known flag rule.\n";
    }
  }

  const testDelta = prevState
    ? `${prevState.tests.suites} suites / ${prevState.tests.tests} tests -> ${rollup.numTotalTestSuites} suites / ${rollup.numTotalTests} tests`
    : `${rollup.numTotalTestSuites} suites / ${rollup.numTotalTests} tests (first recorded run)`;
  const auditDelta = prevState
    ? `${JSON.stringify(prevState.audit)} -> ${JSON.stringify(audit.totals)}`
    : `${JSON.stringify(audit.totals)} (first recorded run)`;

  const alignmentNote = !alignment.checked
    ? "_Alignment with the live branch could not be checked (no remote access)._"
    : alignment.aligned
    ? `✅ This branch's HEAD contains the commit deployed to \`${LIVE_BRANCH}\` (\`${alignment.liveSha.slice(0, 7)}\`). Safe to treat this run as reviewing the live branch.`
    : `⚠️ **This branch has diverged from \`${LIVE_BRANCH}\`.** The deployed commit \`${alignment.liveSha.slice(0, 7)}\` is not an ancestor of HEAD. Everything below reflects this branch's code, which is not what's currently live -- find and review from whichever branch actually contains that commit before trusting this report, or treat this as the signal to re-run the branch-retargeting pass done on 2026-07-31.`;

  const report = `# Weekly Documentation Review -- ${date}

Branch: \`${branch}\` @ \`${headSha.slice(0, 7)}\`

## Live-branch alignment

${alignmentNote}

## Test suite

${testDelta}

## Dependency audit (npm audit)

${auditDelta}

## Commits since the last review

${commitsSection}
${flaggedSection}
## Raw data this run produced

- \`Documentations/AutoTest Results/automated-test-run.json\`
- \`Documentations/AutoTest Results/automated-test-run-log.txt\`
- \`Documentations/AutoTest Results/npm-audit-run.json\`
- \`Documentations/AutoTest Results/npm-audit-run.txt\`

See [Documentations/WEEKLY_DOC_REVIEW.md](../WEEKLY_DOC_REVIEW.md) for what to do with this report.
`;

  writeFileSync(path.join(AUTOTEST_DIR, `weekly-review-${date}.md`), report);

  writeFileSync(
    STATE_PATH,
    JSON.stringify(
      {
        headSha,
        branch,
        date,
        tests: { suites: rollup.numTotalTestSuites, tests: rollup.numTotalTests },
        audit: audit.totals,
        liveSha: alignment.liveSha,
        aligned: alignment.aligned,
      },
      null,
      2,
    ),
  );

  console.log(`\n== Done ==`);
  console.log(`Report: Documentations/AutoTest Results/weekly-review-${date}.md`);
  console.log(`Tests: ${testDelta}`);
  console.log(`Audit: ${JSON.stringify(audit.totals)}`);
}

main();
