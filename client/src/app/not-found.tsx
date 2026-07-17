import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[100dvh] px-6 text-center bg-background text-foreground">
      {/* Design Read: Custom 404 page for developers, minimalist dark-tech, using project variables */}
      
      <div className="max-w-md w-full space-y-6">
        <p className="font-mono text-sm tracking-[0.2em] text-muted-foreground uppercase">
          404 Error
        </p>

        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-none">
          Lost in the Code
        </h1>

        <p className="text-base text-muted-foreground leading-relaxed max-w-[45ch] mx-auto">
          The repository documentation page or directory path you requested does not exist or has been updated.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md text-sm font-semibold bg-foreground text-background hover:bg-foreground/90 transition-all active:scale-[0.98] gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Return Home
          </Link>
          <Link
            href="/shinymack/gitdex"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md text-sm font-semibold border border-border text-foreground hover:bg-accent transition-all active:scale-[0.98] gap-2"
          >
            <BookOpen className="w-4 h-4" />
            Browse Example
          </Link>
        </div>
      </div>
    </main>
  );
}
