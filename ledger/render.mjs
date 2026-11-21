// Draws the profile header: name and the week's line on the left, and a dial of the last
// twelve months on the right. Each mark on the dial is one clock hour in which commits
// landed. Around the dial runs the year, ending today; outward runs the hour of the day.

const W = 1000;
const COL = 360; // text column width
const CX = 690;
const CY = 316;
const R0 = 82; // 06:00
const R1 = 268; // 06:00 the next morning
const GAP = 14; // degrees left open at the top for the hour scale
const HOUR = (R1 - R0) / 24;

const THEMES = {
  dark: {
    ink: "#ece6dc",
    muted: "#8f8a81",
    faint: "#23252a",
    groups: { clients: "#e0a84e", products: "#ece6dc", games: "#e2674b", tools: "#86b3ab", other: "#77726b" },
  },
  light: {
    ink: "#1f1d1a",
    muted: "#6a655d",
    faint: "#ece7de",
    groups: { clients: "#b7791f", products: "#1f1d1a", games: "#c4452c", tools: "#4f7f78", other: "#9a958d" },
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n) => n.toLocaleString("en-US");
const f1 = (n) => n.toFixed(1);

export function renderLedger({ theme, fonts, groups, cells, groupHours, days, weekText, stats }) {
  const c = THEMES[theme];
  const N = days.length;
  const out = [];

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
  const text = (cls, x, y, s, { fill = c.ink, anchor, size, tracking } = {}) =>
    out.push(
      `<text class="${cls}" x="${typeof x === "number" ? f1(x) : x}" y="${typeof y === "number" ? f1(y) : y}" fill="${fill}"` +
        (size ? ` font-size="${size}"` : "") +
        (anchor ? ` text-anchor="${anchor}"` : "") +
        (tracking ? ` letter-spacing="${tracking}em"` : "") +
        `>${esc(s)}</text>`,
    );

  // Polar geometry: angle in degrees clockwise from the top.
  const angle = (day) => GAP / 2 + (day / N) * (360 - GAP);
  const pt = (r, a) => {
    const t = (a * Math.PI) / 180;
    return [CX + r * Math.sin(t), CY - r * Math.cos(t)];
  };
  const P = (r, a) => pt(r, a).map(f1).join(" ");
  const arc = (r, a0, a1) =>
    `M${P(r, a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${P(r, a1)}`;

  // ---- Left column ------------------------------------------------------------
  let y = 56;
  text("d", 0, y, "Fadi Badarni", { size: 50, tracking: -0.01 });
  y += 8;
  for (const line of wrap("text", 18, "I build websites and apps for businesses. Sole engineer at Prime Systems since 2023.", COL)) {
    y += 26;
    text("t", 0, y, line, { size: 18 });
  }

  if (weekText) {
    y += 46;
    out.push(`<path d="M0 ${f1(y - 4)}h9" stroke="${c.ink}" stroke-width="2"/>`);
    text("m", 16, y, "THIS WEEK", { size: 10.5, fill: c.muted, tracking: 0.12 });
    y += 4;
    for (const line of wrap("italic", 20, weekText, COL)) {
      y += 27;
      text("i", 0, y, line, { size: 20 });
    }
  }

  y += 42;
  for (const g of groups) {
    if (!groupHours[g.id]) continue;
    out.push(`<rect x="0" y="${f1(y - 9)}" width="9" height="9" fill="${c.groups[g.id]}"/>`);
    text("m", 18, y, g.title, { size: 12 });
    text("m", COL, y, `${fmt(groupHours[g.id])} h`, { size: 12, anchor: "end", fill: c.muted });
    y += 22;
  }
  y += 4;
  text("m", 0, y, `${stats.activeDays} days with commits  ·  ${stats.repos} repositories`, { size: 11.5, fill: c.muted });

  y += 34;
  const note =
    "Each mark is one clock hour in which commits landed on a main branch. Around the dial: the last twelve months, " +
    "ending today. Outward: the hour of the day, from 06:00 at the centre to 06:00 next morning. Redrawn every night.";
  for (const line of wrap("mono", 10.5, note, COL)) {
    text("m", 0, y, line, { size: 10.5, fill: c.muted });
    y += 16;
  }
  const leftBottom = y;

  // ---- Dial: guides -----------------------------------------------------------
  const aStart = angle(0);
  const aEnd = angle(N);
  const guides = [0, 6, 12, 18, 24].map((h) => R0 + h * HOUR);
  for (const r of guides) {
    out.push(`<path d="${arc(r, aStart, aEnd)}" fill="none" stroke="${c.faint}" stroke-width="1"/>`);
  }
  ["06", "12", "18", "00", "06"].forEach((label, i) =>
    text("m", CX, CY - guides[i] + 3.5, label, { size: 9, fill: c.muted, anchor: "middle" }),
  );

  // Months around the outside
  days.forEach((d, i) => {
    if (!d.endsWith("-01")) return;
    const [yy, mm] = d.split("-");
    const a = angle(i);
    out.push(`<path d="M${P(R1 + 4, a)}L${P(R1 + 10, a)}" stroke="${c.muted}" stroke-width="1"/>`);
    const [x, ly] = pt(R1 + 22, a);
    const s = Math.sin((a * Math.PI) / 180);
    const anchor = s > 0.25 ? "start" : s < -0.25 ? "end" : "middle";
    text("m", x, ly + 3.5, mm === "01" ? `Jan ${yy}` : MONTHS[+mm - 1], { size: 10.5, fill: c.muted, anchor });
  });

  // ---- Dial: the marks, revealed week by week behind a sweeping hand ----------
  const DUR = 3;
  const SWEEP_FROM = 0.03;
  const SWEEP_SPAN = 0.85;
  const pad = 0.1 * ((360 - GAP) / N);
  const cell = ({ day, hour }) => {
    const a0 = angle(day) + pad;
    const a1 = angle(day + 1) - pad;
    const ra = R0 + hour * HOUR + 0.9;
    const rb = R0 + (hour + 1) * HOUR - 0.9;
    return `M${P(rb, a0)}L${P(rb, a1)}L${P(ra, a1)}L${P(ra, a0)}Z`;
  };
  const weeks = new Map();
  for (const x of cells) {
    const w = Math.floor(x.day / 7);
    if (!weeks.has(w)) weeks.set(w, {});
    const byGroup = weeks.get(w);
    byGroup[x.group] = (byGroup[x.group] ?? "") + cell(x);
  }
  for (const [w, byGroup] of [...weeks].sort((a, b) => a[0] - b[0])) {
    const t = SWEEP_FROM + SWEEP_SPAN * ((w * 7) / N);
    const t2 = Math.min(1, t + 0.04);
    out.push(
      `<g><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;${t.toFixed(3)};${t2.toFixed(3)};1" dur="${DUR}s" fill="freeze"/>` +
        Object.entries(byGroup)
          .map(([g, d]) => `<path d="${d}" fill="${c.groups[g]}"/>`)
          .join("") +
        `</g>`,
    );
  }

  // This week, on the rim
  out.push(
    `<path d="${arc(R1 + 4, angle(N - 7), aEnd)}" fill="none" stroke="${c.ink}" stroke-width="2"/>`,
  );

  // The hand: sweeps from the oldest day to today, and rests on today.
  const t0 = SWEEP_FROM;
  const t1 = SWEEP_FROM + SWEEP_SPAN;
  out.push(
    `<path d="M${CX} ${CY - R0 + 8}V${CY - R1 - 14}" stroke="${c.ink}" stroke-width="1.2" transform="rotate(${f1(aEnd)} ${CX} ${CY})">` +
      `<animateTransform attributeName="transform" type="rotate" ` +
      `values="${f1(aStart)} ${CX} ${CY};${f1(aStart)} ${CX} ${CY};${f1(aEnd)} ${CX} ${CY};${f1(aEnd)} ${CX} ${CY}" ` +
      `keyTimes="0;${t0};${t1.toFixed(3)};1" dur="${DUR}s" fill="freeze"/></path>`,
  );
  const [tx, ty] = pt(R1 + 24, aEnd);
  text("m", tx - 4, ty, "today", { size: 10.5, anchor: "end" });

  // Centre
  text("d", CX, CY + 6, fmt(stats.hours), { size: 38, anchor: "middle" });
  text("m", CX, CY + 26, "hours with commits", { size: 9.5, fill: c.muted, anchor: "middle" });

  // ---- Assemble -----------------------------------------------------------------
  const H = Math.ceil(Math.max(CY + R1 + 40, leftBottom + 4));
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
    `Fadi Badarni. I build websites and apps for businesses. A dial of the last twelve months: ` +
    `${fmt(stats.hours)} clock hours in which commits landed, across ${stats.repos} repositories.`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(summary)}">` +
    `<style>${style}</style>${out.join("")}</svg>\n`
  );
}
