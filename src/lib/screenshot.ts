import path from "node:path";
import { copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import sharp from "sharp";
import { MAX_CAPTURE_BYTES } from "./captures";
import { normalizeSiteUrl } from "./validation";
import { fetchPublicResource } from "./safe-fetch";
import { ScreenshotError, type ScreenshotStage } from "./screenshot-error";
import { prepareLambdaLibraries } from "./lambda-chromium";
import { captureFrame } from "./capture-frame";
let active = 0;
export async function screenshotSite(
  input: string,
  fetchResource = fetchPublicResource,
) {
  const url = normalizeSiteUrl(input);
  if (active >= 2)
    throw new Error(
      "ただいま撮影が混み合っています。少し待って再度お試しください。",
    );
  active++;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stage: ScreenshotStage = "prepare";
  try {
    const isLambda =
      process.env.CHROMIUM_RUNTIME === "lambda" ||
      !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    let lambdaArgs: string[] = [];
    if (isLambda && !executablePath) {
      const { default: lambdaChromium } = await import("@sparticuz/chromium");
      await prepareLambdaLibraries();
      executablePath = await lambdaChromium.executablePath();
      await copyFile(
        path.join(process.cwd(), "assets/fonts/NotoSansJP.ttf"),
        path.join(tmpdir(), "fonts/NotoSansJP.ttf"),
      );
      lambdaArgs = lambdaChromium.args.filter(
        (arg) =>
          ![
            "--disable-web-security",
            "--allow-running-insecure-content",
          ].includes(arg),
      );
    }
    // Only library/font paths and OS settings are passed; SUZURI/AWS credentials are excluded.
    const env: Record<string, string> = {};
    for (const key of [
      "PATH",
      "HOME",
      "TMPDIR",
      "TMP",
      "TEMP",
      "SYSTEMROOT",
      "DISPLAY",
      "LD_LIBRARY_PATH",
      "FONTCONFIG_PATH",
    ])
      if (process.env[key]) env[key] = process.env[key]!;
    stage = "launch";
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: !isLambda,
      env,
      timeout: 15000,
      executablePath,
      args: [
        ...lambdaArgs,
        "--disable-background-networking",
        "--disable-quic",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--host-resolver-rules=MAP * ~NOTFOUND",
      ],
    });
    timer = setTimeout(() => {
      controller.abort();
      void browser?.close();
    }, 35000);
    stage = "context";
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
      deviceScaleFactor: 2,
      locale: "ja-JP",
      colorScheme: "light",
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    let requests = 0,
      totalBytes = 0;
    let navigationFailure = false;
    let finalUrl = url;
    await context.route("**/*", async (route) => {
      const request = route.request();
      const document = request.isNavigationRequest();
      try {
        if (
          ++requests > 160 ||
          totalBytes > 40 * 1024 * 1024 ||
          request.method() !== "GET"
        )
          throw new Error("Resource limit");
        if (document) normalizeSiteUrl(request.url());
        const result = await fetchResource(
          request.url(),
          document,
          controller.signal,
        );
        totalBytes += result.body.length;
        const { finalUrl: resourceUrl, ...response } = result;
        if (document) {
          normalizeSiteUrl(resourceUrl);
          if (request.frame() === request.frame().page().mainFrame())
            finalUrl = resourceUrl;
          if (
            resourceUrl !== request.url() &&
            response.headers["content-type"]?.includes("text/html")
          ) {
            const base = `<base href="${resourceUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")}">`;
            response.body = Buffer.from(
              response.body
                .toString("utf8")
                .replace(/<head(?:\s[^>]*)?>/i, (match) => match + base),
            );
          }
        }
        await route.fulfill(response);
      } catch {
        if (document) navigationFailure = true;
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    page.on("dialog", (dialog) => void dialog.dismiss());
    context.on("page", (popup) => {
      if (popup !== page) void popup.close();
    });
    stage = "navigate";
    const response = await page.goto(url, {
      waitUntil: "load",
      timeout: 15000,
    });
    if (!response?.ok() || navigationFailure)
      throw new Error(
        "サイトを表示できません。公開URLとリダイレクト先を確認してください。",
      );
    await page.evaluate(() =>
      Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]),
    );
    // Give client-rendered content and decoded images a bounded settling period.
    await page.waitForTimeout(1500);
    normalizeSiteUrl(page.url());
    if (navigationFailure)
      throw new Error("対象外のサイトへの移動が検出されました。");
    stage = "capture";
    let png = await captureFrame(page);
    const format = "jpeg" as const;
    if (png.length > MAX_CAPTURE_BYTES) {
      png = await sharp(png).jpeg({ quality: 80 }).toBuffer();
    }
    if (png.length > MAX_CAPTURE_BYTES)
      throw new Error("撮影画像が大きすぎます。");
    return { png, format, url: finalUrl, width: 2880, height: 2160 };
  } catch (error) {
    throw new ScreenshotError(stage, error);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
    await browser?.close().catch(() => {});
    active--;
  }
}
