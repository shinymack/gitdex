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
import { Loader2 } from 'lucide-react';
import { useDocsStore } from '@/lib/docs-store';

export default function StatusPage() {
  const params = useParams();
  const router = useRouter();
  const { owner, repo } = params as { owner: string; repo: string };

  const [status, setStatus] = useState<'not-indexed' | 'indexing' | 'indexed' | 'error'>('not-indexed');
  const [error, setError] = useState<string>('');
  const [job, setJob] = useState<any>(null);

  // name-based status check
  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/status?owner=${owner}&repo=${repo}`);
      const data = await res.json();

      if (data.indexed) {
        setStatus('indexed');
        router.push(data.path || `/docs/${owner}/${repo}`);
        router.refresh();
        return true;
      }

      if (data.job) {
        setJob(data.job);
        if (data.job.status === 'failed') {
          setStatus('not-indexed');
          setError('Previous indexing attempt failed. Please try again.');
        } else {
          setStatus('indexing');
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
        }, 5000);
      }
    };

    run();

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo]);

  const indexRepo = async () => {
    setStatus('indexing');
    setError('');

    try {
      const res = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: `https://github.com/${owner}/${repo}` }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Indexing failed');

      // Clear local cached docs for this repo so a subsequent fetch gets fresh data
      try {
        useDocsStore.getState().clearCacheFor(owner, repo);
      } catch (e) {
        // non-fatal
      }

      // Add a small delay to ensure the cache is cleared
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // backend should create a job; re-run status checks which will pick up job
      await fetchStatus();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Indexing failed');
    }
  };

  switch (status) {
    case 'indexing':
      return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
          <p className="text-center">Indexing {owner}/{repo}... This may take a few minutes.</p>
          {job && job.id && <p className="mt-2 text-sm text-muted-foreground">Job ID: {job.id} — {job.status}</p>}
          {error && <p className="text-destructive mt-4">{error}</p>}
        </div>
      );

    case 'indexed':
      return null; // redirected
      
    default:
      return (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <h1 className="text-2xl mb-4">Repository Not Indexed</h1>
          <p className="mb-8 text-muted-foreground">The documentation for {owner}/{repo} is not available yet.</p>
          {error && <p className="text-destructive mb-4">{error}</p>}
          <Button onClick={indexRepo}>
            Index This Repository
          </Button>
        </div>
      );
  }
}