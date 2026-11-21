// Turns raw commits into the drawing's rows: one per configured project. The measure is
// clock hours with commits, not commits: an auto-commit hook can land dozens of commits
// in one hour, and a commit count would read that as dozens of times the work.

export function dayKeyFn(timezone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return (date) => fmt.format(new Date(date));
}

export function hourKeyFn(timezone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  return (date) => fmt.format(new Date(date));
}

// The window: `n` calendar days ending today (YYYY-MM-DD strings).
export function windowDays(today, n = 365) {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 864e5).toISOString().slice(0, 10));
}

export function buildRows(config, repos, days, dayKey, hourKey) {
  const index = new Map(days.map((d, i) => [d, i]));
  const byId = new Map(repos.map((r) => [r.id, r]));
  const used = new Set();

  const make = (label, group, summarize, list) => {
    const hoursByDay = days.map(() => new Map()); // hour key -> commits in that hour
    const commits = [];
    for (const repo of list) {
      for (const c of repo.commits) {
        const i = index.get(dayKey(c.date));
        if (i === undefined) continue;
        const h = hourKey(c.date);
        hoursByDay[i].set(h, (hoursByDay[i].get(h) ?? 0) + 1);
        commits.push({ day: i, subject: c.subject });
      }
    }
    commits.sort((a, b) => b.day - a.day);
    const counts = hoursByDay.map((s) => s.size); // hours with commits, per day
    const total = counts.reduce((a, b) => a + b, 0);
    const created = list.map((r) => r.created).filter(Boolean).sort()[0] ?? null;
    const firstDay = counts.findIndex((n) => n > 0);
    return { label, group, summarize, counts, hoursByDay, commits, total, created, firstDay };
  };

  const rows = config.rows.map((row) => {
    const list = row.repos.map((id) => byId.get(id)).filter(Boolean);
    list.forEach((r) => used.add(r.id));
    return make(row.label, row.group, row.summarize, list);
  });

  // Repositories nobody has labelled yet: public ones keep their own name,
  // private ones are pooled under one anonymous row.
  const rest = repos.filter((r) => !used.has(r.id));
  for (const r of rest.filter((r) => !r.private)) rows.push(make(r.name, "other", true, [r]));
  const unnamed = rest.filter((r) => r.private);
  if (unnamed.length) rows.push(make("Other private projects", "other", false, unnamed));

  return rows.filter((r) => r.total > 0);
}

// One cell per (day, hour) with commits, coloured by the group that landed the most
// commits in it; ties go to the group listed first. Also counts each group's hours.
export function buildCells(rows, groupOrder) {
  const cells = new Map();
  for (const row of rows) {
    row.hoursByDay.forEach((hours, day) => {
      for (const [key, n] of hours) {
        const id = `${day}:${Number(key.slice(-2))}`;
        const groups = cells.get(id) ?? new Map();
        groups.set(row.group, (groups.get(row.group) ?? 0) + n);
        cells.set(id, groups);
      }
    });
  }
  const groupHours = Object.fromEntries(groupOrder.map((g) => [g, 0]));
  const out = [...cells].map(([id, groups]) => {
    const [day, hour] = id.split(":").map(Number);
    for (const g of groups.keys()) groupHours[g] += 1;
    const [group] = [...groups].sort(
      (a, b) => b[1] - a[1] || groupOrder.indexOf(a[0]) - groupOrder.indexOf(b[0]),
    )[0];
    return { day, hour, group };
  });
  return { cells: out, groupHours };
}
