#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontend = path.join(root, "frontend");
const isWin = process.platform === "win32";

const env = { ...process.env, VITE_API_BASE_URL: "" };

console.log("→ npm run build (frontend, same-origin API)");
const r = spawnSync(isWin ? "npm.cmd" : "npm", ["run", "build"], {
  cwd: frontend,
  stdio: "inherit",
  env,
  shell: isWin,
});
process.exit(r.status ?? 0);
