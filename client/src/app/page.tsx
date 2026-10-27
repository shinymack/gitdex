'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, BookOpen, FileCode2, GitBranch, ListTree, MessageCircle, Network, PencilLine, Search } from 'lucide-react';
import { Brand, BrandMark } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { parseGitHubRepository, type GitHubRepository } from '@/lib/validation';
import styles from './landing.module.css';

interface RepositorySuggestion {
  full_name: string;
  description: string | null;
}

interface RepositoryStatus {
  indexed: boolean;
  job?: { state: string; error?: string } | null;
}

type StatusPreview =
  | { identity: string; state: 'loading' }
  | { identity: string; state: 'ready'; data: RepositoryStatus }
  | { identity: string; state: 'error'; error: string };

const processSteps = [
  { id: 'scan', title: 'Scan the source', subtitle: 'Files & structure', icon: FileCode2, heading: 'Start with what’s actually there.', copy: 'GitDex reads the public repository’s file tree and source files. That context gives the guide a starting point in the code, rather than just the README.' },
  { id: 'plan', title: 'Plan the guide', subtitle: 'A reading order', icon: ListTree, heading: 'Give the codebase a reading order.', copy: 'The planning step organizes the source into a table of contents, grouping related parts of the repository before individual chapters are written.' },
  { id: 'write', title: 'Write the docs', subtitle: 'Section by section', icon: PencilLine, heading: 'A big codebase. Smaller chapters.', copy: 'Background tasks generate the sections of the guide. You can follow the actual job status while GitDex prepares the documentation.' },
  { id: 'read', title: 'Explore', subtitle: 'Read, map, ask', icon: BookOpen, heading: 'A guide you can move through.', copy: 'Read the published chapters and architecture diagrams. When you need to go deeper, ask the codebase assistant to inspect source files.' },
] as const;

