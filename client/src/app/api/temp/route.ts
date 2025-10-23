import { NextResponse } from 'next/server';
import { serialize } from 'next-mdx-remote/serialize';

// Mark this as a Server-only module
import 'server-only';

export async function GET() {
  const { promises: fs } = await import('fs');
  const path = await import('path');

  const mdxFilePath = path.join(process.cwd(), 'temp.mdx');
  try {
    const mdxSource = await fs.readFile(mdxFilePath, 'utf8');
    const mdxSerialized = await serialize(mdxSource, { scope: {} });
    return NextResponse.json({ source: mdxSerialized });
  } catch (error) {
    console.error('Error processing MDX:', error);
    return NextResponse.json({ error: 'Failed to load MDX content' }, { status: 500 });
  }
}