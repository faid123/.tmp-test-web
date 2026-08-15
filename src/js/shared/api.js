// The backend origin, the caller identity endpoints expect in element 0 of the
// body, and the shared POST/error plumbing. Import-safe without a DOM.

import { MACHINE_ID } from "./config.js";
import { logApi } from "./apiLog.js";

export { MACHINE_ID };

const DEFAULT_API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";

// Set window.SMARTRPD_API_BASE inline before the page's modules run. Most pages
// have no build step, so a build-time constant would only reach the viewer bundle.
export const API_BASE =
  (typeof window !== "undefined" && window.SMARTRPD_API_BASE) || DEFAULT_API_BASE;

export function getLoggedInUser() {
  if (typeof localStorage === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("loggedInUser") || "null");
  } catch {
    return null;
  }
}

// Element 0 of nearly every request body: the caller the backend authenticates
// and checks is_admin on. Pass `extra` for endpoints that also want caseIntID.
export function callerIdentity(extra) {
  const caller = { machine_id: MACHINE_ID, uuid: getLoggedInUser()?.uuid };
  return extra ? { ...caller, ...extra } : caller;
}

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data; // full parsed error body (code/sqlMessage/sql/kind, etc.)
  }
}

// Call sites are split between "/case/get" and "case/get" spellings; accept both.
export function apiUrl(path) {
  return `${API_BASE}/${String(path).replace(/^\/+/, "")}`;
}

// Body is [caller] or [caller, payload]; a non-2xx throws ApiError with the
// parsed body. Endpoints not of that shape build their own fetch via apiUrl().
export async function apiPost(path, payload, label) {
  const body = payload === undefined ? [callerIdentity()] : [callerIdentity(), payload];

  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  logApi(res, label || `POST /${String(path).replace(/^\/+/, "")}`);

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* some endpoints may answer with an empty body */
  }

  if (!res.ok) {
    // serverErrorMessage is sometimes just "..."; prefer a meaningful field.
    const message =
      (data?.serverErrorMessage && data.serverErrorMessage !== "..." && data.serverErrorMessage) ||
      data?.sqlMessage || data?.code || `HTTP ${res.status}`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

// Read a File as base64, chunked so a large STL doesn't blow the call stack.
export async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// XHR rather than fetch so upload progress is reportable — STLs are large enough
// that a silent multi-second wait reads as a hang. `onProgress` gets a 0..1 fraction.
export function uploadWithProgress(path, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(path));
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.responseText)
        : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(payload);
  });
}
