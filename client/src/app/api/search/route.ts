import { Octokit } from '@octokit/rest';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 150);
  if (!query) return NextResponse.json({ items: [] });
  try {
    const auth = process.env.GITHUB_SOURCE_TOKEN || process.env.GITHUB_TOKEN || undefined;
    const octokit = new Octokit({ auth, request: { timeout: 10000 } });
    const { data } = await octokit.rest.search.repos({ q: `${query} is:public in:name,description`, per_page: 7 });
    const items = data.items.filter(repo => !repo.private && repo.visibility === 'public').map(repo => ({
      full_name: repo.full_name,
      description: repo.description || '',
      html_url: repo.html_url,
      stargazers_count: repo.stargazers_count,
      language: repo.language
    }));
    return NextResponse.json({ items }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
    });
  } catch (error) {
    console.warn('[Search] GitHub search failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Repository search is unavailable. You can still enter the full repository URL.', items: [] }, { status: 503 });
  }
}
