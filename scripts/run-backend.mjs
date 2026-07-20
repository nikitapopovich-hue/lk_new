#!/usr/bin/env node
/**
 * Запуск uvicorn из backend/.venv
 * Usage: node scripts/run-backend.mjs [--reload] [--port 1121]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.join(root, "backend");
const isWin = process.platform === "win32";
const venvPython = isWin
  ? path.join(backend, ".venv", "Scripts", "python.exe")
  : path.join(backend, ".venv", "bin", "python");

if (!fs.existsSync(venvPython)) {
  console.error("Нет backend/.venv — сначала: npm run install:all");
  process.exit(1);
}

const extra = process.argv.slice(2);
const reload = extra.includes("--reload");
const portIdx = extra.indexOf("--port");
const port = portIdx >= 0 ? extra[portIdx + 1] : process.env.PORT || "1121";

const args = ["-m", "uvicorn", "app.main:app", "--host", process.env.HOST || "0.0.0.0", "--port", port];
if (reload) args.push("--reload");

const child = spawn(venvPython, args, {
  cwd: backend,
  stdio: "inherit",
  env: { ...process.env },
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
