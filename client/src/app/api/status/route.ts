import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');

    if (!owner || !repo) {
      return NextResponse.json({ error: 'Missing owner or repo' }, { status: 400 });
    }

    // Forward the request to your backend status endpoint (name-based)
    const backendRes = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/status?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
    );

    // If backend returned non-JSON or empty body, handle gracefully
    const text = await backendRes.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (e) {
      // Backend returned non-JSON - treat as not indexed
      json = { indexed: false };
    }

    return NextResponse.json(json, { status: backendRes.status });
  } catch (error) {
    console.error('Error in status API route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}