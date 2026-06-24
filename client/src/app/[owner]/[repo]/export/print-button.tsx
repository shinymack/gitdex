'use client';

import { Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface PrintButtonProps {
  owner: string;
  repo: string;
  pageCount: number;
}

export function PrintButton({ owner, repo, pageCount }: PrintButtonProps) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 border-b bg-background sticky top-0 z-10 print:hidden">
      <Link
        href={`/${owner}/${repo}`}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to docs
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{pageCount} sections</span>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Printer className="h-4 w-4" />
          Save as PDF
        </button>
      </div>
    </div>
  );
}
