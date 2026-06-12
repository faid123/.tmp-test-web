// Connectivity indicator: a Wi‑Fi icon only. The network name is intentionally
// not displayed (browsers also can't read the literal Wi‑Fi SSID anyway). The
// icon turns red when offline; online/offline status is exposed via title +
// aria-label for accessibility, but no name text is shown.

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function setupConnectivityIndicator(el) {
  if (!el) return () => {};
  el.classList.add("conn-indicator");
  // Icon + hover tooltip. The network name is intentionally not shown in the
  // footer; the tooltip reports only Online/Offline status.
  el.innerHTML = `
    <i class="conn-wifi-icon fa fa-wifi" aria-hidden="true"></i>
    <span class="conn-tooltip" role="tooltip"></span>
  `;
  const tooltip = el.querySelector(".conn-tooltip");

  const apply = () => {
    const online = isOnline();
    el.dataset.online = online ? "1" : "0";
    const status = online ? "Online" : "Offline";
    el.setAttribute("title", status);
    el.setAttribute("aria-label", `Network: ${status}`);
    if (tooltip) tooltip.textContent = status;
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