function repositoryPath(owner: string, repo: string) {
  return `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function statusDestination(base: string, status: RepositoryStatus) {
  return status.indexed ? base : `${base}/status`;
}

function statusDescription(status: RepositoryStatus) {
  if (status.job?.state === 'queued') return status.indexed ? 'An update is queued. The published guide is still available.' : 'This repository is queued for indexing.';
  if (status.job?.state === 'processing') return status.indexed ? 'An update is in progress. The published guide is still available.' : 'GitDex is preparing this guide. Open progress to follow the job.';
  if (status.job?.state === 'failed') return status.indexed ? 'The latest update failed. The published guide is still available.' : 'The latest indexing attempt failed. Open the status page for details and retry.';
  return status.indexed ? 'A published guide is available to read.' : 'There is no published guide yet. Open this repository to choose whether to start indexing.';
}

async function fetchRepositoryStatus(owner: string, repo: string, signal: AbortSignal): Promise<RepositoryStatus> {
  const parameters = new URLSearchParams({ owner, repo });
  const response = await fetch(`/api/status?${parameters}`, { signal, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not check this repository. Try again.');
  if (typeof data.indexed !== 'boolean') throw new Error('The status service returned an incomplete response. Try again.');
  return data;
}

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<RepositorySuggestion[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<StatusPreview | null>(null);
  const [selectedStep, setSelectedStep] = useState<(typeof processSteps)[number]['id']>('scan');
  const inputRef = useRef<HTMLInputElement>(null);
  const submitController = useRef<AbortController | null>(null);
  let identity: GitHubRepository | null = null;
  try {
    identity = parseGitHubRepository(query);
  } catch {
    // Incomplete input stays editable; submission displays parser errors.
  }
  const owner = identity?.owner || '';
  const repo = identity?.repo || '';
  const fullName = owner && repo ? `${owner}/${repo}` : '';
  const base = owner && repo ? repositoryPath(owner, repo) : '';
  const currentPreview = preview?.identity === fullName ? preview : null;
  const step = processSteps.find((item) => item.id === selectedStep)!;
  const popupOpen = showSuggestions && query.trim().length >= 2;

  useEffect(() => {
    const controller = new AbortController();
    const term = query.trim();
    setSuggestions([]);
    setActiveSuggestion(-1);
    if (term.length < 2 || /^(?:https?:\/\/|(?:www\.)?github\.com\/)/i.test(term)) {
      setSearchState('idle');
      return () => controller.abort();
    }
    setSearchState('loading');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?${new URLSearchParams({ q: term })}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Search unavailable');
        const data = await response.json();
        if (controller.signal.aborted) return;
        setSuggestions(data.items || []);
        setSearchState('ready');
      } catch {
        if (!controller.signal.aborted) setSearchState('error');
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!owner || !repo) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const selectedIdentity = `${owner}/${repo}`;
    setPreview({ identity: selectedIdentity, state: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const data = await fetchRepositoryStatus(owner, repo, AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]));
        if (!controller.signal.aborted) setPreview({ identity: selectedIdentity, state: 'ready', data });
      } catch {
        if (!controller.signal.aborted) setPreview({ identity: selectedIdentity, state: 'error', error: 'Status is unavailable. Open the repository to try again.' });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [owner, repo]);

  useEffect(() => {
    function focusRepository(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !target?.closest('input, textarea, select, [contenteditable="true"]')) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', focusRepository);
    return () => {
      window.removeEventListener('keydown', focusRepository);
      submitController.current?.abort();
    };
  }, []);

  function selectRepository(suggestion: RepositorySuggestion) {
    setQuery(suggestion.full_name);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
    setError('');
    inputRef.current?.focus();
  }

  function handleSuggestionKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setShowSuggestions(false);
      setActiveSuggestion(-1);
      return;
    }
    if (suggestions.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      setShowSuggestions(true);
      setActiveSuggestion((current) => event.key === 'ArrowDown' ? (current + 1) % suggestions.length : (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (popupOpen && event.key === 'Enter' && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
      event.preventDefault();
      selectRepository(suggestions[activeSuggestion]);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (opening) return;
    setError('');
    setShowSuggestions(false);
    let parsed: GitHubRepository;
    try {
      parsed = parseGitHubRepository(query);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Enter a GitHub repository URL or owner/repository.');
      inputRef.current?.focus();
      return;
    }
    setOpening(true);
    const controller = new AbortController();
    submitController.current?.abort();
    submitController.current = controller;
    try {
      const data = await fetchRepositoryStatus(parsed.owner, parsed.repo, AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]));
      if (!controller.signal.aborted) router.push(statusDestination(repositoryPath(parsed.owner, parsed.repo), data));
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error && failure.name === 'TimeoutError' ? 'The status check took too long. Try again.' : failure instanceof Error ? failure.message : 'Could not check this repository. Try again.');
      }
    } finally {
      if (!controller.signal.aborted) setOpening(false);
    }
  }

  return (
    <div className={styles.landing}>
      <a className={styles.skip} href="#main">Skip to content</a>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Brand tagline />
          <nav aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a className={styles.sourceNav} href="https://github.com/shinymack/gitdex">View source <ArrowUpRight aria-hidden="true" /></a>
          </nav>
        </header>
        <main id="main">
          <section className={styles.hero} aria-labelledby="hero-title">
            <div className={styles.intro}>
              <p className={styles.context}><GitBranch aria-hidden="true" /> For the repository you’re about to open.</p>
              <h1 id="hero-title">Find your way<br />into the code.</h1>
              <p className={styles.lede}>The README is just the beginning. Turn a public GitHub repository into a guide you can read, explore, and ask questions.</p>
              <form className={styles.form} onSubmit={handleSubmit} aria-busy={opening} noValidate>
                <label htmlFor="repository-input">Start with a repository</label>
                <div className={styles.picker} onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setShowSuggestions(false);
                }}>
                  <div className={styles.repoControl}>
                    <Search aria-hidden="true" />
                    <input ref={inputRef} id="repository-input" name="repository" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="owner/repo" value={query} disabled={opening} role="combobox" aria-autocomplete="list" aria-expanded={popupOpen && suggestions.length > 0} aria-controls="repository-suggestions" aria-activedescendant={popupOpen && activeSuggestion >= 0 ? `repository-option-${activeSuggestion}` : undefined} aria-describedby={`repository-help${error ? ' repository-error' : ''}`} aria-invalid={Boolean(error)} onKeyDown={handleSuggestionKey} onFocus={() => setShowSuggestions(true)} onChange={(event) => {
                      setQuery(event.target.value);
                      setSuggestions([]);
                      setActiveSuggestion(-1);
                      setShowSuggestions(true);
                      setError('');
                    }} />
                    <button type="submit" disabled={opening || !query.trim()}>{opening ? 'Checking…' : 'Open repo'}</button>
                  </div>
                  {popupOpen && searchState !== 'idle' && (
                    <div className={styles.suggestions}>
                      <div id="repository-suggestions" role="listbox" aria-label="Public GitHub repositories">
                        {suggestions.map((suggestion, index) => (
                          <button id={`repository-option-${index}`} key={suggestion.full_name} type="button" role="option" tabIndex={-1} aria-selected={activeSuggestion === index} onMouseDown={(event) => event.preventDefault()} onClick={() => selectRepository(suggestion)}>
                            <strong>{suggestion.full_name}</strong>
                            {suggestion.description && <span>{suggestion.description}</span>}
                          </button>
                        ))}
                      </div>
                      <p role="status">{searchState === 'loading' ? 'Searching public repositories…' : searchState === 'error' ? 'Repository search is unavailable. You can still enter a repository URL.' : suggestions.length ? 'Use ↑ and ↓ to select, then Enter to choose.' : 'No matching repositories. Try a full owner/repository or GitHub URL.'}</p>
                    </div>
                  )}
                </div>
                <p id="repository-help" className={styles.inputNote}>Public repositories only. No account needed.</p>
                {error && <p id="repository-error" className={styles.error} role="alert">{error}</p>}
                {opening && <p className={styles.inputNote} role="status">Checking guide availability and the latest indexing job…</p>}
              </form>
              <Link className={styles.guideLink} href="/shinymack/gitdex"><BookOpen aria-hidden="true" /> Explore GitDex field guide (Demo) <ArrowRight aria-hidden="true" /></Link>
              <div className={styles.outcomes}><span><BookOpen aria-hidden="true" /> Readable docs</span><span><Network aria-hidden="true" /> Architecture maps</span><span><MessageCircle aria-hidden="true" /> Code-aware answers</span></div>
            </div>
            <section className={styles.atlas} aria-labelledby="atlas-title">
              <div className={styles.atlasTop}><span><GitBranch aria-hidden="true" /><span id="atlas-title">{fullName || 'From source to guide'}</span></span><span className={styles.processTag}>{fullName ? 'Repository' : 'The process'}</span></div>
              <div className={styles.mapHeading}><h2>From repository<br />to understanding.</h2><p>Choose a step to see<br />how the guide takes shape.</p></div>
              <div className={styles.routeMap} role="group" aria-label="How GitDex prepares a guide">
                <svg className={styles.connections} viewBox="0 0 600 270" preserveAspectRatio="none" aria-hidden="true"><path d="M100 60H495V116Q495 130 481 130H152Q138 130 138 144V198H495" /><path d="m300 55 6 5-6 5m13 60-6 5 6 5m-13 58 6 5-6 5" /><circle cx="100" cy="60" r="6" /><circle cx="495" cy="60" r="6" /><circle cx="138" cy="198" r="6" /><circle cx="495" cy="198" r="6" /></svg>
                {processSteps.map((item) => <button type="button" key={item.id} className={`${styles.mapNode} ${styles[item.id]}`} aria-pressed={selectedStep === item.id} aria-controls="process-detail" onClick={() => setSelectedStep(item.id)}><item.icon aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.subtitle}</small></span></button>)}
                <span className={styles.routeLabel}>Scan. Plan. Write. Read.</span>
              </div>
              <div className={styles.inspector} id="process-detail" aria-live="polite" aria-atomic="true"><div className={styles.inspectorTop}><step.icon aria-hidden="true" />{step.title}<span>How GitDex works</span></div><h3>{step.heading}</h3><p>{step.copy}</p></div>
              <div className={styles.atlasBottom} aria-live="polite">
                {!fullName ? <p>Select a public repository to check its guide and indexing status.</p> : <>
                  <div><p>{currentPreview?.state === 'ready' ? statusDescription(currentPreview.data) : currentPreview?.state === 'error' ? currentPreview.error : 'Checking this repository’s guide status…'}</p><a href={`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`}>View repository <ArrowUpRight aria-hidden="true" /></a></div>
                  {currentPreview?.state === 'ready' && <div className={styles.repositoryActions}><Link href={statusDestination(base, currentPreview.data)}>{currentPreview.data.indexed ? 'Read guide' : currentPreview.data.job && ['queued', 'processing', 'failed'].includes(currentPreview.data.job.state) ? 'Open status' : 'Open repository'}<ArrowRight aria-hidden="true" /></Link>{currentPreview.data.indexed && currentPreview.data.job && ['queued', 'processing', 'failed'].includes(currentPreview.data.job.state) && <Link href={`${base}/status`}>Open status</Link>}</div>}
                </>}
              </div>
            </section>
          </section>
          <section className={styles.explanation} id="how-it-works" aria-labelledby="explanation-title">
            <div className={styles.sectionHeading}><h2 id="explanation-title">Less spelunking.<br />More understanding.</h2><p>For your first contribution, your next dependency,<br className={styles.desktopBreak} /> or the project you haven’t touched in months.</p></div>
            <div className={styles.readingPath}>
              <article><BookOpen aria-hidden="true" /><h3>Get the lay of the land.</h3><p>Start with an overview of the architecture, then read the parts that matter to what you’re building.</p></article>
              <article><Network aria-hidden="true" /><h3>See how things connect.</h3><p>Follow diagrams alongside the documentation. Trace the journey between the interface, services, and data.</p></article>
              <article><MessageCircle aria-hidden="true" /><h3>Ask the next question.</h3><p>Go beyond the guide. The assistant can explore the file tree and read source files to answer your questions.</p></article>
            </div>
          </section>
          <section className={styles.closing} aria-label="Open source project"><div><BrandMark /><p>Built in the open.<br /><strong>Made for the curious.</strong></p></div><a href="https://github.com/shinymack/gitdex">Explore the GitDex repository <ArrowUpRight aria-hidden="true" /></a></section>
        </main>
        <footer className={styles.footer}><Brand /><p>Read the guide. Check the source. Make it yours.</p><ThemeToggle /></footer>
      </div>
    </div>
  );
}
