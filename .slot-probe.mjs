import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("dialog", (d) => d.dismiss().catch(() => {}));
page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => {
  const t = m.text();
  if (/Loaded STL|design view failed|Slot \d/i.test(t)) console.log(`  [${(Date.now()-t0)/1000}s]`, t.slice(0, 120));
});
const t0 = Date.now();
await page.goto("http://localhost:8089/src/pages/ThreeDViewer.html?id=OAJBLhkNOgokMHYxWW0OASBBDRw", { waitUntil: "domcontentloaded" });
for (const at of [2000, 4000, 4000, 4000, 4000]) {
  await page.waitForTimeout(at);
  const d = await page.evaluate(() => ({
    t: +(performance.now() / 1000).toFixed(1),
    hasFn: typeof window.showDesignUploadPrompt,
    screen: !!document.getElementById("viewer-loading-screen"),
    fading: !!document.querySelector("#viewer-loading-screen.vls-fade"),
    panel: !!document.getElementById("design-upload-prompt"),
    containerKids: [...(document.getElementById("container3D")?.children || [])].map((n) => n.id || n.tagName).slice(0, 8),
  }));
  console.log(JSON.stringify(d));
}
await browser.close();
