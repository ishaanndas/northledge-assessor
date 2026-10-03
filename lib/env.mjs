// Minimal .env loader so the project has a single dependency (the SDK).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export const MODELS = {
  // The drafter and the judge are deliberately different models so the
  // judge does not share the drafter's blind spots.
  drafter: process.env.DRAFTER_MODEL || "claude-opus-5",
  judge: process.env.JUDGE_MODEL || "claude-sonnet-5",
};
