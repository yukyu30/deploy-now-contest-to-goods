import test from "node:test";
import assert from "node:assert/strict";
import { readApiResponse } from "../src/lib/api-response";

test("empty hosting 500 response shows an actionable error with HTTP status", async () => {
  await assert.rejects(
    readApiResponse(new Response(null, { status: 500 })),
    /サーバーから正常な応答を受け取れませんでした（HTTP 500）/,
  );
});

test("HTML gateway errors and truncated JSON are handled", async () => {
  for (const body of ["<html>Bad gateway</html>", '{"src":']) {
    await assert.rejects(
      readApiResponse(new Response(body, { status: 502 })),
      /HTTP 502/,
    );
  }
});

test("invalid JSON shapes are rejected", async () => {
  for (const body of [null, [], "invalid"]) {
    await assert.rejects(readApiResponse(Response.json(body)), /応答形式/);
  }
});

test("API JSON errors retain their message and uncertain product state", async () => {
  const body = { error: "作成結果を確認してください。", uncertain: true };
  assert.deepEqual(
    await readApiResponse(Response.json(body, { status: 502 })),
    body,
  );
  assert.deepEqual(
    await readApiResponse(Response.json({ receipt: "signed" })),
    {
      receipt: "signed",
    },
  );
});
