import path from "node:path";
import { createRequire } from "node:module";

export async function prepareLambdaLibraries() {
  const { inflate, setupLambdaEnvironment } =
    await import("@sparticuz/chromium");
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const bin = path.resolve(
    path.dirname(require.resolve("@sparticuz/chromium")),
    "../bin",
  );
  // Custom Lambda runtimes do not necessarily advertise AWS_Lambda_nodejsXX.x.
  // Explicitly extract and configure AL2023 libraries instead of relying on that hint.
  const extracted = await inflate(path.join(bin, "al2023.tar.br"));
  const libraryPath = path.join(extracted, "lib");
  setupLambdaEnvironment(libraryPath);
  return libraryPath;
}
