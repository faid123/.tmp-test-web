// Accessibility / presentation helpers: the connectivity (Wi‑Fi) status
// indicator and the .docx report builder used by the case-list download.

// === Connectivity indicator ================================================
// A Wi‑Fi icon only. The network name is intentionally not displayed (browsers
// also can't read the literal Wi‑Fi SSID anyway). The icon turns red when
// offline; online/offline status is exposed via title + aria-label for
// accessibility, but no name text is shown.

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

// === Report .docx builder ==================================================
// Build a .docx (Word) file of the case report for the case-list bulk download.
//
// The report is a richly-styled tooth chart (CSS filters, absolute-positioned
// overlays, flex layouts) that Word can't reproduce from HTML/CSS, so we
// rasterize it with html2canvas and embed the PNG as a single full-page image
// in a hand-assembled OOXML document. The .docx is itself a zip, assembled with
// JSZip (already loaded on the case-list page) — so the only extra dependency is
// html2canvas. Returns a Uint8Array for the outer download zip.

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;

// A4 page (11906 x 16838 twips) with 0.5in (720 twip) margins, holding one
// inline image sized to `cx`/`cy` EMU.
function documentXml(cx, cy) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${cx}" cy="${cy}"/>
            <wp:docPr id="1" name="Report"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="1" name="report.png"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="rId1"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function dataUrlToBytes(dataUrl) {
  const b64 = String(dataUrl).split(",")[1] || "";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function waitForImages(doc) {
  const imgs = Array.from(doc.images || []);
  return Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((res) => {
            img.onload = img.onerror = () => res();
          })
    )
  );
}

// Render the report HTML off-screen in an isolated iframe (so its full-document
// <style> doesn't leak into the case list) and snapshot it to a canvas.
async function renderReportCanvas(html, html2canvas) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "794px", // ~A4 width at 96dpi
    height: "1123px",
    border: "0",
    background: "#ffffff",
  });
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();
    // Let the parser settle, then wait for every image (tooth icons + jaw
    // renders) so html2canvas captures a fully-painted report.
    await new Promise((r) => setTimeout(r, 0));
    await waitForImages(doc);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const target = doc.querySelector(".cli-sheet") || doc.body;
    return await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
    });
  } finally {
    iframe.remove();
  }
}

export async function reportHtmlToDocxBytes(html) {
  const html2canvas = window.html2canvas;
  const JSZip = window.JSZip;
  if (typeof html2canvas !== "function") throw new Error("html2canvas not loaded");
  if (typeof JSZip !== "function") throw new Error("JSZip not loaded");

  const canvas = await renderReportCanvas(html, html2canvas);
  if (!canvas.width || !canvas.height) throw new Error("report rendered empty");
  const pngBytes = dataUrlToBytes(canvas.toDataURL("image/png"));

  // Fit the image inside the A4 content box (6.27in x 9.69in after 0.5in
  // margins), preserving aspect ratio. EMU = inches * 914400.
  const EMU = 914400;
  const maxW = Math.round(6.27 * EMU);
  const maxH = Math.round(9.69 * EMU);
  const ar = canvas.height / canvas.width;
  let cx = maxW;
  let cy = Math.round(maxW * ar);
  if (cy > maxH) {
    cy = maxH;
    cx = Math.round(maxH / ar);
  }

  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.file("_rels/.rels", ROOT_RELS_XML);
  zip.file("word/document.xml", documentXml(cx, cy));
  zip.file("word/_rels/document.xml.rels", DOC_RELS_XML);
  zip.file("word/media/image1.png", pngBytes);
  return zip.generateAsync({ type: "uint8array" });
}
