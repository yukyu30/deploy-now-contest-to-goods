import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright", "@sparticuz/chromium", "sharp"],
  outputFileTracingIncludes: {
    "/api/screenshots": [
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/@sparticuz/chromium/bin/**/*",
      "./assets/fonts/**/*",
    ],
  },
  turbopack: { root: process.cwd() },
};
export default nextConfig;
