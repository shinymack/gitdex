'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

export function DocsServiceError({ owner, repo }: { owner: string; repo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section className="mx-auto w-full max-w-xl px-6 py-20" aria-labelledby="docs-service-error">
      <p className="break-all text-sm text-muted-foreground">{owner}/{repo}</p>
      <h1 id="docs-service-error" className="mt-3 font-headline text-3xl font-semibold tracking-tight">The documentation service is unavailable</h1>
      <p role="alert" className="mt-5 text-sm leading-7 text-muted-foreground">The published guide could not be loaded. This is a service error, not confirmation that the guide or requested page is missing. Retrying does not start indexing or change existing documentation.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? 'Retrying…' : 'Retry loading guide'}</Button>
        <Button variant="outline" asChild><Link href={`/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/status`}>View indexing status</Link></Button>
      </div>
    </section>
  );
}
