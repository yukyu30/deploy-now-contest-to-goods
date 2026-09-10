import type { Page } from "playwright";

export async function captureFrame(page: Page, timeout = 10000) {
  const session = await page.context().newCDPSession(page);
  const scale = await page.evaluate(() => window.devicePixelRatio);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Font readiness is already bounded by screenshotSite. page.screenshot()
    // waits for fonts again, which can stall on a page that keeps loading fonts.
    const result = await Promise.race([
      session.send("Page.captureScreenshot", {
        format: "jpeg",
        quality: 90,
        fromSurface: true,
        captureBeyondViewport: false,
        optimizeForSpeed: true,
        clip: { x: 0, y: 0, ...page.viewportSize()!, scale },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Capture timed out")),
          timeout,
        );
      }),
    ]);
    return Buffer.from(result.data, "base64");
  } finally {
    if (timer) clearTimeout(timer);
    await session.detach().catch(() => {});
  }
}
