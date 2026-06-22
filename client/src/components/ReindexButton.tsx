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

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ReindexButton({ owner, repo }: ReindexButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'success' | 'error'>('idle');
  const [lastIndexed, setLastIndexed] = useState<number | null>(null);

  useEffect(() => {
    async function fetchLastIndexed() {
      try {
        const res = await fetch(`/api/status?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.lastIndexed) {
            setLastIndexed(data.lastIndexed);
          }
          if (data.job?.state === 'processing' || data.job?.state === 'queued') {
            const msg = data.job.state === 'queued' ? 'Queued for reindex' : 'Reindexing in progress';
            toast.info(msg, { description: `${owner}/${repo} is being updated in the background.` });
          }
        }
      } catch (e) {
        console.error('Failed to fetch last indexed time', e);
      }
    }
    fetchLastIndexed();
  }, [owner, repo]);

  const handleReindex = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: `https://github.com/${owner}/${repo}`, force: false }),
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

      if (!data.newlyStarted) {
        setStatus('idle');
        const msg = data.status === 'queued' ? 'Queued for reindex' : 'Reindexing in progress';
        toast.info(msg, { description: `${owner}/${repo} is being updated in the background.` });
        return;
      }

      toast.success('Reindexing Started', {
        description: "The pipeline is running in the background."
      });

      router.push(`/${owner}/${repo}/status`);

    } catch (e: any) {
      setStatus('error');
      toast.error('Failed to start', { description: e.message });
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
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
      {lastIndexed && (
        <span className="text-[10px] text-muted-foreground text-center">
          Last indexed {formatRelativeTime(lastIndexed)}
        </span>
      )}
    </div>
  );
}