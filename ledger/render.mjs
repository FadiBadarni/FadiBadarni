// Draws the profile header: name and the week's line on top, and below them a dial of the
// last twelve months, annotated with the year's moments. Each mark on the dial is one clock
// hour in which commits landed. Around the dial runs the year, ending today; outward runs
// the hour of the day. On load a hand sweeps the year, the marks and notes appear behind
// it, and the centre counts the hours it has passed.

const W = 1000;
const CX = 500;
const R0 = 86; // 06:00
const R1 = 250; // 06:00 the next morning
const GAP = 14; // degrees left open at the top for the hour scale
const HOUR = (R1 - R0) / 24;
const NOTE_W = 196; // width of each annotation column

const DUR = 3.6;
const SWEEP_FROM = 0.03;
const SWEEP_SPAN = 0.85;

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
const f3 = (n) => n.toFixed(3);

export function renderLedger({ theme, fonts, groups, cells, groupHours, notes, days, weekText, stats }) {
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
  const textEl = (cls, x, y, s, { fill = c.ink, anchor, size, tracking, extra = "" } = {}) =>
    `<text class="${cls}" x="${f1(x)}" y="${f1(y)}" fill="${fill}"` +
    (size ? ` font-size="${size}"` : "") +
    (anchor ? ` text-anchor="${anchor}"` : "") +
    (tracking ? ` letter-spacing="${tracking}em"` : "") +
    `${extra}>${esc(s)}</text>`;
  const text = (...args) => out.push(textEl(...args));

  // When the sweeping hand reaches a given day, as a fraction of the animation.
  const at = (day) => SWEEP_FROM + SWEEP_SPAN * (day / N);
  const appear = (t) =>
    `<animate attributeName="opacity" values="0;0;1;1" keyTimes="0;${f3(t)};${f3(Math.min(1, t + 0.04))};1" dur="${DUR}s" fill="freeze"/>`;

  // ---- Header -------------------------------------------------------------------
  let y = 58;
  text("d", 0, y, "Fadi Badarni", { size: 54, tracking: -0.01 });
  y += 36;
  text("t", 0, y, "I build websites and apps for businesses. Sole engineer at Prime Systems since 2023.", { size: 19 });
  if (weekText) {
    y += 50;
    out.push(`<path d="M0 ${f1(y - 4)}h9" stroke="${c.ink}" stroke-width="2"/>`);
    text("m", 16, y, "THIS WEEK", { size: 10.5, fill: c.muted, tracking: 0.12 });
    y += 2;
    // Keep "Client A" on one line.
    for (const line of wrap("italic", 23, weekText.replace(/Client ([A-Z])\b/g, "Client $1"), W)) {
      y += 32;
      text("i", 0, y, line, { size: 23 });
    }
  }
  const CY = y + 76 + R1;

  // ---- Dial geometry --------------------------------------------------------------
  const angle = (day) => GAP / 2 + (day / N) * (360 - GAP);
  const pt = (r, a) => {
    const t = (a * Math.PI) / 180;
    return [CX + r * Math.sin(t), CY - r * Math.cos(t)];
  };
  const P = (r, a) => pt(r, a).map(f1).join(" ");
  const arc = (r, a0, a1) => `M${P(r, a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${P(r, a1)}`;
  const aStart = angle(0);
  const aEnd = angle(N);

  // Hour guides and scale
  const guides = [0, 6, 12, 18, 24].map((h) => R0 + h * HOUR);
  for (const r of guides) out.push(`<path d="${arc(r, aStart, aEnd)}" fill="none" stroke="${c.faint}" stroke-width="1"/>`);
  ["06", "12", "18", "00", "06"].forEach((label, i) =>
    text("m", CX, CY - guides[i] + 3.5, label, { size: 9, fill: c.muted, anchor: "middle" }),
  );

  // Months
  days.forEach((d, i) => {
    if (!d.endsWith("-01")) return;
    const [yy, mm] = d.split("-");
    const a = angle(i);
    out.push(`<path d="M${P(R1 + 13, a)}L${P(R1 + 18, a)}" stroke="${c.muted}" stroke-width="1"/>`);
    const [x, ly] = pt(R1 + 30, a);
    const s = Math.sin((a * Math.PI) / 180);
    const anchor = s > 0.25 ? "start" : s < -0.25 ? "end" : "middle";
    text("m", x, ly + 3.5, mm === "01" ? `Jan ${yy}` : MONTHS[+mm - 1], { size: 10.5, fill: c.muted, anchor });
  });

  // ---- The marks, revealed week by week ------------------------------------------
  const pad = 0.1 * ((360 - GAP) / N);
  const cell = ({ day, hour }) => {
    const a0 = angle(day) + pad;
    const a1 = angle(day + 1) - pad;
    const ra = R0 + hour * HOUR + 0.8;
    const rb = R0 + (hour + 1) * HOUR - 0.8;
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
    out.push(
      `<g>${appear(at(w * 7))}` +
        Object.entries(byGroup)
          .map(([g, d]) => `<path d="${d}" fill="${c.groups[g]}"/>`)
          .join("") +
        `</g>`,
    );
  }

  // This week, on the rim
  out.push(`<path d="${arc(R1 + 5, angle(N - 7), aEnd)}" fill="none" stroke="${c.ink}" stroke-width="2.5"/>`);

  // ---- Annotations ------------------------------------------------------------------
  const KICKER_SIZE = 10;
  const NOTE_SIZE = 16.5;
  const placed = notes.map((n) => {
    const a = angle(n.day + 0.5);
    const right = Math.sin((a * Math.PI) / 180) >= 0;
    const lines = wrap("text", NOTE_SIZE, n.headline, NOTE_W - 4);
    const height = 16 + lines.length * 21;
    const anchor = pt(R1 + 9, a);
    const elbow = pt(R1 + 46, a); // clear of the month labels before turning to the note
    return { ...n, a, right, lines, height, anchor, elbow, top: elbow[1] - 14 };
  });
  // Stack each column top to bottom without overlaps, staying beside the dial.
  for (const side of [true, false]) {
    const col = placed.filter((p) => p.right === side).sort((p, q) => p.top - q.top);
    let floor = CY - R1 - 20;
    for (const p of col) {
      p.top = Math.max(p.top, floor);
      floor = p.top + p.height + 18;
    }
    let ceiling = CY + R1 + 20;
    for (let i = col.length - 1; i >= 0; i--) {
      col[i].top = Math.min(col[i].top, ceiling - col[i].height);
      ceiling = col[i].top - 18;
    }
  }
  for (const p of placed) {
    const x = p.right ? W - NOTE_W : NOTE_W;
    const anchorText = p.right ? "start" : "end";
    const lead = p.right ? x - 10 : x + 10;
    const parts = [];
    if (p.run) {
      parts.push(
        `<path d="${arc(R1 + 9, angle(p.run[0]), angle(p.run[1] + 1))}" fill="none" stroke="${c.muted}" stroke-width="1.2"/>`,
      );
    }
    parts.push(
      `<circle cx="${f1(p.anchor[0])}" cy="${f1(p.anchor[1])}" r="2.2" fill="${c.ink}"/>`,
      `<path d="M${f1(p.anchor[0])} ${f1(p.anchor[1])}L${f1(p.elbow[0])} ${f1(p.elbow[1])}L${f1(lead)} ${f1(p.top + 9)}" stroke="${c.muted}" stroke-width="0.8" fill="none"/>`,
      textEl("m", x, p.top + 13, p.kicker.toUpperCase(), { size: KICKER_SIZE, fill: c.muted, anchor: anchorText, tracking: 0.08 }),
      ...p.lines.map((line, i) => textEl("t", x, p.top + 35 + i * 21, line, { size: NOTE_SIZE, anchor: anchorText })),
    );
    out.push(`<g>${appear(at((p.run ? p.run[1] : p.day) + 1))}${parts.join("")}</g>`);
  }

  // ---- The hand -----------------------------------------------------------------------
  const t1 = SWEEP_FROM + SWEEP_SPAN;
  out.push(
    `<path d="M${CX} ${f1(CY - R0 + 8)}V${f1(CY - R1 - 20)}" stroke="${c.ink}" stroke-width="1.2" transform="rotate(${f1(aEnd)} ${CX} ${f1(CY)})">` +
      `<animateTransform attributeName="transform" type="rotate" ` +
      `values="${f1(aStart)} ${CX} ${f1(CY)};${f1(aStart)} ${CX} ${f1(CY)};${f1(aEnd)} ${CX} ${f1(CY)};${f1(aEnd)} ${CX} ${f1(CY)}" ` +
      `keyTimes="0;${SWEEP_FROM};${f3(t1)};1" dur="${DUR}s" fill="freeze"/></path>`,
  );
  const [tx, ty] = pt(R1 + 30, aEnd);
  text("m", tx - 4, ty, "today", { size: 10.5, anchor: "end" });

  // ---- Centre: hours passed by the hand, week by week -----------------------------------
  const perWeek = [];
  for (const x of cells) {
    const w = Math.floor(x.day / 7);
    perWeek[w] = (perWeek[w] ?? 0) + 1;
  }
  const nWeeks = Math.ceil(N / 7);
  let running = 0;
  for (let w = 0; w < nWeeks; w++) {
    running += perWeek[w] ?? 0;
    const tw = at(w * 7);
    const last = w === nWeeks - 1;
    const anim = last
      ? `<animate attributeName="opacity" calcMode="discrete" values="0;1" keyTimes="0;${f3(tw)}" dur="${DUR}s" fill="freeze"/>`
      : `<animate attributeName="opacity" calcMode="discrete" values="0;1;0" keyTimes="0;${f3(tw)};${f3(at((w + 1) * 7))}" dur="${DUR}s" fill="freeze"/>`;
    out.push(
      textEl("d", CX, CY + 8, fmt(running), {
        size: 42,
        anchor: "middle",
        extra: last ? "" : ` opacity="0"`,
      }).replace("</text>", `${anim}</text>`),
    );
  }
  text("m", CX, CY + 28, "hours with commits", { size: 9.5, fill: c.muted, anchor: "middle" });

  // ---- Legend and note -------------------------------------------------------------------
  y = CY + R1 + 76;
  let x = 0;
  for (const g of groups) {
    if (!groupHours[g.id]) continue;
    out.push(`<rect x="${f1(x)}" y="${f1(y - 9)}" width="9" height="9" fill="${c.groups[g.id]}"/>`);
    text("m", x + 16, y, g.title, { size: 12 });
    const hx = x + 16 + measure("mono", 12, g.title) + 10;
    const hours = `${fmt(groupHours[g.id])} h`;
    text("m", hx, y, hours, { size: 12, fill: c.muted });
    x = hx + measure("mono", 12, hours) + 34;
  }
  y += 28;
  text("m", 0, y, `Last twelve months  ·  ${stats.activeDays} days with commits  ·  ${stats.repos} repositories`, {
    size: 11.5,
    fill: c.muted,
  });
  y += 24;
  const note =
    "Each mark is one clock hour in which commits landed on a main branch. Around the dial: the last twelve months, " +
    "ending today. Outward: the hour of the day, from 06:00 at the centre to 06:00 next morning. Notes and figures are " +
    "computed from the same data. Redrawn every night.";
  for (const line of wrap("mono", 10.5, note, W)) {
    text("m", 0, y, line, { size: 10.5, fill: c.muted });
    y += 16;
  }

  // ---- Assemble -------------------------------------------------------------------------
  const H = Math.ceil(y + 4);
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
    `${fmt(stats.hours)} clock hours in which commits landed, across ${stats.repos} repositories. ` +
    notes.map((n) => `${n.kicker}: ${n.headline}`).join(". ");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(summary)}">` +
    `<style>${style}</style>${out.join("")}</svg>\n`
  );
}
