'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import type { DocumentationSearchResult } from '@/lib/docs-search';

export function DocsSearch({ owner, repo }: { owner: string; repo: string }) {
  const router = useRouter();
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DocumentationSearchResult[]>([]);
  const [resultKey, setResultKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const term = query.trim();
  const currentResults = resultKey === JSON.stringify([owner, repo, term]) ? results : [];

  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    setActive(-1);
    setError('');
    if (!term) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/docs-search?${new URLSearchParams({ owner, repo, q: term })}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Documentation search is unavailable.');
        if (controller.signal.aborted) return;
        setResults(data.results);
        setResultKey(JSON.stringify([owner, repo, term]));
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Documentation search is unavailable.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [owner, repo, term, attempt]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div className="relative w-full" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <label htmlFor={`${id}-input`} className="mb-2 block text-xs font-medium text-muted-foreground">Search this guide</label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        <input
          id={`${id}-input`}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !!term}
          aria-controls={`${id}-results`}
          aria-activedescendant={open && currentResults[active] ? `${id}-result-${active}` : undefined}
          autoComplete="off"
          maxLength={200}
          value={query}
          onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={event => {
            if (event.key === 'Escape') { setOpen(false); setActive(-1); }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              if (currentResults.length) setActive(index => index < 0 ? (event.key === 'ArrowDown' ? 0 : currentResults.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + currentResults.length) % currentResults.length);
            }
            if (event.key === 'Enter' && open && currentResults[active]) {
              event.preventDefault();
              router.push(currentResults[active].url);
              setOpen(false);
            }
          }}
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
        />
      </div>
      {open && term && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg md:w-[min(32rem,80vw)]">
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground" role="status" aria-live="polite">
            {loading ? <span className="inline-flex items-center gap-2"><Loader2 aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />Searching this guide…</span> : error ? 'Search could not be completed' : `${currentResults.length} ${currentResults.length === 1 ? 'result' : 'results'} in ${owner}/${repo}`}
          </div>
          {error && <div className="space-y-2 p-3 text-sm"><p role="alert">{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className="text-primary underline underline-offset-4">Retry search</button></div>}
          {!loading && !error && currentResults.length === 0 && <p className="p-3 text-sm text-muted-foreground">No headings or page text match “{term}” in this guide.</p>}
          <ul ref={list} id={`${id}-results`} role="listbox" aria-label={`Documentation matches in ${owner}/${repo}`} className="max-h-80 overflow-y-auto overscroll-contain p-1">
            {currentResults.map((result, index) => (
              <li key={result.id} role="none">
                <Link
                  id={`${id}-result-${index}`}
                  role="option"
                  aria-selected={active === index}
                  tabIndex={-1}
                  href={result.url}
                  onMouseDown={event => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-3 py-3 text-left no-underline ${active === index ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
                >
                  <span className="block text-sm font-medium">{result.heading || result.title}</span>
                  {result.heading && <span className="mt-1 block text-xs text-primary">{result.title}</span>}
                  {result.excerpt && <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">{result.excerpt}</span>}
                </Link>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">↑ ↓ to select · Enter to open · Escape to close</p>
        </div>
      )}
    </div>
  );
}
