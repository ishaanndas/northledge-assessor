// Loads an example company and splits each source document into numbered
// passages. Passage ids look like `deck:3`. The model only ever sees text
// with these ids attached, and every citation must point at one of them.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./env.mjs";

export const EXAMPLES_DIR = path.join(ROOT, "examples");
export const OUT_DIR = path.join(ROOT, "out");

export function listExamples() {
  return fs
    .readdirSync(EXAMPLES_DIR)
    .filter((d) => fs.existsSync(path.join(EXAMPLES_DIR, d, "company.json")))
    .sort();
}

export function loadExample(slug) {
  const dir = path.join(EXAMPLES_DIR, slug);
  const company = JSON.parse(fs.readFileSync(path.join(dir, "company.json"), "utf8"));
  const srcDir = path.join(dir, "sources");
  const sources = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const key = file.replace(/^\d+-/, "").replace(/\.md$/, "");
      const text = fs.readFileSync(path.join(srcDir, file), "utf8");
      const title = (text.match(/^#\s+(.*)$/m) || [, key])[1].trim();
      const passages = splitPassages(text).map((p, i) => ({ id: `${key}:${i + 1}`, text: p }));
      return { key, file, title, passages };
    });
  const passageIndex = new Map();
  for (const s of sources) for (const p of s.passages) passageIndex.set(p.id, { ...p, source: s.key, title: s.title });
  return { slug, company, sources, passageIndex };
}

// A passage is a blank-line separated block. Headings are folded into the
// block that follows them so a slide title travels with its content.
export function splitPassages(text) {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => !/^#\s/.test(b)); // drop the document title line
  const out = [];
  let pendingHeading = null;
  for (const b of blocks) {
    if (/^##+\s/.test(b) && !b.includes("\n")) {
      pendingHeading = b.replace(/^#+\s*/, "");
      continue;
    }
    const body = b.replace(/^##+\s*/, "");
    out.push(pendingHeading ? `${pendingHeading}\n${body}` : body);
    pendingHeading = null;
  }
  return out;
}

// What the model reads. Each passage is prefixed with its id in brackets.
export function renderSources(example) {
  return example.sources
    .map((s) => {
      const body = s.passages.map((p) => `[${p.id}] ${p.text.replace(/\n/g, " ")}`).join("\n\n");
      return `=== SOURCE "${s.key}" (${s.title}) ===\n${body}`;
    })
    .join("\n\n");
}
