import { Octokit } from '@octokit/rest';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 150);
  if (!query) return NextResponse.json({ items: [] });
  try {
    const octokit = new Octokit({ auth: process.env.GITHUB_SOURCE_TOKEN || undefined, request: { timeout: 10000 } });
    const { data } = await octokit.rest.search.repos({ q: `${query} is:public in:name,description`, per_page: 7 });
    return NextResponse.json({ items: data.items.filter(repo => !repo.private && repo.visibility === 'public').map(repo => ({ full_name: repo.full_name, description: repo.description || '', html_url: repo.html_url, stargazers_count: repo.stargazers_count, language: repo.language })) });
  } catch {
    return NextResponse.json({ error: 'Repository search is unavailable. You can still enter the full repository URL.', items: [] }, { status: 503 });
  }
}
