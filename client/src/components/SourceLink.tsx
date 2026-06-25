'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SourceLink({
  owner,
  repo,
  defaultBranch,
  filePath,
  lines,
}: {
  owner: string;
  repo: string;
  defaultBranch: string;
  filePath: string;
  lines: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  let githubUrl = `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${filePath}`;
  if (lines) {
    const lineParts = lines.split(/[\-\u2013\u2014]/).map(p => p.trim());
    const start = lineParts[0];
    const end = lineParts[1];
    if (start) {
      githubUrl += `#L${start}`;
      if (end) {
        githubUrl += `-L${end}`;
      }
    }
  }

  useEffect(() => {
    if (!open || code) return;

    setLoading(true);
    setError('');

    // Fetch raw content from GitHub
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${filePath}`;
    fetch(rawUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch source file from GitHub');
        return res.text();
      })
      .then((text) => {
        if (lines) {
          const allLines = text.split('\n');
          const lineParts = lines.split(/[\-\u2013\u2014]/).map(p => p.trim());
          const startLine = Math.max(1, parseInt(lineParts[0] || '1'));
          const endLine = lineParts[1] ? Math.min(allLines.length, parseInt(lineParts[1])) : startLine;

          const selectedLines = allLines.slice(startLine - 1, endLine);
          setCode(selectedLines.join('\n'));
        } else {
          setCode(text);
        }
      })
      .catch((err: any) => {
        console.error(err);
        setError(err.message || 'Failed to load file contents.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, owner, repo, defaultBranch, filePath, lines, code]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border/80 text-xs font-mono transition-colors no-underline cursor-pointer align-middle mx-1"
      >
        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 16 16">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        <span>{filePath}</span>
        {lines && <span className="opacity-60 bg-background px-1 rounded border border-border/50">{lines}</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[85vw] w-[85vw] max-h-[80vh] flex flex-col p-6 pt-10">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-bold flex items-center justify-between gap-4 font-mono truncate pr-6">
              <span className="truncate">{filePath}:{lines}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {code && (
                  <Button variant="outline" size="sm" onClick={handleCopy} className="h-8 flex items-center gap-1.5 cursor-pointer">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </Button>
                )}
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-md shadow-sm transition-colors"
                >
                  <span>GitHub</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Previewing code from {owner}/{repo} branch {defaultBranch}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-sm max-h-[55vh]">
            {loading && (
              <div className="w-full h-full flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span>Loading source code...</span>
              </div>
            )}

            {error && (
              <div className="text-destructive p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                {error}
              </div>
            )}

            {!loading && !error && code && (
              <pre className="overflow-x-auto whitespace-pre leading-relaxed pr-4">
                <code>
                  {code.split('\n').map((line, idx) => {
                    const lineParts = lines.split(/[\-\u2013\u2014]/).map(p => p.trim());
                    const startLine = Math.max(1, parseInt(lineParts[0] || '1'));
                    const currentLineNumber = startLine + idx;
                    return (
                      <div key={idx} className="flex hover:bg-muted/50 py-0.5 px-1 rounded transition-colors">
                        <span className="w-10 text-right select-none text-muted-foreground/60 mr-4 pr-2 border-r border-border font-mono text-xs leading-6">
                          {currentLineNumber}
                        </span>
                        <span className="flex-1 font-mono text-sm leading-6 whitespace-pre">{line}</span>
                      </div>
                    );
                  })}
                </code>
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
