import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  compactCapture,
  PRODUCT_REQUEST_BUDGET,
} from "../src/lib/compact-capture";
import { verifyCapture } from "../src/lib/captures";

process.env.SUZURI_API_KEY = "compact-capture-test-key";

test("detailed images fit the complete request budget including a long URL and escaped title", async () => {
  const input = await sharp(randomBytes(1440 * 1080 * 3), {
    raw: { width: 1440, height: 1080, channels: 3 },
  })
    .png()
    .toBuffer();
  const url = `https://demo.lolipop-now.app/?q=${"a".repeat(1900)}`;
  const capture = await compactCapture(input, url);
  const body = JSON.stringify({
    src: capture.src,
    receipt: capture.receipt,
    title: "\u0000".repeat(80),
    fit: "contain",
    background: "#ffffff",
    confirmed: true,
    publish: true,
  });
  assert.ok(Buffer.byteLength(body) <= PRODUCT_REQUEST_BUDGET);
  const verified = verifyCapture(capture.src, capture.receipt);
  assert.equal(verified.url, url);
  const info = await sharp(verified.png).metadata();
  assert.equal(info.format, "jpeg");
  assert.equal(info.width, capture.width);
  assert.equal(info.height, capture.height);
  assert.ok(capture.width < 1440);
});

test("simple captures retain their dimensions without being enlarged", async () => {
  const input = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: "white",
    },
  })
    .png()
    .toBuffer();
  const capture = await compactCapture(input, "https://demo.lolipop-now.app/");
  assert.equal(capture.width, 800);
  assert.equal(capture.height, 600);
});
