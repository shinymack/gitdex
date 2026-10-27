'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface RepositoryStatus {
  /** Availability of a published guide, independent of the latest job outcome. */
  indexed: boolean;
  lastIndexed?: number;
  job?: {
    state: 'queued' | 'processing' | 'completed' | 'failed';
    currentStep?: number;
    error?: string;
    sectionCount?: number;
    sectionsCompleted?: number;
  } | null;
}

export function isActiveJob(data: RepositoryStatus | null): boolean {
  return data?.job?.state === 'queued' || data?.job?.state === 'processing';
}

export function useRepositoryStatus(owner: string, repo: string) {
  const [data, setData] = useState<RepositoryStatus | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const submission = useRef<AbortController | null>(null);
  const retry = useCallback(() => setRefresh(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    setData(null);
    setLoading(true);
    setError('');
    setMissing(false);
    async function poll() {
      try {
        const response = await fetch(`/api/status?${new URLSearchParams({ owner, repo })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]), cache: 'no-store' });
        const result = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setMissing(response.status === 404);
          throw new Error(typeof result.error === 'string' ? result.error : 'Repository status is unavailable.');
        }
        if (typeof result.indexed !== 'boolean') throw new Error('The status service returned an invalid response.');
        if (controller.signal.aborted) return;
        setData(result);
        setError('');
        if (isActiveJob(result)) timer = setTimeout(poll, 3000);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Repository status is unavailable.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [owner, repo, refresh]);

  useEffect(() => () => submission.current?.abort(), [owner, repo]);

  const start = useCallback(async (force = false) => {
    if (submission.current) return;
    const controller = new AbortController();
    submission.current = controller;
    setStarting(true);
    setError('');
    try {
      const response = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: `https://github.com/${owner}/${repo}`, force }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Indexing could not be started.');
      if (!controller.signal.aborted) retry();
      return !controller.signal.aborted;
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Indexing could not be started.');
      return false;
    } finally {
      if (!controller.signal.aborted) setStarting(false);
      submission.current = null;
    }
  }, [owner, repo, retry]);

  return { data, error, missing, loading, starting, retry, start };
}
