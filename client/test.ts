// test-dynamic-source.ts
import { createDynamicSource, extractHeadings, resolveRelativeLink } from './lib/dynamic-source';

async function test() {
  try {
    // Replace with a real indexed repo (e.g., from your backend run)
    const repo = 'Chat-App-MERN'; // Or whatever you indexed
    console.log(`\nTesting for repo: ${repo}\n`);

    const source = await createDynamicSource(repo);
    console.log('=== Page Tree (Sidebar Structure) ===');
    console.dir(source.pageTree, { depth: 3 }); // Logs hierarchical nodes

    console.log('\n=== Pages Map (All Files) ===');
    console.log(Object.keys(source.pagesMap)); // Logs slugs like ['_toc', '1_system-overview', '2.1_authentication...']

    console.log('\n=== Sample Page Data ===');
    const sample = source.pagesMap['1_system-overview']; // Adjust slug if needed
    if (sample) console.dir(sample, { depth: 1 });

    console.log('\n=== Sample Relative Link Resolution ===');
    // From slug ['2_backend-architecture-and-apis'], resolve './3.1_user-interface-components.mdx'
    const resolved = resolveRelativeLink(['2_backend-architecture-and-apis'], './3.1_user-interface-components.mdx', source.pagesMap);
    console.log('Resolved href:', resolved); // Should be '/3.1-user-interface-components' (wait, slugify? Wait, in resolve, I have it as is; adjust if titles have spaces)

    console.log('\n=== Sample Headings Extraction (from a content snippet) ===');
    // Mock content for test
    const mockContent = '# H1 Title\n## H2 Sub\n### H3 Deep\nText here';
    const headings = extractHeadings(mockContent);
    console.dir(headings, { depth: 1 });
  } catch (error) {
    console.error('Test failed:', error);
    // Common issues: 404 if repo/docs/{repo} not indexed yet, or invalid token
  }
}

test();