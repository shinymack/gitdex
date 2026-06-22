import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Link from 'fumadocs-core/link';
import { redirect } from 'next/navigation';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      enabled: true,
      title: (
        <div className="flex items-center text-foreground hover:text-primary transition-colors">
          <span className="font-bold">GitDex</span>
        </div>
      ),
    },
  };
}