// Plain-text rendering of an assessment. This is what a partner would get
// in email; the HTML report is the same content with click-through sources.
const mark = { verified: "", warning: " (!)", failed: " (unverified)" };

function stmtLine(s) {
  const cites = (s.citations || []).map((c) => `[${c.passage_id}]`).join(" ");
  const basis = s.basis === "stated" ? "" : ` _${s.basis}_`;
  return `- ${s.text} ${cites}${basis}${mark[s.verification?.status] ?? ""}`;
}

export function toMarkdown(rec) {
  const a = rec.assessment;
  const v = rec.verification_summary;
  const L = [];
  L.push(`# ${a.company_name}: draft assessment`);
  L.push(`_Drafted ${rec.generated_at} by ${rec.model}. ${v.verified} of ${v.statements} statements verified against source text; ${v.warning} carry warnings; ${v.failed} failed verification and are marked. This draft does not contain a recommendation._`);
  L.push("");
  L.push("## Summary");
  L.push(a.summary);
  if (a.integrity_notes.length) {
    L.push("");
    L.push("## Integrity notes");
    for (const n of a.integrity_notes) L.push(`- ${n}`);
  }
  L.push("");
  L.push("## Assessment");
  for (const d of a.dimensions) {
    L.push(`### ${d.name}`);
    L.push(d.finding);
    for (const c of d.claims) L.push(stmtLine(c));
    if (d.open_questions.length) {
      L.push("");
      L.push("Open questions:");
      for (const q of d.open_questions) L.push(`- ${q}`);
    }
    L.push("");
  }
  L.push("## Where the sources disagree");
  if (!a.contradictions.length) L.push("No contradictions found between the sources.");
  for (const c of a.contradictions) L.push(stmtLine(c));
  L.push("");
  L.push("## What is missing");
  for (const m of a.missing) L.push(`- **${m.item}.** ${m.why_it_matters}`);
  L.push("");
  L.push("## The case against");
  L.push(a.bear_case.thesis);
  for (const p of a.bear_case.points) L.push(stmtLine(p));
  L.push("");
  L.push("## Sources");
  for (const s of rec.sources) L.push(`- ${s.key}: ${s.title} (${s.passages} passages)`);
  L.push("");
  L.push("_Citation keys refer to numbered passages in the input documents. (!) marks a statement with a soft warning, usually a number that is not in the cited passage. (unverified) marks a statement whose quote could not be found in the cited passage after one repair round; read it as the model's assertion, not as sourced._");
  return L.join("\n");
}
