// client/src/app/api/index/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repoUrl } = body;
    
    if (!repoUrl) {
      return NextResponse.json({ error: 'Repo URL is required' }, { status: 400 });
    }
    
    // Forward the request to your backend
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/index`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ repoUrl }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in API route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}