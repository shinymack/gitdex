// 'use client';

// import { useState, useEffect } from 'react';
// import { useParams, useRouter } from 'next/navigation';
// import { Button } from '@/src/components/ui/button';
// import { Loader2 } from 'lucide-react';
// import { useDocsStore } from '@/lib/docs-store';

// export default function StatusPage() {
//   const params = useParams();
//   const { owner, repo } = params as { owner: string; repo: string };

//   const [status, setStatus] = useState<'not-indexed' | 'indexing' | 'indexed' | 'error'>('not-indexed');
//   const [error, setError] = useState<string>('');
//   const [job, setJob] = useState<any>(null);

//   // name-based status check
//   const fetchStatus = async () => {
//     try {
//       const res = await fetch(`/api/status?owner=${owner}&repo=${repo}`);
//       const data = await res.json();

//       if (data.indexed) {
//         setStatus('indexed');
//         // redirect to docs path provided by backend or default
//         window.location.href = data.path || `/docs/${owner}/${repo}`;
//         return true;
//       }

//       if (data.job) {
//         setJob(data.job);
//         // Show index button if job failed, otherwise show indexing state
//         if (data.job.status === 'failed') {
//           setStatus('not-indexed');
//           setError('Previous indexing attempt failed. Please try again.');
//         } else {
//           setStatus('indexing');
//         }
//         return false;
//       }

//       setStatus('not-indexed');
//       return false;
//     } catch (e) {
//       setStatus('error');
//       setError('Failed to check status');
//       return true;
//     }
//   };

//   // Poll name-based status repeatedly until indexed or error
//   useEffect(() => {
//     let stopped = false;
//     let interval: ReturnType<typeof setInterval> | null = null;

//     const run = async () => {
//       const done = await fetchStatus();
//       if (!done && !stopped) {
//         interval = setInterval(async () => {
//           if (stopped) return;
//           await fetchStatus();
//         }, 5000);
//       }
//     };

//     run();

//     return () => {
//       stopped = true;
//       if (interval) clearInterval(interval);
//     };
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [owner, repo]);

//   const indexRepo = async () => {
//     setStatus('indexing');
//     setError('');

//     try {
//       const res = await fetch('/api/index', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ repoUrl: `https://github.com/${owner}/${repo}` }),
//       });

//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || 'Indexing failed');

//       // Clear local cached docs for this repo so a subsequent fetch gets fresh data
//       try {
//         useDocsStore.getState().clearCacheFor(owner, repo);
//       } catch (e) {
//         // non-fatal
//       }

//       // backend should create a job; re-run status checks which will pick up job
//       await fetchStatus();
//     } catch (err) {
//       setStatus('error');
//       setError(err instanceof Error ? err.message : 'Indexing failed');
//     }
//   };

//   switch (status) {
//     case 'indexing':
//       return (
//         <div className="flex flex-col items-center justify-center min-h-screen">
//           <Loader2 className="w-8 h-8 animate-spin mb-4" />
//           <p className="text-center">Indexing {owner}/{repo}... This may take a few minutes.</p>
//           {job && job.id && <p className="mt-2 text-sm text-muted-foreground">Job ID: {job.id} — {job.status}</p>}
//           {error && <p className="text-destructive mt-4">{error}</p>}
//         </div>
//       );

//     case 'indexed':
//       return null; // redirected

//     default:
//       return (
//         <div className="flex flex-col items-center justify-center min-h-screen">
//           <h1 className="text-2xl mb-4">Repository Not Indexed</h1>
//           <p className="mb-8 text-muted-foreground">The documentation for {owner}/{repo} is not available yet.</p>
//           {error && <p className="text-destructive mb-4">{error}</p>}
//           <Button onClick={indexRepo}>
//             Index This Repository
//           </Button>
//         </div>
//       );
//   }
// }

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, BookOpen } from 'lucide-react';
import { useDocsStore } from '@/lib/docs-store';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';

