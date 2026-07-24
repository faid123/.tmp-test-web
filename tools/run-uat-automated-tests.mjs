#!/usr/bin/env node
// tools/run-uat-automated-tests.mjs
//
// Runs the full Jest suite (the same test:ci gate CI runs before deploy) and
// rolls the per-suite results up against the 12 standing UAT workflow cases
// (UAT-01 - UAT-12, defined in SmartRPD_Documentation.docx §12.2 / restated in
// the docx UAT set on other branches; see Documentations/AutoTest Results/
// Automated_UAT_Test_Run_Report.docx §1 on this branch for the current
// equivalent reference).
//
// Output, written to Documentations/AutoTest Results/:
//   automated-test-run.json    - machine-readable run + UAT rollup
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
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped + '[\\\\/]?', 'g'), '');
  }
  return out;
}

// ---------------------------------------------------------------------------
// UAT-01 .. UAT-12 workflow names, per the standing UAT case set.
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
// Suite -> UAT mapping. Derived by reading each suite's actual imports
// (2026-07-24, dev-deploy-shafik-2 branch, post src/ restructuring). "category"
// records whether the suite imports the real src/ module under test,
// reimplements a local copy of the logic, or is a hardcoded placeholder
// assertion -- this materially affects how much regression protection a PASS
// actually represents, and is carried into the report so a passing suite
// count is never read as a blanket coverage guarantee. All 13 suites here
// import real src/ modules directly (a real improvement over the older,
// pre-restructuring branch, where several suites were hand-copied
// reimplementations). Update this table whenever suites are added/removed/renamed.
// ---------------------------------------------------------------------------
const SUITE_MAP = {
  'crypt.test.mjs': { uat: [], category: 'real', crossCutting: true, note: 'Imports real src/js/shared/crypt.js. Case-ID URL obfuscation used across case list, chat, viewer, version history, annotation and create-case links -- cross-cutting, not tied to one workflow.' },
  'importResolution.test.mjs': { uat: [], category: 'real', crossCutting: true, note: 'Walks src/, __tests__/ and the HTML pages checking every relative import/script-src resolves. Repo-wide build-integrity check, not tied to one workflow.' },
  'dashboard.test.mjs': { uat: ['UAT-04'], category: 'real', note: 'Imports real dashboard.js pipeline functions.' },
  'caseEnrichment.test.mjs': { uat: ['UAT-02'], category: 'real', note: 'Imports real src/js/shared/caseEnrichment.js. Case-detail and co-owner request/fold layer behind the case list.' },
  'clinicalInfoCodec.test.mjs': { uat: ['UAT-06'], category: 'real', note: 'Imports real src/js/2D/clinicalInfo.js (.NET-compatible clinical-info envelope codec).' },
  'mergeInstructions.test.mjs': { uat: ['UAT-06'], category: 'real', note: 'Imports real src/js/2D/mergeInstructions.js.' },
  'reciprocatingExclusivity.test.mjs': { uat: ['UAT-06'], category: 'real', note: 'Imports real src/js/2D/criteria.js, components.js and annotationTeethModel.js.' },
  'jawStructLingualPlate.test.mjs': { uat: ['UAT-06'], category: 'real', note: 'Imports real src/js/2D/jawStructApply.js against fixture desktop files.' },
  'jawStructMajorSwitch.test.mjs': { uat: ['UAT-06'], category: 'real', note: 'Imports real src/js/2D/jawStructApply.js.' },
  'jawStructRoundTrip.test.mjs': { uat: ['UAT-06'], category: 'real', note: 'Imports real src/js/2D/jawStructApply.js against fixture desktop files.' },
  'artificialTeethDecode.test.mjs': { uat: ['UAT-07', 'UAT-08'], category: 'real', note: 'Imports real src/viewer3d/artificialTeeth.js MessagePack/coordinate decode layer used by both the embedded 3D preview and the standalone 3D viewer.' },
  'passwordReset.test.mjs': { uat: ['UAT-01'], category: 'real', note: 'Imports real src/js/shared/passwordReset.js. New change-password/reset-password feature -- an extension of the Login & Authentication workflow.' },
  'helpBot.test.mjs': { uat: [], category: 'real', note: 'Imports real src/js/shared/helpMatcher.js and helpTopics.js (AI-powered help assistant). New feature with no standing UAT-xx case yet -- needs one added to the 12-case set rather than being force-mapped to an existing workflow.' },
};

const CATEGORY_LABEL = {
  real: 'Real (imports the actual src/ module under test)',
  copy: 'Copy (reimplements the logic locally; does not import src/)',
  stub: 'Stub (hardcoded placeholder assertion; no source under test)',
};

// ---------------------------------------------------------------------------
// 1. Run the suite (same command as npm run test:ci / the deploy workflow gate)
// ---------------------------------------------------------------------------
mkdirSync(outDir, { recursive: true });
if (existsSync(jsonTmp)) unlinkSync(jsonTmp);

let commandFailed = false;
let consoleLog = '';
try {
  // json-summary gives coverage/coverage-summary.json, read below and folded
  // into the structured output -- more reliable than parsing the printed
  // text coverage table (which --json suppresses from the console anyway).
  // Jest's verbose reporter + coverage table write to stderr, not stdout --
  // redirect stderr into stdout so execSync's return value captures them.
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
const unmatchedUats = uatRollup.filter((u) => u.suites.length === 0).map((u) => `${u.id} ${u.name}`);
const unmappedSuites = suites.filter((s) => !s.crossCutting && s.uat.length === 0).map((s) => ({ file: s.file, note: s.note }));
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
  uatWorkflowsWithNoAutomatedCoverage: unmatchedUats,
  suitesForFeaturesWithNoStandingUatCase: unmappedSuites,
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
if (unmatchedUats.length) {
  console.log(`UAT workflows with no automated coverage: ${unmatchedUats.join(', ')}`);
}
if (unmappedSuites.length) {
  console.log(`Suites for features with no standing UAT case: ${unmappedSuites.map((s) => s.file).join(', ')}`);
}
process.exitCode = commandFailed ? 1 : 0;
