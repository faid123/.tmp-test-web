// Connectivity indicator: renders 4 signal bars whose fill level reflects the
// browser's effective connection type, with a hover tooltip showing the active
// network name/status. Browsers cannot expose the literal WiFi SSID for
// privacy reasons, so the tooltip falls back to the connection type
// (`4g`, `3g`, `wifi`, `ethernet`, etc.) plus an Online/Offline label.

const LEVEL_BY_EFFECTIVE_TYPE = {
  "slow-2g": 1,
  "2g": 1,
  "3g": 2,
  "4g": 4,
  "5g": 4,
};

function readState() {
  if (typeof navigator === "undefined") {
    return { online: true, level: 4, label: "Connected" };
  }
  const online = navigator.onLine !== false;
  if (!online) return { online: false, level: 0, label: "Offline" };

  const conn =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection ||
    null;
  if (!conn) return { online: true, level: 4, label: "Connected" };

  const type = conn.type || conn.effectiveType || "";
  const level =
    LEVEL_BY_EFFECTIVE_TYPE[conn.effectiveType] ??
    (type === "wifi" || type === "ethernet" ? 4 : 3);

  const parts = [];
  if (type === "wifi") parts.push("Wi‑Fi");
  else if (type === "ethernet") parts.push("Ethernet");
  else if (type === "cellular") parts.push("Cellular");
  else parts.push("Connected");
  if (conn.effectiveType) parts.push(conn.effectiveType.toUpperCase());
  if (Number.isFinite(conn.downlink)) parts.push(`${conn.downlink} Mbps`);

  return { online: true, level, label: parts.join(" · ") };
}

export function setupConnectivityIndicator(el) {
  if (!el) return () => {};
  el.classList.add("conn-indicator");
  el.innerHTML = `
    <span class="conn-bar" data-bar="1"></span>
    <span class="conn-bar" data-bar="2"></span>
    <span class="conn-bar" data-bar="3"></span>
    <span class="conn-bar" data-bar="4"></span>
    <span class="conn-tooltip" role="tooltip"></span>
  `;
  const tooltip = el.querySelector(".conn-tooltip");

  const apply = () => {
    const { online, level, label } = readState();
    el.dataset.level = String(level);
    el.dataset.online = online ? "1" : "0";
    el.setAttribute("title", label);
    el.setAttribute("aria-label", label);
    if (tooltip) tooltip.textContent = label;
  };

  apply();

  const onChange = () => apply();
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  const conn =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection ||
    null;
  conn?.addEventListener?.("change", onChange);

  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
    conn?.removeEventListener?.("change", onChange);
  };
}
