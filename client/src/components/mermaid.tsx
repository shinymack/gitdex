'use client';

import { use, useEffect, useId, useState, useRef } from 'react';
import { useTheme } from 'next-themes';

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <MermaidContent chart={chart} />;
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

// Enhanced function to fix common Mermaid syntax issues
function fixMermaidSyntax(chart: string): string {
  let fixedChart = chart.trim();

  // Helper function to clean content by removing all quotes (single, double, backticks)
  const cleanContent = (content: string) => content.replace(/['"`]/g, '');

  // Fix node content for square brackets: A[...]
  fixedChart = fixedChart.replace(/(\w+)\[([^\]]+)\]/g, (match, id, content) => {
    const cleaned = cleanContent(content);
    return `${id}["${cleaned}"]`;
  });

  // Fix node content for parentheses: A(...)
  fixedChart = fixedChart.replace(/(\w+)\(([^)]+)\)/g, (match, id, content) => {
    const cleaned = cleanContent(content);
    return `${id}("${cleaned}")`;
  });

  // Fix node content for curly braces: A{...}
  fixedChart = fixedChart.replace(/(\w+)\{([^}]+)\}/g, (match, id, content) => {
    const cleaned = cleanContent(content);
    return `${id}{"${cleaned}"}`;
  });

  fixedChart = fixedChart.replace(/([\w\s]*)([\[\(\{\|])([^\]\)\}\|"'`]+)([\]\)\}\|])/g, (match, prefix, open, content, close) => {
    const cleaned = cleanContent(content);
    return `${prefix}${open}"${cleaned}"${close}`;
  });

  // Fix the main issue: arrows with both labels and text after the arrow
  // Pattern for: A -- "Label" --> B: "Additional text"
  fixedChart = fixedChart.replace(/(\w+)\s*--\s*"([^"]*)"\s*-->\s*(\w+)\s*:\s*"([^"]*)"/g, (match, from, label1, to, label2) => {
    return `${from} -->|"${label1}: ${label2}"| ${to}`;
  });

  // Pattern for: A --> B: "Label"
  fixedChart = fixedChart.replace(/(\w+)\s*-->\s*(\w+)\s*:\s*"([^"]*)"/g, (match, from, to, label) => {
    const cleanedLabel = cleanContent(label);
    return `${from} -->|"${cleanedLabel}"| ${to}`;
  });

  // Pattern for: A -.-> B: "Label"
  fixedChart = fixedChart.replace(/(\w+)\s*-\.\->\s*(\w+)\s*:\s*"([^"]*)"/g, (match, from, to, label) => {
    const cleanedLabel = cleanContent(label);
    return `${from} -.->|"${cleanedLabel}"| ${to}`;
  });
  // Add this to your fixMermaidSyntax function
  fixedChart = fixedChart.replace(/SubGraph\s+([^\n]+)\n([\s\S]*?)End/g, (match, name, content) => {
    return `subgraph "${name.trim()}"\n${content}end`;
  });
  // Pattern for: A ==> B: "Label"
  fixedChart = fixedChart.replace(/(\w+)\s*==>\s*(\w+)\s*:\s*"([^"]*)"/g, (match, from, to, label) => {
    const cleanedLabel = cleanContent(label);
    return `${from} ==>|"${cleanedLabel}"| ${to}`;
  });

  // Fix arrow syntax without labels - first handle dotted arrows to avoid conflicts
  fixedChart = fixedChart.replace(/(\w+)\s*-\.\s*>\s*(\w+)/g, '$1 -.-> $2');

  // Fix solid arrows: any sequence of dashes followed by >
  fixedChart = fixedChart.replace(/(\w+)\s*-+\s*>\s*(\w+)/g, '$1 --> $2');

  // Fix thick arrows
  fixedChart = fixedChart.replace(/(\w+)\s*=\s*>\s*(\w+)/g, '$1 ==> $2');

  return fixedChart;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const panzoomRef = useRef<any>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { default: mermaid } = use(
    cachePromise('mermaid', () => import('mermaid')),
  );

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    themeCSS: 'margin: 1.5rem auto 0;',
    theme: resolvedTheme === 'dark' ? 'dark' : 'default',
    // Suppress default error rendering
    suppressErrorRendering: true,
  });

  const renderResult = use(
    cachePromise(`${chart}-${resolvedTheme}`, async () => {
      try {
        // First try to render the original chart without fixing
        try {
          const result = await mermaid.render(id + '-original', chart.replaceAll('\\n', '\n'));
          return { success: true, ...result };
        } catch (originalError) {
          // If original fails, try with fixed syntax
          console.log(originalError)
          try {
            const fixedChart = fixMermaidSyntax(chart);
            const result = await mermaid.render(id, fixedChart.replaceAll('\\n', '\n'));
            return { success: true, ...result };
          } catch (error) {
            // If both fail, show the raw diagram code in a neutral box
            const fixedError = error as Error;
            return {
              success: false,
              error: fixedError.message || 'Unknown Mermaid error',
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
  }, [svgContent]);

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
    <div className="mermaid-pan-zoom-container">
      <div
        ref={containerRef}
        className="mermaid-svg-wrapper"
        style={{
          border: `1px solid ${resolvedTheme === 'dark' ? '#1a1a1a' : '#e5e7eb'}`,
          borderRadius: '0.5rem',
          overflow: 'hidden',
          background: resolvedTheme === 'dark' ? '#0a0a0a' : '#ffffff',
          minHeight: '400px',
          cursor: 'grab',
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />

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

      {/* Add custom styles */}
      <style jsx>{`
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
        
        .mermaid-svg-wrapper svg {
          max-width: 100%;
          height: auto;
          display: block;
        }
      `}</style>
    </div>
  );
}