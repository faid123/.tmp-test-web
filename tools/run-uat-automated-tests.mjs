#!/usr/bin/env node
// tools/run-uat-automated-tests.mjs
//
// Runs the full Jest suite (the same test:ci gate CI runs before deploy) and
// rolls the per-suite results up against the 12 standing UAT workflow cases
// (UAT-01 - UAT-12, defined in SmartRPD_Documentation.docx §12.2 and restated
// in Documentations/UAT_Protocol_SOP.docx §6).
//
// Output, written to Documentations/AutoTest Results/:
//   automated-test-run.json   - machine-readable run + UAT rollup
//   automated-test-run-log.txt - full Jest console output (verbose + coverage)
//
// Usage: node tools/run-uat-automated-tests.mjs

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'Documentations', 'AutoTest Results');
const jsonTmp = path.join(repoRoot, '.jest-run-result.tmp.json');

// Jest/Node/Istanbul all report absolute filesystem paths (stack traces,
// coverage-map keys). Those are specific to wherever THIS clone lives on
// disk, so anyone else who forks/clones the repo elsewhere would get a
// different, machine-specific set of paths baked into the committed report.
// Strip the repo-root prefix everywhere before writing output so the files
// are identical in shape regardless of who ran them or where the clone sits.
const repoRootVariants = [repoRoot, repoRoot.replace(/\\/g, '/')];
function toRepoRelative(absPath) {
  const rel = path.relative(repoRoot, absPath);
  return rel.split(path.sep).join('/');
}
function stripRepoRoot(text) {
  let out = text;
  for (const variant of repoRootVariants) {
    // Escape regex metachars, then also swallow one following slash/backslash
    // so "<root>/src/foo.js" becomes "src/foo.js" rather than "/src/foo.js".
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped + '[\\\\/]?', 'g'), '');
  }
  return out;
}

// ---------------------------------------------------------------------------
// UAT-01 .. UAT-12 workflow names, per UAT_Protocol_SOP.docx §6 / UAT_Report.docx §3
// ---------------------------------------------------------------------------
const UAT_WORKFLOWS = {
  'UAT-01': 'Login & Authentication',
  'UAT-02': 'Case List',
  'UAT-03': 'Case Creation',
  'UAT-04': 'Dashboard',
  'UAT-05': 'Collaboration (Chat/Notifications)',
  'UAT-06': '2D Annotation',
  'UAT-07': 'Embedded 3D Preview',
  'UAT-08': '3D Viewer (standalone)',
  'UAT-09': 'Add STL Files',
  'UAT-10': 'Version History',
  'UAT-11': 'Download / Export / Share',
  'UAT-12': 'Responsive (Tablet + Mobile)',
};

// ---------------------------------------------------------------------------
// Suite -> UAT mapping. Derived by reading each suite's imports/description
// against the module it exercises (2026-07-23). "category" records whether the
// suite imports the real src/ module under test, reimplements a local copy of
// the logic, or is a hardcoded placeholder assertion -- this materially
// affects how much regression protection a PASS actually represents, and is
// carried into the report so a passing suite count is never read as a blanket
// coverage guarantee. Update this table whenever suites are added/removed/renamed.
// ---------------------------------------------------------------------------
const SUITE_MAP = {
  'crypt.test.mjs': { uat: [], note: 'Imports real src/crypt.js. Case-ID URL obfuscation used across case list, chat, viewer, version history, annotation and create-case links -- cross-cutting, not tied to one workflow.', crossCutting: true, category: 'real' },
  'importResolution.test.mjs': { uat: [], note: 'Walks src/, __tests__/ and the HTML pages checking every relative import/script-src resolves. Repo-wide build-integrity check, not tied to one workflow. Pulled from nyunt/dev-deploy 2026-07-24 as part of reconciling this branch’s test tree to the dev-deploy baseline (see Automated_UAT_Test_Run_Report.docx §3).', crossCutting: true, category: 'real' },
  'dashboard.test.mjs': { uat: ['UAT-04'], category: 'real', note: 'Imports real dashboard.js pipeline functions.' },
  'clinicalInfoCodec.test.mjs': { uat: ['UAT-06'], category: 'copy', note: 'Reimplements the .NET envelope codec as a faithful local copy rather than importing src/js/2D/clinicalInfo.js.' },
  'mergeInstructions.test.mjs': { uat: ['UAT-06'], category: 'copy', note: 'Reimplements mergeInstructions() as a faithful local copy rather than importing src/js/2D/noticeboard.js.' },
  'reciprocatingExclusivity.test.mjs': { uat: ['UAT-06'], category: 'real', note: 'Imports real src/js/2D/criteria.js, components.js and annotationTeethModel.js.' },
  'jawStructLingualPlate.test.mjs': { uat: ['UAT-06'], category: 'real', note: 'Imports real src/js/2D/jawStructApply.js against fixture desktop files.' },
  'jawStructMajorSwitch.test.mjs': { uat: ['UAT-06'], category: 'real', note: 'Imports real src/js/2D/jawStructApply.js.' },
  'jawStructRoundTrip.test.mjs': { uat: ['UAT-06'], category: 'real', note: 'Imports real src/js/2D/jawStructApply.js against fixture desktop files.' },
};

