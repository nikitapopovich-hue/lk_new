#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backend = path.join(root, "backend");
const frontend = path.join(root, "frontend");
const isWin = process.platform === "win32";
const venvPython = isWin
  ? path.join(backend, ".venv", "Scripts", "python.exe")
  : path.join(backend, ".venv", "bin", "python");

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: isWin });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!fs.existsSync(venvPython)) {
  console.log("→ python -m venv backend/.venv");
  run(isWin ? "python" : "python3", ["-m", "venv", ".venv"], backend);
}

console.log("→ pip install -r requirements.txt");
run(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"], root);

console.log("→ проверка python-multipart");
const check = spawnSync(venvPython, ["-c", "import multipart; from app.main import app"], {
  cwd: backend,
  stdio: "inherit",
  shell: isWin,
});
if (check.status !== 0) {
  console.error("\nОшибка: backend-зависимости не установились. Запустите вручную:");
  console.error("  backend\\.venv\\Scripts\\pip install -r requirements.txt");
  process.exit(1);
}

console.log("→ npm install (frontend)");
run(isWin ? "npm.cmd" : "npm", ["install"], frontend);

console.log("\nГотово. Скопируйте .env.example → .env в корне и запустите: npm run dev");
