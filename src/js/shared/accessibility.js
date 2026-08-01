// Accessibility / presentation helpers: the .docx report builder used by the
// case-list download.
//
// The footer Wi‑Fi / connectivity indicator that used to live here was removed
// along with its #footerConnection slot in every footer; the status bar now
// carries Help and About buttons in that spot instead.

// === Report exporters ======================================================
// Two renderings of the case report, both from the same HTML that
// noticeboard.js's buildReportHtml() produces:
//
//   reportHtmlToDocxBytes() → .docx, for the case-list bulk download.
//   reportHtmlToPdfBlob()   → .pdf, for the 2D case-note approval preview.
//
// The report is a richly-styled tooth chart (CSS filters, absolute-positioned
// overlays, flex layouts) that neither Word nor a PDF writer can reproduce from
// HTML/CSS, so both paths rasterize it with html2canvas and embed the bitmap as
// a single full-page image. The .docx is a hand-assembled OOXML zip (JSZip);
// the PDF is built with jsPDF.
//
// Both third-party libs are fetched on demand rather than via a <script> tag on
// every page: they are ~400KB each and only matter the moment someone actually
// exports a report. Pages that already carry the tag (case_list.html loads
// html2canvas) short-circuit to the existing global.

// Pinned CDN builds, same host/style as the <script> tags on the case-list page.
const LIB_URLS = {
  html2canvas: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js",
};

const scriptPromises = new Map();

// Inject a <script> once per URL and resolve when it has run. Concurrent
// callers share the one in-flight load.
function loadScriptOnce(url) {
  if (scriptPromises.has(url)) return scriptPromises.get(url);
  const p = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = url;
    el.async = true;
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => {
      // Drop the cached rejection so a later attempt can retry (a failed load
      // is usually a transient network problem, not a permanent one).
      scriptPromises.delete(url);
      reject(new Error(`failed to load ${url}`));
    });
    document.head.appendChild(el);
  });
  scriptPromises.set(url, p);
  return p;
}

async function ensureHtml2Canvas() {
  if (typeof window.html2canvas === "function") return window.html2canvas;
  await loadScriptOnce(LIB_URLS.html2canvas);
  if (typeof window.html2canvas !== "function") throw new Error("html2canvas not loaded");
  return window.html2canvas;
}

// The UMD build publishes the namespace `window.jspdf`, with the constructor as
// `jsPDF` on it.
async function ensureJsPdf() {
  if (typeof window.jspdf?.jsPDF === "function") return window.jspdf.jsPDF;
  await loadScriptOnce(LIB_URLS.jspdf);
  const ctor = window.jspdf?.jsPDF;
  if (typeof ctor !== "function") throw new Error("jsPDF not loaded");
  return ctor;
}

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
  const html2canvas = await ensureHtml2Canvas();
  const JSZip = window.JSZip;
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

// === Report .pdf builder ===================================================
// A4 portrait, in points — the same page size the report's own
// `@page { size: A4 portrait }` targets, so the PDF matches what printing the
// HTML would have produced.
const PDF_PAGE = { w: 595.28, h: 841.89 };
const PDF_MARGIN = 28.35; // 10mm, matching the report's @page margin

// Wrap an already-rasterized report in a single-page A4 PDF Blob.
//
// JPEG rather than PNG: the report is a full-bleed bitmap at scale 2, and PNG
// runs to several MB, which is slow to hand to a PDF viewer. 0.92 quality keeps
// the tooth chart and its thin overlay strokes legible.
function jpegToPdfBlob(jpegDataUrl, aspectRatio, JsPDF) {
  const pdf = new JsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const maxW = PDF_PAGE.w - PDF_MARGIN * 2;
  const maxH = PDF_PAGE.h - PDF_MARGIN * 2;
  // Fit inside the content box preserving aspect ratio, so nothing is cropped,
  // then centre what's left over.
  let w = maxW;
  let h = w * aspectRatio;
  if (h > maxH) {
    h = maxH;
    w = h / aspectRatio;
  }
  const x = PDF_MARGIN + (maxW - w) / 2;
  const y = PDF_MARGIN + (maxH - h) / 2;

  pdf.addImage(jpegDataUrl, "JPEG", x, y, w, h);
  return pdf.output("blob");
}

// Rasterize the report and wrap it in a single-page A4 PDF, returned as a Blob.
export async function reportHtmlToPdfBlob(html) {
  const { pdfBlob } = await reportHtmlToPreview(html);
  return pdfBlob;
}

// Width the emailed PNG is reduced to: A4 at 96dpi. The report is rendered at
// scale 2 (~1588px), and a PNG of that runs to several MB — far past what a JSON
// request body will carry. Halving it keeps the page legible at a few hundred KB.
const EMAIL_PNG_MAX_W = 794;

// A PNG data URL of the report, downscaled to `maxWidth`. PNG rather than JPEG
// because /sendEmail's `thumbnail` field is a PNG data URL everywhere else it is
// used (viewer3d sends "data:image/png;base64,…").
function toPngDataUrl(canvas, maxWidth) {
  if (canvas.width <= maxWidth) return canvas.toDataURL("image/png");

  const out = document.createElement("canvas");
  out.width = maxWidth;
  out.height = Math.round((canvas.height / canvas.width) * maxWidth);
  const ctx = out.getContext("2d");
  // Painted white first: the report is opaque, but a PNG's transparent ground
  // renders black in some mail clients.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

// Rasterize the report ONCE and hand back three forms of it:
//
//   imageUrl — the page as a JPEG data URL, for showing on screen as a plain
//              <img>. An <iframe> pointed at the PDF would drag in the browser's
//              own PDF viewer (toolbar, page controls, zoom widget, thumbnail
//              rail, and a blob UUID where a filename should be), which is
//              chrome around a document nobody asked for.
//   pngUrl   — the page as a downscaled PNG data URL, for /sendEmail's
//              `thumbnail` field.
//   pdfBlob  — the same bitmap as a downloadable A4 PDF.
//
// html2canvas is by far the expensive step, so all three share one render.
export async function reportHtmlToPreview(html) {
  const [html2canvas, JsPDF] = await Promise.all([ensureHtml2Canvas(), ensureJsPdf()]);

  const canvas = await renderReportCanvas(html, html2canvas);
  if (!canvas.width || !canvas.height) throw new Error("report rendered empty");

  const imageUrl = canvas.toDataURL("image/jpeg", 0.92);
  return {
    imageUrl,
    pngUrl: toPngDataUrl(canvas, EMAIL_PNG_MAX_W),
    pdfBlob: jpegToPdfBlob(imageUrl, canvas.height / canvas.width, JsPDF),
  };
}
