import test from "node:test";
import assert from "node:assert/strict";
import { closeBrowser } from "../src/lib/close-browser";

test("a stalled browser close does not prevent returning the capture result", async () => {
  let finish!: () => void;
  const closing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let invoked = false;
  let released = false;
  await closeBrowser(
    {
      close() {
        invoked = true;
        return closing;
      },
    },
    10,
    () => {
      released = true;
    },
  );
  assert.equal(invoked, true);
  assert.equal(released, false);
  finish();
  await closing;
  assert.equal(released, true);
});

test("an already-crashed browser does not replace the capture error", async () => {
  await closeBrowser({
    async close() {
      throw new Error("Browser crashed");
    },
  });
  await closeBrowser(undefined);
});
