export class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async ensureSession() {
    await getSessionLogin();
  }

  async post(endpoint, data, test,what) {
    const url = `${this.baseUrl}${endpoint}`;
    if (what !== undefined) {
      console.log(what);
    }
    const downloadLabel = what === undefined ? '' : `Downloading: ${what} | `;
    await getSessionLogin();


    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

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
      throw new Error('Content-Length response header unavailable');
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
  // Shared viewer URLs currently rely on this fallback account when there is no
  // loggedInUser session. If auth is tightened later, keep a deliberate
  // read-only/public-viewer fallback here instead of silently removing URL access.
  const loginData = {
    id: 0,
    username: "faid",
    email: "",
    password: "faid30413041D**",
    salt: "",
    create_time: 0,
    is_admin: 1,
    uuid: "",
    deleted: 0
  };
  const dataish = {
    machine_id: '3a0df9c37b50873c63cebecd7bed73152a5ef616',
	uuid: 'AC4gRQXZJoNz9EhhW36Q8jMJXBsf',
    //uuid: 'eOqJe2FpjqdECy25l0KuJkH2cPQm', // dev server acc uuid


  };

  const urllogin = 'https://live.api.smartrpdai.com/api/smartrpd/user/login';
  try {
    const response = await fetch(urllogin, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([dataish,loginData])
    });

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
