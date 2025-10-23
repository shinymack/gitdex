import { Octokit } from '@octokit/rest';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();

  if (!q) {
    return NextResponse.json({ items: [] });
  }

  try {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    // Fetch a larger page from GitHub, then do a lightweight filter to improve
    // partial-name matches (helps when typing only part of a repo name).
    const res = await octokit.request('GET /search/repositories', {
      q: `${q} in:name,description`,
      per_page: 50,
    });

    const qLower = q.toLowerCase();
    const items = (res.data.items || [])
      .filter((repo: any) => {
        if (!repo) return false;
        const name = (repo.name || '').toLowerCase();
        const full = (repo.full_name || '').toLowerCase();
        const desc = (repo.description || '').toLowerCase();
        return full.includes(qLower) || name.includes(qLower) || desc.includes(qLower);
      })
      .slice(0, 7);

    return NextResponse.json({ items });
  } catch (err) {
    console.error('Octokit search error:', err);
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
