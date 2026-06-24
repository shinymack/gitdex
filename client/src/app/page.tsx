'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ModernNav from '../components/ModernNav';
import { ClientOnly } from '@/components/ClientOnly';
import { ArrowRight, Zap, Search, Sparkles } from 'lucide-react';
import { validateGitHubUrl } from '../lib/validation';
import InteractiveConstellation from '../components/InteractiveConstellation';
import { FlickeringGrid } from '../components/FlickeringGrid';
import FeatureGrid from '../components/FeatureGrid';

function WordRotate() {
  const words = ['documentation.', 'diagrams.', 'AI chat.'];
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % words.length);
        setVisible(true);
      }, 300);
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className={`inline-block text-primary transition-all duration-300 transform ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      {words[index]}
    </span>
  );
}

interface RepoSuggestion {
  full_name: string;
  description: string;
  html_url: string;
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<RepoSuggestion[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const searchRepos = useCallback(async (q: string) => {
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSuggestions(data.items || []);
    } catch (err) {
      console.error('Search error:', err);
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);

    const timer = setTimeout(() => {
      searchRepos(query);
    }, 200);

    setDebounceTimer(timer);
    return () => clearTimeout(timer);
  }, [query, searchRepos]);

  const handleSelectRepo = (repo: RepoSuggestion) => {
    setQuery(repo.full_name);
    setSelectedRepo(repo.full_name);
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    setError('');
    const input = selectedRepo || query;
    const fullUrl = input.includes('github.com') ? input : `https://github.com/${input}`;
    const validation = validateGitHubUrl(fullUrl);
    if (!validation.valid) {
      setError(validation.error || 'Invalid GitHub URL format');
      return;
    }

    setIsLoading(true);

    try {
      const urlParts = input.split('/');
      const owner = urlParts[urlParts.length - 2];
      const repo = urlParts[urlParts.length - 1].replace('.git', '');
      const res = await fetch(`/api/status?owner=${owner}&repo=${repo}`);
      const data = await res.json();

      if (data.indexed || data.lastIndexed) {
        window.location.href = data.path || `/${owner}/${repo}`;
      } else {
        window.location.href = `/${owner}/${repo}/status`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setSelectedRepo('');
    setError('');

    if (val.trim() === '') {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setShowSuggestions(true);
  };

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowSuggestions(false);
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const input = document.getElementById('search-input');
        input?.focus();
      }
    };

    document.addEventListener('click', onDocClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground transition-colors duration-500 relative flex flex-col overflow-hidden">
      {/* Dynamic Flickering Grid Canvas Background */}
      <ClientOnly>
        <FlickeringGrid className="z-0" />
      </ClientOnly>

      {/* Floating Modern Header */}
      <ModernNav />

      {/* Ambient Gradient Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[550px] pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[15%] w-[30%] h-[35%] bg-primary/10 rounded-full blur-[140px]" />
        <div className="absolute top-[15%] right-[15%] w-[30%] h-[35%] bg-primary/10 rounded-full blur-[140px]" />
      </div>

      <main className="relative z-10 flex-1 flex flex-col pt-32 px-5 md:px-8 max-w-6xl mx-auto w-full">
        {/* Asymmetric Hero Split Layout */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center py-6 md:py-8 mb-4">
          <div className="lg:col-span-7 flex flex-col justify-center items-center lg:items-start text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-mono uppercase tracking-[0.15em] w-fit mb-6 mx-auto lg:mx-0">
              <Sparkles className="w-3 h-3 animate-pulse text-primary" />
              <span>Interactive Code Intelligence</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter leading-tight mb-6 font-headline text-foreground">
              Any repository.<br />
              <WordRotate />
            </h1>

            <p className="text-sm sm:text-base md:text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed mx-auto lg:mx-0">
              Turn any public GitHub repository into a fully indexed interactive environment. Visualize structure, map modules, and chat with an AI assistant that reads actual files.
            </p>

            {/* Search CTA Box */}
            <div ref={containerRef} className="w-full max-w-xl relative z-20 mx-auto lg:mx-0">
              <div className="flex gap-2.5 p-1.5 bg-card/45 backdrop-blur-md rounded-2xl border border-border/80 shadow-md focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
                <div className="relative flex-1 flex items-center">
                  <Search className="absolute left-3.5 text-muted-foreground/80 w-4 h-4" />
                  <Input
                    id="search-input"
                    placeholder="owner/repo (e.g. shinymack/gitdex)"
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => query.length >= 2 && setShowSuggestions(true)}
                    className="pl-10 pr-10 h-10 w-full bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/60"
                    disabled={isLoading}
                  />
                  {!query && (
                    <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border/50 bg-muted/40 px-2 font-mono text-[9px] font-medium text-muted-foreground/60">
                      <span>/</span>
                    </kbd>
                  )}
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={isLoading || !query.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary/95 px-5 h-10 rounded-xl font-medium shadow-sm transition-all duration-300 active:scale-95 flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                      <span>Indexing...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>Go to Docs</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Suggestions Dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-30 w-full mt-2.5 bg-card/90 border border-border/50 rounded-2xl shadow-xl max-h-60 overflow-y-auto backdrop-blur-xl">
                  {suggestions.map((repo) => (
                    <button
                      key={repo.full_name}
                      onClick={() => handleSelectRepo(repo)}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 border-b border-border/30 last:border-b-0 transition-colors"
                    >
                      <div className="font-semibold text-sm text-foreground">{repo.full_name}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{repo.description}</div>
                    </button>
                  ))}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2.5 mt-3.5 text-xs text-destructive bg-destructive/10 p-3.5 rounded-xl border border-destructive/20 font-mono">
                  <Zap className="w-3.5 h-3.5" />
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Free-Floating Interactive Particle Web */}
          <div className="lg:col-span-5 flex items-center justify-center w-full">
            <ClientOnly>
              <InteractiveConstellation />
            </ClientOnly>
          </div>
        </section>

        {/* Feature Ticker Strip */}
        <section className="w-full border-y border-border/30 py-4 overflow-hidden mb-12 relative bg-card/25 backdrop-blur-sm">
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
          <div className="animate-marquee flex items-center gap-12 whitespace-nowrap text-xs font-semibold tracking-wider text-muted-foreground/80 uppercase font-mono">
            <span>Multi-Step Indexing</span>
            <span className="text-primary/40">•</span>
            <span>AI Codebase Assistant</span>
            <span className="text-primary/40">•</span>
            <span>Interactive Diagrams</span>
            <span className="text-primary/40">•</span>
            <span>Serverless Queueing</span>
            <span className="text-primary/40">•</span>
            <span>Fumadocs Reader</span>
            <span className="text-primary/40">•</span>
            <span>Mermaid Flowcharts</span>
            <span className="text-primary/40">•</span>
            <span>On-Demand Updates</span>
            <span className="text-primary/40">•</span>
            <span>GitHub Integration</span>
            <span className="text-primary/40">•</span>

            {/* Duplicate for infinite loop */}
            <span>Multi-Step Indexing</span>
            <span className="text-primary/40">•</span>
            <span>AI Codebase Assistant</span>
            <span className="text-primary/40">•</span>
            <span>Interactive Diagrams</span>
            <span className="text-primary/40">•</span>
            <span>Serverless Queueing</span>
            <span className="text-primary/40">•</span>
            <span>Fumadocs Reader</span>
            <span className="text-primary/40">•</span>
            <span>Mermaid Flowcharts</span>
            <span className="text-primary/40">•</span>
            <span>On-Demand Updates</span>
            <span className="text-primary/40">•</span>
            <span>GitHub Integration</span>
            <span className="text-primary/40">•</span>
          </div>
        </section>

        {/* Asymmetric Bento Features Grid (Double-Bezel Architecture) */}
        <FeatureGrid />

        {/* Action Demo CTA with Nested Button-in-Button Arrow */}
        <section className="text-center py-12 mb-8 relative overflow-hidden rounded-3xl border border-border/25 bg-card/15 backdrop-blur-sm">
          <div className="absolute inset-0 bg-radial-gradient from-primary/5 via-transparent to-transparent opacity-30 pointer-events-none" />
          <div className="max-w-md mx-auto flex flex-col items-center gap-4 px-4">
            <p className="text-[10px] tracking-[0.2em] font-mono text-primary uppercase font-bold">Interactive Showcase</p>
            <h2 className="text-3xl font-bold tracking-tight text-foreground font-headline mb-1">Explore GitDex firsthand</h2>
            <p className="text-sm text-muted-foreground max-w-sm mb-4 leading-relaxed">
              Scan through actual indexed repo documentation, search files, and play with visual diagrams instantly.
            </p>
            <Link href="/shinymack/gitdex">
              <Button className="rounded-full bg-primary hover:bg-primary/95 text-primary-foreground font-medium px-6 py-5 h-auto group transition-all active:scale-95 shadow-lg flex items-center gap-3">
                <span>View Example Docs</span>
                <span className="w-6 h-6 rounded-full bg-white/20 dark:bg-black/20 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1">
                  <ArrowRight className="w-3.5 h-3.5 text-current" />
                </span>
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-muted-foreground border-t border-border/20 mt-auto bg-card/5">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>Built with Next.js, Fumadocs, and Gemini. Powered by GitHub API.</p>
          <div className="flex gap-4">
            <a href="https://github.com/shinymack/gitdex" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}