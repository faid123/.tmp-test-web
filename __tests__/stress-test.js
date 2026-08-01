// k6 load probe for the endpoints the case pages hit hardest.
//
// NOT a jest test — jest's testMatch is `**/__tests__/**/*.test.mjs`, so this file is
// never collected. Run it deliberately:  k6 run __tests__/stress-test.js
//
// Every check asserts the response. They used to be `() => true`, which cannot fail: a
// run in which all 900 requests 500'd still reported 100% checks passed, which is the
// one thing a load probe must never do.
//
// The request bodies mirror what the app actually sends (preview3D.js for the heatmap,
// caseManagement.js for the thumbnails) — a probe that sends a shape the app doesn't is
// measuring an error path.
//
// NB /mailinglist/add is a WRITE against the live backend: a full run adds ~300 fake
// addresses to case 1199's mailing list, and the endpoint is write-only (no read, no
// delete — see the note in src/js/2D/caseNote.js). Point CASE_INT_ID at a scratch case,
// or comment that block out, before running this against production.

import http from 'k6/http';
import { check, sleep } from 'k6';

const API = 'https://live.api.smartrpdai.com/api/smartrpd';
const HEADERS = { 'Content-Type': 'application/json' };
const MACHINE_ID = 'mock-machine-id';
const UUID = 'mock-uuid';
const CASE_INT_ID = 1199;
const JAW_TYPE_UPPER = 1;

export let options = {
  vus: 10,
  duration: '30s',
  // A load run's real pass/fail: a failed request, a p95 blowout, or any check going
  // red ends the run non-zero instead of printing a green wall of numbers.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    checks: ['rate>0.99'],
  },
};

/** k6 throws on a non-JSON body, so parsing is the body-shape assertion. */
function jsonOf(res) {
  try {
    return res.json();
  } catch {
    return null;
  }
}

/** Answered 200 with a JSON body — the floor every endpoint here has to clear. */
function checkedJson(res, label, extra = {}) {
  check(res, {
    [`${label}: 200`]: (r) => r.status === 200,
    [`${label}: JSON body`]: (r) => jsonOf(r) !== null,
    ...extra,
  });
  return jsonOf(res);
}

export default function () {
  // Undercut heatmap: the 2D preview's per-jaw request (preview3D.js baseBody).
  const heatmapRes = http.post(
    `${API}/undercutheatmap/get`,
    JSON.stringify({
      machine_id: MACHINE_ID,
      uuid: UUID,
      case_int_id: CASE_INT_ID,
      caseIntID: CASE_INT_ID,
      jaw_type: JAW_TYPE_UPPER,
    }),
    { headers: HEADERS }
  );
  checkedJson(heatmapRes, 'POST /undercutheatmap/get', {
    // An empty body parses fine but carries no heatmap — the failure mode that looked
    // identical to success under the old check.
    'POST /undercutheatmap/get: non-empty payload': (r) => r.body != null && r.body.length > 2,
  });

  // Mailing list: a write. See the header note before pointing this at production.
  const email = `user_${__VU}_${__ITER}@example.com`;
  const mailRes = http.post(
    `${API}/mailinglist/add`,
    JSON.stringify({ case_int_id: CASE_INT_ID, email }),
    { headers: HEADERS }
  );
  checkedJson(mailRes, 'POST /mailinglist/add');

  // Thumbnails: the two-element envelope caseManagement.js sends. The payload key is
  // `case_int_id` — `case_id` is parsed as a different id server-side and 404s.
  const thumbRes = http.post(
    `${API}/thumbnails/get`,
    JSON.stringify([
      { machine_id: MACHINE_ID, uuid: UUID, caseIntID: CASE_INT_ID },
      { case_int_id: CASE_INT_ID },
    ]),
    { headers: HEADERS }
  );
  checkedJson(thumbRes, 'POST /thumbnails/get', {
    'POST /thumbnails/get: array of rows': (r) => Array.isArray(jsonOf(r)),
  });

  sleep(1);
}
