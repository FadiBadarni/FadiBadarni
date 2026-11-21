// Nightly build: read commits, write the week line, draw both themes.
//   LEDGER_TOKEN   token that can read the owner's repositories (required unless cached)
//   LEDGER_CACHE   optional path to cache the GitHub read between local runs
//   LEDGER_PRIVATE_WORDS  optional comma list of words the week line must never contain
//   --no-week      skip the Claude call and keep the existing line

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectCommits } from "./github.mjs";
import { buildRows, dayKeyFn, hourKeyFn, windowDays } from "./rows.mjs";
import { renderLedger } from "./render.mjs";
import { writeWeekLine } from "./week.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const config = readJson(join(here, "config.json"));
const fonts = readJson(join(here, "fonts", "fonts.json"));
const weekPath = join(here, "week.json");

const dayKey = dayKeyFn(config.timezone);
const today = dayKey(new Date());
const days = windowDays(today);
const weekStart = days.length - 7;
const since = new Date(Date.parse(`${days[0]}T00:00:00Z`) - 864e5);

let repos;
const cache = process.env.LEDGER_CACHE;
if (cache && existsSync(cache)) {
  repos = readJson(cache);
} else {
  const token = process.env.LEDGER_TOKEN;
  if (!token) throw new Error("LEDGER_TOKEN is not set");
  repos = await collectCommits({ token, since, skipRepo: config.profileRepo });
  if (cache) writeFileSync(cache, JSON.stringify(repos));
}

const rows = buildRows(config, repos, days, dayKey, hourKeyFn(config.timezone));

// Words the week line may never contain: the parts of client repository names
// (minus words their public label already uses), plus anything in the secret.
const byId = new Map(repos.map((r) => [r.id, r]));
const generic = new Set(["backend", "frontend", "landing", "pages", "services", "grader", "question", "factory", "app", "web"]);
const privateWords = new Set(
  (process.env.LEDGER_PRIVATE_WORDS ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean),
);
for (const row of config.rows.filter((r) => !r.summarize)) {
  const labelWords = row.label.toLowerCase();
  for (const id of row.repos) {
    for (const part of (byId.get(id)?.name ?? "").toLowerCase().split(/[-_]/)) {
      if (part.length >= 3 && !generic.has(part) && !labelWords.includes(part)) privateWords.add(part);
    }
  }
}

let week = existsSync(weekPath) ? readJson(weekPath) : null;
if (!process.argv.includes("--no-week")) {
  const line = writeWeekLine({ rows, weekStart, privateWords: [...privateWords], glyphs: fonts.italic.widths });
  if (line) {
    week = { text: line, from: days[weekStart], to: today, generatedAt: new Date().toISOString() };
    writeFileSync(weekPath, `${JSON.stringify(week, null, 2)}\n`);
  }
}
// A line older than a day no longer describes "this week", so it is left out.
const age = week ? (Date.parse(today) - Date.parse(week.to)) / 864e5 : Infinity;
const weekText = age <= 1 ? week.text : null;

const inWindow = (c) => dayKey(c.date) >= days[0];
// Hours are counted once even when several projects got commits in the same hour.
const stats = {
  hours: new Set(rows.flatMap((r) => r.hoursByDay.flatMap((s) => [...s]))).size,
  repos: repos.filter((r) => r.commits.some(inWindow)).length,
  activeDays: days.filter((_, i) => rows.some((r) => r.counts[i] > 0)).length,
};

const assets = join(here, "..", "assets");
mkdirSync(assets, { recursive: true });
for (const theme of ["dark", "light"]) {
  const svg = renderLedger({ theme, fonts, groups: config.groups, rows, days, weekStart, weekText, stats });
  writeFileSync(join(assets, `ledger-${theme}.svg`), svg);
}
console.log(
  `ledger: ${stats.hours} hours with commits, ${rows.length} rows, ${stats.activeDays} active days, ` +
    `week line ${weekText ? "shown" : "hidden"}`,
);
