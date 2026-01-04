import { Octokit } from '@octokit/rest';
import { encoding_for_model } from '@dqbd/tiktoken';
import { GoogleGenAI } from '@google/genai';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const tiktoken = encoding_for_model('gpt-4');

// Helper function to recursively delete a directory and all its contents
async function deleteDirectoryRecursively(owner, repo, path) {
    try {
        console.log(`Attempting to delete contents of: ${path}`);
        const { data: contents } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
        });

        for (const item of contents) {
            if (item.type === 'dir') {
                await deleteDirectoryRecursively(owner, repo, item.path);
            } else if (item.type === 'file') {
                try {
                    console.log(`Deleting file: ${item.path}`);
                    await octokit.rest.repos.deleteFile({
                        owner,
                        repo,
                        path: item.path,
                        message: `Delete ${item.name} for cleanup`,
                        sha: item.sha,
                    });
                    console.log(`Successfully deleted: ${item.path}`);
                } catch (deleteError) {
                    console.warn(`Failed to delete ${item.path}:`, deleteError.message);
                }
            }
        }
    } catch (error) {
        if (error.status !== 404) {
            console.error(`Failed to get contents of ${path}:`, error.message);
        }
    }
}

// Helper function for generation with timeout and retry
async function generateWithRetry(prompt, retries = 5, timeoutMs = 5 * 60 * 1000) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
            );

            const result = await Promise.race([
                ai.models.generateContent({
                    model: 'gemini-2.5-flash-lite',
                    contents: [prompt],
                }),
                timeoutPromise
            ]);


            return result;
        } catch (error) {
            console.warn(`Generation attempt ${attempt + 1} failed for prompt:`, error.message);
            if (attempt === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
    }
}

// New generation function using Gemma 3 27B with strict rate limiting
// async function generateWithRetry(prompt, retries = 5, timeoutMs = 5 * 60 * 1000) {
//     // strict rate limiting (6 RPM = 1 request every 10 seconds)
//     // We add a delay BEFORE the request to ensure spacing.
//     // Ideally this should be a global queue, but since calls are sequential in processRepository, this works.
//     const SAFE_DELAY_MS = 10000;
//     console.log(`Waiting ${SAFE_DELAY_MS}ms for rate limits...`);
//     await new Promise(resolve => setTimeout(resolve, SAFE_DELAY_MS));

//     for (let attempt = 0; attempt < retries; attempt++) {
//         try {
//             const timeoutPromise = new Promise((_, reject) =>
//                 setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
//             );

//             const result = await Promise.race([
//                 ai.models.generateContent({
//                     model: 'gemma-3-27b-it',
//                     contents: [prompt],
//                 }),
//                 timeoutPromise
//             ]);

//             return result;
//         } catch (error) {
//             console.warn(`Generation attempt ${attempt + 1} failed for prompt:`, error.message);

//             // If it is a 404 (model not found), fallback to gemini-1.5-flash but throttle it?
//             if (error.message.includes('404') || error.message.includes('not found')) {
//                 console.warn("Gemma 3/2 model not found, falling back to gemini-1.5-flash");
//                 return ai.models.generateContent({
//                     model: 'gemini-3-flash',
//                     contents: [prompt],
//                 });
//             }

//             if (attempt === retries - 1) throw error;
//             // Exponential backoff for retries
//             await new Promise(resolve => setTimeout(resolve, 5000 * Math.pow(2, attempt)));
//         }
//     }
// }

