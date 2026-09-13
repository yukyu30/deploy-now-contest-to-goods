import sharp from "sharp";
import { signCapture } from "./captures";

// Leave headroom below the hosting layer's observed ~16 KiB request limit.
export const PRODUCT_REQUEST_BUDGET = 15_000;

export async function compactCapture(input: Buffer, url: string) {
  const prefix = "data:image/jpeg;base64,";
  // The signed receipt has a fixed-size hash, so an empty image gives the exact
  // receipt length. Budget for the longest escaped title and all design fields.
  const overhead = Buffer.byteLength(
    JSON.stringify({
      src: prefix,
      receipt: signCapture(Buffer.alloc(0), url),
      title: "\u0000".repeat(80),
      fit: "contain",
      background: "#ffffff",
      confirmed: true,
      publish: true,
    }),
  );
  const maxBytes = Math.floor((PRODUCT_REQUEST_BUDGET - overhead) / 4) * 3;
  if (maxBytes <= 0)
    throw new Error("URLが長すぎます。短いURLで撮影してください。");

  for (const width of [1440, 1080, 800, 600, 480, 360, 240, 160]) {
    for (const quality of [70, 45]) {
      const { data, info } = await sharp(input, {
        limitInputPixels: 12_000_000,
      })
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer({ resolveWithObject: true });
      if (data.length > maxBytes) continue;
      return {
        src: prefix + data.toString("base64"),
        receipt: signCapture(data, url),
        width: info.width,
        height: info.height,
        url,
      };
    }
  }
  throw new Error(
    "画像を送信可能なサイズに縮小できませんでした。別のページでお試しください。",
  );
}
