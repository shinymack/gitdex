import { Loader2, FileDown } from 'lucide-react';
import type { ReactNode } from 'react';
import Link from 'next/link';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

import { AssistantModal } from '@/components/assistant-ui/assistant-modal';

export default async function Layout(props: LayoutProps) {
  const params = await props.params;

  return (
    <div className="font-sans">
      {props.children ? (
        props.children
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
        </div>
      )}
      <AssistantModal owner={params.owner} repo={params.repo} />
      <Link
        href={`/${params.owner}/${params.repo}/export`}
        title="Export as PDF"
        className="fixed bottom-[4.5rem] right-6 z-40 flex items-center gap-2 px-3 py-2 rounded-full bg-background border border-border shadow-md text-xs font-medium text-muted-foreground hover:text-foreground hover:shadow-lg transition-all duration-200 print:hidden"
      >
        <FileDown className="h-3.5 w-3.5" />
        Export PDF
      </Link>
    </div>
  );
}
