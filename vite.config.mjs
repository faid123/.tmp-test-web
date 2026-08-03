// Dev-server config for Vite (`npx vite --port 8089`).
//
// This project loads its stylesheets via plain <link href="..."> tags rather
// than JS imports, so Vite does NOT hot-reload them — the browser caches the
// served CSS/JS and keeps showing stale copies after you edit a file. Sending
// `Cache-Control: no-store` for everything Vite serves makes every reload fetch
// fresh files, so edits to noticeboard.css (etc.) take effect immediately.
export default {
  server: {
    headers: {
      "Cache-Control": "no-store",
    },
  },
};
