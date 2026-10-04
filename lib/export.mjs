// Export the assessment as the partners would see it: review applied
// (edits, removals, moves, inserted blocks, the note). The block list comes
// from the same renderer the app uses (app/doc.js), run here in a sandbox,
// so the file matches the screen. Formats: markdown, plain text, docx.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { ROOT } from "./env.mjs";

let Doc;
function doc() {
  if (Doc) return Doc;
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "app", "doc.js"), "utf8"), ctx);
  return (Doc = ctx.window.Doc);
}

const unesc = (s) => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
// Rich html (b, i, br, a) to markdown and to plain text.
const htmlToMd = (h) => unesc(String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<(b|strong)>(.*?)<\/\1>/gi, "**$2**").replace(/<(i|em)>(.*?)<\/\1>/gi, "*$2*").replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)").replace(/<[^>]+>/g, ""));
const htmlToText = (h) => unesc(String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));

export function blocksFor(c) {
  const rv = c.reviewDoc || {};
  return doc().buildBlocks(c, { mode: "partner", decisions: rv.decisions || {}, overrides: rv.overrides || {}, reviewer: rv.reviewer, note: rv.note });
}

export function toMarkdownApplied(c) {
  const L = [];
  for (const b of blocksFor(c)) {
    const text = b.rich ? htmlToMd(b.html) : b.text;
    switch (b.type) {
      case "label": L.push(`_${text}_`, ""); break;
      case "title": L.push(`# ${text}`, ""); break;
      case "meta": L.push(text, ""); break;
      case "h2": L.push(`## ${text}`, ""); break;
      case "h3": L.push(`### ${text}`, ""); break;
      case "h": L.push(`### ${text}`, ""); break;
      case "flags": L.push(...b.items.map((n) => `- ${n}`), ""); break;
      case "claim": L.push(`- ${text} ${(b.stmt.citations || []).map((x) => `[${x.passage_id}]`).join(" ")}`); break;
      case "bullet": L.push(`- ${text}`); break;
      case "gap": L.push(`- ${text}`); break;
      case "quote": L.push(`> ${text}`, ""); break;
      case "divider": L.push("---", ""); break;
      case "checks": break;
      default: if (text) L.push(text, "");
    }
  }
  // A bullet run followed by a paragraph needs a blank line.
  return L.join("\n").replace(/\n(- [^\n]*)\n(?!- |\n)/g, "\n$1\n\n").trim() + "\n";
}

export function toPlainText(c) {
  return toMarkdownApplied(c).replace(/^#+\s*/gm, "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").replace(/^_(.*)_$/gm, "$1").replace(/^> /gm, "");
}

// ---- docx: a minimal, valid package with heading styles ----
const xesc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function runs(html) {
  // Split rich html into runs with bold/italic flags; <br> becomes a line break.
  const out = [];
  const re = /<br\s*\/?>|<(\/?)(b|strong|i|em)>|<a [^>]*>|<\/a>|[^<]+/gi;
  let bold = 0, ital = 0, m;
  while ((m = re.exec(String(html || "")))) {
    const t = m[0];
    if (/^<br/i.test(t)) out.push({ br: true });
    else if (m[2]) { const on = !m[1]; if (/^(b|strong)$/i.test(m[2])) bold += on ? 1 : -1; else ital += on ? 1 : -1; }
    else if (/^<\/?a/i.test(t)) continue;
    else out.push({ text: unesc(t), bold: bold > 0, ital: ital > 0 });
  }
  return out;
}
const para = (content, style, opts = {}) => {
  const rs = (typeof content === "string" ? [{ text: content }] : content).map((r) => r.br ? `<w:r><w:br/></w:r>` : `<w:r>${r.bold || r.ital || opts.color || opts.size ? `<w:rPr>${r.bold ? "<w:b/>" : ""}${r.ital ? "<w:i/>" : ""}${opts.color ? `<w:color w:val="${opts.color}"/>` : ""}${opts.size ? `<w:sz w:val="${opts.size}"/>` : ""}</w:rPr>` : ""}<w:t xml:space="preserve">${xesc(r.text)}</w:t></w:r>`).join("");
  return `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${opts.bullet ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>` : ""}${opts.after !== undefined ? `<w:spacing w:after="${opts.after}"/>` : ""}</w:pPr>${rs}</w:p>`;
};

export function toDocx(c) {
  const P = [];
  for (const b of blocksFor(c)) {
    const content = b.rich ? runs(b.html) : [{ text: b.text || "" }];
    switch (b.type) {
      case "label": P.push(para(content, "Label")); break;
      case "title": P.push(para(content, "Title")); break;
      case "meta": P.push(para(content, "Meta")); break;
      case "h2": P.push(para(content, "Heading2")); break;
      case "h3": case "h": P.push(para(content, "Heading3")); break;
      case "flags": b.items.forEach((n) => P.push(para([{ text: n }], "Normal", { bullet: true }))); break;
      case "claim": P.push(para([{ text: b.text }, { text: "  " + (b.stmt.citations || []).map((x) => x.passage_id).join(", ") }], "Normal", { bullet: true })); break;
      case "bullet": case "gap": P.push(para(content, "Normal", { bullet: true })); break;
      case "quote": P.push(para(content, "Quote")); break;
      case "divider": P.push(para([{ text: "" }], "Normal")); break;
      case "checks": break;
      default: P.push(para(content, b.type === "summary" || b.type === "note" ? "Body" : "Normal"));
    }
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${P.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="17181A"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Label"><w:name w:val="Label"/><w:basedOn w:val="Normal"/><w:rPr><w:caps/><w:sz w:val="16"/><w:color w:val="8A8C92"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:sz w:val="20"/><w:color w:val="55575C"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/></w:pPr><w:rPr><w:b/><w:caps/><w:sz w:val="18"/><w:color w:val="8A8C92"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Body"><w:name w:val="Body"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="567"/></w:pPr><w:rPr><w:i/><w:color w:val="55575C"/></w:rPr></w:style>
</w:styles>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`;
  return zipStore([["[Content_Types].xml", contentTypes], ["_rels/.rels", rels], ["word/document.xml", document], ["word/_rels/document.xml.rels", docRels], ["word/styles.xml", styles], ["word/numbering.xml", numbering]]);
}

// Tiny zip writer (deflate). Enough for a docx.
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function zipStore(files) {
  const parts = [], central = []; let offset = 0;
  for (const [name, text] of files) {
    const data = Buffer.from(text, "utf8"), comp = zlib.deflateRawSync(data), nameB = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameB.length, 26); local.writeUInt16LE(0, 28);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nameB.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    parts.push(local, nameB, comp); central.push(cd, nameB); offset += local.length + nameB.length + comp.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cdBuf, end]);
}
