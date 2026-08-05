import { logApi } from "../js/shared/apiLog.js";
import { LOGIN_CREDENTIALS, MACHINE_ID, VIEWER_UUID } from "../js/shared/config.js";
import { API_BASE } from "../js/shared/api.js";
export class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async ensureSession() {
    await getSessionLogin();
  }

  async post(endpoint, data, test,what) {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(what)
    let that = '';
    if(what == undefined)
    {
      that = '';
    }
    const downloadLabel = what === undefined ? '' : `Downloading: ${what} | `;
    await getSessionLogin();

    const send = () => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    let response = await send();

    // The backend session lives server-side, keyed by machine_id + uuid (no
    // cookie is set), and this client logs in once per page load. Anything that
    // logs that shared account out — session TTL, another tab, another client —
    // makes every later call 401 "user is logged out", which is what broke the
    // design-overlay button: the page loaded fine, then the click 401'd on all
    // four slots. Re-login once and retry instead of failing the call.
    if (response.status === 401) {
      console.warn(`[ApiClient] session expired on POST ${endpoint} — re-logging in`);
      resetSessionLogin();
      await getSessionLogin();
      response = await send();
    }

    logApi(response, `POST ${endpoint}`);
    if (!response.ok) {
      if (response.status == 500 || response.status == 404) {
        return 'stl';
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (test) {
      return true;
    }

    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
      // Server used chunked transfer encoding — no progress bar possible.
      // Nothing to tear down here: the fallback container is only created
      // below, and touching it at this point threw a TDZ ReferenceError that
      // failed the whole request.
      return response.json();
    }

    const totalBytes = parseInt(contentLength, 10);
    let loadedBytes = 0;
    const els = window.viewerLoadingEls;

    // Shared UI state for the fallback local overlay
    let container = null, progressBar = null, percentage = null, displayBox = null;

    if (els) {
      // Use the centralized loading screen — identical update pattern to main branch
      progressBar = els.progressBar;
      percentage  = els.percentage;
      displayBox  = els.displayBox;
      progressBar.max = totalBytes;
      progressBar.value = 0;
      progressBar.style.display = 'block';
    } else {
      container = document.createElement('div');
      container.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;';
      progressBar = document.createElement('progress');
      progressBar.max = totalBytes;
      progressBar.style.cssText = 'width:80%;margin-bottom:10px;';
      percentage = document.createElement('span');
      percentage.style.cssText = 'display:block;margin-bottom:10px;';
      displayBox = document.createElement('div');
      displayBox.style.cssText = 'width:80%;padding:10px;border:transparent;border-radius:5px;background:transparent;text-align:center;min-height:100px;box-sizing:border-box;';
      container.appendChild(progressBar);
      container.appendChild(percentage);
      container.appendChild(displayBox);
      document.body.appendChild(container);
    }

    const reader = response.body.getReader();
    const stream = new ReadableStream({
      start(controller) {
        function push() {
          reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            loadedBytes += value.length;
            progressBar.value = loadedBytes;

            const percent = ((loadedBytes / totalBytes) * 100).toFixed(2);
            percentage.textContent = `${percent}%`;

            const timeElapsed = performance.now() / 1000;
            const downloadSpeedMBps = (loadedBytes / (1024 * 1024 * timeElapsed)).toFixed(1);
            displayBox.textContent = `${downloadLabel}   Download speed: ${downloadSpeedMBps} MB/s`;

            controller.enqueue(value);
            push();
          });
        }
        push();
      }
    });

    const responseStream = new Response(stream);
    const jsonResponse = await responseStream.json();

    if (container) document.body.removeChild(container);

    return jsonResponse;
  }
}

let sessionLoginPromise = null;

// Drop the memoized session so the next call logs in again.
function resetSessionLogin() {
  sessionLoginPromise = null;
}

function getSessionLogin() {
  if (!sessionLoginPromise) {
    sessionLoginPromise = login().catch((error) => {
      sessionLoginPromise = null;
      throw error;
    });
  }
  return sessionLoginPromise;
}


async function login() {
  const loginData = LOGIN_CREDENTIALS;
  const dataish = {
    machine_id: MACHINE_ID,
    uuid: VIEWER_UUID,
  };

  const urllogin = `${API_BASE}/user/login`;
  try {
    const response = await fetch(urllogin, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([dataish,loginData])
    });
    logApi(response, 'POST /user/login');
    if (!response.ok) {
      throw new Error(`Login failed with status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
    throw error; // Rethrow the error to handle it in the caller function
  }
}
// 
