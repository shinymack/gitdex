import { NextResponse } from 'next/server';
import { z } from 'zod';

const indexRequest = z.object({
  repoUrl: z.string().min(1).max(300),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = indexRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Provide a repository URL and a boolean refresh flag.' }, { status: 400 });
    }
    const { repoUrl, force = false } = parsed.data;
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl, force }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(18000)]),
    });
    
    const data = await response.json();
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error in API route:', error);
    return NextResponse.json({ error: 'Indexing is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}