// dev-deploy also has caseEnrichment.test.mjs and artificialTeethDecode.test.mjs, which
// would bring this branch to the full 11-suite/105-test dev-deploy baseline. They were
// deliberately NOT pulled in: both import source modules that only exist under dev-deploy's
// restructured tree (src/js/shared/caseEnrichment.js, src/viewer3d/artificialTeeth.js) --
// dev-deploy moved/reorganized most of src/ (src/*.js -> src/viewer3d/*.js, src/js/*.js ->
// src/js/pages/ + src/js/shared/, plus new modules) and this integration branch never
// received that restructuring. Pulling just the two test files fails at import time; pulling
// the restructuring too is a much larger, separate merge decision -- see
// Automated_UAT_Test_Run_Report.docx §3 for the full writeup before attempting it.

const CATEGORY_LABEL = {
  real: 'Real (imports the actual src/ module under test)',
  copy: 'Copy (reimplements the logic locally; does not import src/)',
  stub: 'Stub (hardcoded placeholder assertion; no source under test)',
};

// UATs with no suite mapped to them at all -- computed below, not hand-maintained.

// ---------------------------------------------------------------------------
// 1. Run the suite (same command as npm run test:ci / the deploy workflow gate)
// ---------------------------------------------------------------------------
mkdirSync(outDir, { recursive: true });
if (existsSync(jsonTmp)) unlinkSync(jsonTmp);

let commandFailed = false;
let consoleLog = '';
try {
  // Jest's verbose test-result reporter and coverage table both write to
  // stderr, not stdout -- redirect stderr into stdout so execSync's return
  // value (stdout only) actually captures them.
  // json-summary gives coverage/coverage-summary.json, read below and folded
  // into the structured output -- more reliable than parsing the printed
  // text coverage table (which --json suppresses from the console anyway).
  consoleLog = execSync(
    `npx jest --ci --coverage --coverageReporters=json-summary --verbose --testLocationInResults --json --outputFile="${jsonTmp}" 2>&1`,
    { cwd: repoRoot, encoding: 'utf8' }
  );
} catch (err) {
  // Jest exits non-zero on any test failure; still capture the output.
  commandFailed = true;
  consoleLog = (err.stdout || '') + (err.stderr || '');
}

if (!existsSync(jsonTmp)) {
  console.error('Jest did not produce a JSON result file. Aborting.');
  console.error(consoleLog);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(jsonTmp, 'utf8'));
unlinkSync(jsonTmp);

// ---------------------------------------------------------------------------
// 2. Roll suite results up per-suite and per-UAT
// ---------------------------------------------------------------------------
const suites = raw.testResults.map((tr) => {
  const file = tr.name.split(/[\\/]/).pop();
  const pass = tr.assertionResults.filter((a) => a.status === 'passed').length;
  const fail = tr.assertionResults.filter((a) => a.status === 'failed').length;
  const skip = tr.assertionResults.filter((a) => a.status === 'pending' || a.status === 'skipped').length;
  const mapping = SUITE_MAP[file] || { uat: [], category: 'unmapped', note: 'Not yet classified in tools/run-uat-automated-tests.mjs SUITE_MAP -- update the map.' };
  return {
    file,
    status: tr.status,
    tests: tr.assertionResults.length,
    pass,
    fail,
    skip,
    durationMs: tr.endTime - tr.startTime,
    uat: mapping.uat,
    category: mapping.category,
    crossCutting: !!mapping.crossCutting,
    note: mapping.note,
    failureMessages: tr.assertionResults.filter((a) => a.status === 'failed').map((a) => ({ title: a.fullName, message: stripRepoRoot((a.failureMessages || []).join('\n')) })),
  };
});

