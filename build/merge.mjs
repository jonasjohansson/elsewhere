// Merge raw events + AI scores -> public/events.json (the single file the app reads).
// Works with or without scores present (falls back to a neutral default), so the
// app is buildable before the AI scan finishes.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const events = JSON.parse(readFileSync(resolve(ROOT, "data/events.raw.json"), "utf8"));
const meta = JSON.parse(readFileSync(resolve(ROOT, "data/meta.json"), "utf8"));

// Load all score files into a map by id.
const scoreMap = new Map();
const scoreDir = resolve(ROOT, "data/scores");
if (existsSync(scoreDir)) {
  for (const f of readdirSync(scoreDir).filter((f) => f.endsWith(".json"))) {
    let arr;
    try { arr = JSON.parse(readFileSync(resolve(scoreDir, f), "utf8")); }
    catch (e) { console.warn(`  ! skipping unparseable ${f}: ${e.message}`); continue; }
    for (const s of arr) if (s && s.id) scoreMap.set(s.id, s);
  }
}

let scored = 0;
const out = events.map((e) => {
  const s = scoreMap.get(e.id);
  if (s) scored++;
  return {
    id: e.id,
    title: e.title,
    camp: e.camp || "",
    loc: e.loc || "",
    desc: e.desc || "",
    time: e.time,
    dur: e.dur,
    cat: e.cat,
    days: e.days,
    recur: !!e.recur,
    score: s ? s.score : 50,
    forYou: s ? !!s.forYou : false,
    reason: s ? s.reason : "",
  };
});

const payload = { meta: { ...meta, scored, total: out.length }, events: out };
writeFileSync(resolve(ROOT, "events.json"), JSON.stringify(payload));
console.log(`✓ Merged ${out.length} events (${scored} AI-scored) -> events.json`);
if (scored) {
  const forYou = out.filter((e) => e.forYou).length;
  const buckets = { "80+": 0, "65-79": 0, "50-64": 0, "<50": 0 };
  for (const e of out) buckets[e.score >= 80 ? "80+" : e.score >= 65 ? "65-79" : e.score >= 50 ? "50-64" : "<50"]++;
  console.log(`  For You: ${forYou}  |  score buckets:`, buckets);
}
