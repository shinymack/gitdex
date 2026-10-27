import { NextResponse } from 'next/server';
import { DynamicDocsSource } from '@/lib/dynamic-source';
import { searchDocumentation } from '@/lib/docs-search';
import { parseGitHubRepository } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let repository;
  try {
    const owner = params.get('owner');
    const repo = params.get('repo');
    if (!owner || !repo) throw new Error('Choose a repository to search.');
    repository = parseGitHubRepository(`${owner}/${repo}`);
  } catch {
    return NextResponse.json({ error: 'A valid GitHub owner and repository are required.' }, { status: 400 });
  }
  const query = (params.get('q') ?? '').trim();
  if (query.length > 200) return NextResponse.json({ error: 'Keep search queries under 200 characters.' }, { status: 400 });
  const { owner, repo } = repository;
  if (!query) return NextResponse.json({ owner, repo, results: [] });
  try {
    const source = new DynamicDocsSource(owner, repo);
    await source.initialize();
    return NextResponse.json({ owner, repo, revision: source.commitSha, results: searchDocumentation(owner, repo, source, query) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Documentation search is unavailable. Try again shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
