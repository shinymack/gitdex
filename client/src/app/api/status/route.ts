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
      `${apiUrl}/api/status?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
    );

    const text = await backendRes.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (e) {
      json = { indexed: false };
    }

    return NextResponse.json(json, { status: backendRes.status });
  } catch (error) {
    console.error('Error in status API route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}