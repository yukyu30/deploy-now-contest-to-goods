import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { screenshotSite } from "../src/lib/screenshot";
import {
  fetchPublicResource,
  validateResourceUrl,
} from "../src/lib/safe-fetch";

// Exercise real Chromium, screenshot decoding and request interception with deterministic
// public-domain fixtures; never access or create real SUZURI products.
test("headless browser renders a site and follows a permitted redirect", async () => {
  const requests: string[] = [];
  const transport: typeof fetchPublicResource = async (url, document) => {
    validateResourceUrl(url, document);
    requests.push(url);
    if (url.endsWith("/style.css"))
      return {
        status: 200,
        headers: { "content-type": "text/css" },
        finalUrl: url,
        body: Buffer.from("body{background:rgb(236,116,71)}"),
      };
    return {
      status: 200,
      headers: { "content-type": "text/html" },
      finalUrl: "https://fixture.lolipop-now.app/page",
      body: Buffer.from(
        '<!doctype html><html><head><link rel="stylesheet" href="/style.css"><h1>Screenshot fixture</h1>',
      ),
    };
  };
  const shot = await screenshotSite(
    "https://fixture.lolipop-now.app/",
    transport,
  );
  assert.equal(shot.url, "https://fixture.lolipop-now.app/page");
  assert.ok(requests.some((url) => url.endsWith("/style.css")));
  const img = sharp(shot.png);
  const meta = await img.metadata();
  assert.equal(meta.width, 2880);
  assert.equal(meta.height, 2160);
  assert.equal(meta.format, "jpeg");
  const pixel = await img
    .extract({ left: 2000, top: 2000, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  // JPEG can shift a solid color by a few levels through chroma conversion.
  [236, 116, 71].forEach((expected, index) =>
    assert.ok(Math.abs(pixel[index] - expected) <= 3),
  );
});
test("out-of-domain navigation is rejected", async () => {
  const transport: typeof fetchPublicResource = async (url, document) => {
    validateResourceUrl(url, document);
    return {
      status: 200,
      finalUrl: "https://outside.example.com/",
      headers: {},
      body: Buffer.alloc(0),
    };
  };
  await assert.rejects(() =>
    screenshotSite("https://fixture.lolipop-now.app/", transport),
  );
});

test("a font requested after page load cannot block frame capture", async () => {
  let requestedFont = false;
  const transport: typeof fetchPublicResource = async (
    url,
    document,
    signal,
  ) => {
    validateResourceUrl(url, document);
    if (url.endsWith("/pending.woff2")) {
      requestedFont = true;
      return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("Aborted")), {
          once: true,
        });
      });
    }
    return {
      status: 200,
      headers: { "content-type": "text/html" },
      finalUrl: url,
      body: Buffer.from(`<!doctype html><html><body style="background:#ec7447"><h1>Font fallback</h1><script>
        window.addEventListener('load', () => setTimeout(() => {
          const font = new FontFace('SlowFont', 'url(/pending.woff2)', {display:'swap'});
          document.fonts.add(font);
          document.body.style.fontFamily = 'SlowFont, sans-serif';
          font.load().catch(() => {});
        }, 100));
      </script></body></html>`),
    };
  };
  const shot = await screenshotSite(
    "https://fixture.lolipop-now.app/",
    transport,
  );
  assert.ok(requestedFont);
  const metadata = await sharp(shot.png).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 2880);
  assert.equal(metadata.height, 2160);
});
