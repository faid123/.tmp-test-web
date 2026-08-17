/**
 * @jest-environment jsdom
 *
 * The approval email's body (src/js/2D/caseNote.js): title, then the renders,
 * then the text. Order only holds while the images are inlined in the message.
 */
import { caseEmailBody, emailImagesHtml } from "../src/js/2D/caseNote.js";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const args = { recipient: { username: "shafik" }, link: "https://example.test/case" };

beforeEach(() => {
  localStorage.clear();
});

test("the title leads the body", () => {
  const body = caseEmailBody(3008, args);

  expect(body.startsWith("<h2")).toBe(true);
  expect(body.indexOf("</h2>")).toBeLessThan(body.indexOf("Hi shafik"));
});

test("the title names the case, and the text no longer repeats it", () => {
  const body = caseEmailBody(3008, args);

  expect(body).toMatch(/<h2[^>]*>3008<\/h2>/);
  expect(body).not.toContain("Case: 3008");
});

test("the renders sit between the title and the text", () => {
  const body = caseEmailBody(3008, { ...args, images: [{ src: PNG, alt: "Upper jaw thumbnail" }] });

  expect(body.indexOf("</h2>")).toBeLessThan(body.indexOf("<img"));
  expect(body.indexOf("<img")).toBeLessThan(body.indexOf("Hi shafik"));
  expect(body).toContain("<b>Upper jaw thumbnail:</b>");
});

test("body is unchanged when there is nothing to show", () => {
  expect(caseEmailBody(3008, { ...args, images: [] })).toBe(caseEmailBody(3008, args));
  expect(caseEmailBody(3008, args)).not.toContain("<img");
});

test("an arch with no render is left out, not sent as an empty image", () => {
  expect(emailImagesHtml([{ src: "", alt: "Lower" }, { src: PNG, alt: "Upper" }])).toBe(
    emailImagesHtml([{ src: PNG, alt: "Upper" }])
  );
});

test("alt text can't open a tag or break out of the attribute", () => {
  const html = emailImagesHtml([{ src: PNG, alt: '"><script>alert(1)</script>' }]);

  expect(html).toContain("&quot;"); // escaped inside alt=""
  expect(html).not.toContain("<script");
  expect(html.match(/<(?!\/?b>|br>|img )/g)).toBeNull();
});

test("a case name carrying markup is escaped inside the title", () => {
  // The label is read off the page's topbar, so it is whatever was rendered there.
  document.body.innerHTML = '<span id="caseLabel"></span>';
  document.getElementById("caseLabel").textContent = "Case: <b>Smith & Co</b>";
  const body = caseEmailBody(1, args);

  expect(body).toContain("&lt;b&gt;Smith &amp; Co");
  expect(body.match(/<(?!\/?h2|br)/g)).toBeNull();
});