const uatRollup = Object.entries(UAT_WORKFLOWS).map(([id, name]) => {
  const linked = suites.filter((s) => s.uat.includes(id));
  const tests = linked.reduce((n, s) => n + s.tests, 0);
  const pass = linked.reduce((n, s) => n + s.pass, 0);
  const fail = linked.reduce((n, s) => n + s.fail, 0);
  const categories = [...new Set(linked.map((s) => s.category))];
  let automationConfidence;
  if (linked.length === 0) automationConfidence = 'No automated coverage';
  else if (categories.every((c) => c === 'real')) automationConfidence = 'Real source coverage';
  else if (categories.includes('real')) automationConfidence = 'Mixed (real + copy/stub)';
  else if (categories.every((c) => c === 'stub')) automationConfidence = 'Placeholder only (no real assertion)';
  else automationConfidence = 'Copy/reimplementation only (drift risk)';
  return {
    id,
    name,
    suites: linked.map((s) => s.file),
    tests,
    pass,
    fail,
    automationConfidence,
  };
});

const crossCutting = suites.filter((s) => s.crossCutting).map((s) => ({ file: s.file, note: s.note }));
const unmappedUats = uatRollup.filter((u) => u.suites.length === 0).map((u) => `${u.id} ${u.name}`);
const categoryCounts = suites.reduce((acc, s) => {
  acc[s.category] = (acc[s.category] || 0) + s.tests;
  return acc;
}, {});

const summary = {
  runAt: new Date().toISOString(),
  command: 'npx jest --ci --coverage --coverageReporters=json-summary --verbose --testLocationInResults --json',
  commandFailed,
  numTotalTestSuites: raw.numTotalTestSuites,
  numPassedTestSuites: raw.numPassedTestSuites,
  numFailedTestSuites: raw.numFailedTestSuites,
  numTotalTests: raw.numTotalTests,
  numPassedTests: raw.numPassedTests,
  numFailedTests: raw.numFailedTests,
  testsByCategory: categoryCounts,
  categoryLegend: CATEGORY_LABEL,
  suites,
  uatRollup,
  crossCuttingSuites: crossCutting,
  uatWorkflowsWithNoAutomatedCoverage: unmappedUats,
};

// ---------------------------------------------------------------------------
// 3. Write outputs
// ---------------------------------------------------------------------------
const coverageSummaryPath = path.join(repoRoot, 'coverage', 'coverage-summary.json');
if (existsSync(coverageSummaryPath)) {
  const covRaw = JSON.parse(readFileSync(coverageSummaryPath, 'utf8'));
  summary.coverageTotal = covRaw.total;
  // Istanbul keys coverageByFile on absolute paths -- rewrite to repo-relative
  // (forward-slash, portable) so the committed JSON doesn't hardcode this
  // clone's absolute location.
  summary.coverageByFile = Object.fromEntries(
    Object.entries(covRaw)
      .filter(([k]) => k !== 'total')
      .map(([k, v]) => [toRepoRelative(k), v])
  );
}

const jsonOut = path.join(outDir, 'automated-test-run.json');
const logOut = path.join(outDir, 'automated-test-run-log.txt');
writeFileSync(jsonOut, JSON.stringify(summary, null, 2), 'utf8');
writeFileSync(logOut, stripRepoRoot(consoleLog), 'utf8');

console.log(`\nWrote ${jsonOut}`);
console.log(`Wrote ${logOut}`);
console.log(`\nResult: ${summary.numPassedTestSuites}/${summary.numTotalTestSuites} suites, ${summary.numPassedTests}/${summary.numTotalTests} tests passed.`);
if (unmappedUats.length) {
  console.log(`UAT workflows with no automated coverage: ${unmappedUats.join(', ')}`);
}
process.exitCode = commandFailed ? 1 : 0;
