// Deterministic citation checks. No model involved. Shared by the drafting
// pipeline (to trigger a repair round) and by the eval (to report honestly).

export function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Pull numeric values out of text, normalizing $38k / 1.4M / 38,000 / 118%
// to plain numbers so a claim can be matched against its evidence.
export function extractNumbers(text) {
  const out = new Set();
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(k|m|b|bn|mm|million|billion|thousand)?\b/gi;
  let m;
  while ((m = re.exec(text))) {
    let n = parseFloat(m[1].replace(/,/g, ""));
    const suf = (m[2] || "").toLowerCase();
    if (suf === "k" || suf === "thousand") n *= 1e3;
    else if (suf === "m" || suf === "mm" || suf === "million") n *= 1e6;
    else if (suf === "b" || suf === "bn" || suf === "billion") n *= 1e9;
    if (!Number.isNaN(n)) {
      out.add(round(n));
      // Keep the bare figure too: "$38k" in a claim vs "38" in a passage.
      out.add(round(parseFloat(m[1].replace(/,/g, ""))));
    }
  }
  return out;
}
const round = (n) => Math.round(n * 1000) / 1000;

const wordCount = (s) => normalize(s).split(" ").filter(Boolean).length;

// Walk every cited statement in an assessment with a stable id and location.
export function* statements(a) {
  for (const [di, d] of a.dimensions.entries()) {
    for (const [ci, c] of d.claims.entries()) {
      yield { id: `d${di}.c${ci}`, where: `${d.name}`, section: "dimension", stmt: c };
    }
  }
  for (const [i, c] of a.contradictions.entries()) {
    yield { id: `x${i}`, where: "Contradictions", section: "contradiction", stmt: c };
  }
  for (const [i, c] of a.bear_case.points.entries()) {
    yield { id: `b${i}`, where: "Bear case", section: "bear_case", stmt: c };
  }
}

export function verifyAssessment(assessment, passageIndex) {
  const results = [];
  for (const { id, where, section, stmt } of statements(assessment)) {
    const issues = [];
    const cits = [];
    if (!stmt.citations || stmt.citations.length === 0) issues.push({ code: "no_citation", hard: true });
    for (const cit of stmt.citations || []) {
      const p = passageIndex.get(cit.passage_id);
      const c = { passage_id: cit.passage_id, quote: cit.quote, status: "ok" };
      if (!p) {
        c.status = "missing_passage";
        issues.push({ code: "missing_passage", hard: true, passage_id: cit.passage_id, quote: cit.quote });
      } else if (!normalize(p.text).includes(normalize(cit.quote))) {
        c.status = "quote_not_found";
        issues.push({ code: "quote_not_found", hard: true, passage_id: cit.passage_id, quote: cit.quote });
      } else if (wordCount(cit.quote) > 30) {
        c.status = "quote_too_long";
        issues.push({ code: "quote_too_long", hard: false, passage_id: cit.passage_id, quote: cit.quote });
      }
      cits.push(c);
    }
    // Every number in the claim should appear somewhere in the cited passages.
    // The source title (date, duration, capture date) counts as evidence too;
    // the model sees it in the source header.
    const evidenceText = (stmt.citations || [])
      .map((c) => {
        const p = passageIndex.get(c.passage_id);
        return p ? `${p.title} ${p.text}` : "";
      })
      .join(" ");
    const evidenceNums = extractNumbers(evidenceText);
    const claimNums = extractNumbers(stmt.text);
    const strays = [...claimNums].filter((n) => !evidenceNums.has(n));
    if (strays.length && stmt.basis !== "derived") {
      issues.push({ code: "number_not_in_evidence", hard: false, numbers: strays });
    }
    const hard = issues.some((i) => i.hard);
    results.push({
      id,
      where,
      section,
      text: stmt.text,
      basis: stmt.basis,
      citations: cits,
      status: hard ? "failed" : issues.length ? "warning" : "verified",
      issues,
    });
  }
  const count = (st) => results.filter((r) => r.status === st).length;
  return {
    results,
    summary: {
      statements: results.length,
      verified: count("verified"),
      warning: count("warning"),
      failed: count("failed"),
      citations: results.reduce((n, r) => n + r.citations.length, 0),
      citations_ok: results.reduce((n, r) => n + r.citations.filter((c) => c.status === "ok").length, 0),
    },
  };
}

// Attach each statement's verification to the assessment object itself so a
// reader of the JSON sees status next to the claim.
export function annotate(assessment, verification) {
  const byId = new Map(verification.results.map((r) => [r.id, r]));
  for (const { id, stmt } of statements(assessment)) {
    const r = byId.get(id);
    stmt.verification = { status: r.status, issues: r.issues.map((i) => i.code) };
    stmt.citations?.forEach((c, i) => (c.status = r.citations[i]?.status || "ok"));
  }
  return assessment;
}

// Failures formatted for the repair prompt.
export function hardFailures(verification) {
  const out = [];
  for (const r of verification.results) {
    for (const i of r.issues) {
      if (!i.hard) continue;
      out.push({
        where: r.where,
        claim: r.text,
        passage_id: i.passage_id || "(none)",
        quote: i.quote || "(none)",
        reason:
          i.code === "no_citation"
            ? "the claim has no citation"
            : i.code === "missing_passage"
              ? "no passage with that id exists"
              : "that quote does not appear verbatim in the passage",
      });
    }
  }
  return out;
}
