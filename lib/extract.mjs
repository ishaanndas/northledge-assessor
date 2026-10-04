// Turn whatever the associate has (a PDF or PPTX deck, a Word doc, a text
// file, a URL) into the plain text the pipeline reads. Output is shaped so
// the passage splitter does the right thing: one passage per slide or page,
// one per paragraph for prose, blank lines between passages.
import path from "node:path";
import { readZip } from "./zip.mjs";

const xmlText = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, "&");
// Letter-spaced headings come out of PDFs as "S E E D  R O U N D"; close them up,
// using the wider gaps between words (two or more spaces) as word boundaries.
const despace = (s) => {
  const toks = s.trim().split(/ +/);
  const singles = toks.filter((t) => t.length === 1).length;
  if (toks.length < 6 || singles / toks.length < 0.6) return s;
  return s.trim().replace(/ {2,}/g, "\u0001").replace(/ /g, "").replace(/\u0001/g, " ").replace(/([A-Za-z])(\d)/g, "$1 $2").replace(/(\d)([A-Za-z])/g, "$1 $2").replace(/\s*[·•|]\s*/g, " · ");
};
const tidyLine = (s) => despace(s.replace(/[^\S\n]/g, " ")).replace(/ {2,}/g, " ").trim();
const onePassage = (lines) => lines.map(tidyLine).filter(Boolean).join("\n");

export async function extractFile(filename, buffer) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return extractPdf(buffer, filename);
  if (ext === ".pptx") return extractPptx(buffer, filename);
  if (ext === ".docx") return extractDocx(buffer, filename);
  if ([".md", ".txt", ".markdown", ".text", ".csv"].includes(ext) || ext === "") return { text: buffer.toString("utf8"), meta: { method: "text", filename } };
  throw new Error(`Unsupported file type ${ext || "(none)"}. Use PDF, PPTX, DOCX, Markdown or plain text.`);
}

async function extractPdf(buffer, filename) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  let result;
  try { result = await parser.getText(); } finally { await parser.destroy().catch(() => {}); }
  const pages = (result.pages || []).map((p) => String(p.text || "").split("\n"));
  // One passage per page, including pages with no extractable text, so passage N is page N.
  const slides = pages.map((lines, i) => {
    const body = onePassage(lines);
    if (!body) return `## Slide ${i + 1}\n[no extractable text on this page; see the slide]`;
    const first = body.split("\n")[0];
    return first.length < 90 ? `## Slide ${i + 1}: ${first}\n${body.split("\n").slice(1).join("\n")}` : `## Slide ${i + 1}\n${body}`;
  });
  const title = path.basename(filename, path.extname(filename)).replace(/[-_]+/g, " ");
  return { text: `# ${title}\n\n${slides.join("\n\n")}`, meta: { method: "pdf", pages: pages.length, filename } };
}

function extractPptx(buffer, filename) {
  const zip = readZip(buffer);
  const slideNames = zip.names().filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const slides = slideNames.map((n, i) => {
    const xml = zip.read(n).toString("utf8");
    const paras = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)].map((m) => xmlText([...m[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(""))).map(tidyLine).filter(Boolean);
    if (!paras.length) return `## Slide ${i + 1}\n[no text on this slide]`;
    return `## Slide ${i + 1}: ${paras[0]}\n${paras.slice(1).join("\n")}`;
  });
  const title = path.basename(filename, ".pptx").replace(/[-_]+/g, " ");
  return { text: `# ${title}\n\n${slides.join("\n\n")}`, meta: { method: "pptx", slides: slideNames.length, filename } };
}

