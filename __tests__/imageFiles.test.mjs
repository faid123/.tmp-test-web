// __tests__/imageFiles.test.mjs
//
// The pure halves of the upload image pipeline: HEIF sniffing, the fit-to-box
// maths and the re-encode rename. normalizeImageFile itself needs a canvas and a
// real image decoder, so it is exercised in a browser, not here.

import {
  MAX_IMAGE_EDGE,
  fitWithin,
  isHeifBytes,
  isHeifName,
  jpegName,
} from "../src/js/shared/imageFiles.js";

// An ISO-BMFF header: 4-byte box size, "ftyp", then the brand.
function ftypHeader(brand) {
  const bytes = new Uint8Array(16);
  bytes.set([0, 0, 0, 0x18], 0);
  bytes.set([..."ftyp"].map((c) => c.charCodeAt(0)), 4);
  bytes.set([...brand].map((c) => c.charCodeAt(0)), 8);
  return bytes;
}

describe("isHeifBytes", () => {
  test.each(["heic", "heix", "mif1", "msf1", "hevc", "heim"])(
    "recognises the %s brand",
    (brand) => {
      expect(isHeifBytes(ftypHeader(brand))).toBe(true);
    }
  );

  test("ignores a non-HEIF ISO container (MP4)", () => {
    expect(isHeifBytes(ftypHeader("isom"))).toBe(false);
    expect(isHeifBytes(ftypHeader("mp42"))).toBe(false);
  });

  test("ignores JPEG and PNG magic", () => {
    expect(isHeifBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
    expect(isHeifBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe(false);
  });

  test("survives a short or missing read", () => {
    expect(isHeifBytes(null)).toBe(false);
    expect(isHeifBytes(new Uint8Array([0, 0, 0, 0x18, 102, 116, 121, 112]))).toBe(false);
  });
});

describe("isHeifName", () => {
  test("matches the extensions and MIME types a phone produces", () => {
    expect(isHeifName("IMG_0042.HEIC", "")).toBe(true);
    expect(isHeifName("photo.heif", "")).toBe(true);
    expect(isHeifName("photo", "image/heic")).toBe(true);
    expect(isHeifName("photo", "image/heif-sequence")).toBe(true);
  });

  test("leaves ordinary photos alone", () => {
    expect(isHeifName("scan.jpg", "image/jpeg")).toBe(false);
    // A name merely containing "heic" is not an extension.
    expect(isHeifName("heic-notes.png", "image/png")).toBe(false);
  });
});

describe("fitWithin", () => {
  test("passes through anything already inside the box", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1200, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  test("scales the longest edge down, keeping the aspect ratio", () => {
    // A 12MP landscape capture.
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    // The same sensor held portrait — the long edge is the height.
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  test("never yields a zero dimension for an extreme panorama", () => {
    const { width, height } = fitWithin(20000, 3, 1600);
    expect(width).toBe(1600);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  test("defaults to the shipped max edge", () => {
    expect(fitWithin(4000, 4000).width).toBe(MAX_IMAGE_EDGE);
  });
});

describe("jpegName", () => {
  test("replaces the extension the file arrived with", () => {
    expect(jpegName("IMG_0042.HEIC")).toBe("IMG_0042.jpg");
    expect(jpegName("scan.png")).toBe("scan.jpg");
    expect(jpegName("photo.jpeg")).toBe("photo.jpg");
  });

  test("keeps dots that are part of the name", () => {
    expect(jpegName("case 12.4 upper.png")).toBe("case 12.4 upper.jpg");
  });

  test("handles a name with no extension at all", () => {
    expect(jpegName("1000012345")).toBe("1000012345.jpg");
  });

  test("falls back when the picker gives no name", () => {
    expect(jpegName("")).toBe("image.jpg");
    expect(jpegName(undefined)).toBe("image.jpg");
  });
});
