import { createCompiler } from '@fumadocs/mdx-remote';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { visit } from 'unist-util-visit';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// Languages guaranteed to be bundled by Shiki / Fumadocs
const SUPPORTED_LANGS = new Set([
  'js', 'javascript', 'jsx', 'ts', 'typescript', 'tsx',
  'bash', 'sh', 'zsh', 'shell', 'json', 'jsonc',
  'html', 'css', 'scss', 'sql',
  'md', 'markdown', 'mdx',
  'py', 'python', 'rust', 'rs', 'go', 'golang',
  'java', 'c', 'cpp', 'c++', 'cs', 'csharp', 'php',
  'rb', 'ruby', 'swift', 'kt', 'kotlin',
  'yaml', 'yml', 'mermaid', 'diff', 'text', 'plaintext'
]);

const ALIAS_MAP: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  golang: 'go',
  csharp: 'cs',
  ruby: 'rb',
  kotlin: 'kt',
  markdown: 'md',
  shell: 'bash',
  zsh: 'bash',
  sh: 'bash',
  // Map configuration/script formats to bash so Shiki renders syntax without throwing missing-bundle errors
  env: 'bash',
  ini: 'bash',
  toml: 'bash',
  docker: 'bash',
  dockerfile: 'bash',
  properties: 'bash',
  conf: 'bash',
  cfg: 'bash',
};

const remarkFixCodeLang = () => {
  return (tree: unknown) => {
    visit(tree as never, 'code', (node: { lang?: string }) => {
      if (!node.lang) return;
      const langLower = node.lang.toLowerCase().trim();
      const mapped = ALIAS_MAP[langLower] || langLower;
      if (SUPPORTED_LANGS.has(mapped)) {
        node.lang = mapped;
      } else {
        node.lang = 'text';
      }
    });
  };
};

// Generated content is Markdown, never executable MDX or raw HTML.
const remarkLiteralHtml = () => (tree: unknown) => {
  visit(tree as never, 'html', (node: { type: string; value: string }) => {
    node.type = 'text';
  });
};

export const compiler = createCompiler({
  format: 'md',
  remarkPlugins: [
    remarkFixCodeLang,
    remarkMath,
    remarkLiteralHtml,
    remarkMdxMermaid,
  ],
  rehypePlugins: [
    rehypeKatex,
  ],
});
