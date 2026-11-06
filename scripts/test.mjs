import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const output = join(tmpdir(), `chatgpt-prompt-queue-${randomUUID()}.test.mjs`);
try {
  await build({
    entryPoints: ["test/queue.test.ts"],
    bundle: true,
    outfile: output,
    format: "esm",
    platform: "node",
    target: "node20",
    external: ["node:test", "node:assert/strict"],
  });
  const result = spawnSync(process.execPath, ["--test", output], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(output, { force: true });
}