// Extract the processing logic into a separate function
export async function processRepository(repoUrl) {
    console.log('ProcessRepository: Processing repository', { repoUrl });

    if (!repoUrl) {
        throw new Error('Repo URL is required');
    }

    let owner, repo;
    try {
        const url = new URL(repoUrl);
        if (url.hostname !== 'github.com') {
            throw new Error('Only GitHub repositories are supported');
        }
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length < 2) {
            throw new Error('Invalid repository URL format');
        }
        owner = pathParts[0];
        repo = pathParts[1].replace('.git', '');
    } catch (e) {
        throw new Error('Invalid repo URL: ' + e.message);
    }
    console.log('ProcessRepository: Processing repository', { owner, repo });

    const repoResponse = await octokit.rest.repos.get({ owner, repo });
    const repoData = repoResponse.data;
    if (repoData.size > 500 * 1024 * 1024) {
        throw new Error('Repository too large to process');
    }
    console.log('ProcessRepository: Repository info fetched', { size: repoData.size });

    console.log('ProcessRepository: Fetching git tree');
    const { data: treeData } = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: repoData.default_branch,
        recursive: true
    });

    const relevantFiles = treeData.tree.filter(item =>
        item.type === 'blob' &&
        item.path.match(/\.(js|ts|jsx|tsx|md|json|py|rb|go|rs|java|cpp|h|c|cs|php|css|html|sql|yaml|yml)$/i) &&
        item.size < 1000000 &&
        !item.path.match(/\b(node_modules|dist|build|\.git|__pycache__|\.lock|\.min\.js|\.bundle\.js)\b/i)
    );

    console.log('ProcessRepository: Filtered files', { count: relevantFiles.length });

    // Batch file content fetching with retry logic
    console.log('ProcessRepository: Fetching file contents in batches');
    const batchSize = 10;
    const fileContents = [];
    for (let i = 0; i < relevantFiles.length; i += batchSize) {
        const batch = relevantFiles.slice(i, i + batchSize);
        const batchPromises = batch.map(async file => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const fileResponse = await octokit.rest.repos.getContent({
                        owner,
                        repo,
                        path: file.path,
                        mediaType: { format: 'raw' },
                    });
                    return {
                        path: file.path,
                        content: fileResponse.data.toString('utf8'),
                        size: file.size
                    };
                } catch (error) {
                    console.warn(`ProcessRepository: Failed to fetch ${file.path} (attempt ${attempt + 1}):`, error.message);
                    if (attempt === 2) return null;
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        });
        const batchResults = await Promise.allSettled(batchPromises);
        fileContents.push(...batchResults
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value)
            .filter(file => file !== null));
    }
    console.log('ProcessRepository: Files fetched', { successful: fileContents.length });

    console.log('ProcessRepository: Generating global TOC');
    const filePaths = fileContents.map(f => f.path).join('\n');
    const tocPrompt = `You are GitDex, an expert in repo analysis. From these file paths in ${owner}/${repo}:

${filePaths}

Generate a hierarchical table of contents for documentation with 4-8 top-level sections, each with 1-3 subsections. Use numeric prefixes (e.g., 1., 2.1.). Titles should be descriptive and professional (e.g., "System Overview", "Core Features"). Adjust section count for large repos if needed.
For each section/subsection, provide:
- prefix: e.g., "1.", "2.1."
- title: Descriptive title
- filename: prefix_title.mdx (lowercase, no spaces, e.g., 1_system-overview.mdx)
- description: Brief 1-sentence description
- relevant_files: Array of 2-4 relevant file paths (prioritize key files by dir/name/type)

Output as JSON array of objects, sorted by prefix, with no content overlap.

Example:
[
  {"prefix": "1.", "title": "System Overview", "filename": "1_system-overview.mdx", "description": "High-level system introduction.", "relevant_files": ["README.md", "package.json"]},
  {"prefix": "2.", "title": "Frontend Implementation", "filename": "2_frontend-implementation.mdx", "description": "UI and client-side logic details.", "relevant_files": ["src/app.js"]}
]`;

    const tocResult = await generateWithRetry(tocPrompt);
    let tocText = tocResult.text.trim();
    tocText = tocText.replace(/```json\n?|\n?```/g, '').trim();
    const tocEntries = JSON.parse(tocText);
    console.log('ProcessRepository: Global TOC generated', { sections: tocEntries.length });

    tocEntries.sort((a, b) => {
        const pa = a.prefix.split('.').map(Number);
        const pb = b.prefix.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
        }
        return 0;
    });

    console.log('ProcessRepository: Sorted TOC:', tocEntries);

    console.log('ProcessRepository: Generating section MDX files');
    const generatedFiles = [];
    for (const [index, entry] of tocEntries.entries()) {
        console.log(`ProcessRepository: Processing section ${entry.prefix} ${entry.title}`);
        const relevantContents = fileContents.filter(f => entry.relevant_files.includes(f.path));

        const maxTokens = 100000;
        let truncatedContents = [];
        for (const f of relevantContents) {
            const tokens = tiktoken.encode(f.content);
            if (tokens.length > maxTokens / relevantContents.length) {
                const truncated = tiktoken.decode(tokens.slice(0, maxTokens / relevantContents.length));
                truncatedContents.push(`File: ${f.path}\n${truncated}... (truncated for length)\n---\n`);
            } else {
                truncatedContents.push(`File: ${f.path}\n${f.content}\n---\n`);
            }
        }
        const contentBlock = truncatedContents.join('');
        if (truncatedContents.some(c => c.includes('(truncated'))) {
            console.log(`ProcessRepository: Truncated content for section ${entry.prefix} to fit token limits`);
        }

        const sectionPrompt = `You are GitDex, an expert technical writer. Generate production-ready MDX documentation for ${owner}/${repo}.
    
Section: ${entry.title}
Description: ${entry.description}
Context Files: ${entry.relevant_files.join(', ')}

Code Context:
${contentBlock}

STRICT OUTPUT RULES:
1. **Format**: Valid MDX only. No frontmatter (it is added programmatically).
2. **Structure**:
   - Start with "# ${entry.title}"
   - Use "##" for major subsections.
   - End with "## Key Takeaways" or "## Integration Details".
3. **Content**:
   - Write clear, concise, professional English.
   - Include 3-5 code snippets from the provided "Code Context".
   - WRAP ALL CODE SNIPPETS in standard backticks with correct language tags (e.g., \`\`\`tsx).
   - NEVER use \`\`\`env or \`\`\`environment. Use \`\`\`bash or \`\`\`plaintext.
4. **Mermaid Diagrams** (CRITICAL):
   - Include exactly ONE relevant Mermaid diagram if the section warrants it (Architecture, Flow, State).
   - Syntax:
     - Use \`graph TD\` or \`sequenceDiagram\`. Avoid complex classes.
     - **Nodes**: Always use quotes. \`A["User"] --> B["API"]\`.
     - **Arrows**: usage \`-->\` (standard) or \`-.->\` (dotted). NO fancy arrows.
     - **Labels**: \`A -->|"Click"| B\`.
     - **Grouping**: use \`subgraph "Name"\` ... \`end\`.
   - **Validation**: Ensure no syntax errors. If unsure, omit the diagram.
5. **Constraints**:
   - NO IMAGES (<img> or ![]()).
   - NO placeholders ("TODO", "Insert logic here").
   - NO hallucinated imports. Use only what is in the "Code Context".

Output ONLY the MDX body.`;

        const sectionResult = await generateWithRetry(sectionPrompt);
        let mdxContent = sectionResult.text.trim();

        // Enhanced cleanup for Mermaid blocks
        mdxContent = mdxContent
            .replace(/```mdx/g, '')
            .replace(/```mermaid/g, '\n\n```mermaid')
            .replace(/```mermaid\s*\n\s*```/g, '\n\n```mermaid\ngraph TD\nA["Placeholder"] --> B["Diagram"]\n```\n\n')
            .replace(/(```mermaid[\s\S]*?```)/g, match => {
                const inner = match.replace(/```mermaid|```/g, '').trim();
                if (inner.split('\n').length < 3 || !inner.includes('-->')) {
                    return '\n\n```mermaid\ngraph TD\nA["Component"] --> B["Service"]\nC --> B\n```\n\n';
                }
                return '\n\n' + match + '\n\n';
            });

        // Remove any existing frontmatter to avoid duplication
        if (mdxContent.startsWith('---')) {
            const frontmatterEnd = mdxContent.indexOf('---', 3) + 3;
            mdxContent = mdxContent.substring(frontmatterEnd).trim();
        }

        // Calculate sidebar_position correctly
        const sidebarPosition = entry.prefix.endsWith('.')
            ? parseInt(entry.prefix.replace('.', ''))
            : parseFloat(entry.prefix);

        // Add our own frontmatter with the correct sidebar_position
        mdxContent = `---
title: "${entry.title}"
description: "${entry.description}"
sidebar_position: ${sidebarPosition}
---
${mdxContent}`;

        generatedFiles.push({ filename: entry.filename, content: mdxContent });
    }

    console.log('ProcessRepository: All MDX files generated', { totalFiles: generatedFiles.length });

    const docsRepo = 'gitdex-docs';
    const docsPath = `docs/${owner}/${repo}`;

    console.log('ProcessRepository: Clearing existing docs folder');
    await deleteDirectoryRecursively(process.env.GITHUB_USERNAME, docsRepo, docsPath);

    console.log('ProcessRepository: Creating Fumadocs-compatible folder structure');

    const mainMeta = {
        title: `${repo} Documentation`,
        description: `Documentation for ${owner}/${repo}`,
        icon: "book",
        root: true
    };

    // meta.json will be added in the atomic commit below

    // Atomic Commit: Bundle all files and meta.json into a single commit
    console.log('ProcessRepository: Preparing atomic commit...');
    const blobs = [];

    // Add main meta.json
    blobs.push({
        path: `${docsPath}/meta.json`,
        mode: '100644',
        type: 'blob',
        content: JSON.stringify(mainMeta, null, 2)
    });

    // Add all generated MDX files
    for (const { filename, content } of generatedFiles) {
        blobs.push({
            path: `${docsPath}/${filename}`,
            mode: '100644',
            type: 'blob',
            content: content
        });
    }

    let retries = 3;
    while (retries > 0) {
        try {
            // 1. Get the latest commit SHA of the main branch
            const { data: refData } = await octokit.rest.git.getRef({
                owner: process.env.GITHUB_USERNAME,
                repo: docsRepo,
                ref: 'heads/main'
            });
            const latestCommitSha = refData.object.sha;

            // 2. Get the base tree SHA
            const { data: commitData } = await octokit.rest.git.getCommit({
                owner: process.env.GITHUB_USERNAME,
                repo: docsRepo,
                commit_sha: latestCommitSha,
            });
            const baseTreeSha = commitData.tree.sha;

            // 3. Create a new tree with our blobs, based on the previous tree
            const { data: newTree } = await octokit.rest.git.createTree({
                owner: process.env.GITHUB_USERNAME,
                repo: docsRepo,
                base_tree: baseTreeSha,
                tree: blobs
            });

            // 4. Create the commit
            const { data: newCommit } = await octokit.rest.git.createCommit({
                owner: process.env.GITHUB_USERNAME,
                repo: docsRepo,
                message: `GitDex Index: ${owner}/${repo}`,
                tree: newTree.sha,
                parents: [latestCommitSha]
            });

            // 5. Update the reference (move the branch pointer)
            await octokit.rest.git.updateRef({
                owner: process.env.GITHUB_USERNAME,
                repo: docsRepo,
                ref: 'heads/main',
                sha: newCommit.sha
            });

            console.log('ProcessRepository: Atomic commit successful', { commitSha: newCommit.sha });
            break; // Success!

        } catch (error) {
            console.warn(`Atomic commit attempt failed (${retries} retries left):`, error.message);
            retries--;
            // If we're out of retries, rethrow
            if (retries === 0) {
                throw new Error(`Atomic commit failed after retries: ${error.message}`);
            }
            // Wait slightly before retrying to let the dust settle
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    console.log('ProcessRepository: Atomic commit complete, returning success response');


    return {
        message: `Indexing completed for ${repoUrl}`,
        details: {
            repository: repoData.full_name,
            files_processed: fileContents.length,
            sections_generated: tocEntries.length,
            access_path: `/docs/${owner}/${repo}`
        }
    };
}

// Keep the original indexController for now (will be removed later)
export const indexController = async (req, res) => {
    console.log('IndexController: Request received', { repoUrl: req.body.repoUrl });

    try {
        const result = await processRepository(req.body.repoUrl);
        res.json(result);
        console.log('IndexController: Response sent successfully');
    } catch (error) {
        console.error('IndexController: Error occurred', error);
        res.status(500).json({
            error: 'Failed to index repository',
            details: error.message
        });
    }
};