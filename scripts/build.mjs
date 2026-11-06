import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await Promise.all([
  build({
    entryPoints: ["src/content.ts"],
    bundle: true,
    outfile: "dist/content.js",
    format: "iife",
    target: "chrome120",
    minify: false,
    sourcemap: true,
  }),
  build({
    entryPoints: ["src/background.ts"],
    bundle: true,
    outfile: "dist/background.js",
    format: "esm",
    target: "chrome120",
    minify: false,
    sourcemap: true,
  }),
]);

await cp("manifest.json", "dist/manifest.json");
await cp("icon.svg", "dist/icon.svg");
