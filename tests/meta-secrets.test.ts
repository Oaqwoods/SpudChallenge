// Secret-leak guards for the Meta integration (playbook PROMPT 40 checklist
// 15–16): the static export must never contain CAPI secrets or the
// server-only Graph API endpoint, and no tracked source file may carry a
// Meta secret value. The out/ scan skips when no build is present — run
// `npm run build` before relying on it.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(new URL("..", import.meta.url).pathname);
const OUT_DIR = join(ROOT, "out");

const SCAN_EXTENSIONS = new Set([".html", ".js", ".css", ".json", ".txt", ".xml"]);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

test("static export contains no CAPI secrets or server-only Meta endpoints", (t) => {
  if (!existsSync(OUT_DIR)) {
    t.skip("out/ not present — run `npm run build` first");
    return;
  }
  const forbidden = [
    "META_CAPI_ACCESS_TOKEN",
    "META_DATASET_ID",
    // CAPI is server-side only: the Conversions API endpoint must never be
    // part of the browser bundle. (connect.facebook.net IS expected — it is
    // the public Pixel script URL.)
    "graph.facebook.com",
  ];
  const hits: string[] = [];
  for (const file of walk(OUT_DIR)) {
    const ext = file.slice(file.lastIndexOf("."));
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    const content = readFileSync(file, "utf8");
    for (const word of forbidden) {
      if (content.includes(word)) hits.push(`${relative(ROOT, file)}: ${word}`);
    }
  }
  assert.deepEqual(hits, [], `secret leakage in static export: ${hits.join(", ")}`);
});

test("no tracked source file assigns a Meta secret value", () => {
  const skipDirs = new Set(["node_modules", ".git", ".next", "out", ".qwen"]);
  const sourceExts = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".yml", ".yaml", ".md", ".env", ".example"]);
  // A secret assignment: NAME followed by : or = and a token-like value.
  const assignment = /META_CAPI_ACCESS_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_-]{8,}/;
  const hits: string[] = [];

  const scan = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skipDirs.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        scan(full);
        continue;
      }
      const isEnvFile = entry.startsWith(".env");
      const ext = full.slice(full.lastIndexOf("."));
      if (!isEnvFile && !sourceExts.has(ext)) continue;
      const content = readFileSync(full, "utf8");
      if (assignment.test(content)) hits.push(relative(ROOT, full));
    }
  };
  scan(ROOT);
  assert.deepEqual(hits, [], `possible Meta secret value committed in: ${hits.join(", ")}`);
});
