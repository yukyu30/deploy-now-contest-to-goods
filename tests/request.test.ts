import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkRequest } from "../src/lib/request";

const production = "https://web2object.lolipop-now.app";
const preview = "https://pr-4-example.preview.lolipop-now.app";
let savedOrigin: string | undefined;
beforeEach(() => {
  savedOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = production;
});
afterEach(() => {
  if (savedOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = savedOrigin;
});
function request(origin: string | null, fetchSite?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin !== null) headers.set("origin", origin);
  if (fetchSite !== undefined) headers.set("sec-fetch-site", fetchSite);
  return new Request("http://localhost:3000/api/screenshots", {
    method: "POST",
    headers,
  });
}

test("same-origin browser requests work behind a proxy and on previews", () => {
  for (const origin of [production, preview])
    assert.equal(checkRequest(request(origin, "same-origin")), undefined);
  delete process.env.APP_ORIGIN;
  assert.equal(checkRequest(request(preview, "same-origin")), undefined);
});

test("rejects cross-site, sibling-site and navigation requests even with matching origin", () => {
  for (const site of [
    "cross-site",
    "same-site",
    "none",
    "",
    "same-origin, cross-site",
  ])
    assert.equal(checkRequest(request(production, site))?.status, 403);
});

test("same-origin metadata does not admit missing, opaque or malformed origins", () => {
  for (const origin of [
    null,
    "null",
    "invalid",
    "file://",
    production + "/path",
    production + " https://evil.example",
  ])
    assert.equal(checkRequest(request(origin, "same-origin"))?.status, 403);
});

test("without metadata, only the configured origin is allowed", () => {
  assert.equal(checkRequest(request(production)), undefined);
  assert.equal(checkRequest(request(preview))?.status, 403);
  const spoofed = request("https://evil.example");
  spoofed.headers.set("x-forwarded-host", "evil.example");
  spoofed.headers.set("x-forwarded-proto", "https");
  assert.equal(checkRequest(spoofed)?.status, 403);
});

test("without configuration or metadata, local requests must match the request URL", () => {
  delete process.env.APP_ORIGIN;
  assert.equal(checkRequest(request("http://localhost:3000")), undefined);
  assert.equal(checkRequest(request(preview))?.status, 403);
});

test("JSON content type is still required for same-origin browsers", () => {
  const input = request(preview, "same-origin");
  input.headers.set("content-type", "text/plain");
  assert.equal(checkRequest(input)?.status, 415);
});
