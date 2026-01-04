import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

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
    <div className="font-serif">
      {props.children ? (
        props.children
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
        </div>
      )}
      <AssistantModal owner={params.owner} repo={params.repo} />
    </div>
  );
}
