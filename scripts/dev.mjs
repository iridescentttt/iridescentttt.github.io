import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildContent } from "./build-content.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = path.join(repoRoot, "content");
const watchers = new Map();
let rebuildTimer;

await buildAndLog();
await watchContent();

const vite = spawn("vite", ["--host", "127.0.0.1", "--port", "5173"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}

vite.on("exit", (code, signal) => {
  closeWatchers();
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

async function buildAndLog() {
  const { documents } = await buildContent();
  console.log(`Generated ${documents.length} documents from content/.`);
}

async function watchContent() {
  const dirs = await collectDirs(contentDir);
  for (const dir of dirs) watchDir(dir);
}

function watchDir(dir) {
  if (watchers.has(dir)) return;

  const watcher = fs.watch(dir, () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(async () => {
      try {
        await watchContent();
        await buildAndLog();
      } catch (error) {
        console.error(error);
      }
    }, 100);
  });

  watchers.set(dir, watcher);
}

async function collectDirs(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const dirs = [dir];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      dirs.push(...await collectDirs(path.join(dir, entry.name)));
    }
  }

  return dirs;
}

function closeWatchers() {
  for (const watcher of watchers.values()) watcher.close();
  watchers.clear();
}

function shutdown(signal) {
  closeWatchers();
  vite.kill(signal);
}
