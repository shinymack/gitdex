'use client';

import { useState, useEffect } from 'react';
import { Github, BookOpen, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/src/components/ui/button';

export function FloatingNav() {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <nav
      className={`
        fixed top-4 left-1/2 -translate-x-1/2 z-50
        w-[90%] md:w-[80%] lg:w-[70%]
        rounded-2xl border border-border/40
        bg-background/50 backdrop-blur-[5px]
        shadow-md
        transition-all duration-300
      `}
    >
      <div className="px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">GitDex</span>
        </Link>

        <div className="flex items-center gap-4">
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            {/* <Link href="/docs">
              <Button variant="ghost" size="sm" className="gap-2">
                <BookOpen className="w-4 h-4" />
                <span>Docs</span>
              </Button>
            </Link> */}

            <a
              href="https://github.com/shinymack/gitdex"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" size="sm">
                <Github className="w-4 h-4" />
              </Button>
            </a>

            {/* <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button> */}
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/80 backdrop-blur-lg rounded-b-2xl">
          <div className="px-4 py-3 flex flex-col gap-3">
            {/* <Link href="/docs" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                <BookOpen className="w-4 h-4" />
                <span>Docs</span>
              </Button>
            </Link> */}

            {/* <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTheme(theme === 'dark' ? 'light' : 'dark');
                setMobileMenuOpen(false);
              }}
              className="w-full justify-start gap-2"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </Button> */}

            <a
              href="https://github.com/shinymack/gitdex"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                <Github className="w-4 h-4" />
                <span>GitHub</span>
              </Button>
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
