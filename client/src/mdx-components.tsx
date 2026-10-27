import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Mermaid } from '@/components/mermaid';
import { parseGitHubSourceHref, SourceLink } from '@/components/SourceLink';

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Mermaid,
    pre: ({ ref: _ref, ...props }) => <CodeBlock {...props}><Pre>{props.children}</Pre></CodeBlock>,
    a: ({ href, children, ...props }) => {
      const source = parseGitHubSourceHref(href);
      if (source) return <SourceLink source={source} title={props.title}>{children}</SourceLink>;
      // Markdown remains non-executable, including link protocols obscured by whitespace.
      const destination = href?.replace(/[\u0000-\u0020\u007f]/g, '') ?? '';
      if (/^[a-z][a-z\d+.-]*:/i.test(destination) && !/^(https?:|mailto:)/i.test(destination)) return <span>{children}</span>;
      return <a {...props} href={href}>{children}</a>;
    },
    ...components,
  };
}
