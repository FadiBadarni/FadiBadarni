// Draws the ledger as SVG: a title, the week's line, then one row per project with one
// tick per day that had commits. Everything drawn is a count read from GitHub.

const W = 1000;
const PLOT_X0 = 232;
const PLOT_X1 = 932;
const ROW_H = 22;
const TICK_MIN = 2.5;
const TICK_MAX = 15;

const THEMES = {
  dark: { ink: "#e8e3da", muted: "#8f8a81", faint: "#2c2a27", accent: "#e3a857", band: 0.1 },
  light: { ink: "#1f1d1a", muted: "#6a655d", faint: "#e6e1d8", accent: "#b0620f", band: 0.07 },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmt = (n) => n.toLocaleString("en-US");

export function renderLedger({ theme, fonts, groups, rows, days, weekStart, weekText, stats }) {
  const c = THEMES[theme];
  const measure = (face, size, text, tracking = 0) => {
    let sum = 0;
    for (const ch of text) sum += (fonts[face].widths[ch] ?? 0.55) + tracking;
    return sum * size;
  };
  const wrap = (face, size, text, max) => {
    const lines = [];
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(face, size, next) > max) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };

  const out = [];
  const text = (cls, x, y, s, { fill = c.ink, anchor, size, tracking } = {}) =>
    out.push(
      `<text class="${cls}" x="${x}" y="${y}" fill="${fill}"` +
        (size ? ` font-size="${size}"` : "") +
        (anchor ? ` text-anchor="${anchor}"` : "") +
        (tracking ? ` letter-spacing="${tracking}em"` : "") +
        `>${esc(s)}</text>`,
    );
  const rule = (x1, x2, y, color = c.faint) =>
    out.push(`<path d="M${x1} ${y}H${x2}" stroke="${color}" stroke-width="1"/>`);

  // Title
  let y = 52;
  text("d", 0, y, "Fadi Badarni", { size: 52, tracking: -0.01 });
  y += 38;
  text("t", 0, y, "I build websites and apps for businesses. Sole engineer at Prime Systems since 2023.", {
    size: 19,
  });

  // This week
  if (weekText) {
    y += 52;
    out.push(`<rect x="0" y="${y - 8}" width="7" height="7" fill="${c.accent}"/>`);
    text("m", 15, y, "THIS WEEK", { size: 11, fill: c.muted, tracking: 0.12 });
    for (const line of wrap("italic", 21, weekText, W)) {
      y += 30;
      text("i", 0, y, line, { size: 21 });
    }
  }

  // Totals
  y += 50;
  text(
    "m",
    0,
    y,
    `Last 12 months  ·  ${fmt(stats.hours)} hours with commits  ·  ${stats.activeDays} days  ·  ${stats.repos} repositories`,
    { size: 12, fill: c.muted },
  );

  // Ledger
  const step = (PLOT_X1 - PLOT_X0) / days.length;
  const maxDay = Math.max(...rows.flatMap((r) => r.counts));
  const tick = (n) => TICK_MIN + ((TICK_MAX - TICK_MIN) * (n - 1)) / Math.max(1, maxDay - 1);
  const ticksPath = (counts, from, to) => {
    let d = "";
    for (let i = from; i < to; i++) {
      if (!counts[i]) continue;
      const x = (PLOT_X0 + (i + 0.5) * step).toFixed(2);
      d += `M${x} ${rowBase}v-${tick(counts[i]).toFixed(2)}`;
    }
    return d;
  };

  const ledgerTop = y + 22;
  const body = [];
  let rowBase = 0;
  y = ledgerTop;
  let first = true;
  for (const g of groups) {
    const members = rows.filter((r) => r.group === g.id).sort((a, b) => b.total - a.total);
    if (members.length === 0) continue;
    y += first ? 14 : 30;
    const title = g.title.toUpperCase();
    text("m", 0, y, title, { size: 10.5, fill: c.muted, tracking: 0.1 });
    const ruleStart = measure("mono", 10.5, title, 0.1) + 12;
    let ruleEnd = W;
    if (first) {
      text("m", W, y, "HOURS", { size: 10.5, fill: c.muted, tracking: 0.1, anchor: "end" });
      ruleEnd = W - measure("mono", 10.5, "HOURS", 0.1) - 12;
    }
    rule(ruleStart, ruleEnd, y - 3.5);
    first = false;
    y += 4;
    for (const r of members) {
      y += ROW_H;
      rowBase = y;
      text("m", 0, y, r.label, { size: 12 });
      text("m", W, y, fmt(r.total), { size: 12, anchor: "end" });
      body.push(`<path d="M${PLOT_X0} ${y + 0.5}H${PLOT_X1}" stroke="${c.faint}" stroke-width="1"/>`);
      const past = ticksPath(r.counts, 0, weekStart);
      const recent = ticksPath(r.counts, weekStart, days.length);
      if (past) body.push(`<path d="${past}" stroke="${c.ink}" stroke-width="1.3"/>`);
      if (recent) body.push(`<path d="${recent}" stroke="${c.accent}" stroke-width="1.3"/>`);
    }
  }
  const ledgerBottom = y + 6;

  // The last seven days, the period the line above describes.
  const bandX = PLOT_X0 + weekStart * step;
  out.push(
    `<rect x="${bandX.toFixed(2)}" y="${ledgerTop}" width="${(PLOT_X1 - bandX).toFixed(2)}" ` +
      `height="${ledgerBottom - ledgerTop}" fill="${c.accent}" fill-opacity="${c.band}">` +
      `<animate attributeName="opacity" values="0;0;1" keyTimes="0;0.8;1" dur="2.6s" fill="freeze"/></rect>`,
  );

  // Rows draw in from left to right, once, when the page opens. Without SMIL the
  // rect's own width applies and everything shows at once.
  const plotW = PLOT_X1 - PLOT_X0 + 2;
  out.push(
    `<clipPath id="reveal"><rect x="${PLOT_X0 - 1}" y="${ledgerTop}" width="${plotW}" height="${ledgerBottom - ledgerTop}">` +
      `<animate attributeName="width" values="0;${plotW}" dur="2.2s" calcMode="spline" keyTimes="0;1" ` +
      `keySplines="0.3 0.1 0.2 1" fill="freeze"/></rect></clipPath>`,
    `<g clip-path="url(#reveal)" stroke-linecap="butt" fill="none">${body.join("")}</g>`,
  );

  // Month axis
  y = ledgerBottom + 12;
  rule(PLOT_X0, PLOT_X1, y - 9);
  days.forEach((d, i) => {
    if (!d.endsWith("-01")) return;
    const [yy, mm] = d.split("-");
    const x = PLOT_X0 + i * step;
    out.push(`<path d="M${x.toFixed(2)} ${y - 9}v4" stroke="${c.muted}" stroke-width="1"/>`);
    const label = mm === "01" ? `${MONTHS[0]} ${yy}` : MONTHS[+mm - 1];
    text("m", x.toFixed(2), y + 5, label, { size: 10.5, fill: c.muted });
  });

  // Legend: what a tick means, drawn with real ticks at the real scale.
  y += 46;
  const mid = Math.max(2, Math.round(maxDay / 2));
  let x = 0;
  for (const [n, label] of [
    [1, "1"],
    [mid, String(mid)],
    [maxDay, `${maxDay} hours with commits in a day`],
  ]) {
    out.push(`<path d="M${x + 1} ${y}v-${tick(n).toFixed(2)}" stroke="${c.ink}" stroke-width="1.3"/>`);
    text("m", x + 8, y, label, { size: 11, fill: c.muted });
    x += 8 + measure("mono", 11, label) + 20;
  }
  out.push(`<rect x="${x}" y="${y - 7}" width="7" height="7" fill="${c.accent}"/>`);
  text("m", x + 13, y, "last 7 days", { size: 11, fill: c.muted });
  y += 22;
  text(
    "m",
    0,
    y,
    "One tick per day with commits to a project's main branch; its height counts the clock hours in which they landed. Redrawn nightly.",
    { size: 11, fill: c.muted },
  );

  const H = Math.ceil(y + 10);
  const face = (name, file, style = "normal") =>
    `@font-face{font-family:L-${name};font-style:${style};src:url(data:font/woff2;base64,${fonts[file].woff2}) format("woff2")}`;
  const style =
    face("display", "display") +
    face("text", "text") +
    face("italic", "italic", "italic") +
    face("mono", "mono") +
    `.d{font-family:L-display,Georgia,serif}.t{font-family:L-text,Georgia,serif}` +
    `.i{font-family:L-italic,Georgia,serif;font-style:italic}.m{font-family:L-mono,ui-monospace,monospace}`;

  const summary =
    `Fadi Badarni. I build websites and apps for businesses. ` +
    `${fmt(stats.hours)} hours with commits across ${stats.repos} repositories in the last 12 months, one row per project.`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(summary)}">` +
    `<style>${style}</style>${out.join("")}</svg>\n`
  );
}
