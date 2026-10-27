import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Brand, BrandMark } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-7xl items-center px-6 py-7"><Brand /></header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center px-6 py-16">
        <div className="max-w-xl">
          <BrandMark className="mb-8 size-12" />
          <p className="mb-4 text-sm text-muted-foreground">Page not found</p>
          <h1 className="text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-6xl">This path ends here.</h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">This documentation page does not exist, or its address changed when the guide was updated. Open the repository again to find its current pages.</p>
          <Link href="/" className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"><ArrowLeft aria-hidden="true" className="size-4" />Find a repository</Link>
        </div>
      </main>
      <footer className="mx-auto flex w-full max-w-7xl items-center justify-between gap-5 border-t border-border px-6 py-6"><p className="text-xs text-muted-foreground">GitDex. A field guide to your code.</p><ThemeToggle /></footer>
    </div>
  );
}
