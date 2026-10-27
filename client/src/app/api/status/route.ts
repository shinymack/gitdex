import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!owner || !repo) {
      return NextResponse.json({ error: 'Missing owner or repo' }, { status: 400 });
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    const backendRes = await fetch(
      `${apiUrl}/api/status?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`,
      { cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(18000)]) }
    );

    const text = await backendRes.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json({ error: 'Repository status is unavailable.' }, { status: 503 });
    }

    return NextResponse.json(json, { status: backendRes.status });
  } catch (error) {
    console.error('Error in status API route:', error);
    return NextResponse.json({ error: 'Repository status is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}