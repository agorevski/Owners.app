import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const srcDir = resolve(root, "src");
const outDir = resolve(root, "dist");

/**
 * Bundles the MV3 extension entry points and copies static assets into dist/.
 *
 * Content scripts and the service worker are bundled as IIFE (no ESM imports at runtime),
 * with @owners/shared inlined. Static manifest + sidebar HTML are copied verbatim.
 */
async function run() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await build({
    entryPoints: {
      "background/service-worker": resolve(srcDir, "background/service-worker.ts"),
      "content/product": resolve(srcDir, "content/product.ts"),
      "content/orders": resolve(srcDir, "content/orders.ts"),
      "sidebar/sidebar": resolve(srcDir, "sidebar/sidebar.ts"),
    },
    outdir: outDir,
    bundle: true,
    format: "iife",
    target: ["chrome110"],
    platform: "browser",
    sourcemap: true,
    logLevel: "info",
  });

  await cp(resolve(srcDir, "manifest.json"), resolve(outDir, "manifest.json"));
  await cp(resolve(srcDir, "sidebar/sidebar.html"), resolve(outDir, "sidebar/sidebar.html"));

  console.log(`Extension built to ${outDir}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
