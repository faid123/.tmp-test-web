// Single source of truth for the backend origin, the caller identity every
// endpoint expects in element 0 of its request body, and the shared POST/error
// plumbing. Before this module the base URL was pasted into 12 files and
// getLoggedInUser was reimplemented 13 times, so a staging switch was a
// find-and-replace and error handling drifted per file.
//
// Import-safe without a DOM: caseEnrichment.test.mjs runs in Jest's default
// node environment, so every browser global here sits behind a typeof guard.

import { MACHINE_ID } from "./config.js";
import { logApi } from "./apiLog.js";

export { MACHINE_ID };

const DEFAULT_API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";

// Point a deploy at another backend by setting window.SMARTRPD_API_BASE in an
// inline <script> before the page's module scripts run. Most pages load raw ES
// modules straight from source with no build step, so a build-time constant
// (import.meta.env / DefinePlugin) would only reach the webpack'd viewer bundle
// — and import.meta breaks that bundle's UMD output outright.
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

// Element 0 of nearly every request body: the caller the backend authenticates,
// and checks is_admin on for the admin-only endpoints. Pass `extra` for the
// endpoints that also want caseIntID etc. alongside the identity.
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

// The codebase-wide POST convention: body is [caller] or [caller, payload], the
// response is JSON, and a non-2xx throws ApiError carrying the parsed body.
// Endpoints whose body is NOT that two-element shape (multi-element jawstruct
// posts, file uploads) still build their own fetch — use apiUrl() for those.
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
