'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ReindexButtonProps {
  owner: string;
  repo: string;
}

export function ReindexButton({ owner, repo }: ReindexButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'cooldown' | 'error'>('idle');
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
        return;
      }

      if (!res.ok) throw new Error('Failed to start reindexing');

      // Now poll for completion instead of redirecting
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/status?owner=${owner}&repo=${repo}`);
          const statusData = await statusRes.json();

          if (statusData.indexed) {
            clearInterval(pollInterval);
            setStatus('success');
            // Refresh the current page to show new content
            router.refresh();
            setTimeout(() => setStatus('idle'), 2000);
          } else if (statusData.job && statusData.job.status === 'failed') {
            clearInterval(pollInterval);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
          }
        } catch (e) {
          // ignore transient errors
        }
      }, 2000);

    } catch (e) {
      setStatus('error');
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
