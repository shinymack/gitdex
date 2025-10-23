// import { defineConfig } from 'fumadocs-mdx/config';
// import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';

// export const docs = defineDocs({
//   dir: 'content/docs',
// });

// export default defineConfig({
//   mdxOptions: {
//     remarkPlugins: [remarkMdxMermaid],
//   },
// });


// client/source.config.ts
import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';

// // Create a custom plugin wrapper that adds error handling
// const safeRemarkMdxMermaid = () => {
//   const plugin = remarkMdxMermaid();
  
//   return (tree: any) => {
//     try {
//       // Find all mermaid code blocks
//       const visit = require('unist-util-visit');
//       visit(tree, 'code', (node: any) => {
//         if (node.lang === 'mermaid') {
//           let mermaidCode = node.value.trim();
          
//           mermaidCode = mermaidCode.replace(/([A-Za-z0-9_]+)\[([^\]]+)\]/g, (match, id, text) => {
//             if (!text.startsWith('"') && !text.endsWith('"')) {
//               return `${id}["${text}"]`;
//             }
//             return match;
//           });
    
          
//           const validTypes = ['graph TD', 'graph LR', 'flowchart TD', 'flowchart LR', 'sequenceDiagram', 'classDiagram'];
//           const firstLine = mermaidCode.split('\n')[0].trim();
//           if (!validTypes.some(type => firstLine.includes(type))) {
//             mermaidCode = `graph TD\n${mermaidCode}`;
//           }
          
//           node.value = mermaidCode;
//         }
//       });
      
//       // Now apply the original plugin
//       return plugin(tree);
//     } catch (error) {
//       console.error('Error processing Mermaid diagrams:', error);
//       return tree; // Return the original tree if there's an error
//     }
//   };
// };

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
  },
});