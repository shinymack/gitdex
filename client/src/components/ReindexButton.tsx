'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Check, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from "sonner";
import { Button } from '@/src/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDocsStore } from '@/lib/docs-store';

interface ReindexButtonProps {
  owner: string;
  repo: string;
}

export function ReindexButton({ owner, repo }: ReindexButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'processing' | 'success' | 'cooldown' | 'error'>('idle');
  const [nextAvailable, setNextAvailable] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Initial check for cooldown status without triggering reindex
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/status?owner=${owner}&repo=${repo}`);
        const data = await res.json();
        if (data.job && data.job.status === 'cooldown') {
          setStatus('cooldown');
          setNextAvailable(data.job.nextAvailable);
        }
      } catch (e) {
        // ignore
      }
    };
    checkStatus();
  }, [owner, repo]);

  const handleReindex = async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: `https://github.com/${owner}/${repo}`, force: true }),
      });

      if (res.status === 429) {
        const data = await res.json();
        setStatus('cooldown');
        setErrorMsg(data.error);
        toast.error('Reindexing Rate Limited', {
          description: "Please try again later. Cooldown is active."
        });
        return;
      }

      if (!res.ok) throw new Error('Failed to start reindexing');

      toast.info('Reindexing Started', {
        description: "This may take a few minutes..."
      });

      const data = await res.json();
      const jobId = data.jobId;

      toast.info('Reindexing Started', {
        description: "This may take a few minutes..."
      });

      // Now poll for completion of THIS specific job
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/status/${jobId}`);
          const jobData = await statusRes.json();

          if (jobData.status === 'completed') {
            clearInterval(pollInterval);

            // Clear local cache to ensure fresh data fetch
            useDocsStore.getState().clearCacheFor(owner, repo);

            setStatus('success');
            toast.success('Reindexing Complete', {
              description: "The documentation has been updated."
            });
            // Refresh the current page to show new content
            router.refresh();
            setTimeout(() => setStatus('idle'), 2000);
          } else if (jobData.status === 'failed') {
            clearInterval(pollInterval);
            setStatus('error');
            toast.error('Reindexing Failed', {
              description: jobData.error || "An unknown error occurred."
            });
            setTimeout(() => setStatus('idle'), 3000);
          }
        } catch (e) {
          // ignore transient polling errors
        }
      }, 2000);

    } catch (e) {
      setStatus('error');
      toast.error('Failed to start', { description: "Could not connect to server." });
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const getCooldownRemaining = () => {
    if (!nextAvailable) return 'Cooldown active';
    const mins = Math.ceil((nextAvailable - Date.now()) / 60000);
    return `Available in ${mins}m`;
  };

  if (status === 'cooldown') {
    const title = getCooldownRemaining();
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="w-full gap-2 opacity-50 cursor-not-allowed" disabled>
              <RefreshCw className="w-3 h-3" />
              Reindex
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{title}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full gap-2"
      onClick={handleReindex}
      disabled={status === 'loading' || status === 'success'}
    >
      {status === 'loading' ? <Loader2 className="w-3 h-3 animate-spin" /> :
        status === 'success' ? <Check className="w-3 h-3 text-green-500" /> :
          status === 'error' ? <AlertCircle className="w-3 h-3 text-destructive" /> :
            <RefreshCw className="w-3 h-3" />}
      {status === 'loading' ? 'Queuing...' :
        status === 'success' ? 'Queued!' :
          'Reindex'}
    </Button>
  );
}
