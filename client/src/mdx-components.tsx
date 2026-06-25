import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Mermaid } from '@/components/mermaid';
import { SourceLink } from '@/components/SourceLink';

function extractText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.props && node.props.children) return extractText(node.props.children);
  return '';
}

export function getMDXComponents(components?: MDXComponents & { owner?: string; repo?: string; defaultBranch?: string }): MDXComponents {
  const { owner, repo, defaultBranch = 'main', ...passedComponents } = components || {};
  return {
    ...defaultMdxComponents,
    Mermaid,
    pre: ({ ref: _ref, ...props }) => (
      <CodeBlock {...props}>
        <Pre>{props.children}</Pre>
      </CodeBlock>
    ),
    a: (props) => {
      const text = extractText(props.children).trim();

      // Match files with extensions, optionally followed by colon and line numbers (including hyphens/en-dashes/em-dashes)
      // e.g. client/src/app/layout.tsx:17-38 or README.md:34–35
      const sourceRefRegex = /^([a-zA-Z0-9_\-\.\/]+)\.[a-zA-Z0-9]+(?::\d+(?:[\-\u2013\u2014]\d+)?)?$/;
      const isSourceRef = sourceRefRegex.test(text);

      if (isSourceRef && owner && repo) {
        const parts = text.split(':');
        const filePath = parts[0];
        const lines = parts[1] || '';
        return (
          <SourceLink
            owner={owner}
            repo={repo}
            defaultBranch={defaultBranch}
            filePath={filePath}
            lines={lines}
          />
        );
      }

      return <a {...props} />;
    },
    ...passedComponents,
  };
}
