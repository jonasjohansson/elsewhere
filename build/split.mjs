// Split events.raw.json into compact scoring batches for the AI scan.
// Each batch keeps only what the scorer needs: id, title, camp, cat, desc.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const events = JSON.parse(readFileSync(resolve(ROOT, "data/events.raw.json"), "utf8"));
const BATCH = 70;
const dir = resolve(ROOT, "data/batches");
mkdirSync(dir, { recursive: true });

let n = 0;
for (let i = 0; i < events.length; i += BATCH) {
  const slice = events.slice(i, i + BATCH).map((e) => ({
    id: e.id, title: e.title, camp: e.camp, cat: e.cat,
    desc: (e.desc || "").slice(0, 600),
  }));
  writeFileSync(resolve(dir, `batch-${String(n).padStart(2, "0")}.json`), JSON.stringify(slice, null, 2));
  n++;
}
console.log(`Wrote ${n} batches of up to ${BATCH} (total ${events.length} events) to data/batches/`);
