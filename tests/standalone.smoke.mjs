import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";

test("standalone includes and loads screenshot runtime dependencies", async () => {
  const root = path.resolve(".next/standalone");
  const standaloneRequire = createRequire(path.join(root, "package.json"));
  // A normal source test loads the full node_modules and misses tracing omissions.
  assert.ok(
    existsSync(path.join(root, "node_modules/playwright-core/browsers.json")),
  );
  for (const name of ["playwright", "sharp", "@sparticuz/chromium"]) {
    assert.ok(standaloneRequire.resolve(name).startsWith(root + path.sep));
    assert.ok(standaloneRequire(name));
  }
  assert.equal(
    typeof standaloneRequire("playwright").chromium.launch,
    "function",
  );
});
