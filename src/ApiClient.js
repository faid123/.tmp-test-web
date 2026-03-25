export class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async post(endpoint, data, test,what) {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(what)
    let that = '';
    if(what == undefined)
    {
      that == '';
    }
    else
    {
      that = `Downloading: ${what} | `
    }
    const buffer = await login();


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

    // Create and style elements
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.height = '100vh';
    container.style.textAlign = 'center';

    const progressBar = document.createElement('progress');
    progressBar.max = totalBytes;
    progressBar.style.width = '80%';
    progressBar.style.marginBottom = '10px';

    const percentage = document.createElement('span');
    percentage.style.display = 'block';
    percentage.style.marginBottom = '10px';

    const displayBox = document.createElement('div');
    displayBox.style.width = '80%';
    displayBox.style.padding = '10px';
    displayBox.style.border = 'transparent';
    displayBox.style.borderRadius = '5px';
    displayBox.style.backgroundColor = 'transparent'; // Transparent background
    displayBox.style.textAlign = 'center';
    displayBox.style.minHeight = '100px';
    displayBox.style.boxSizing = 'border-box'; // Include padding in width

    container.appendChild(progressBar);
    container.appendChild(percentage);
    container.appendChild(displayBox);
    document.body.appendChild(container);

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

            // Calculate percentage
            const percent = ((loadedBytes / totalBytes) * 100).toFixed(2);
            percentage.textContent = `${percent}%`;

            // Calculate download speed in MB/s
            const timeElapsed = performance.now() / 1000; // in seconds
            const downloadSpeedMBps = (loadedBytes / (1024 * 1024 * timeElapsed)).toFixed(1); // Convert bytes to MB and round to 1 decimal place
            displayBox.textContent = `${that}   Download speed: ${downloadSpeedMBps} MB/s`;

            controller.enqueue(value);
            push();
          });
        }
        push();
      }
    });

    const responseStream = new Response(stream);
    const jsonResponse = await responseStream.json();

    // Remove the container after the download is complete
    document.body.removeChild(container);

    return jsonResponse;
  }
}


async function login() {
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