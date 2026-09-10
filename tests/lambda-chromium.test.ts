import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { prepareLambdaLibraries } from "../src/lib/lambda-chromium";

test("custom Lambda runtimes receive shared libraries without a Node runtime hint", async () => {
  const keys = [
    "AWS_EXECUTION_ENV",
    "LD_LIBRARY_PATH",
    "FONTCONFIG_PATH",
    "HOME",
  ] as const;
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.AWS_EXECUTION_ENV = "AWS_Lambda_provided.al2023";
    process.env.LD_LIBRARY_PATH = "/existing/lib";
    delete process.env.FONTCONFIG_PATH;
    const libraryPath = await prepareLambdaLibraries();
    await access(path.join(libraryPath, "libnss3.so"));
    assert.equal(process.env.LD_LIBRARY_PATH, `${libraryPath}:/existing/lib`);
    assert.ok(String(process.env.FONTCONFIG_PATH).endsWith("/fonts"));
    // Warm invocations reuse the extracted files without duplicating search paths.
    assert.equal(await prepareLambdaLibraries(), libraryPath);
    assert.equal(process.env.LD_LIBRARY_PATH, `${libraryPath}:/existing/lib`);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
