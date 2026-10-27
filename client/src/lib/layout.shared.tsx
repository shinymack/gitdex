import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BrandMark } from '@/components/brand';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      enabled: true,
      title: <span className="inline-flex items-center gap-2.5 text-foreground"><BrandMark /><span className="font-headline text-2xl font-bold tracking-[-0.05em]">GitDex</span></span>,
    },
    searchToggle: { enabled: false },
    themeSwitch: { enabled: false },
  };
}
