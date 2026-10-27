'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isActiveJob, useRepositoryStatus } from '@/lib/use-repository-status';

export function ReindexButton({ owner, repo }: { owner: string; repo: string }) {
  const router = useRouter();
  const { data, error, loading, starting, retry, start } = useRepositoryStatus(owner, repo);
  const active = isActiveJob(data);
  const failed = data?.job?.state === 'failed';
  const statusUrl = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/status`;
  const indexedAt = data?.lastIndexed ? new Date(data.lastIndexed) : null;

  async function requestUpdate() {
    if (await start(true)) router.push(statusUrl);
  }

  return (
    <div className="flex w-full flex-col gap-2 text-xs">
      {active ? (
        <Link href={statusUrl} className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 leading-5 text-foreground underline-offset-4 hover:underline">
          {data?.job?.state === 'queued' ? 'Update queued.' : 'Update in progress.'} Keep reading, or view progress.
        </Link>
      ) : (
        <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => void requestUpdate()} disabled={loading || starting}>
          {starting || loading ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" className="size-3.5" />}
          {starting ? 'Requesting update…' : failed ? 'Retry guide update' : 'Update guide'}
        </Button>
      )}
      {failed && <p className="leading-5 text-muted-foreground">The latest update failed. This published guide is still readable. <Link href={statusUrl} className="text-primary underline underline-offset-4">View failure details</Link></p>}
      {indexedAt && Number.isFinite(indexedAt.getTime()) && <p className="text-muted-foreground">Last published <time dateTime={indexedAt.toISOString()}>{indexedAt.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}</time></p>}
      {error && <div role="alert" className="space-y-1 leading-5 text-muted-foreground"><p>{error}</p><button type="button" onClick={retry} className="text-primary underline underline-offset-4">Check status again</button></div>}
    </div>
  );
}
