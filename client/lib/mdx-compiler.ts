import { createCompiler } from '@fumadocs/mdx-remote';
import { getMDXComponents } from '@/mdx-components';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';

export const compiler = createCompiler({
    remarkPlugins : [
        remarkMdxMermaid
    ]
});