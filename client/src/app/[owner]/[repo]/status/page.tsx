// 'use client';

// import { useState, useEffect } from 'react';
// import { useParams, useRouter } from 'next/navigation';
// import { Button } from '@/components/ui/button';
// import { Loader2, CheckCircle2, AlertCircle, BookOpen } from 'lucide-react';
// import { Progress } from '@/components/ui/progress';
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// export default function StatusPage() {
//   const params = useParams();
//   const router = useRouter();
//   const { owner, repo } = params as { owner: string; repo: string };

//   const [jobState, setJobState] = useState<'not-indexed' | 'processing' | 'completed' | 'failed'>('not-indexed');
//   const [error, setError] = useState<string>('');

//   const fetchStatus = async () => {
//     try {
//       const res = await fetch(`/api/status?owner=${owner}&repo=${repo}`);
//       const data = await res.json();

//       if (data.indexed) {
//         setJobState('completed');
//         setTimeout(() => {
//           router.push(`/${owner}/${repo}`);
//           router.refresh();
//         }, 1000);
//         return true;
//       }

//       if (data.job) {
//         if (data.job.state === 'failed') {
//           setJobState('failed');
//           setError(data.job.error || 'Unknown error');
//         } else if (data.job.state === 'processing') {
//           setJobState('processing');
//         } else if (data.job.state === 'completed') {
//            setJobState('completed');
//            setTimeout(() => {
//              router.push(`/${owner}/${repo}`);
//              router.refresh();
//            }, 1000);
//            return true;
//         }
//         return false;
//       }

//       setJobState('not-indexed');
//       return false;
//     } catch (e) {
//       setJobState('failed');
//       setError('Failed to check status');
//       return true;
//     }
//   };

//   useEffect(() => {
//     let stopped = false;
//     let interval: ReturnType<typeof setInterval> | null = null;

//     const run = async () => {
//       const done = await fetchStatus();
//       if (!done && !stopped) {
//         interval = setInterval(async () => {
//           if (stopped) return;
//           await fetchStatus();
//         }, 3000);
//       }
//     };

//     run();

//     return () => {
//       stopped = true;
//       if (interval) clearInterval(interval);
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [owner, repo]);

//   const indexRepo = async () => {
//     setJobState('processing');
//     try {
//       const res = await fetch('/api/index', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ repoUrl: `https://github.com/${owner}/${repo}` }),
//       });
//       if (!res.ok) {
//         const data = await res.json();
//         throw new Error(data.error || 'Indexing failed');
//       }
//     } catch (err: any) {
//       setJobState('failed');
//       setError(err.message);
//     }
//   };

//   return (
//     <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
//       <Card className="w-full max-w-md bg-background/50 backdrop-blur border-border/50">
//         <CardHeader className="text-center">
//           <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
//             {jobState === 'processing' && <Loader2 className="w-6 h-6 animate-spin text-primary" />}
//             {jobState === 'completed' && <CheckCircle2 className="w-6 h-6 text-green-500" />}
//             {jobState === 'failed' && <AlertCircle className="w-6 h-6 text-destructive" />}
//             {jobState === 'not-indexed' && <BookOpen className="w-6 h-6 text-muted-foreground" />}
//             {jobState === 'processing' ? 'Indexing In Progress' :
//               jobState === 'completed' ? 'Indexing Complete' :
//                 'Repository Status'}
//           </CardTitle>
//           <CardDescription>{owner}/{repo}</CardDescription>
//         </CardHeader>
//         <CardContent className="space-y-6">
//           {jobState === 'processing' && (
//             <div className="space-y-2">
//               <p className="text-sm text-center text-muted-foreground animate-pulse">
//                 AI Agent is scanning, planning, and writing documentation...
//               </p>
//               <Progress value={50} className="h-2 animate-pulse" />
//             </div>
//           )}

//           {jobState === 'completed' && (
//             <div className="text-center space-y-4">
//               <p className="text-green-500 font-medium">Documentation is ready!</p>
//               <Button onClick={() => router.push(`/${owner}/${repo}`)} className="w-full">
//                 View Documentation
//               </Button>
//             </div>
//           )}

//           {jobState === 'failed' && (
//             <div className="text-center space-y-4">
//               <p className="text-destructive font-medium">Indexing Failed</p>
//               <p className="text-sm text-muted-foreground">{error}</p>
//               <Button onClick={indexRepo} className="w-full" size="lg">
//                 Try Again
//               </Button>
//             </div>
//           )}

//           {jobState === 'not-indexed' && (
//             <div className="text-center space-y-4">
//               <p className="text-muted-foreground">
//                 Documentation has not been generated for this repository yet.
//               </p>
//               <Button onClick={indexRepo} className="w-full" size="lg">
//                 Start Indexing
//               </Button>
//             </div>
//           )}
//         </CardContent>
//       </Card>
//     </div>
//   );
// }

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, BookOpen } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const STEP_INFO: Record<number, { text: string; progress: number }> = {
  0: { text: 'Scanning repository files...', progress: 20 },
  1: { text: 'Planning documentation structure...', progress: 40 },
  2: { text: 'Writing documentation sections...', progress: 75 },
  3: { text: 'Committing to GitHub...', progress: 90 },
};

export default function StatusPage() {
  const params = useParams();
  const router = useRouter();
  const { owner, repo } = params as { owner: string; repo: string };

  const [jobState, setJobState] = useState<'loading' | 'not-indexed' | 'processing' | 'failed'>('loading');
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [error, setError] = useState<string>('');
  
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const delayRef = useRef(2000);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/status?owner=${owner}&repo=${repo}`);
      if (!res.ok) throw new Error('Failed to check status');
      const data = await res.json();

      // 1. Check GitHub first
      if (data.indexed) {
        router.push(`/${owner}/${repo}`);
        router.refresh();
        return true; // Stop polling
      }

      // 2. Check Redis job
      if (data.job) {
        if (data.job.state === 'failed') {
          setJobState('failed');
          setError(data.job.error || 'Unknown error during AI generation.');
          return true; // Stop polling
        } else if (data.job.state === 'completed') {
          // CRITICAL FIX: Job is done in Redis, but GitHub API might still be processing the commit.
          // Keep polling until GitHub says `indexed: true`.
          setJobState('processing');
          setCurrentStep(3);
          return false; 
        } else if (data.job.state === 'processing' || data.job.state === 'queued') {
          setJobState('processing');
          setCurrentStep(data.job.currentStep || 0);
          return false; // Keep polling
        }
      }

      // No docs, no active job
      setJobState('not-indexed');
      return true; // Stop polling
    } catch (e) {
      setJobState('failed');
      setError('Failed to connect to the server.');
      return true; // Stop polling
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
      // Restart polling after triggering
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
            {jobState === 'processing' && <Loader2 className="w-6 h-6 animate-spin text-primary" />}
            {jobState === 'failed' && <AlertCircle className="w-6 h-6 text-destructive" />}
            {jobState === 'not-indexed' && <BookOpen className="w-6 h-6 text-muted-foreground" />}
            {jobState === 'loading' ? 'Checking Status...' :
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