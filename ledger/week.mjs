// Writes the "This week" sentence with Claude, through the `claude` CLI.
// Works with either secret: CLAUDE_CODE_OAUTH_TOKEN (a subscription) or ANTHROPIC_API_KEY.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SYSTEM = `You write the one-line note under the heading THIS WEEK on Fadi Badarni's GitHub profile. Fadi is a software engineer who builds websites and apps for businesses, and his own products and games.

You receive the projects he committed to in the last seven days, busiest first, with their commit subject lines. Client projects come without subject lines.

Write ONE sentence of 70 to 140 characters that says concretely what he worked on, busiest work first. Plain and specific, no hype.

Rules:
- Refer to projects only by the labels given. For a project without subject lines, describe the work with the words of its label (for example "booking work for Client B") and nothing more specific.
- Never name a person, company, client, city or venue, even when a commit subject does.
- No numbers, emoji, quotation marks, exclamation marks or praise words.
- Do not start with "This week" or with "Fadi".

The register to aim for: "Rail physics and a new landing for Sled, Set, Go!, booking work for Client B, and a calmer menu editor in Prime Menus."

Reply with the sentence only.`;

export function writeWeekLine({ rows, weekStart, privateWords, glyphs }) {
  const active = rows
    .map((row) => ({ row, n: row.counts.slice(weekStart).reduce((a, b) => a + b, 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (active.length === 0) return null;

  // "auto:" subjects come from an auto-commit hook and only name file paths.
  const input = active
    .map(({ row, n }) => {
      const head = `## ${row.label} (${n} hours with commits)`;
      if (!row.summarize) return `${head}\n(client work: subject lines withheld)`;
      const subjects = [
        ...new Set(
          row.commits.filter((c) => c.day >= weekStart && !/^auto:/i.test(c.subject)).map((c) => c.subject),
        ),
      ]
        .slice(0, 30)
        .map((s) => `- ${s.slice(0, 120)}`);
      return `${head}\n${subjects.length ? subjects.join("\n") : "(no descriptive subject lines)"}`;
    })
    .join("\n\n");

  const dir = mkdtempSync(join(tmpdir(), "ledger-"));
  try {
    const systemFile = join(dir, "system.txt");
    writeFileSync(systemFile, SYSTEM);
    // On Windows the CLI is an npm .cmd shim, which only runs through a shell.
    const win = process.platform === "win32";
    const args = [
      "-p",
      "--model", "sonnet",
      "--tools", win ? '""' : "",
      "--system-prompt-file", win ? `"${systemFile}"` : systemFile,
      "--no-session-persistence",
      "--output-format", "text",
    ];
    const res = spawnSync("claude", args, { input, encoding: "utf8", shell: win, timeout: 180_000 });
    if (res.status !== 0) {
      console.warn(`week line: claude exited with ${res.status}; keeping the previous line`);
      return null;
    }
    return check(res.stdout, privateWords, glyphs);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Rejects anything that could leak a client or break the drawing. Never logs the text
// itself: Actions logs of a public repository are public.
function check(raw, privateWords, glyphs) {
  let s = raw.trim().replace(/\s+/g, " ").replace(/^["“']+|["”']+$/g, "");
  if (s.length < 30 || s.length > 170) {
    console.warn(`week line: rejected, ${s.length} characters`);
    return null;
  }
  const hit = privateWords.some((w) => new RegExp(`(^|[^a-z])${escapeRe(w)}([^a-z]|$)`, "i").test(s));
  if (hit) {
    console.warn("week line: rejected, it contained a withheld word");
    return null;
  }
  return [...s].filter((ch) => ch in glyphs).join("");
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
