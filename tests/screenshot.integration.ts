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
