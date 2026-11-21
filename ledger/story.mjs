// Picks the moments of the year that get an annotation on the dial. Every one is
// computed from the same commit hours the dial draws.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (iso) => {
  const [, m, d] = iso.split("-");
  return `${+d} ${MONTHS[+m - 1]}`;
};

export function buildStory({ rows, cells, days, maxProjects = 4 }) {
  const N = days.length;
  const perDay = new Array(N).fill(0);
  for (const c of cells) perDay[c.day] += 1;
  const notes = [];

  const max = Math.max(...perDay);
  const busiest = perDay.indexOf(max);
  notes.push({ day: busiest, kicker: `Longest day · ${fmtDay(days[busiest])}`, headline: `${max} hours with commits` });

  // Longest run of consecutive days with commits.
  let best = { len: 0 };
  let start = -1;
  for (let i = 0; i <= N; i++) {
    if (i < N && perDay[i] > 0) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (i - start > best.len) best = { len: i - start, from: start, to: i - 1 };
      start = -1;
    }
  }
  if (best.len >= 7) {
    notes.push({
      day: best.to,
      run: [best.from, best.to],
      kicker: `Longest run · ${fmtDay(days[best.from])}–${fmtDay(days[best.to])}`,
      headline: `${best.len} days in a row`,
    });
  }

  // First commits of my own projects whose repositories were created inside the
  // window, so "first" is literally true. Client work is left out.
  rows
    .filter(
      (r) => r.group !== "clients" && !r.retired && r.created && r.created.slice(0, 10) > days[0] && r.firstDay >= 0,
    )
    .sort((a, b) => b.total - a.total)
    .slice(0, maxProjects)
    .forEach((r) =>
      notes.push({ day: r.firstDay, kicker: `First commits · ${fmtDay(days[r.firstDay])}`, headline: r.label }),
    );

  return notes;
}
