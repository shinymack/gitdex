import Link from 'next/link';
import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn('h-8 w-8 shrink-0 text-primary', className)}>
      <g transform="translate(1 4) skewY(-12)" fill="currentColor">
        <rect x="2" y="3" width="27" height="5" rx="1" />
        <rect x="2" y="12" width="17" height="5" rx="1" />
        <rect x="2" y="21" width="27" height="5" rx="1" />
      </g>
    </svg>
  );
}

export function Brand({ className, tagline = false }: { className?: string; tagline?: boolean }) {
  return (
    <Link href="/" aria-label="GitDex home" className={cn('inline-flex items-center gap-2.5 rounded-sm text-foreground no-underline', className)}>
      <BrandMark />
      <span className="font-headline text-2xl font-bold tracking-[-0.05em]">GitDex</span>
      {tagline && <span className="ml-3 hidden border-l border-border pl-5 text-xs font-normal tracking-normal text-muted-foreground lg:inline">A field guide to your code.</span>}
    </Link>
  );
}
