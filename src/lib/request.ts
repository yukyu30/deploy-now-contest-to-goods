import { NextResponse } from "next/server";
export const reply = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function isHttpOrigin(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return /^(http|https):$/.test(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}
export function checkRequest(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  let allowed = false;
  if (isHttpOrigin(origin)) {
    if (fetchSite !== null) {
      // Browser-controlled metadata survives proxy URL rewriting and preview URLs.
      // Reject sibling sites too: another tenant is not this app's own page.
      allowed = fetchSite === "same-origin";
    } else {
      // Older clients without Fetch Metadata must match the configured origin.
      // Never derive this fallback from untrusted forwarded-host headers.
      try {
        const expected = new URL(process.env.APP_ORIGIN?.trim() || request.url)
          .origin;
        allowed = origin === expected;
      } catch {
        allowed = false;
      }
    }
  }
  if (!allowed)
    return reply({ error: "このサイトの画面から操作してください。" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({ error: "JSONが必要です。" }, 415);
}
export async function readJson(request: Request, limit = 8192) {
  if (!request.body) throw new Error("リクエストが空です。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("入力が大きすぎます。");
    }
    chunks.push(value);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object")
    throw new Error("入力内容を確認してください。");
  return body;
}
