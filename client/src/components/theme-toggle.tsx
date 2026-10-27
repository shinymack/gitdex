'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = !mounted || resolvedTheme !== 'light';
  const label = isDark ? 'Light mode' : 'Dark mode';

  return (
    <button type="button" onClick={() => setTheme(isDark ? 'light' : 'dark')} aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`} className={cn('inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-transparent px-3 py-2 text-xs font-medium text-foreground hover:border-primary', className)}>
      {isDark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
      <span>{label}</span>
    </button>
  );
}
