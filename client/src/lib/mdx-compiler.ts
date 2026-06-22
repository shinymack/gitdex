import { createCompiler } from '@fumadocs/mdx-remote';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { visit } from 'unist-util-visit';

// Custom plugin to fix unsupported Shiki languages so the page doesn't crash
const remarkFixCodeLang = () => {
    return (tree: any) => {
        visit(tree, 'code', (node: any) => {
            if (!node.lang) return;

            const supportedLangs = ['mermaid','js', 'jsx', 'ts', 'tsx', 'bash', 'sh', 'json', 'html', 'css', 'md', 'mdx', 'python', 'py', 'rust', 'go', 'java', 'c', 'cpp', 'sql', 'yaml', 'yml', 'text', 'plaintext', 'diff'];

            if (!supportedLangs.includes(node.lang)) {
                // Map common non-supported langs to safe fallbacks
                if (['env', 'ini', 'toml'].includes(node.lang)) {
                    node.lang = 'bash';
                } else {
                    node.lang = 'text';
                }
            }
        });
    };
};

export const compiler = createCompiler({
    remarkPlugins: [
        remarkFixCodeLang, // Run this BEFORE Mermaid so Shiki doesn't crash
        remarkMdxMermaid
    ]
});