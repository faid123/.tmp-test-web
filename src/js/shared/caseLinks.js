// Builds the 3D viewer URL for a case (ThreeDViewer.html reads ?id=<encryptedId>).
//
// Split out of caseManagement.js so the 2D Case Note's notification emails can
// carry the same link the case list's copy/QR actions produce, without pulling
// in the whole case-list page module.

import { lol } from "./crypt.js";

// The 3D viewer link is meant to be shared / scanned from a phone, so a
// localhost URL would be unreachable off-machine. Only used as a substitute
// when developing locally (see below).
const LIVE_VIEWER_BASE = "https://faid123.github.io/.tmp-test-web";

// Mirrors the Start Case navigation: encrypts the id and respects the
// GitHub-Pages base path so the link works when deployed.
//
// Pass `forShare: true` for links that leave this machine (copy-to-clipboard,
// QR, email): when developing on localhost those are rewritten to the live
// server so a phone can reach them. In-app navigation leaves it false so it
// stays local during dev. Deployed builds always use their own origin either way.
export function buildThreeDViewerUrl(caseId, { forShare = false } = {}) {
  if (!caseId) return "";
  const encryptedId = lol(caseId);
  const host = window.location.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "";
  if (forShare && isLocalhost) {
    return `${LIVE_VIEWER_BASE}/src/pages/ThreeDViewer.html?id=${encryptedId}`;
  }
  const isGitHubPages = host.includes("github.io");
  const basePath = isGitHubPages
    ? `/${window.location.pathname.split("/").filter(Boolean)[0] || ""}`
    : "";
  return `${window.location.origin}${basePath}/src/pages/ThreeDViewer.html?id=${encryptedId}`;
}
