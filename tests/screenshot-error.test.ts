import test from "node:test";
import assert from "node:assert/strict";
import { ScreenshotError } from "../src/lib/screenshot-error";

test("browser startup failures are distinguished from target navigation failures", () => {
  const startup = new ScreenshotError(
    "launch",
    new Error(
      "error while loading shared libraries: libnss3.so: cannot open shared object file",
    ),
  );
  assert.equal(startup.code, "SCREENSHOT_LAUNCH_MISSING_LIBRARY");
  assert.match(startup.message, /起動/);
  const navigation = new ScreenshotError(
    "navigate",
    new Error("net::ERR_FAILED"),
  );
  assert.equal(navigation.code, "SCREENSHOT_NAVIGATE_FAILED");
  assert.match(navigation.message, /公開URL/);
});

test("public diagnostics do not include raw paths, URLs or credentials", () => {
  const cause = new Error(
    "ENOENT /private/secret https://example.com/?token=secret",
  );
  const error = new ScreenshotError("prepare", cause);
  assert.equal(error.code, "SCREENSHOT_PREPARE_MISSING_FILE");
  assert.doesNotMatch(error.message + error.code, /secret|example.com|private/);
  assert.equal(error.cause, cause);
});

test("diagnostics distinguish completed font loading without exposing call logs", () => {
  const error = new ScreenshotError(
    "capture",
    new Error(
      "Timeout 10000ms exceeded https://example.com/?secret=private\n taking page screenshot\n waiting for fonts to load...\n fonts loaded",
    ),
  );
  assert.deepEqual(error.progress, [
    "capture_requested",
    "fonts_wait_started",
    "fonts_ready",
  ]);
  assert.doesNotMatch(
    JSON.stringify(error.progress),
    /secret|private|example.com/,
  );
});
