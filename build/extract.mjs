// Extract the Elsewhere '26 event dataset from the source site's JS bundle.
// The site (whatwherewhen.nobodies.team) is a fully-offline PWA: the entire
// dataset is one JS array literal baked into /assets/index-*.js. We download it,
// slice out the array, and evaluate it as JS (it is a JS literal, not strict JSON:
// it uses \' escapes and unicode punctuation).
//
// Usage: node build/extract.mjs
// Writes: data/events.raw.json, data/meta.json

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://whatwherewhen.nobodies.team";

// Festival day -> ISO date. Data references Mon Jul 6 2026 as a pre-festival
// build day, so the festival proper is Tue Jul 7 .. Sun Jul 12 2026.
const DAY_DATES = {
  Tue: "2026-07-07",
  Wed: "2026-07-08",
  Thu: "2026-07-09",
  Fri: "2026-07-10",
  Sat: "2026-07-11",
  Sun: "2026-07-12",
};

async function main() {
  console.log("Fetching index.html …");
  const html = await (await fetch(SITE + "/")).text();
  const m = html.match(/\/assets\/index-[A-Za-z0-9]+\.js/);
  if (!m) throw new Error("Could not find bundle script tag in index.html");
  const bundleUrl = SITE + m[0];
  console.log("Fetching bundle:", bundleUrl);
  let js = await (await fetch(bundleUrl)).text();

  // U+2028 / U+2029 are legal in JS strings (ES2019) but let's normalise to be safe.
  js = js.replace(/[\u2028\u2029]/g, " ");

  const start = js.indexOf('[{"id":');
  if (start < 0) throw new Error('Could not find event array ([{"id":) in bundle');

  let data;
  if (js[start - 1] === "`") {
    // Newer bundles store the data as JSON inside a template literal:
    //   JSON.parse(`[{"id":...}]`)
    // Find the closing (unescaped) backtick, evaluate the template literal to
    // recover the exact JSON string, then JSON.parse it — same as the app does.
    let esc = false, close = -1;
    for (let i = start; i < js.length; i++) {
      const c = js[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === "`") { close = i; break; }
    }
    if (close < 0) throw new Error("Could not find closing backtick of template literal");
    const tmpl = js.slice(start - 1, close + 1); // includes both backticks
    const jsonStr = new Function("return " + tmpl)(); // template literal -> JSON string
    data = JSON.parse(jsonStr);
  } else {
    // Older bundles store a bare JS array literal (uses \' escapes) — eval as JS.
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < js.length; i++) {
      const c = js[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "[" || c === "{") depth++;
      else if (c === "]" || c === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) throw new Error("Could not find end of event array");
    data = new Function("return " + js.slice(start, end))();
  }
  if (!Array.isArray(data)) throw new Error("Extracted value is not an array");

  // Normalise + validate.
  const cats = {}, dayHist = {}, camps = new Set();
  for (const r of data) {
    if (!r.title || !r.time || typeof r.dur !== "number" || !Array.isArray(r.days)) {
      throw new Error("Malformed record: " + JSON.stringify(r).slice(0, 120));
    }
    cats[r.cat] = (cats[r.cat] || 0) + 1;
    for (const d of r.days) dayHist[d] = (dayHist[d] || 0) + 1;
    if (r.camp) camps.add(r.camp);
  }

  mkdirSync(resolve(ROOT, "data"), { recursive: true });
  writeFileSync(resolve(ROOT, "data/events.raw.json"), JSON.stringify(data, null, 2));
  writeFileSync(
    resolve(ROOT, "data/meta.json"),
    JSON.stringify(
      { source: bundleUrl, extractedCount: data.length, dayDates: DAY_DATES, categories: cats },
      null,
      2
    )
  );

  console.log(`\n✓ Extracted ${data.length} events`);
  console.log("  categories:", cats);
  console.log("  days:", dayHist);
  console.log("  distinct camps:", camps.size);
  console.log("  wrote data/events.raw.json + data/meta.json");
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
