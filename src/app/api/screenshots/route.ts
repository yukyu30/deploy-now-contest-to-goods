import { checkRequest, readJson, reply } from "@/lib/request";
import { normalizeSiteUrl } from "@/lib/validation";
import { screenshotSite } from "@/lib/screenshot";
import { signCapture } from "@/lib/captures";
import { ScreenshotError } from "@/lib/screenshot-error";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const invalid = checkRequest(request);
  if (invalid) return invalid;
  let url: string;
  try {
    const body = await readJson(request);
    if (typeof body.url !== "string") throw new Error();
    url = normalizeSiteUrl(body.url);
  } catch {
    return reply(
      {
        error: "https:// で始まる *.lolipop-now.app のURLを指定してください。",
      },
      400,
    );
  }
  if (!process.env.SUZURI_API_KEY?.trim())
    return reply({ error: "サーバーのSUZURI APIキーが未設定です。" }, 503);
  try {
    const shot = await screenshotSite(url);
    const receipt = signCapture(shot.png, shot.url);
    return reply({
      receipt,
      src: `data:image/${shot.format};base64,${shot.png.toString("base64")}`,
      width: shot.width,
      height: shot.height,
      url: shot.url,
    });
  } catch (error) {
    const code =
      error instanceof ScreenshotError ? error.code : "SCREENSHOT_FAILED";
    console.error("Screenshot failed", {
      code,
      platform: process.platform,
      arch: process.arch,
      node: process.versions.node,
    });
    return reply(
      {
        code,
        error:
          error instanceof Error ? error.message : "撮影できませんでした。",
      },
      502,
    );
  }
}
