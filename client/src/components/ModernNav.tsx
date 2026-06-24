'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Github, Sun, Moon, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ModernNav() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Render skeleton to avoid layout shift
    return (
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] md:w-[85%] lg:w-[68%] rounded-full border border-border/20 bg-background/30 backdrop-blur-md h-[54px] shadow-sm" />
    );
  }

  return (
    <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] md:w-[85%] lg:w-[68%] rounded-full border border-border/25 bg-background/45 backdrop-blur-md shadow-lg transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-primary/20">
      <div className="px-5 py-2.5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-sm font-bold tracking-tight text-foreground transition-colors group-hover:text-primary font-headline">
            GitDex
          </span>
        </Link>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {/* GitHub link (desktop) */}
          <a
            href="https://github.com/shinymack/gitdex"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center"
          >
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Github className="w-4 h-4" />
            </Button>
          </a>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all active:scale-95"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-500 transition-transform rotate-0 scale-100" />
            ) : (
              <Moon className="w-4 h-4 text-blue-600 transition-transform rotate-0 scale-100" />
            )}
          </Button>

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden w-8 h-8 rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border/20 bg-background/90 backdrop-blur-xl rounded-b-3xl">
          <div className="px-5 py-4 flex flex-col gap-3">
            <a
              href="https://github.com/shinymack/gitdex"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors"
            >
              <Github className="w-4.5 h-4.5" />
              <span>GitHub Repository</span>
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
