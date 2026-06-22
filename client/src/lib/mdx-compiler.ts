import { createCompiler } from '@fumadocs/mdx-remote';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { visit } from 'unist-util-visit';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const remarkFixCodeLang = () => {
    return (tree: any) => {
        visit(tree, 'code', (node: any) => {
            if (!node.lang) return;
            const supported = new Set([
                'mermaid', 'js', 'jsx', 'ts', 'tsx', 'bash', 'sh', 'json',
                'html', 'css', 'md', 'mdx', 'python', 'py', 'rust', 'go',
                'java', 'c', 'cpp', 'sql', 'yaml', 'yml', 'text', 'plaintext', 'diff',
            ]);
            if (!supported.has(node.lang)) {
                node.lang = ['env', 'ini', 'toml', 'rb', 'ruby', 'php', 'cs', 'swift', 'kotlin'].includes(node.lang)
                    ? 'bash'
                    : 'text';
            }
        });
    };
};

/**
 * Escapes bare curly braces in text and inlineCode nodes so the MDX JSX
 * parser doesn't treat model-generated content like `^{th}` as JS expressions.
 *
 * Must run AFTER remarkMath so that $...$ blocks are already converted to
 * math nodes (not text nodes) and their internal braces are never touched.
 *
 * Code block nodes are excluded - their content is verbatim and escaping
 * would cause literal backslashes to appear in rendered code.
 */
const remarkEscapeBraces = () => {
    return (tree: any) => {
        visit(tree, ['text', 'inlineCode'], (node: any) => {
            if (typeof node.value === 'string') {
                node.value = node.value.replace(/([{}])/g, '\\$1');
            }
        });
    };
};

export const compiler = createCompiler({
    remarkPlugins: [
        remarkFixCodeLang,
        remarkMath,         // must come before remarkEscapeBraces
        remarkEscapeBraces, // safe: math nodes already extracted
        remarkMdxMermaid,
    ],
    rehypePlugins: [
        rehypeKatex,
    ],
});