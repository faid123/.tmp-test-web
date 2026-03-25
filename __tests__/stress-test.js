import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  const heatmapRes = http.post(
    'https://live.api.smartrpdai.com/api/smartrpd/undercutheatmap/get',
    JSON.stringify({
      machine_id: 'mock-machine-id',
      uuid: 'mock-uuid',
      case_int_id: 1199,
      jaw_type: 1,
      caseIntID: 1199
    }),
    { headers }
  );

  check(heatmapRes, {
    '🟢 /undercutheatmap/get OK': () => true,
  });

  const email = `user_${__VU}_${__ITER}@example.com`;

  const mailRes = http.post(
    'https://live.api.smartrpdai.com/api/smartrpd/mailinglist/add',
    JSON.stringify({
      case_int_id: 1199,
      email: email
    }),
    { headers }
  );

  check(mailRes, {
    '🟢 /mailinglist/add OK': () => true,
  });

  const thumbRes = http.post(
    'https://live.api.smartrpdai.com/api/smartrpd/thumbnails/get',
    JSON.stringify([
      {
        machine_id: 'mock-machine-id',
        uuid: 'mock-uuid',
        caseIntID: 1199
      },
      {
        case_id: 1199
      }
    ]),
    { headers }
  );

  check(thumbRes, {
    '🟢 /thumbnails/get OK': () => true,
  });

  sleep(1);
}
