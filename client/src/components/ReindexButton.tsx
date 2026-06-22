'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Check, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from "sonner";
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocsStore } from '@/lib/docs-store';

interface ReindexButtonProps {
  owner: string;
  repo: string;
}

export function ReindexButton({ owner, repo }: ReindexButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'success' | 'error'>('idle');

  const handleReindex = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: `https://github.com/${owner}/${repo}`, force: true }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setStatus('idle');
        toast.error('Cooldown Active', {
          description: data.error || "Please try again later."
        });
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to start reindexing');

      toast.success('Reindexing Started', {
        description: "The pipeline is running in the background."
      });

      // Redirect to status page so user can watch it process
      router.push(`/${owner}/${repo}/status`);

    } catch (e: any) {
      setStatus('error');
      toast.error('Failed to start', { description: e.message });
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full gap-2"
      onClick={handleReindex}
      disabled={status === 'loading'}
    >
      {status === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> :
        status === 'error' ? <AlertCircle className="w-3 h-3 text-destructive" /> :
          <RefreshCw className="w-3 h-3" />}
      {status === 'loading' ? 'Queuing...' : 'Reindex'}
    </Button>
  );
}