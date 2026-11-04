import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @decpub/shared adalah TypeScript ESM yang dipakai bersama server, skrip, dan frontend (tanpa langkah build).
  transpilePackages: ["@decpub/shared"],
  webpack: (config) => {
    // Paket bersama menulis impor relatif sebagai "./x.js" (aturan ESM Node) padahal berkasnya x.ts.
    // Turbopack tidak punya pemetaan ini, jadi dev dan build memakai webpack (--webpack di package.json).
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return config;
  },
};

export default nextConfig;
