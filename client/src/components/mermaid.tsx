'use client';

import { use, useEffect, useId, useState, useRef } from 'react';
import { useTheme } from 'next-themes';
import { Maximize2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function Mermaid({ 
  chart, 
  border = true, 
  margin = true 
}: { 
  chart: string; 
  border?: boolean; 
  margin?: boolean; 
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <MermaidContent chart={chart} border={border} margin={margin} />;
}

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(
  key: string,
  setPromise: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function wrapLabelText(text: string, maxLen: number = 20): string {
  if (text.includes('<br') || text.includes('\n')) return text;
  if (text.length <= maxLen) return text;

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + (currentLine ? ' ' : '') + word).length > maxLen) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        lines.push(word);
      }
    } else {
      currentLine += (currentLine ? ' ' : '') + word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.join('<br/>');
}

function fixMermaidSyntax(chart: string): string {
  let fixedChart = chart.trim();

  const cleanContent = (content: string) => content.replace(/['"`]/g, '');

  fixedChart = fixedChart.replace(/(\w+)(\[\[?|\(\(?|\{\{?|\[\()\s*"([^"\n]+)"\s*(\]\]?|\)\)?|\}\}?|\)\])/g, (match, id, open, content, close) => {
    const cleaned = cleanContent(content);
    const wrapped = wrapLabelText(cleaned);
    return `${id}${open}"${wrapped}"${close}`;
  });

  fixedChart = fixedChart.replace(/(\w+)(\[\[?|\(\(?|\{\{?|\[\()([^"\]\)\}\n]+)(\]\]?|\)\)?|\}\}?|\)\])/g, (match, id, open, content, close) => {
    const cleaned = cleanContent(content);
    const wrapped = wrapLabelText(cleaned);
    return `${id}${open}"${wrapped}"${close}`;
  });

  fixedChart = fixedChart.replace(/(==>|-->|-\.->)\s*\|"?([^"|\n]+)"?\|/g, (match, arrow, content) => {
    const cleaned = cleanContent(content);
    const wrapped = wrapLabelText(cleaned, 25);
    return `${arrow}|"${wrapped}"|`;
  });

  fixedChart = fixedChart.replace(/(\w+)\s*--\s*"([^"\n]+)"\s*-->\s*(\w+)/g, (match, from, content, to) => {
    const cleaned = cleanContent(content);
    const wrapped = wrapLabelText(cleaned, 25);
    return `${from} -->|"${wrapped}"| ${to}`;
  });

  fixedChart = fixedChart.replace(/(\w+)\s*--\s*"([^"]*)"\s*-->\s*(\w+)\s*:\s*"([^"]*)"/g, (match, from, label1, to, label2) => {
    const wrapped = wrapLabelText(`${label1}: ${label2}`);
    return `${from} -->|"${wrapped}"| ${to}`;
  });

  fixedChart = fixedChart.replace(/(\w+)\s*-->\s*(\w+)\s*:\s*"([^"]*)"/g, (match, from, to, label) => {
    const cleanedLabel = cleanContent(label);
    const wrapped = wrapLabelText(cleanedLabel);
    return `${from} -->|"${wrapped}"| ${to}`;
  });

  fixedChart = fixedChart.replace(/(\w+)\s*-\.\->\s*(\w+)\s*:\s*"([^"]*)"/g, (match, from, to, label) => {
    const cleanedLabel = cleanContent(label);
    const wrapped = wrapLabelText(cleanedLabel);
    return `${from} -.->|"${wrapped}"| ${to}`;
  });

  fixedChart = fixedChart.replace(/SubGraph\s+([^\n]+)\n([\s\S]*?)End/g, (match, name, content) => {
    return `subgraph "${name.trim()}"\n${content}end`;
  });

  fixedChart = fixedChart.replace(/(\w+)\s*==>\s*(\w+)\s*:\s*"([^"]*)"/g, (match, from, to, label) => {
    const cleanedLabel = cleanContent(label);
    const wrapped = wrapLabelText(cleanedLabel);
    return `${from} ==>|"${wrapped}"| ${to}`;
  });

  fixedChart = fixedChart.replace(/(\w+)\s*-\.\s*>\s*(\w+)/g, '$1 -.-> $2');
  fixedChart = fixedChart.replace(/(\w+)\s*-+\s*>\s*(\w+)/g, '$1 --> $2');
  fixedChart = fixedChart.replace(/(\w+)\s*=\s*>\s*(\w+)/g, '$1 ==> $2');

  return fixedChart;
}

function MermaidContent({ 
  chart, 
  border = true, 
  margin = true 
}: { 
  chart: string; 
  border?: boolean; 
  margin?: boolean; 
}) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const panzoomRef = useRef<any>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { default: mermaid } = use(
    cachePromise('mermaid', () => import('mermaid')),
  );

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    htmlLabels: true,
    fontFamily: '"Plus Jakarta Sans", var(--font-mzh), sans-serif',
    flowchart: {
      padding: 24,
    },
    themeCSS: `
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
      margin: 1.5rem auto 0;
      .node rect, .node circle, .node ellipse, .node polygon, .node path {
        stroke-width: 2.5px !important;
      }
      .label {
        font-family: "Plus Jakarta Sans", sans-serif !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        text-align: center;
      }
      text.nodeLabel, text.labelText, .label, .edgeLabel span {
        font-family: "Plus Jakarta Sans", sans-serif !important;
        font-size: 14px !important;
        font-weight: 600 !important;
      }
    `,
    theme: resolvedTheme === 'dark' ? 'dark' : 'default',
    look: 'handDrawn',
    suppressErrorRendering: true,
  });

  const renderResult = use(
    cachePromise(`${chart}-${resolvedTheme}`, async () => {
      try {
        if (typeof window !== 'undefined' && document.fonts) {
          try {
            await Promise.race([
              document.fonts.ready,
              new Promise((resolve) => setTimeout(resolve, 1500)),
            ]);
          } catch (e) {
            console.warn('Font loading check failed:', e);
          }
        }

        const fixedChart = fixMermaidSyntax(chart);
        try {
          const result = await mermaid.render(id, fixedChart.replaceAll('\\n', '\n'));
          return { success: true, ...result };
        } catch (fixedError) {
          console.log('Fixed rendering failed, trying original:', fixedError);
          try {
            const result = await mermaid.render(id + '-original', chart.replaceAll('\\n', '\n'));
            return { success: true, ...result };
          } catch (originalError) {
            const error = originalError as Error;
            return {
              success: false,
              error: error.message || 'Unknown Mermaid error',
              svg: `
                <div class="border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 rounded-md p-4">
                  <div class="flex items-start space-x-2">
                    <div class="text-red-500 mt-0.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                    </div>
                    <div class="flex-1">
                      <div class="text-sm font-medium text-red-800 dark:text-red-200">Mermaid Diagram Error</div>
                      <details class="mt-2">
                        <summary class="text-xs text-red-600 dark:text-red-400 cursor-pointer">View diagram code</summary>
                        <pre class="mt-1 p-2 text-xs bg-red-100 dark:bg-red-900/20 rounded overflow-x-auto"><code>${chart.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                      </details>
                    </div>
                  </div>
                </div>
              `,
              rawChart: chart
            };
          }
        }
      } catch (err) {
        const errorm = err as Error;
        console.error('Mermaid rendering error:', err);
        return {
          success: false,
          error: errorm.message || 'Unknown Mermaid error',
          svg: `
            <div class="border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 rounded-md p-4">
              <div class="flex items-start space-x-2">
                <div class="text-red-500 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                </div>
                <div class="flex-1">
                  <div class="text-sm font-medium text-red-800 dark:text-red-200">Mermaid Diagram Error</div>
                  <details class="mt-2">
                    <summary class="text-xs text-red-600 dark:text-red-400 cursor-pointer">View diagram code</summary>
                    <pre class="mt-1 p-2 text-xs bg-red-100 dark:bg-red-900/20 rounded overflow-x-auto"><code>${chart.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                  </details>
                </div>
              </div>
            </div>
          `,
          rawChart: chart
        };
      }
    }),
  );

  // Process the SVG content when the result changes
  useEffect(() => {
    if (renderResult.success) {
      console.log('Mermaid rendered successfully');

      // Extract just the SVG content
      const svgMatch = renderResult.svg.match(/<svg[^>]*>[\s\S]*?<\/svg>/);
      if (svgMatch) {
        const extractedSvg = svgMatch[0];
        console.log('SVG extracted successfully');
        setSvgContent(extractedSvg);
        setError(null);
        setIsLoading(false);
      } else {
        console.error('No SVG found in rendered content');
        setError('No SVG content found in rendered diagram');
        setIsLoading(false);
      }
    } else {
      setError(renderResult.error || 'Failed to render diagram');
      setIsLoading(false);
    }
  }, [renderResult]);

  // Initialize panzoom when SVG content is available
  useEffect(() => {
    if (containerRef.current && svgContent && !panzoomRef.current) {
      // Import panzoom dynamically
      import('panzoom').then((panzoomModule) => {
        const svgElement = containerRef.current?.querySelector('svg');
        if (svgElement) {
          try {
            panzoomRef.current = panzoomModule.default(svgElement, {
              zoomSpeed: 0.1,
              minZoom: 0.5,
              maxZoom: 5,
              filterKey: () => false, // Disable keyboard controls
              beforeWheel: (e: WheelEvent) => {
                // Only allow zoom with Ctrl/Cmd key
                return e.ctrlKey || e.metaKey;
              },
            });
            console.log('Panzoom initialized successfully');
          } catch (error) {
            console.error('Error initializing panzoom:', error);
          }
        }
      });
    }

    // Cleanup function
    return () => {
      if (panzoomRef.current) {
        try {
          panzoomRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing panzoom:', e);
        }
        panzoomRef.current = null;
      }
    };
  }, [svgContent, isFullscreen]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 border rounded-md bg-muted/20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !renderResult.success) {
    return (
      <div
        dangerouslySetInnerHTML={{ __html: renderResult.svg }}
      />
    );
  }

  return (
    <div className={margin ? "mermaid-pan-zoom-container" : ""}>
      <div className="relative group">
        <div
          ref={containerRef}
          className="mermaid-svg-wrapper"
          style={{
            border: border ? `1px solid ${resolvedTheme === 'dark' ? '#1a1a1a' : '#e5e7eb'}` : 'none',
            borderRadius: border ? '0.5rem' : '0',
            overflow: 'hidden',
            background: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
            minHeight: '400px',
            cursor: 'grab',
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />

        <div className="absolute top-2 right-2 z-10 transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100">
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1.5 bg-background/85 hover:bg-muted text-foreground border rounded-md shadow-sm transition-colors cursor-pointer"
            title="Expand diagram"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Add controls hint */}
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <span>💡 Tip: Drag to pan, Scroll to zoom</span>
        <button
          onClick={() => {
            if (panzoomRef.current) {
              panzoomRef.current.moveTo(0, 0);
              panzoomRef.current.zoomAbs(0, 0, 1);
            }
          }}
          className="px-2 py-1 bg-muted hover:bg-muted/80 rounded transition-colors"
        >
          Reset View
        </button>
      </div>

      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[90vw] w-[90vw] md:max-w-[85vw] md:w-[85vw] h-[85vh] flex flex-col p-6 pt-10">
          <MermaidDialogContent svgContent={svgContent} resolvedTheme={resolvedTheme || 'dark'} />
        </DialogContent>
      </Dialog>

      {/* Add custom styles */}
      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        
        .mermaid-pan-zoom-container {
          margin: 1.5rem auto;
        }
        
        .mermaid-svg-wrapper {
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        
        .mermaid-svg-wrapper:active {
          cursor: grabbing;
        }
        
        .mermaid-svg-wrapper :global(svg) {
          max-width: 100%;
          height: auto;
          display: block;
        }

        .mermaid-svg-wrapper :global(svg text),
        .mermaid-svg-wrapper :global(svg .label),
        .mermaid-svg-wrapper :global(svg .edgeLabel span) {
          font-family: "Plus Jakarta Sans", sans-serif !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          text-anchor: middle !important;
        }
      `}</style>
    </div>
  );
}

function MermaidDialogContent({ svgContent, resolvedTheme }: { svgContent: string; resolvedTheme: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panzoomRef = useRef<any>(null);

  useEffect(() => {
    if (containerRef.current && svgContent && !panzoomRef.current) {
      import('panzoom').then((panzoomModule) => {
        const svgElement = containerRef.current?.querySelector('svg');
        if (svgElement) {
          try {
            panzoomRef.current = panzoomModule.default(svgElement, {
              zoomSpeed: 0.1,
              minZoom: 0.2,
              maxZoom: 8,
              filterKey: () => false, // Disable keyboard controls
            });
          } catch (error) {
            console.error('Error initializing panzoom in dialog:', error);
          }
        }
      });
    }

    return () => {
      if (panzoomRef.current) {
        try {
          panzoomRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing panzoom in dialog:', e);
        }
        panzoomRef.current = null;
      }
    };
  }, [svgContent]);

  return (
    <div className="flex-1 w-full h-full relative flex items-center justify-center overflow-hidden bg-background/50 border rounded-md min-h-[60vh] max-h-[75vh] cursor-grab active:cursor-grabbing">
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center p-8 dialog-mermaid-wrapper"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      <div className="absolute bottom-4 left-4 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded border">
        💡 Drag to pan, Scroll to zoom
      </div>
      <button
        onClick={() => {
          if (panzoomRef.current) {
            panzoomRef.current.moveTo(0, 0);
            panzoomRef.current.zoomAbs(0, 0, 1);
          }
        }}
        className="absolute bottom-4 right-4 px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded border transition-colors cursor-pointer"
      >
        Reset View
      </button>

      <style jsx global>{`
        .dialog-mermaid-wrapper svg {
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          display: block;
        }
      `}</style>
    </div>
  );
}