'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, Code, RefreshCw, GitFork, ArrowRight, Sparkles } from 'lucide-react';

export default function FeatureGrid() {
  const [pulse, setPulse] = useState(false);
  const [syncState, setSyncState] = useState(0);

  // Sync state loop simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setSyncState((prev) => (prev + 1) % 4);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="mb-16 w-full">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-auto">
        {/* Bento Card 1: Smart AI Analysis (2/3 width) */}
        <div className="md:col-span-2 group rounded-[2rem] p-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.005] hover:border-primary/30 shadow-sm">
          <div className="rounded-[calc(2rem-0.25rem)] p-6 md:p-8 bg-card/65 dark:bg-zinc-950/40 backdrop-blur-md h-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-foreground">
                Smart AI Analysis
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                AI-powered code analysis that understands your project structure and generates comprehensive documentation.
              </p>
            </div>

            {/* Analysis Mockup Interface */}
            <div className="lg:col-span-6 w-full bg-zinc-100/70 dark:bg-black/60 border border-border/60 rounded-xl p-4 flex flex-col justify-between overflow-hidden shadow-sm h-full min-h-[140px] select-none text-[10px] font-mono text-muted-foreground">
              <div className="flex items-center justify-between border-b border-border/30 pb-2 mb-2 text-muted-foreground/60 text-[8px]">
                <span>REPOSITORY ANALYZER</span>
                <span className="text-primary font-semibold">ACTIVE</span>
              </div>
              <div className="flex-1 flex flex-col gap-1.5 justify-center">
                <div className="flex items-center gap-2 text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>[1/3] Scanning codebase tree... 100%</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>[2/3] Mapping module hierarchy... 100%</span>
                </div>
                <div className="flex items-center gap-2 text-primary animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span>[3/3] Generating MDX documentation...</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Card 2: Architecture Diagrams (1/3 width) */}
        <div className="group rounded-[2rem] p-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.005] hover:border-primary/30 shadow-sm">
          <div className="rounded-[calc(2rem-0.25rem)] p-6 bg-card/65 dark:bg-zinc-950/40 backdrop-blur-md h-full flex flex-col justify-between min-h-[300px]">
            <div className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Code className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-foreground">
                Architecture Flowcharts
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Map structural relationships automatically. Renders modular diagrams indicating parent-child linkages in real time.
              </p>
            </div>

            {/* SVG Visual Node representation */}
            <div className="mt-6 border border-dashed border-border/40 rounded-xl p-3 bg-zinc-950/10 dark:bg-black/10 flex items-center justify-center min-h-[100px]">
              <svg viewBox="0 0 160 80" className="w-full max-w-[150px] text-primary">
                <rect x="5" y="25" width="40" height="20" rx="4" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1" />
                <text x="25" y="37" fontSize="6" textAnchor="middle" fill="currentColor" className="font-mono">Router</text>

                <path d="M 45 35 L 75 15 M 45 35 L 75 55" stroke="currentColor" strokeWidth="0.8" fill="none" strokeDasharray="3,3" />

                <rect x="75" y="5" width="45" height="20" rx="4" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1" />
                <text x="97" y="17" fontSize="6" textAnchor="middle" fill="currentColor" className="font-mono">AuthCtx</text>

                <rect x="75" y="45" width="45" height="20" rx="4" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1" />
                <text x="97" y="57" fontSize="6" textAnchor="middle" fill="currentColor" className="font-mono">Database</text>
              </svg>
            </div>
          </div>
        </div>

        {/* Bento Card 3: Interactive AI Assistant (2/3 width) */}
        <div className="md:col-span-2 group rounded-[2rem] p-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.005] hover:border-primary/30 shadow-sm">
          <div className="rounded-[calc(2rem-0.25rem)] p-6 md:p-8 bg-card/65 dark:bg-zinc-950/40 backdrop-blur-md h-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-foreground">
                Interactive AI Codebase Assistant
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                Chat with your codebase directly. The assistant contextually references and reads specific repository files to answer technical questions without hallucination.
              </p>
            </div>

            {/* Responsive Interface Mockup (Chat Mock) */}
            <div className="lg:col-span-6 w-full bg-zinc-100/70 dark:bg-black/60 border border-border/60 rounded-xl p-3.5 flex flex-col justify-between overflow-hidden shadow-sm h-full min-h-[160px] text-[10px] select-none">
              <div>
                <div className="flex items-center justify-between border-b border-border/30 pb-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-semibold text-foreground">GitDex Assistant</span>
                  </div>
                  <span className="text-[8px] font-mono text-muted-foreground/80">pipeline.ts</span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="bg-primary/10 border border-primary/20 text-foreground px-2.5 py-1.5 rounded-2xl rounded-tr-sm self-end max-w-[85%] text-right font-sans">
                    Explain buildSchema in pipeline.ts
                  </div>
                  <div className="bg-zinc-200/40 dark:bg-zinc-900/60 border border-border/40 text-muted-foreground dark:text-foreground/85 px-2.5 py-1.5 rounded-2xl rounded-tl-sm self-start max-w-[90%] leading-normal font-sans">
                    It maps raw data array's `uid` to `id` and validates whether a valid `name` string exists.
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-border/20 flex items-center justify-between text-muted-foreground/50 text-[8px] font-sans">
                <span>Ask GitDex...</span>
                <div className="w-3.5 h-3.5 rounded bg-primary/10 flex items-center justify-center text-primary">
                  <ArrowRight className="w-2.5 h-2.5" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Card 4: On-Demand Updates (1/3 width) */}
        <div className="group rounded-[2rem] p-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.005] hover:border-primary/30 shadow-sm">
          <div className="rounded-[calc(2rem-0.25rem)] p-6 bg-card/65 dark:bg-zinc-950/40 backdrop-blur-md h-full flex flex-col justify-between min-h-[300px]">
            <div className="flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <RefreshCw className={`w-5 h-5 ${syncState === 1 ? 'animate-spin' : ''}`} />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-foreground">
                On-Demand Updates
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Refresh your documentation instantly. Re-index your repository with a single click to scan recent commits and rebuild maps.
              </p>
            </div>

            {/* Reindex Mockup Interface */}
            <div className="mt-6 bg-zinc-100/70 dark:bg-black/60 border border-border/60 rounded-xl p-4 h-[90px] flex flex-col items-center justify-center gap-2.5 shadow-sm select-none">
              <button className={`w-full py-2 px-4 rounded-lg font-sans text-[10px] font-semibold transition-all duration-300 ${
                syncState === 1 
                  ? 'bg-primary/20 text-primary border border-primary/30 cursor-wait' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/95 cursor-pointer shadow-sm active:scale-95'
              }`}>
                {syncState === 1 ? 'Indexing Repository...' : 'Reindex Repository'}
              </button>
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground/80">
                <span className={`w-1.5 h-1.5 rounded-full ${syncState === 1 ? 'bg-primary animate-ping' : 'bg-emerald-500'}`} />
                <span>{syncState === 1 ? 'Syncing commits...' : 'Status: Up to date'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
