'use client';

import Link from 'next/link';
import { AlertCircle, BookOpen, Hourglass, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isActiveJob, useRepositoryStatus } from '@/lib/use-repository-status';

const STEPS = ['Reading repository files', 'Planning the guide', 'Writing documentation sections', 'Publishing the guide'];

export function RepositoryStatusPanel({ owner, repo }: { owner: string; repo: string }) {
  const { data, error, missing, loading, starting, retry, start } = useRepositoryStatus(owner, repo);
  const state = data?.job?.state;
  const active = isActiveJob(data);
  const failed = state === 'failed';
  const available = data?.indexed;
  const unpublished = state === 'completed' && !available;
  const title = loading ? 'Checking repository status' : missing ? 'Repository not found' : active ? (state === 'queued' ? 'Waiting to index' : 'Building your field guide') : failed ? (available ? 'The guide update failed' : 'Indexing failed') : available ? 'Your field guide is ready' : unpublished ? 'Publication is not available' : error ? 'The request could not be completed' : 'Create a field guide';

  return (
    <section className="mx-auto w-full max-w-xl px-6 py-16 sm:py-24" aria-labelledby="repository-status-title">
      <div className="mb-6 flex size-12 items-center justify-center rounded-xl border border-border bg-muted text-primary">
        {loading || state === 'processing' || starting ? <Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : state === 'queued' ? <Hourglass aria-hidden="true" className="size-5" /> : failed || error || unpublished ? <AlertCircle aria-hidden="true" className="size-5" /> : <BookOpen aria-hidden="true" className="size-5" />}
      </div>
      <a href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`} className="break-all text-sm text-muted-foreground underline-offset-4 hover:underline">{owner}/{repo}</a>
      <h1 id="repository-status-title" className="mt-3 font-headline text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <div className="mt-6 space-y-4 text-sm leading-7 text-muted-foreground" aria-live="polite">
        {loading && <p>Checking for a published guide and the latest indexing run.</p>}
        {!loading && state === 'queued' && <p>The run is queued. It will start when a worker is available. You can leave this page and return to this URL.</p>}
        {!loading && state === 'processing' && (
          <>
            <p>{STEPS[data?.job?.currentStep ?? 0] ?? 'Indexing the repository'}. This page updates automatically; the run continues if you leave.</p>
            {typeof data?.job?.sectionCount === 'number' && data.job.sectionCount > 0 && <p>{data.job.sectionsCompleted ?? 0} of {data.job.sectionCount} sections written.</p>}
          </>
        )}
        {!loading && failed && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-foreground">{data?.job?.error || 'The latest run did not finish. You can explicitly retry indexing.'}</p>}
        {!loading && available && <p>{active ? 'The published guide remains readable while this update runs.' : failed ? 'The previously published guide is unchanged and still readable.' : 'Open the published documentation below.'}</p>}
        {!loading && unpublished && <p>The latest run completed, but a usable published guide is not available. Check again before starting another run.</p>}
        {!loading && !data?.job && !available && !error && <p>No published guide is available. Start indexing to read and document this public repository. Opening this page does not start a run.</p>}
        {error && <p role="alert" className="rounded-lg border border-destructive/30 px-4 py-3 text-foreground">{error} {missing ? 'Check the name and make sure the repository is public.' : 'Existing published pages are not changed by this error.'}</p>}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {available && <Button asChild><Link href={`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`}>Read published guide</Link></Button>}
        {!loading && !active && !unpublished && (!available || failed) && !error && <Button disabled={starting} onClick={() => void start(!!available)}>{starting ? 'Requesting indexing…' : failed ? 'Retry indexing' : 'Start indexing'}</Button>}
        {error || unpublished ? <Button variant="outline" disabled={loading || starting} onClick={retry}>Check again</Button> : null}
        <Button variant="ghost" asChild><Link href="/">Choose another repository</Link></Button>
      </div>
    </section>
  );
}