function extractDocx(buffer, filename) {
  const zip = readZip(buffer);
  const xml = zip.read("word/document.xml")?.toString("utf8") || "";
  const paras = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((m) => {
    const isHeading = /<w:pStyle w:val="Heading\d"/.test(m[0]);
    const t = xmlText([...m[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((x) => x[1]).join(""));
    return { t: tidyLine(t), isHeading };
  }).filter((p) => p.t);
  const title = path.basename(filename, ".docx").replace(/[-_]+/g, " ");
  return { text: `# ${title}\n\n${paras.map((p) => (p.isHeading ? `## ${p.t}` : p.t)).join("\n\n")}`, meta: { method: "docx", paragraphs: paras.length, filename } };
}

export async function extractUrl(url) {
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  // Google Slides and Docs links: fetch the exported file instead of the editor page.
  const gs = url.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/);
  if (gs) url = `https://docs.google.com/presentation/d/${gs[1]}/export/pdf`;
  const gd = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/);
  if (gd) url = `https://docs.google.com/document/d/${gd[1]}/export?format=docx`;
  // A Drive file link (a PDF or PPTX someone shared): fetch the file itself.
  const dv = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/);
  if (dv) url = `https://drive.google.com/uc?export=download&id=${dv[1]}`;
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Mozilla/5.0 (assessment-drafter; reads public pages)" } });
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  const isGoogle = !!(gs || gd || dv);
  const PRIVATE = "This Google link is private, so the app can't open it. In Google Drive or Slides, click Share, set General access to \"Anyone with the link\", and try again. Or download the deck and drop the file here instead.";
  if (isGoogle && (res.status === 401 || res.status === 403 || res.status === 404)) throw new Error(PRIVATE);
  if (!res.ok) throw new Error(res.status === 404 ? "Nothing found at that link." : res.status === 401 || res.status === 403 ? "That link needs a sign-in, so the app can't open it. Download the file and drop it here instead." : `Couldn't open that link (the site answered ${res.status}).`);
  // A Google link that lands on a sign-in page is private to the viewer, not to this server.
  if (/accounts\.google\.com/.test(res.url) || (isGoogle && ctype.includes("text/html"))) throw new Error(PRIVATE);
  // A link straight to a file: parse the file, not the bytes as HTML.
  const fileExt = ctype.includes("pdf") ? ".pdf" : ctype.includes("presentationml") ? ".pptx" : ctype.includes("wordprocessingml") ? ".docx" : (new URL(url).pathname.match(/\.(pdf|pptx|docx|md|txt)$/i) || [])[0]?.toLowerCase();
  if (fileExt) {
    let name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "download") || "download";
    if (gs) name = "google-slides-deck"; else if (gd) name = "google-doc";
    const buf = Buffer.from(await res.arrayBuffer());
    const r = await extractFile(name.endsWith(fileExt) ? name : name + fileExt, buf);
    r.meta.url = url;
    r.buffer = buf;
    return r;
  }
  const html = await res.text();
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? tidyLine(xmlText(titleM[1].replace(/\s+/g, " "))) : url;
  let t = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, "");
  // Hidden elements stay in the text, marked, because that is where instructions aimed at machines tend to live.
  t = t.replace(/<([a-z0-9]+)\b([^>]*?(?:\bhidden\b|display\s*:\s*none|aria-hidden="true")[^>]*)>/gi, "\n\n[hidden element] <$1$2>");
  t = t.replace(/<(?:br|hr)\b[^>]*>/gi, "\n").replace(/<\/(?:p|div|section|article|header|footer|main|nav|li|ul|ol|h[1-6]|tr|table|blockquote|figure|figcaption|dd|dt|aside)>/gi, "\n\n").replace(/<[^>]+>/g, " ");
  t = xmlText(t).split("\n").map(tidyLine).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Keep readable content: drop menu, cart and button scraps (very short lines),
  // keep hidden-element markers with their text, and cap the total so one big
  // site can never swamp a draft.
  const paras = t.split(/\n\n+/).map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length >= 40 || (/^\[hidden element\]/.test(p) && p.length > 30))
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .slice(0, 60);
  const host = new URL(url).host;
  return { text: `# ${host} — ${title} (captured ${new Date().toISOString().slice(0, 10)})\n\n${paras.join("\n\n")}`, meta: { method: "url", url, paragraphs: paras.length, title } };
}