export default function StatusPage() {
  const params = useParams();
  const router = useRouter();
  const { owner, repo } = params as { owner: string; repo: string };

  const [status, setStatus] = useState<'not-indexed' | 'indexing' | 'indexed' | 'error' | 'cooldown'>('not-indexed');
  const [error, setError] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [nextAvailable, setNextAvailable] = useState<number | null>(null);

  // name-based status check
  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/status?owner=${owner}&repo=${repo}`);
      const data = await res.json();

      if (data.indexed) {
        setStatus('indexed');
        setProgress(100);
        setTimeout(() => {
          router.push(data.path || `/docs/${owner}/${repo}`);
          router.refresh();
        }, 1000);
        return true;
      }

      if (data.job) {
        if (data.job.status === 'failed') {
          setStatus('not-indexed');
          setError('Previous indexing attempt failed. Please try again.');
          setProgress(0);
        } else if (data.job.status === 'cooldown') {
          setStatus('cooldown');
          setNextAvailable(data.job.nextAvailable);
        } else {
          setStatus('indexing');
          // Simulate progress based on time or status if available
          // For now, just a slow tick
          setProgress((prev) => Math.min(prev + 5, 90));
        }
        return false;
      }

      setStatus('not-indexed');
      return false;
    } catch (e) {
      setStatus('error');
      setError('Failed to check status');
      return true;
    }
  };

  // Poll name-based status repeatedly until indexed or error
  useEffect(() => {
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      const done = await fetchStatus();
      if (!done && !stopped) {
        interval = setInterval(async () => {
          if (stopped) return;
          await fetchStatus();
        }, 3000);
      }
    };

    run();

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo]);

  const indexRepo = async (force = false) => {
    setStatus('indexing');
    setError('');
    setProgress(10);

    console.log('Frontend: indexRepo called with force:', force);
    try {
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: `https://github.com/${owner}/${repo}`,
          force: !!force // Ensure boolean
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) { // Cooldown
          setStatus('cooldown');
          setError(data.error);
        } else {
          throw new Error(data.error || 'Indexing failed');
        }
        return;
      }

      // Clear local cached docs for this repo so a subsequent fetch gets fresh data
      try {
        useDocsStore.getState().clearCacheFor(owner, repo);
      } catch (e) {
        // non-fatal
      }

      await fetchStatus();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Indexing failed');
      setProgress(0);
    }
  };

  const getCooldownTime = () => {
    if (!nextAvailable) return "Try again later";
    const minutes = Math.ceil((nextAvailable - Date.now()) / 60000);
    return `${minutes} minutes`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-md bg-background/50 backdrop-blur border-border/50">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
            {status === 'indexing' && <Loader2 className="w-6 h-6 animate-spin text-primary" />}
            {status === 'indexed' && <CheckCircle2 className="w-6 h-6 text-green-500" />}
            {status === 'error' && <AlertCircle className="w-6 h-6 text-destructive" />}
            {status === 'cooldown' && <RefreshCw className="w-6 h-6 text-orange-500" />}
            {status === 'not-indexed' && <BookOpen className="w-6 h-6 text-muted-foreground" />}
            {status === 'indexing' ? 'Indexing In Progress' :
              status === 'indexed' ? 'Indexing Complete' :
                status === 'cooldown' ? 'Indexing Cooldown' :
                  'Repository Status'}
          </CardTitle>
          <CardDescription>
            {owner}/{repo}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {status === 'indexing' && (
            <div className="space-y-2">
              <p className="text-sm text-center text-muted-foreground animate-pulse">
                Analyzing repository structure, generating docs...
              </p>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {status === 'indexed' && (
            <div className="text-center space-y-4">
              <p className="text-green-500 font-medium">Documentation is ready!</p>
              <Button onClick={() => router.push(`/docs/${owner}/${repo}`)} className="w-full">
                View Documentation
              </Button>
            </div>
          )}

          {status === 'not-indexed' && (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Documentation has not been generated for this repository yet.
              </p>
              <Button onClick={() => indexRepo(true)} className="w-full" size="lg">
                Start Indexing
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}