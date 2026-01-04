'use client';

import { useEffect, useState } from 'react';
import { DocsSkeleton } from './docs-skeleton';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import Link from 'next/link';
import { useDocsStore } from '@/lib/docs-store';

interface SyncingGuardProps {
  owner: string;
  repo: string;
}

export function SyncingGuard({ owner, repo }: SyncingGuardProps) {
  const [status, setStatus] = useState<'loading' | 'indexing' | 'not_found' | 'error'>('loading');

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/status?owner=${owner}&repo=${repo}`);
        if (!res.ok) throw new Error('Failed to check status');

        const data = await res.json();

        // If progress < 100 or status is 'scanned'/'processing', show skeletal loading
        if (data.status === 'processing' || data.status === 'scanned' || data.status === 'queued') {
          setStatus('indexing');
        } else if (data.indexed) {
          // It says indexed but we are in the guard? Maybe a race condition.
          // Clear cache and reload page to try fetching docs again.
          try {
            useDocsStore.getState().clearCacheFor(owner, repo);
          } catch (e) { }

          window.location.reload();
        } else {
          setStatus('not_found');
        }

      } catch (e) {
        setStatus('error');
      }
    };

    checkStatus();
    intervalId = setInterval(checkStatus, 3000); // Poll every 3s

    return () => clearInterval(intervalId);
  }, [owner, repo]);

  if (status === 'loading' || status === 'indexing') {
    return (
      <div className="container py-12 animate-in fade-in duration-500">
        <div className="flex items-center gap-2 mb-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>
            {status === 'loading' ? 'Checking status...' : 'Agent is reading repository...'}
          </span>
        </div>
        <DocsSkeleton />
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="bg-destructive/10 p-4 rounded-full mb-4">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Documentation Not Found</h2>
        <p className="text-muted-foreground max-w-md mb-8">
          We couldn't find any documentation for {owner}/{repo}. The repository might not exist or hasn't been indexed clearly.
        </p>
        <div className="flex gap-4">
          <Link href="/">
            <Button variant="outline">Go Home</Button>
          </Link>
          <Link href={`/docs/${owner}/${repo}/status`}>
            <Button>Start Indexing</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <AlertCircle className="w-10 h-10 text-muted-foreground mb-4" />
      <p>Something went wrong checking the status.</p>
      <Button variant="link" onClick={() => window.location.reload()}>Retry</Button>
    </div>
  );
}
