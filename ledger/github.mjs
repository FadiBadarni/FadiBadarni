// Reads commit dates (and subject lines) from every repository the token's owner owns.
// Only the default branch is read, and nothing but dates and first lines leaves this module.

const API = "https://api.github.com";

export async function collectCommits({ token, since, skipRepo }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ledger",
  };

  // `tag` names what is being read without the repository name: Actions logs of a
  // public repository are public, and private repository names must not reach them.
  const page = async (url, tag) => {
    const res = await fetch(url, { headers });
    if (res.status === 409) return { items: [], next: null }; // empty repository
    if (!res.ok) throw new Error(`GitHub answered ${res.status} while reading ${tag}`);
    const link = res.headers.get("link") ?? "";
    const next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
    return { items: await res.json(), next };
  };

  const all = async (url, tag) => {
    const out = [];
    for (let u = url; u; ) {
      const { items, next } = await page(u, tag);
      out.push(...items);
      u = next;
    }
    return out;
  };

  const sinceIso = since.toISOString();
  const repos = (await all(`${API}/user/repos?affiliation=owner&per_page=100`, "the repository list")).filter(
    (r) => !r.fork && r.name !== skipRepo && r.pushed_at >= sinceIso,
  );

  const readRepo = async (r) => {
    const url =
      `${API}/repos/${r.full_name}/commits?per_page=100` +
      `&sha=${encodeURIComponent(r.default_branch)}&since=${sinceIso}`;
    const commits = (await all(url, `repository #${r.id}`))
      .filter((c) => c.author?.type !== "Bot" && !/\[bot\]/i.test(c.commit.author?.name ?? ""))
      .map((c) => ({ date: c.commit.author.date, subject: c.commit.message.split("\n")[0] }));
    return { id: r.id, name: r.name, private: r.private, commits };
  };

  // Six repositories at a time keeps well inside GitHub's secondary rate limits.
  const results = [];
  for (let i = 0; i < repos.length; i += 6) {
    results.push(...(await Promise.all(repos.slice(i, i + 6).map(readRepo))));
  }
  return results;
}
