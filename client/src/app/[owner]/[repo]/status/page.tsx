'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, BookOpen, Hourglass } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const STEP_INFO: Record<number, { text: string; progress: number }> = {
  0: { text: 'Scanning repository files...', progress: 20 },
  1: { text: 'Planning documentation structure...', progress: 40 },
  2: { text: 'Writing documentation sections...', progress: 75 },
  3: { text: 'Uploading documentation...', progress: 90 },
};

export default function StatusPage() {
  const params = useParams();
  const router = useRouter();
  const { owner, repo } = params as { owner: string; repo: string };

  const [jobState, setJobState] = useState<'loading' | 'not-indexed' | 'queued' | 'processing' | 'failed'>('loading');
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [error, setError] = useState<string>('');

  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const delayRef = useRef(2000);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/status?owner=${owner}&repo=${repo}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to check status');
      }

      if (data.indexed) {
        router.push(`/${owner}/${repo}`);
        router.refresh();
        return true;
      }

      if (data.job) {
        if (data.job.state === 'failed') {
          setJobState('failed');
          setError(data.job.error || 'Unknown error during AI generation.');
          return true;
        } else if (data.job.state === 'completed') {
          setJobState('processing');
          setCurrentStep(3);
          return false;
        } else if (data.job.state === 'queued') {
          setJobState('queued');
          return false; // Keep polling
        } else if (data.job.state === 'processing') {
          setJobState('processing');
          setCurrentStep(data.job.currentStep || 0);
          return false;
        }
      }

      setJobState('not-indexed');
      return true;
    } catch (e: any) {
      setJobState('failed');
      setError(e.message || 'Failed to connect to the server.');
      return true;
    }
  }, [owner, repo, router]);

  const runPolling = useCallback(async () => {
    const done = await fetchStatus();
    if (!done) {
      delayRef.current = Math.min(delayRef.current + 1000, 5000);
      pollTimeoutRef.current = setTimeout(runPolling, delayRef.current);
    }
  }, [fetchStatus]);

  useEffect(() => {
    let stopped = false;
    delayRef.current = 2000;

    const initPoll = async () => {
      const done = await fetchStatus();
      if (!done && !stopped) {
        delayRef.current = Math.min(delayRef.current + 1000, 5000);
        pollTimeoutRef.current = setTimeout(runPolling, delayRef.current);
      }
    };

    initPoll();

    return () => {
      stopped = true;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [fetchStatus, runPolling]);

  const indexRepo = async () => {
    setJobState('processing');
    setCurrentStep(0);
    setError('');
    try {
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: `https://github.com/${owner}/${repo}` }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Indexing failed');
      }
      delayRef.current = 2000;
      runPolling();
    } catch (err: any) {
      setJobState('failed');
      setError(err.message);
    }
  };

  const stepInfo = STEP_INFO[currentStep] || { text: 'Processing...', progress: 10 };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-md bg-background/50 backdrop-blur border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
            {jobState === 'queued' && <Hourglass className="w-6 h-6 text-blue-500" />}
            {jobState === 'processing' && <Loader2 className="w-6 h-6 animate-spin text-primary" />}
            {jobState === 'failed' && <AlertCircle className="w-6 h-6 text-destructive" />}
            {jobState === 'not-indexed' && <BookOpen className="w-6 h-6 text-muted-foreground" />}
            {jobState === 'loading' ? 'Checking Status...' :
              jobState === 'queued' ? 'Waiting in Queue' :
                jobState === 'processing' ? 'Indexing In Progress' :
                  jobState === 'failed' ? 'Indexing Failed' :
                    'Repository Status'}
          </CardTitle>
          <CardDescription>{owner}/{repo}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {jobState === 'loading' && (
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Checking repository status...
            </div>
          )}

          {jobState === 'queued' && (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground animate-pulse">
                Another repository is currently being indexed.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Your job will start automatically as soon as the previous one finishes.
              </p>
            </div>
          )}

          {jobState === 'processing' && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground animate-pulse">
                {stepInfo.text}
              </p>
              <Progress value={stepInfo.progress} className="h-2" />
              <p className="text-xs text-muted-foreground/70">
                Running in background via QStash. You can close this tab!
              </p>
            </div>
          )}

          {jobState === 'failed' && (
            <div className="text-center space-y-4">
              <p className="text-destructive font-medium">Indexing Failed</p>
              <p className="text-sm text-muted-foreground bg-destructive/10 p-3 rounded-md">{error}</p>
              <Button onClick={indexRepo} className="w-full" size="lg">
                Try Again
              </Button>
            </div>
          )}

          {jobState === 'not-indexed' && (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Documentation has not been generated for this repository yet.
              </p>
              <Button onClick={indexRepo} className="w-full" size="lg">
                Start Indexing
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}