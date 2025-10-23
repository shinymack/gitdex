// import defaultMdxComponents from 'fumadocs-ui/mdx';
// import type { MDXComponents } from 'mdx/types';
// import { Mermaid } from './src/components/mermaid';

// export function getMDXComponents(components?: MDXComponents): MDXComponents {
//   return {
//     ...defaultMdxComponents,
//     Mermaid,
//     ...components,
//   };
// }

// src/app/mdx-components.tsx


// import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
// import type { MDXComponents } from 'mdx/types';
// import { Mermaid } from './src/components/mermaid';

// export function getMDXComponents(components: MDXComponents): MDXComponents {
//   return {
//     ...components,
//     Mermaid,
//     pre: ({ children, ...props }: any) => (
//       <CodeBlock keepBackground {...props}>
//         <Pre>{children}</Pre>
//       </CodeBlock>
//     ),
//     code: ({ className, ...props }: any) => {
//       if (className?.includes('language-mermaid')) {
//         return <Pre className="mermaid">{props.children}</Pre>; // Fumadocs handles Mermaid
//       }
//       return <code className={className} {...props} />;
//     },
//   };
// }



import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types';
import { Mermaid } from '@/src/components/mermaid'

export function getMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Mermaid,
    pre: ({ ref: _ref, ...props }) => (
      <CodeBlock {...props}>
        <Pre>{props.children}</Pre>
      </CodeBlock>
    ),
    ...components
  };
}