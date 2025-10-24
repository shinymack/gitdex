
// import { Octokit } from '@octokit/rest';
// import fs from 'fs/promises';
// import { encoding_for_model } from '@dqbd/tiktoken';
// import { GoogleGenAI } from '@google/genai';

// const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// const tiktoken = encoding_for_model('gpt-4');

// // Helper function to recursively delete a directory and all its contents
// async function deleteDirectoryRecursively(owner, repo, path) {
//   try {
//     console.log(`Attempting to delete contents of: ${path}`);
//     const { data: contents } = await octokit.rest.repos.getContent({
//       owner,
//       repo,
//       path,
//     });

//     // Process each item in the directory
//     for (const item of contents) {
//       if (item.type === 'dir') {
//         // Recursively delete subdirectories
//         await deleteDirectoryRecursively(owner, repo, item.path);
//       } else if (item.type === 'file') {
//         // Delete files
//         try {
//           console.log(`Deleting file: ${item.path}`);
//           await octokit.rest.repos.deleteFile({
//             owner,
//             repo,
//             path: item.path,
//             message: `Delete ${item.name} for cleanup`,
//             sha: item.sha,
//           });
//           console.log(`Successfully deleted: ${item.path}`);
//         } catch (deleteError) {
//           console.warn(`Failed to delete ${item.path}:`, deleteError.message);
//         }
//       }
//     }
//   } catch (error) {
//     if (error.status !== 404) {
//       console.error(`Failed to get contents of ${path}:`, error.message);
//     }
//     // If the directory doesn't exist, that's fine
//   }
// }

// export const indexController = async (req, res) => {
//   console.log('IndexController: Request received', { repoUrl: req.body.repoUrl });
//   const { repoUrl } = req.body;
//   if (!repoUrl) {
//     console.log('IndexController: Error - Repo URL is missing');
//     return res.status(400).json({ error: 'Repo URL is required' });
//   }

//   try {
//     const urlParts = repoUrl.split('/');
//     const owner = urlParts[urlParts.length - 2];
//     const repo = urlParts[urlParts.length - 1].replace('.git', '');
//     console.log('IndexController: Processing repository', { owner, repo });

//     const repoResponse = await octokit.rest.repos.get({ owner, repo });
//     const repoData = repoResponse.data;
//     if (repoData.size > 500 * 1024 * 1024) {
//       return res.status(400).json({ error: 'Repository too large to process' });
//     }
//     console.log('IndexController: Repository info fetched', { size: repoData.size });

//     console.log('IndexController: Fetching git tree');
//     const { data: treeData } = await octokit.rest.git.getTree({
//       owner,
//       repo,
//       tree_sha: repoData.default_branch,
//       recursive: true
//     });

//     const relevantFiles = treeData.tree.filter(item => 
//       item.type === 'blob' && 
//       item.path.match(/\.(js|ts|jsx|tsx|md|json|py|rb|go|rs|java|cpp|h|c|cs|php|css|html|sql|yaml|yml)$/i) &&
//       item.size < 1000000 &&
//       !item.path.match(/\b(node_modules|dist|build|\.git|__pycache__|\.lock|\.min\.js|\.bundle\.js)\b/i)
//     );

//     console.log('IndexController: Filtered files', { count: relevantFiles.length });

//     // Batch file content fetching with retry logic
//     console.log('IndexController: Fetching file contents in batches');
//     const batchSize = 10;
//     const fileContents = [];
//     for (let i = 0; i < relevantFiles.length; i += batchSize) {
//       const batch = relevantFiles.slice(i, i + batchSize);
//       const batchPromises = batch.map(async file => {
//         for (let attempt = 0; attempt < 3; attempt++) {
//           try {
//             const fileResponse = await octokit.rest.repos.getContent({
//               owner,
//               repo,
//               path: file.path,
//               mediaType: { format: 'raw' },
//             });
//             return { 
//               path: file.path, 
//               content: fileResponse.data.toString('utf8'),
//               size: file.size
//             };
//           } catch (error) {
//             console.warn(`IndexController: Failed to fetch ${file.path} (attempt ${attempt + 1}):`, error.message);
//             if (attempt === 2) return null;
//             await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
//           }
//         }
//       });
//       const batchResults = await Promise.allSettled(batchPromises);
//       fileContents.push(...batchResults
//         .filter(result => result.status === 'fulfilled')
//         .map(result => result.value)
//         .filter(file => file !== null));
//     }
//     console.log('IndexController: Files fetched', { successful: fileContents.length });

//     console.log('IndexController: Generating global TOC');
//     const filePaths = fileContents.map(f => f.path).join('\n');
//     const tocPrompt = `You are GitDex, an expert in repo analysis. From these file paths in the repo ${owner}/${repo}:

//  ${filePaths}

// Infer a hierarchical table of contents for documentation. Structure as 4-8 top-level sections with 1-3 subsections each. Use numeric prefixes like 1., 2.1., 3.2.1. Make titles descriptive, professional, and aligned with common documentation practices (e.g., "System Overview", "Architecture and Design", "Core Features and Implementation").

// For each section/subsection, provide:
// - prefix: e.g., "1." or "2.1."
// - title: Descriptive title
// - filename: prefix_title.mdx (lowercase, no spaces, e.g., 1_system-overview.mdx, 2.1_architecture.mdx)
// - description: Brief 1-sentence desc
// - relevant_files: Array of 2-4 most relevant file paths (prioritize key files, match by dir/name/content type)

// Output as JSON array of objects, sorted by prefix. Ensure no overlap in content.

// Example JSON:
// [
//   {"prefix": "1.", "title": "System Overview", "filename": "1_system-overview.mdx", "description": "High-level introduction to the system.", "relevant_files": ["README.md", "package.json"]},
//   {"prefix": "2.", "title": "Frontend Implementation", "filename": "2_frontend-implementation.mdx", "description": "Details on UI and client-side logic.", "relevant_files": ["src/app.js"]}
// ]`;

//     const tocResult = await ai.models.generateContent({
//         model: "gemini-2.5-flash",
//         contents: [tocPrompt],
//         config : {
//             thinkingConfig: {
//                 thinkingBudget: 0,
//             },
//         }
//     });
//     let tocText = tocResult.text.trim();
//     tocText = tocText.replace(/```json\n?|\n?```/g, '').trim();
//     const tocEntries = JSON.parse(tocText);
//     console.log('IndexController: Global TOC generated', { sections: tocEntries.length });

//     tocEntries.sort((a, b) => {
//       const pa = a.prefix.split('.').map(Number);
//       const pb = b.prefix.split('.').map(Number);
//       for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
//         if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
//       }
//       return 0;
//     });

//     console.log('IndexController: Generating section MDX files');
//     const generatedFiles = [];
//     for (const [index, entry] of tocEntries.entries()) {
//       console.log(`IndexController: Processing section ${entry.prefix} ${entry.title}`);
//       const relevantContents = fileContents.filter(f => entry.relevant_files.includes(f.path));
//       const contentBlock = relevantContents.map(f => `File: ${f.path}\n${f.content}\n---\n`).join('');


//       const sectionPrompt = `You are GitDex, a technical documentation AI. Role: Generate wiki-style MDX docs in DeepWiki style. Always follow instructions exactly.

// First, think step-by-step:
// 1. Analyze content for structure: High-level explanations, bullets, tables, snippets, diagrams.
// 2. Ensure 1-2 Mermaid diagrams: Validate syntax internally (simulate Mermaid Live rendering).
// 3. For Mermaid nodes: ALWAYS enclose ALL text in double quotes inside brackets, e.g., A["Frontend - React"]. Repeat: ALL node text MUST be in quotes. NO EXCEPTIONS FOR THIS 3RD RULE. I REPEAT NO EXCEPTIONS FOR THIS RULE
// 4. No Colours to be used.


// Section Details:
// - Title: ${entry.title}
// - Description: ${entry.description}
// - Relevant Files: ${entry.relevant_files.join(', ')}

// Content:
//  ${contentBlock}

// MDX Structure:
// - Frontmatter: ---
//   title: "${entry.title}"
//   description: "${entry.description}"
// ---
// - # ${entry.title}
// - ## Subsections (e.g., bullets for features, tables for stack, snippets with links, Mermaid after relevant sections)
// - ## Key Integration Points (end here: insights on flows, best practices)

// Requirements:
// - 4-6 snippets: \`\`\`lang with explanations, GitHub links/line ranges.
// - Inline links: [View on GitHub](https://github.com/${owner}/${repo}/blob/main/{path}).
// - 1-2 Mermaids: graph TD/flowchart LR/sequenceDiagram. 4-8 nodes. Enclose ALL node text in quotes, e.g., A["Text here"].
// - No unnecesary mermaid diagrams please.
// - Length: 800-1500 words.
// - Adapt to repo.

// Mermaid Rules (THINK BEFORE GENERATING: Step-by-step validate syntax, quotes on nodes):
// 1. ALL node text in double quotes: e.g., A["Frontend (React)"] |"Node Name"| "EVERYTHING IN QUOTES PLEASE"
// 2. Arrows: -->, ---, -.->, ==> only.
// 3. Format: \`\`\`mermaid\ncode\n\`\`\` with blanks.
// 4. Types: graph TD, etc.
// 5. Nodes: ["Rectangle"], ("Circle"), {"Diamond"}—text in quotes.
// 6. No extras. Concise.
// 7. C -.-> B: "Accesses socket from auth store"
//     Mermaid does not allow labels (: "text") after the arrow like that.
//     To label an edge, the correct syntax is:

//     C -.->|"Accesses socket from auth store(Zustand)"| B
// REMEMBER QUOTES EVERYWHERE EVEN IN LABELING THE EDGES
// NO ANY OTHER TYPE OF QUOTES (NOT EVEN BACKTICKS FOR COMMANDS)
// "

// Output ONLY MDX without any additional formatting or markdown code blocks.`;

//         const sectionResult = await ai.models.generateContent({
//           model: 'gemini-2.5-flash',
//           contents: [sectionPrompt],
//           config: {
//             thinkingConfig: {
//                 thinkingBudget: 500,
//             },
//             }   
//         });
//       let mdxContent = sectionResult.text.trim();

// // Enhanced cleanup for Mermaid blocks and ensure MDX start
//         mdxContent = mdxContent
//         .replace(/```mdx/g, '') // Remove any stray ```mdx
//         .replace(/```mermaid/g, '\n\n```mermaid')
//         .replace(/```mermaid\s*\n\s*```/g, '\n\n```mermaid\ngraph TD\nA["Placeholder"] --> B["Diagram"]\n```\n\n') // Replace empty or invalid Mermaid blocks
//         .replace(/(```mermaid[\s\S]*?```)/g, match => {
//             const inner = match.replace(/```mermaid|```/g, '').trim();
//             if (inner.split('\n').length < 3 || !inner.includes('-->')) {
//             return '\n\n```mermaid\ngraph TD\nA["Component"] --> B["Service"]\nC --> B\n```\n\n';
//             }
//             return '\n\n' + match + '\n\n'; // Preserve valid blocks with proper spacing
//         });

//       // Remove any existing frontmatter to avoid duplication
//       if (mdxContent.startsWith('---')) {
//         const frontmatterEnd = mdxContent.indexOf('---', 3) + 3;
//         mdxContent = mdxContent.substring(frontmatterEnd).trim();
//       }

//       // Calculate sidebar_position correctly
//       const sidebarPosition = entry.prefix.endsWith('.') 
//         ? parseInt(entry.prefix.replace('.', ''))  // For "1.", "2." etc. -> 1, 2
//         : parseFloat(entry.prefix);                 // For "2.1", "2.2" etc. -> 2.1, 2.2

//       // Add our own frontmatter with the correct sidebar_position
//       mdxContent = `---
// title: "${entry.title}"
// description: "${entry.description}"
// sidebar_position: ${sidebarPosition}
// ---
//  ${mdxContent}`;

//       generatedFiles.push({ filename: entry.filename, content: mdxContent });
//     }

//     console.log('IndexController: All MDX files generated', { totalFiles: generatedFiles.length });

//     const docsRepo = 'gitdex-docs';
//     // Updated to include owner in the path structure
//     const docsPath = `docs/${owner}/${repo}`;

//     console.log('IndexController: Clearing existing docs folder');

//     // Recursively delete all contents in the docs path
//     await deleteDirectoryRecursively(process.env.GITHUB_USERNAME, docsRepo, docsPath);

//     console.log('IndexController: Creating Fumadocs-compatible folder structure');

//     // Create the main meta.json for the entire documentation set
//     const mainMeta = {
//       title: `${repo} Documentation`,
//       description: `Documentation for ${owner}/${repo}`,
//       icon: "book",
//       root: true
//     };

//     // Create main meta.json at the root
//     try {
//       await octokit.rest.repos.createOrUpdateFileContents({
//         owner: process.env.GITHUB_USERNAME,
//         repo: docsRepo,
//         path: `${docsPath}/meta.json`,
//         message: `Add main meta.json for ${owner}/${repo}`,
//         content: Buffer.from(JSON.stringify(mainMeta, null, 2)).toString('base64'),
//       });
//       console.log('IndexController: Successfully created main meta.json');
//     } catch (error) {
//       console.error('Failed to create main meta.json:', error.message);
//       throw error;
//     }

//     console.log('IndexController: Uploading MDX files to linear structure');

//     // Upload MDX files directly to the docs path in linear format
//     for (const { filename, content } of generatedFiles) {
//       try {
//         await octokit.rest.repos.createOrUpdateFileContents({
//           owner: process.env.GITHUB_USERNAME,
//           repo: docsRepo,
//           path: `${docsPath}/${filename}`,
//           message: `Add ${filename} for ${owner}/${repo}`,
//           content: Buffer.from(content).toString('base64'),
//         });
//         console.log(`IndexController: Successfully uploaded ${filename}`);
//       } catch (uploadError) {
//         if (uploadError.status === 409) {
//           try {
//             const { data: latestFile } = await octokit.rest.repos.getContent({
//               owner: process.env.GITHUB_USERNAME,
//               repo: docsRepo,
//               path: `${docsPath}/${filename}`,
//             });
//             await octokit.rest.repos.createOrUpdateFileContents({
//               owner: process.env.GITHUB_USERNAME,
//               repo: docsRepo,
//               path: `${docsPath}/${filename}`,
//               message: `Add ${filename} for ${owner}/${repo}`,
//               content: Buffer.from(content).toString('base64'),
//               sha: latestFile.sha,
//             });
//             console.log(`IndexController: Successfully uploaded ${filename} after retry`);
//           } catch (retryError) {
//             console.error(`Failed to upload ${filename} after retry:`, retryError.message);
//           }
//         } else {
//           console.error(`Failed to upload ${filename}:`, uploadError.message);
//         }
//       }
//     }

//     res.json({ 
//       message: `Indexing completed for ${repoUrl}`,
//       details: {
//         repository: repoData.full_name,
//         files_processed: fileContents.length,
//         sections_generated: tocEntries.length,
//         access_path: `/docs/${owner}/${repo}`
//       }
//     });
//     console.log('IndexController: Response sent successfully');

//   } catch (error) {
//     console.error('IndexController: Error occurred', error);
//     res.status(500).json({ 
//       error: 'Failed to index repository',
//       details: error.message
//     });
//   }
// };


// import { Octokit } from '@octokit/rest';
// import fs from 'fs/promises';
// import { encoding_for_model } from '@dqbd/tiktoken';
// import { GoogleGenAI } from '@google/genai';

// const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// const tiktoken = encoding_for_model('gpt-4');

// // Helper function to recursively delete a directory and all its contents
// async function deleteDirectoryRecursively(owner, repo, path) {
//   try {
//     console.log(`Attempting to delete contents of: ${path}`);
//     const { data: contents } = await octokit.rest.repos.getContent({
//       owner,
//       repo,
//       path,
//     });

//     // Process each item in the directory
//     for (const item of contents) {
//       if (item.type === 'dir') {
//         // Recursively delete subdirectories
//         await deleteDirectoryRecursively(owner, repo, item.path);
//       } else if (item.type === 'file') {
//         // Delete files
//         try {
//           console.log(`Deleting file: ${item.path}`);
//           await octokit.rest.repos.deleteFile({
//             owner,
//             repo,
//             path: item.path,
//             message: `Delete ${item.name} for cleanup`,
//             sha: item.sha,
//           });
//           console.log(`Successfully deleted: ${item.path}`);
//         } catch (deleteError) {
//           console.warn(`Failed to delete ${item.path}:`, deleteError.message);
//         }
//       }
//     }
//   } catch (error) {
//     if (error.status !== 404) {
//       console.error(`Failed to get contents of ${path}:`, error.message);
//     }
//     // If the directory doesn't exist, that's fine
//   }
// }

// // Extract the processing logic into a separate function
// export async function processRepository(repoUrl) {
//   console.log('ProcessRepository: Processing repository', { repoUrl });

//   if (!repoUrl) {
//     throw new Error('Repo URL is required');
//   }

//   const urlParts = repoUrl.split('/');
//   const owner = urlParts[urlParts.length - 2];
//   const repo = urlParts[urlParts.length - 1].replace('.git', '');
//   console.log('ProcessRepository: Processing repository', { owner, repo });

//   const repoResponse = await octokit.rest.repos.get({ owner, repo });
//   const repoData = repoResponse.data;
//   if (repoData.size > 500 * 1024 * 1024) {
//     throw new Error('Repository too large to process');
//   }
//   console.log('ProcessRepository: Repository info fetched', { size: repoData.size });

//   console.log('ProcessRepository: Fetching git tree');
//   const { data: treeData } = await octokit.rest.git.getTree({
//     owner,
//     repo,
//     tree_sha: repoData.default_branch,
//     recursive: true
//   });

//   const relevantFiles = treeData.tree.filter(item => 
//     item.type === 'blob' && 
//     item.path.match(/\.(js|ts|jsx|tsx|md|json|py|rb|go|rs|java|cpp|h|c|cs|php|css|html|sql|yaml|yml)$/i) &&
//     item.size < 1000000 &&
//     !item.path.match(/\b(node_modules|dist|build|\.git|__pycache__|\.lock|\.min\.js|\.bundle\.js)\b/i)
//   );

//   console.log('ProcessRepository: Filtered files', { count: relevantFiles.length });

//   // Batch file content fetching with retry logic
//   console.log('ProcessRepository: Fetching file contents in batches');
//   const batchSize = 10;
//   const fileContents = [];
//   for (let i = 0; i < relevantFiles.length; i += batchSize) {
//     const batch = relevantFiles.slice(i, i + batchSize);
//     const batchPromises = batch.map(async file => {
//       for (let attempt = 0; attempt < 3; attempt++) {
//         try {
//           const fileResponse = await octokit.rest.repos.getContent({
//             owner,
//             repo,
//             path: file.path,
//             mediaType: { format: 'raw' },
//           });
//           return { 
//             path: file.path, 
//             content: fileResponse.data.toString('utf8'),
//             size: file.size
//           };
//         } catch (error) {
//           console.warn(`ProcessRepository: Failed to fetch ${file.path} (attempt ${attempt + 1}):`, error.message);
//           if (attempt === 2) return null;
//           await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
//         }
//       }
//     });
//     const batchResults = await Promise.allSettled(batchPromises);
//     fileContents.push(...batchResults
//       .filter(result => result.status === 'fulfilled')
//       .map(result => result.value)
//       .filter(file => file !== null));
//   }
//   console.log('ProcessRepository: Files fetched', { successful: fileContents.length });

//   console.log('ProcessRepository: Generating global TOC');
//   const filePaths = fileContents.map(f => f.path).join('\n');
//   const tocPrompt = `You are GitDex, an expert in repo analysis. From these file paths in the repo ${owner}/${repo}:

//  ${filePaths}

// Infer a hierarchical table of contents for documentation. Structure as 4-8 top-level sections with 1-3 subsections each. Use numeric prefixes like 1., 2.1., 3.2.1. Make titles descriptive, professional, and aligned with common documentation practices (e.g., "System Overview", "Architecture and Design", "Core Features and Implementation").

// For each section/subsection, provide:
// - prefix: e.g., "1." or "2.1."
// - title: Descriptive title
// - filename: prefix_title.mdx (lowercase, no spaces, e.g., 1_system-overview.mdx, 2.1_architecture.mdx)
// - description: Brief 1-sentence desc
// - relevant_files: Array of 2-4 most relevant file paths (prioritize key files, match by dir/name/content type)

// Output as JSON array of objects, sorted by prefix. Ensure no overlap in content.

// Example JSON:
// [
//   {"prefix": "1.", "title": "System Overview", "filename": "1_system-overview.mdx", "description": "High-level introduction to the system.", "relevant_files": ["README.md", "package.json"]},
//   {"prefix": "2.", "title": "Frontend Implementation", "filename": "2_frontend-implementation.mdx", "description": "Details on UI and client-side logic.", "relevant_files": ["src/app.js"]}
// ]`;

//   const tocResult = await ai.models.generateContent({
//       model: "gemini-2.5-flash",
//       contents: [tocPrompt],
//       config : {
//           thinkingConfig: {
//               thinkingBudget: 0,
//           },
//       }
//   });
//   let tocText = tocResult.text.trim();
//   tocText = tocText.replace(/```json\n?|\n?```/g, '').trim();
//   const tocEntries = JSON.parse(tocText);
//   console.log('ProcessRepository: Global TOC generated', { sections: tocEntries.length });

//   tocEntries.sort((a, b) => {
//     const pa = a.prefix.split('.').map(Number);
//     const pb = b.prefix.split('.').map(Number);
//     for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
//       if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
//     }
//     return 0;
//   });

//   console.log('ProcessRepository: Generating section MDX files');
//   const generatedFiles = [];
//   for (const [index, entry] of tocEntries.entries()) {
//     console.log(`ProcessRepository: Processing section ${entry.prefix} ${entry.title}`);
//     const relevantContents = fileContents.filter(f => entry.relevant_files.includes(f.path));
//     const contentBlock = relevantContents.map(f => `File: ${f.path}\n${f.content}\n---\n`).join('');

//     const sectionPrompt = `You are GitDex, a technical documentation AI. Role: Generate wiki-style MDX docs in DeepWiki style. Always follow instructions exactly.

// First, think step-by-step:
// 1. Analyze content for structure: High-level explanations, bullets, tables, snippets, diagrams.
// 2. Ensure 1-2 Mermaid diagrams: Validate syntax internally (simulate Mermaid Live rendering).
// 3. For Mermaid nodes: ALWAYS enclose ALL text in double quotes inside brackets, e.g., A["Frontend - React"]. Repeat: ALL node text MUST be in quotes. NO EXCEPTIONS FOR THIS 3RD RULE. I REPEAT NO EXCEPTIONS FOR THIS RULE
// 4. No Colours to be used.


// Section Details:
// - Title: ${entry.title}
// - Description: ${entry.description}
// - Relevant Files: ${entry.relevant_files.join(', ')}

// Content:
//  ${contentBlock}

// MDX Structure:
// - Frontmatter: ---
//   title: "${entry.title}"
//   description: "${entry.description}"
// ---
// - # ${entry.title}
// - ## Subsections (e.g., bullets for features, tables for stack, snippets with links, Mermaid after relevant sections)
// - ## Key Integration Points (end here: insights on flows, best practices)

// Requirements:
// - 4-6 snippets: \`\`\`lang with explanations, GitHub links/line ranges.
// - Inline links: [View on GitHub](https://github.com/${owner}/${repo}/blob/main/{path}).
// - 1-2 Mermaids: graph TD/flowchart LR/sequenceDiagram. 4-8 nodes. Enclose ALL node text in quotes, e.g., A["Text here"].
// - No unnecesary mermaid diagrams please.
// - Length: 800-1500 words.
// - Adapt to repo.

// Mermaid Rules (THINK BEFORE GENERATING: Step-by-step validate syntax, quotes on nodes):
// 1. ALL node text in double quotes: e.g., A["Frontend (React)"] |"Node Name"| "EVERYTHING IN QUOTES PLEASE"
// 2. Arrows: -->, ---, -.->, ==> only.
// 3. Format: \`\`\`mermaid\ncode\n\`\`\` with blanks.
// 4. Types: graph TD, etc.
// 5. Nodes: ["Rectangle"], ("Circle"), {"Diamond"}—text in quotes.
// 6. No extras. Concise.
// 7. C -.-> B: "Accesses socket from auth store" DONT DO THIS PLEASE
//     Mermaid does not allow labels (: "text") after the arrow like that.
//     To label an edge, the correct syntax is:

//     C -.->|"Accesses socket from auth store(Zustand)"| B
// REMEMBER QUOTES EVERYWHERE EVEN IN LABELING THE EDGES
// NO ANY OTHER TYPE OF QUOTES (NOT EVEN BACKTICKS FOR COMMANDS)
// JUST MAKE SURE MERMAID CODE FOLLOWS THE LATEST SYNTAX RULES
// Output ONLY MDX without any additional formatting or markdown code blocks.`;

//       const sectionResult = await ai.models.generateContent({
//         model: 'gemini-2.5-flash',
//         contents: [sectionPrompt],
//         config: {
//             thinkingConfig: {
//                 thinkingBudget: 500,
//             },
//             }   
//       });
//     let mdxContent = sectionResult.text.trim();

//     // Enhanced cleanup for Mermaid blocks and ensure MDX start
//       mdxContent = mdxContent
//       .replace(/```mdx/g, '') // Remove any stray ```mdx
//       .replace(/```mermaid/g, '\n\n```mermaid')
//       .replace(/```mermaid\s*\n\s*```/g, '\n\n```mermaid\ngraph TD\nA["Placeholder"] --> B["Diagram"]\n```\n\n') // Replace empty or invalid Mermaid blocks
//       .replace(/(```mermaid[\s\S]*?```)/g, match => {
//           const inner = match.replace(/```mermaid|```/g, '').trim();
//           if (inner.split('\n').length < 3 || !inner.includes('-->')) {
//           return '\n\n```mermaid\ngraph TD\nA["Component"] --> B["Service"]\nC --> B\n```\n\n';
//           }
//           return '\n\n' + match + '\n\n'; // Preserve valid blocks with proper spacing
//       });

//     // Remove any existing frontmatter to avoid duplication
//     if (mdxContent.startsWith('---')) {
//       const frontmatterEnd = mdxContent.indexOf('---', 3) + 3;
//       mdxContent = mdxContent.substring(frontmatterEnd).trim();
//     }

//     // Calculate sidebar_position correctly
//     const sidebarPosition = entry.prefix.endsWith('.') 
//       ? parseInt(entry.prefix.replace('.', ''))  // For "1.", "2." etc. -> 1, 2
//       : parseFloat(entry.prefix);                 // For "2.1", "2.2" etc. -> 2.1, 2.2

//     // Add our own frontmatter with the correct sidebar_position
//     mdxContent = `---
// title: "${entry.title}"
// description: "${entry.description}"
// sidebar_position: ${sidebarPosition}
// ---
//  ${mdxContent}`;

//     generatedFiles.push({ filename: entry.filename, content: mdxContent });
//   }

//   console.log('ProcessRepository: All MDX files generated', { totalFiles: generatedFiles.length });

//   const docsRepo = 'gitdex-docs';
//   // Updated to include owner in the path structure
//   const docsPath = `docs/${owner}/${repo}`;

//   console.log('ProcessRepository: Clearing existing docs folder');

//   // Recursively delete all contents in the docs path
//   await deleteDirectoryRecursively(process.env.GITHUB_USERNAME, docsRepo, docsPath);

//   console.log('ProcessRepository: Creating Fumadocs-compatible folder structure');

//   // Create the main meta.json for the entire documentation set
//   const mainMeta = {
//     title: `${repo} Documentation`,
//     description: `Documentation for ${owner}/${repo}`,
//     icon: "book",
//     root: true
//   };

//   // Create main meta.json at the root
//   try {
//     await octokit.rest.repos.createOrUpdateFileContents({
//       owner: process.env.GITHUB_USERNAME,
//       repo: docsRepo,
//       path: `${docsPath}/meta.json`,
//       message: `Add main meta.json for ${owner}/${repo}`,
//       content: Buffer.from(JSON.stringify(mainMeta, null, 2)).toString('base64'),
//     });
//     console.log('ProcessRepository: Successfully created main meta.json');
//   } catch (error) {
//     console.error('Failed to create main meta.json:', error.message);
//     throw error;
//   }

//   console.log('ProcessRepository: Uploading MDX files to linear structure');

//   // Upload MDX files directly to the docs path in linear format
//   for (const { filename, content } of generatedFiles) {
//     try {
//       await octokit.rest.repos.createOrUpdateFileContents({
//         owner: process.env.GITHUB_USERNAME,
//         repo: docsRepo,
//         path: `${docsPath}/${filename}`,
//         message: `Add ${filename} for ${owner}/${repo}`,
//         content: Buffer.from(content).toString('base64'),
//       });
//       console.log(`ProcessRepository: Successfully uploaded ${filename}`);
//     } catch (uploadError) {
//       if (uploadError.status === 409) {
//         try {
//           const { data: latestFile } = await octokit.rest.repos.getContent({
//             owner: process.env.GITHUB_USERNAME,
//             repo: docsRepo,
//             path: `${docsPath}/${filename}`,
//           });
//           await octokit.rest.repos.createOrUpdateFileContents({
//             owner: process.env.GITHUB_USERNAME,
//             repo: docsRepo,
//             path: `${docsPath}/${filename}`,
//             message: `Add ${filename} for ${owner}/${repo}`,
//             content: Buffer.from(content).toString('base64'),
//             sha: latestFile.sha,
//           });
//           console.log(`ProcessRepository: Successfully uploaded ${filename} after retry`);
//         } catch (retryError) {
//           console.error(`Failed to upload ${filename} after retry:`, retryError.message);
//         }
//       } else {
//         console.error(`Failed to upload ${filename}:`, uploadError.message);
//       }
//     }
//   }

//   return { 
//     message: `Indexing completed for ${repoUrl}`,
//     details: {
//       repository: repoData.full_name,
//       files_processed: fileContents.length,
//       sections_generated: tocEntries.length,
//       access_path: `/docs/${owner}/${repo}`
//     }
//   };
// }

// // Keep the original indexController for now (will be removed later)
// export const indexController = async (req, res) => {
//   console.log('IndexController: Request received', { repoUrl: req.body.repoUrl });

//   try {
//     const result = await processRepository(req.body.repoUrl);
//     res.json(result);
//     console.log('IndexController: Response sent successfully');
//   } catch (error) {
//     console.error('IndexController: Error occurred', error);
//     res.status(500).json({ 
//       error: 'Failed to index repository',
//       details: error.message
//     });
//   }
// };
/////////////////////before revamp
// import { Octokit } from '@octokit/rest';
// import fs from 'fs/promises';
// import { encoding_for_model } from '@dqbd/tiktoken';
// import { GoogleGenAI } from '@google/genai';

// const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// const tiktoken = encoding_for_model('gpt-4');

// // Helper function to recursively delete a directory and all its contents
// async function deleteDirectoryRecursively(owner, repo, path) {
//   try {
//     console.log(`Attempting to delete contents of: ${path}`);
//     const { data: contents } = await octokit.rest.repos.getContent({
//       owner,
//       repo,
//       path,
//     });

//     for (const item of contents) {
//       if (item.type === 'dir') {
//         await deleteDirectoryRecursively(owner, repo, item.path);
//       } else if (item.type === 'file') {
//         try {
//           console.log(`Deleting file: ${item.path}`);
//           await octokit.rest.repos.deleteFile({
//             owner,
//             repo,
//             path: item.path,
//             message: `Delete ${item.name} for cleanup`,
//             sha: item.sha,
//           });
//           console.log(`Successfully deleted: ${item.path}`);
//         } catch (deleteError) {
//           console.warn(`Failed to delete ${item.path}:`, deleteError.message);
//         }
//       }
//     }
//   } catch (error) {
//     if (error.status !== 404) {
//       console.error(`Failed to get contents of ${path}:`, error.message);
//     }
//   }
// }

// // Extract the processing logic into a separate function
// export async function processRepository(repoUrl) {
//   console.log('ProcessRepository: Processing repository', { repoUrl });

//   if (!repoUrl) {
//     throw new Error('Repo URL is required');
//   }

//   const urlParts = repoUrl.split('/');
//   const owner = urlParts[urlParts.length - 2];
//   const repo = urlParts[urlParts.length - 1].replace('.git', '');
//   console.log('ProcessRepository: Processing repository', { owner, repo });

//   const repoResponse = await octokit.rest.repos.get({ owner, repo });
//   const repoData = repoResponse.data;
//   if (repoData.size > 500 * 1024 * 1024) {
//     throw new Error('Repository too large to process');
//   }
//   console.log('ProcessRepository: Repository info fetched', { size: repoData.size });

//   console.log('ProcessRepository: Fetching git tree');
//   const { data: treeData } = await octokit.rest.git.getTree({
//     owner,
//     repo,
//     tree_sha: repoData.default_branch,
//     recursive: true
//   });

//   const relevantFiles = treeData.tree.filter(item => 
//     item.type === 'blob' && 
//     item.path.match(/\.(js|ts|jsx|tsx|md|json|py|rb|go|rs|java|cpp|h|c|cs|php|css|html|sql|yaml|yml)$/i) &&
//     item.size < 1000000 &&
//     !item.path.match(/\b(node_modules|dist|build|\.git|__pycache__|\.lock|\.min\.js|\.bundle\.js)\b/i)
//   );

//   console.log('ProcessRepository: Filtered files', { count: relevantFiles.length });

//   // Batch file content fetching with retry logic
//   console.log('ProcessRepository: Fetching file contents in batches');
//   const batchSize = 10;
//   const fileContents = [];
//   for (let i = 0; i < relevantFiles.length; i += batchSize) {
//     const batch = relevantFiles.slice(i, i + batchSize);
//     const batchPromises = batch.map(async file => {
//       for (let attempt = 0; attempt < 3; attempt++) {
//         try {
//           const fileResponse = await octokit.rest.repos.getContent({
//             owner,
//             repo,
//             path: file.path,
//             mediaType: { format: 'raw' },
//           });
//           return { 
//             path: file.path, 
//             content: fileResponse.data.toString('utf8'),
//             size: file.size
//           };
//         } catch (error) {
//           console.warn(`ProcessRepository: Failed to fetch ${file.path} (attempt ${attempt + 1}):`, error.message);
//           if (attempt === 2) return null;
//           await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
//         }
//       }
//     });
//     const batchResults = await Promise.allSettled(batchPromises);
//     fileContents.push(...batchResults
//       .filter(result => result.status === 'fulfilled')
//       .map(result => result.value)
//       .filter(file => file !== null));
//   }
//   console.log('ProcessRepository: Files fetched', { successful: fileContents.length });

//   console.log('ProcessRepository: Generating global TOC');
//   const filePaths = fileContents.map(f => f.path).join('\n');
//   const tocPrompt = `You are GitDex, an expert in repo analysis. From these file paths in the repo ${owner}/${repo}:

//  ${filePaths}

// Infer a hierarchical table of contents for documentation. Structure as 4-8 top-level sections with 1-3 subsections each. Use numeric prefixes like 1., 2.1., 3.2.1. Make titles descriptive, professional, and aligned with common documentation practices (e.g., "System Overview", "Architecture and Design", "Core Features and Implementation").
// NOT COMPULSORY YOU CAN CHANGE THE NUMBER OF SECTIONS AND SUBSECTION FOR LARGE REPOS IF NECESSARY.
// For each section/subsection, provide:
// - prefix: e.g., "1." or "2.1."
// - title: Descriptive title
// - filename: prefix_title.mdx (lowercase, no spaces, e.g., 1_system-overview.mdx, 2.1_architecture.mdx)
// - description: Brief 1-sentence desc
// - relevant_files: Array of 2-4 most relevant file paths (prioritize key files, match by dir/name/content type)

// Output as JSON array of objects, sorted by prefix. Ensure no overlap in content.

// Example JSON:
// [
//   {"prefix": "1.", "title": "System Overview", "filename": "1_system-overview.mdx", "description": "High-level introduction to the system.", "relevant_files": ["README.md", "package.json"]},
//   {"prefix": "2.", "title": "Frontend Implementation", "filename": "2_frontend-implementation.mdx", "description": "Details on UI and client-side logic.", "relevant_files": ["src/app.js"]}
// ]`;

//   const tocResult = await ai.models.generateContent({
//       model: "gemini-2.5-flash",
//       contents: [tocPrompt],
//       config : {
//           thinkingConfig: {
//               thinkingBudget: 0,
//           },
//       }
//   });
//   let tocText = tocResult.text.trim();
//   tocText = tocText.replace(/```json\n?|\n?```/g, '').trim();
//   const tocEntries = JSON.parse(tocText);
//   console.log('ProcessRepository: Global TOC generated', { sections: tocEntries.length });

//   tocEntries.sort((a, b) => {
//     const pa = a.prefix.split('.').map(Number);
//     const pb = b.prefix.split('.').map(Number);
//     for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
//       if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
//     }
//     return 0;
//   });

//   console.log('ProcessRepository: Generating section MDX files');
//   const generatedFiles = [];
//   for (const [index, entry] of tocEntries.entries()) {
//     console.log(`ProcessRepository: Processing section ${entry.prefix} ${entry.title}`);
//     const relevantContents = fileContents.filter(f => entry.relevant_files.includes(f.path));
//     const contentBlock = relevantContents.map(f => `File: ${f.path}\n${f.content}\n---\n`).join('');

//     const sectionPrompt = `You are GitDex, a technical documentation AI. Role: Generate wiki-style MDX docs in DeepWiki style. Always follow instructions exactly.

// Section Details:
// - Title: ${entry.title}
// - Description: ${entry.description}
// - Relevant Files: ${entry.relevant_files.join(', ')}

// Content:
//  ${contentBlock}

// MDX Structure:
// - Frontmatter: ---
//   title: "${entry.title}"
//   description: "${entry.description}"
// ---
// - # ${entry.title}
// - ## Subsections (e.g., bullets for features, tables for stack, snippets with links, Mermaid after relevant sections)
// - ## Key Integration Points (end here: insights on flows, best practices)

// Requirements:
// - 4-6 snippets: \`\`\`lang with explanations, GitHub links/line ranges.
// - Inline links: [View on GitHub](https://github.com/${owner}/${repo}/blob/main/{path}).
// - 1-2 Mermaids: graph TD/flowchart LR/sequenceDiagram. 4-8 nodes. Enclose ALL node text in quotes, e.g., A["Text here"].
// - No unnecesary mermaid diagrams please. 
// - Length: 800-1500 words.
// - Adapt to repo.(ML, WEB DEV, FRAMEWORKS)
// DONT USE TOO MUCH COMPLEX SEQUENCE DIAGRAMS WITH TOO MANY CONNECTION TRY TO REPRESENT THEM USING graph LR or TD OR JUST  A SMALLER SEQUENCE DIAGRAM.
// DONT USE TOO MUCH COMPLEX SEQUENCE DIAGRAMS WITH TOO MANY CONNECTION TRY TO REPRESENT THEM USING graph LR or TD OR JUST  A SMALLER SEQUENCE DIAGRAM.
// ANY TYPE OF TEXT IN NODE OR EDGE LABEL SHOULD BE IN QUOTES.
// ANY TYPE OF TEXT IN NODE OR EDGE LABEL SHOULD BE IN QUOTES.
// MERMAID RULES: (FOLLOW STRICTLY)
// 1. ALL node text in double quotes: e.g., A["Frontend (React)"]
// 2. Arrows: -->, ---, -.->, ==> only.
// 3. Format: \`\`\`mermaid\ncode\n\`\`\` with blanks.
// 4. Types: graph TD, flowchart LR, sequenceDiagram, classDiagram.
// 5. DONT USE TOO MUCH COMPLEX SEQUENCE DIAGRAMS WITH TOO MANY CONNECTION TRY TO REPRESENT THEM USING graph LR or TD OR JUST  A SMALLER SEQUENCE DIAGRAM.
// 6. Nodes: ["Rectangle"], ("Circle"), {"Diamond"}—text in quotes.
// 7. For arrow labels(ALWAYS USE THIS): Use A -->|"Label"| B 
// 8. CRITICAL: NEVER use both arrow labels AND text after the arrow. Use EITHER A -->|"Label"| B OR A -- "Label" --> B, NEVER both together.
// 9. CRITICAL: For conditional flows, use: A -- "Condition" --> B OR A -->|"Condition"| B, not A -- "Condition" --> B: "Additional text"
// 10. CRITICAL: If you need to show both a condition and an explanation, create separate nodes or use multiple arrows.
// 11. CRITICAL: For subgraphs, ALWAYS use lowercase: "subgraph \"Name\"" and "end" (NOT "SubGraph" or "End")
// 12. CRITICAL: NEVER use code blocks with languages that might not be supported. Stick to common languages like: javascript, typescript, python, java, html, css, json, markdown, bash, shell, sql, yaml, yml, xml, plaintext.
// 13. CRITICAL: NEVER use code blocks with "env" language. Use "plaintext" or "bash" instead.
// 14. CRITICAL: For configuration files or environment variables, use \`\`\`plaintext or \`\`\`bash instead of \`\`\`env.
// 15. CRITICAL: Avoid using language-specific code blocks for niche or specialized languages. When in doubt, use \`\`\`plaintext.

// Output ONLY MDX without any additional formatting or markdown code blocks.`;

//       const sectionResult = await ai.models.generateContent({
//         model: 'gemini-2.5-flash',
//         contents: [sectionPrompt],
//         config: {
//             thinkingConfig: {
//                 thinkingBudget: 500,
//             },
//             }   
//       });
//     let mdxContent = sectionResult.text.trim();

//     // Enhanced cleanup for Mermaid blocks
//     mdxContent = mdxContent
//       .replace(/```mdx/g, '') // Remove any stray ```mdx
//       .replace(/```mermaid/g, '\n\n```mermaid')
//       .replace(/```mermaid\s*\n\s*```/g, '\n\n```mermaid\ngraph TD\nA["Placeholder"] --> B["Diagram"]\n```\n\n') // Replace empty or invalid Mermaid blocks
//       .replace(/(```mermaid[\s\S]*?```)/g, match => {
//           const inner = match.replace(/```mermaid|```/g, '').trim();
//           if (inner.split('\n').length < 3 || !inner.includes('-->')) {
//           return '\n\n```mermaid\ngraph TD\nA["Component"] --> B["Service"]\nC --> B\n```\n\n';
//           }
//           return '\n\n' + match + '\n\n'; // Preserve valid blocks with proper spacing
//       });

//     // Remove any existing frontmatter to avoid duplication
//     if (mdxContent.startsWith('---')) {
//       const frontmatterEnd = mdxContent.indexOf('---', 3) + 3;
//       mdxContent = mdxContent.substring(frontmatterEnd).trim();
//     }

//     // Calculate sidebar_position correctly
//     const sidebarPosition = entry.prefix.endsWith('.') 
//       ? parseInt(entry.prefix.replace('.', ''))  // For "1.", "2." etc. -> 1, 2
//       : parseFloat(entry.prefix);                 // For "2.1", "2.2" etc. -> 2.1, 2.2

//     // Add our own frontmatter with the correct sidebar_position
//     mdxContent = `---
// title: "${entry.title}"
// description: "${entry.description}"
// sidebar_position: ${sidebarPosition}
// ---
//  ${mdxContent}`;

//     generatedFiles.push({ filename: entry.filename, content: mdxContent });
//   }

//   console.log('ProcessRepository: All MDX files generated', { totalFiles: generatedFiles.length });

//   const docsRepo = 'gitdex-docs';
//   const docsPath = `docs/${owner}/${repo}`;

//   console.log('ProcessRepository: Clearing existing docs folder');
//   await deleteDirectoryRecursively(process.env.GITHUB_USERNAME, docsRepo, docsPath);

//   console.log('ProcessRepository: Creating Fumadocs-compatible folder structure');

//   const mainMeta = {
//     title: `${repo} Documentation`,
//     description: `Documentation for ${owner}/${repo}`,
//     icon: "book",
//     root: true
//   };

//   try {
//     await octokit.rest.repos.createOrUpdateFileContents({
//       owner: process.env.GITHUB_USERNAME,
//       repo: docsRepo,
//       path: `${docsPath}/meta.json`,
//       message: `Add main meta.json for ${owner}/${repo}`,
//       content: Buffer.from(JSON.stringify(mainMeta, null, 2)).toString('base64'),
//     });
//     console.log('ProcessRepository: Successfully created main meta.json');
//   } catch (error) {
//     console.error('Failed to create main meta.json:', error.message);
//     throw error;
//   }

//   console.log('ProcessRepository: Uploading MDX files to linear structure');

//   for (const { filename, content } of generatedFiles) {
//     try {
//       await octokit.rest.repos.createOrUpdateFileContents({
//         owner: process.env.GITHUB_USERNAME,
//         repo: docsRepo,
//         path: `${docsPath}/${filename}`,
//         message: `Add ${filename} for ${owner}/${repo}`,
//         content: Buffer.from(content).toString('base64'),
//       });
//       console.log(`ProcessRepository: Successfully uploaded ${filename}`);
//     } catch (uploadError) {
//       if (uploadError.status === 409) {
//         try {
//           const { data: latestFile } = await octokit.rest.repos.getContent({
//             owner: process.env.GITHUB_USERNAME,
//             repo: docsRepo,
//             path: `${docsPath}/${filename}`,
//           });
//           await octokit.rest.repos.createOrUpdateFileContents({
//             owner: process.env.GITHUB_USERNAME,
//             repo: docsRepo,
//             path: `${docsPath}/${filename}`,
//             message: `Add ${filename} for ${owner}/${repo}`,
//             content: Buffer.from(content).toString('base64'),
//             sha: latestFile.sha,
//           });
//           console.log(`ProcessRepository: Successfully uploaded ${filename} after retry`);
//         } catch (retryError) {
//           console.error(`Failed to upload ${filename} after retry:`, retryError.message);
//         }
//       } else {
//         console.error(`Failed to upload ${filename}:`, uploadError.message);
//       }
//     }
//   }

//   return { 
//     message: `Indexing completed for ${repoUrl}`,
//     details: {
//       repository: repoData.full_name,
//       files_processed: fileContents.length,
//       sections_generated: tocEntries.length,
//       access_path: `/docs/${owner}/${repo}`
//     }
//   };
// }

// // Keep the original indexController for now (will be removed later)
// export const indexController = async (req, res) => {
//   console.log('IndexController: Request received', { repoUrl: req.body.repoUrl });

//   try {
//     const result = await processRepository(req.body.repoUrl);
//     res.json(result);
//     console.log('IndexController: Response sent successfully');
//   } catch (error) {
//     console.error('IndexController: Error occurred', error);
//     res.status(500).json({ 
//       error: 'Failed to index repository',
//       details: error.message
//     });
//   }
// };
//////////////////////////
// import { Octokit } from '@octokit/rest';
// import fs from 'fs/promises';
// import { encoding_for_model } from '@dqbd/tiktoken';
// import { GoogleGenAI } from '@google/genai';

// const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
// const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// const tiktoken = encoding_for_model('gpt-4');

// // Helper function to recursively delete a directory and all its contents
// async function deleteDirectoryRecursively(owner, repo, path) {
//   try {
//     console.log(`Attempting to delete contents of: ${path}`);
//     const { data: contents } = await octokit.rest.repos.getContent({
//       owner,
//       repo,
//       path,
//     });

//     for (const item of contents) {
//       if (item.type === 'dir') {
//         await deleteDirectoryRecursively(owner, repo, item.path);
//       } else if (item.type === 'file') {
//         try {
//           console.log(`Deleting file: ${item.path}`);
//           await octokit.rest.repos.deleteFile({
//             owner,
//             repo,
//             path: item.path,
//             message: `Delete ${item.name} for cleanup`,
//             sha: item.sha,
//           });
//           console.log(`Successfully deleted: ${item.path}`);
//         } catch (deleteError) {
//           console.warn(`Failed to delete ${item.path}:`, deleteError.message);
//         }
//       }
//     }
//   } catch (error) {
//     if (error.status !== 404) {
//       console.error(`Failed to get contents of ${path}:`, error.message);
//     }
//   }
// }

// // Helper function for generation with timeout and retry
// async function generateWithRetry(prompt, retries = 3, timeoutMs = 5 * 60 * 1000) {
//   for (let attempt = 0; attempt < retries; attempt++) {
//     try {
//       const timeoutPromise = new Promise((_, reject) =>
//         setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
//       );

//       const result = await Promise.race([
//         ai.models.generateContent({
//           model: 'gemini-2.0-flash',
//           contents: [prompt],
//         //   config: {
//         //     thinkingConfig: {
//         //       thinkingBudget: 500,
//         //     },
//         //   }
//         }),
//         timeoutPromise
//       ]);

//       return result;
//     } catch (error) {
//       console.warn(`Generation attempt ${attempt + 1} failed for prompt:`, error.message);
//       if (attempt === retries - 1) throw error;
//       await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
//     }
//   }
// }

// // Extract the processing logic into a separate function
// export async function processRepository(repoUrl) {
//   console.log('ProcessRepository: Processing repository', { repoUrl });

//   if (!repoUrl) {
//     throw new Error('Repo URL is required');
//   }

//   let owner, repo;
//   try {
//     const url = new URL(repoUrl);
//     if (url.hostname !== 'github.com') {
//       throw new Error('Only GitHub repositories are supported');
//     }
//     const pathParts = url.pathname.split('/').filter(Boolean);
//     if (pathParts.length < 2) {
//       throw new Error('Invalid repository URL format');
//     }
//     owner = pathParts[0];
//     repo = pathParts[1].replace('.git', '');
//   } catch (e) {
//     throw new Error('Invalid repo URL: ' + e.message);
//   }
//   console.log('ProcessRepository: Processing repository', { owner, repo });

//   const repoResponse = await octokit.rest.repos.get({ owner, repo });
//   const repoData = repoResponse.data;
//   if (repoData.size > 500 * 1024 * 1024) {
//     throw new Error('Repository too large to process');
//   }
//   console.log('ProcessRepository: Repository info fetched', { size: repoData.size });

//   console.log('ProcessRepository: Fetching git tree');
//   const { data: treeData } = await octokit.rest.git.getTree({
//     owner,
//     repo,
//     tree_sha: repoData.default_branch,
//     recursive: true
//   });

//   const relevantFiles = treeData.tree.filter(item => 
//     item.type === 'blob' && 
//     item.path.match(/\.(js|ts|jsx|tsx|md|json|py|rb|go|rs|java|cpp|h|c|cs|php|css|html|sql|yaml|yml)$/i) &&
//     item.size < 1000000 &&
//     !item.path.match(/\b(node_modules|dist|build|\.git|__pycache__|\.lock|\.min\.js|\.bundle\.js)\b/i)
//   );

//   console.log('ProcessRepository: Filtered files', { count: relevantFiles.length });

//   // Batch file content fetching with retry logic
//   console.log('ProcessRepository: Fetching file contents in batches');
//   const batchSize = 10;
//   const fileContents = [];
//   for (let i = 0; i < relevantFiles.length; i += batchSize) {
//     const batch = relevantFiles.slice(i, i + batchSize);
//     const batchPromises = batch.map(async file => {
//       for (let attempt = 0; attempt < 3; attempt++) {
//         try {
//           const fileResponse = await octokit.rest.repos.getContent({
//             owner,
//             repo,
//             path: file.path,
//             mediaType: { format: 'raw' },
//           });
//           return { 
//             path: file.path, 
//             content: fileResponse.data.toString('utf8'),
//             size: file.size
//           };
//         } catch (error) {
//           console.warn(`ProcessRepository: Failed to fetch ${file.path} (attempt ${attempt + 1}):`, error.message);
//           if (attempt === 2) return null;
//           await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
//         }
//       }
//     });
//     const batchResults = await Promise.allSettled(batchPromises);
//     fileContents.push(...batchResults
//       .filter(result => result.status === 'fulfilled')
//       .map(result => result.value)
//       .filter(file => file !== null));
//   }
//   console.log('ProcessRepository: Files fetched', { successful: fileContents.length });

//   console.log('ProcessRepository: Generating global TOC');
//   const filePaths = fileContents.map(f => f.path).join('\n');
//   const tocPrompt = `You are GitDex, an expert in repo analysis. From these file paths in the repo ${owner}/${repo}:

//  ${filePaths}

// Infer a hierarchical table of contents for documentation. Structure as 4-8 top-level sections with 1-3 subsections each. Use numeric prefixes like 1., 2.1., 3.2.1. Make titles descriptive, professional, and aligned with common documentation practices (e.g., "System Overview", "Architecture and Design", "Core Features and Implementation").
// NOT COMPULSORY YOU CAN CHANGE THE NUMBER OF SECTIONS AND SUBSECTION FOR LARGE REPOS IF NECESSARY.
// For each section/subsection, provide:
// - prefix: e.g., "1." or "2.1."
// - title: Descriptive title
// - filename: prefix_title.mdx (lowercase, no spaces, e.g., 1_system-overview.mdx, 2.1_architecture.mdx)
// - description: Brief 1-sentence desc
// - relevant_files: Array of 2-4 most relevant file paths (prioritize key files, match by dir/name/content type)

// Output as JSON array of objects, sorted by prefix. Ensure no overlap in content.

// Example JSON:
// [
//   {"prefix": "1.", "title": "System Overview", "filename": "1_system-overview.mdx", "description": "High-level introduction to the system.", "relevant_files": ["README.md", "package.json"]},
//   {"prefix": "2.", "title": "Frontend Implementation", "filename": "2_frontend-implementation.mdx", "description": "Details on UI and client-side logic.", "relevant_files": ["src/app.js"]}
// ]`;

//   const tocResult = await generateWithRetry(tocPrompt, 3, 5 * 60 * 1000);
//   let tocText = tocResult.text.trim();
//   tocText = tocText.replace(/```json\n?|\n?```/g, '').trim();
//   const tocEntries = JSON.parse(tocText);
//   console.log('ProcessRepository: Global TOC generated', { sections: tocEntries.length });

//   tocEntries.sort((a, b) => {
//     const pa = a.prefix.split('.').map(Number);
//     const pb = b.prefix.split('.').map(Number);
//     for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
//       if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
//     }
//     return 0;
//   });

//   console.log('ProcessRepository: Sorted TOC:', tocEntries);

//   console.log('ProcessRepository: Generating section MDX files');
//   const generatedFiles = [];
//   for (const [index, entry] of tocEntries.entries()) {
//     console.log(`ProcessRepository: Processing section ${entry.prefix} ${entry.title}`);
//     const relevantContents = fileContents.filter(f => entry.relevant_files.includes(f.path));

//     const maxTokens = 100000; // Adjust based on Gemini limits; leave headroom for prompt overhead
//     let truncatedContents = [];
//     for (const f of relevantContents) {
//       const tokens = tiktoken.encode(f.content);
//       if (tokens.length > maxTokens / relevantContents.length) { // Fair share per file
//         const truncated = tiktoken.decode(tokens.slice(0, maxTokens / relevantContents.length));
//         truncatedContents.push(`File: ${f.path}\n${truncated}... (truncated for length)\n---\n`);
//       } else {
//         truncatedContents.push(`File: ${f.path}\n${f.content}\n---\n`);
//       }
//     }
//     const contentBlock = truncatedContents.join('');
//     // Optional: Log if truncated
//     if (truncatedContents.some(c => c.includes('(truncated'))) {
//       console.log(`ProcessRepository: Truncated content for section ${entry.prefix} to fit token limits`);
//     }

//     const sectionPrompt = `You are GitDex, a technical documentation AI. Role: Generate wiki-style MDX docs in DeepWiki style. Always follow instructions exactly.

// Section Details:
// - Title: ${entry.title}
// - Description: ${entry.description}
// - Relevant Files: ${entry.relevant_files.join(', ')}

// Content:
//  ${contentBlock}

// MDX Structure:
// - Frontmatter: ---
//   title: "${entry.title}"
//   description: "${entry.description}"
// ---
// - # ${entry.title}
// - ## Subsections (e.g., bullets for features, tables for stack, snippets with links, Mermaid after relevant sections)
// - ## Key Integration Points (end here: insights on flows, best practices)

// Requirements:
// - 4-6 snippets: \`\`\`lang with explanations, GitHub links/line ranges.
// - Inline links: [View on GitHub](https://github.com/${owner}/${repo}/blob/main/{path}).
// - 1-2 Mermaids: graph TD/flowchart LR/sequenceDiagram. 4-8 nodes. Enclose ALL node text in quotes, e.g., A["Text here"].
// - No unnecesary mermaid diagrams please. 
// - Length: 800-1500 words.
// - Adapt to repo.(ML, WEB DEV, FRAMEWORKS, EMBEDDED, C)
// DONT USE TOO MUCH COMPLEX SEQUENCE DIAGRAMS WITH TOO MANY CONNECTION TRY TO REPRESENT THEM USING graph LR or TD OR JUST A SMALLER SEQUENCE DIAGRAM.
// ANY TYPE OF TEXT IN NODE OR EDGE LABEL SHOULD BE IN QUOTES.
// MERMAID RULES: (FOLLOW STRICTLY)
// 0. NO UNNECESSARY MERMAID DIAGRAMS like the component and C one which you hallucinate.
// 1. ALL node text in double quotes: e.g., A["Frontend (React)"]
// 2. Arrows: -->, ---, -.->, ==> only.
// 3. Format: \`\`\`mermaid\ncode\n\`\`\` with blanks.
// 4. Types: graph TD, flowchart LR, sequenceDiagram, classDiagram.
// 5. DONT USE TOO MUCH COMPLEX SEQUENCE DIAGRAMS WITH TOO MANY CONNECTION TRY TO REPRESENT THEM USING graph LR or TD OR JUST  A SMALLER SEQUENCE DIAGRAM.
// 6. Nodes: ["Rectangle"], ("Circle"), {"Diamond"}—text in quotes.
// 7. For arrow labels(ALWAYS USE THIS): Use A -->|"Label"| B 
// 8. CRITICAL: NEVER use both arrow labels AND text after the arrow. Use EITHER A -->|"Label"| B OR A -- "Label" --> B, NEVER both together.
// 9. CRITICAL: For conditional flows, use: A -- "Condition" --> B OR A -->|"Condition"| B, not A -- "Condition" --> B: "Additional text"
// 10. CRITICAL: If you need to show both a condition and an explanation, create separate nodes or use multiple arrows.
// 11. CRITICAL: For subgraphs, ALWAYS use lowercase: "subgraph \"Name\"" and "end" (NOT "SubGraph" or "End")
// 12. CRITICAL: NEVER use code blocks with languages that might not be supported. Stick to common languages like: javascript, typescript, python, java, html, css, json, markdown, bash, shell, sql, yaml, yml, xml, plaintext.
// 13. CRITICAL: NEVER use code blocks with "env" language. Use "plaintext" or "bash" instead.
// 14. CRITICAL: For configuration files or environment variables, use \`\`\`plaintext or \`\`\`bash instead of \`\`\`env.
// 15. CRITICAL: Avoid using language-specific code blocks for niche or specialized languages. When in doubt, use \`\`\`plaintext.
// 16. DONT USE ANY IMAGES IN THE MDX CONTENT PLZ, ONLY MDX CONTENT AND MERMAID BLOCKS.
// 17. NO COLORING IN THE MERMAID DIAGRAMS PLEASE KEEP THEM VANILLA.
// Output ONLY MDX without any additional formatting or markdown code blocks.`;

//       const sectionResult = await generateWithRetry(sectionPrompt);
//     let mdxContent = sectionResult.text.trim();

//     // Enhanced cleanup for Mermaid blocks
//     mdxContent = mdxContent
//       .replace(/```mdx/g, '') // Remove any stray ```mdx
//       .replace(/```mermaid/g, '\n\n```mermaid')
//       .replace(/```mermaid\s*\n\s*```/g, '\n\n```mermaid\ngraph TD\nA["Placeholder"] --> B["Diagram"]\n```\n\n') // Replace empty or invalid Mermaid blocks
//       .replace(/(```mermaid[\s\S]*?```)/g, match => {
//           const inner = match.replace(/```mermaid|```/g, '').trim();
//           if (inner.split('\n').length < 3 || !inner.includes('-->')) {
//           return '\n\n```mermaid\ngraph TD\nA["Component"] --> B["Service"]\nC --> B\n```\n\n';
//           }
//           return '\n\n' + match + '\n\n'; // Preserve valid blocks with proper spacing
//       });

//     // Remove any existing frontmatter to avoid duplication
//     if (mdxContent.startsWith('---')) {
//       const frontmatterEnd = mdxContent.indexOf('---', 3) + 3;
//       mdxContent = mdxContent.substring(frontmatterEnd).trim();
//     }

//     // Calculate sidebar_position correctly
//     const sidebarPosition = entry.prefix.endsWith('.') 
//       ? parseInt(entry.prefix.replace('.', ''))  // For "1.", "2." etc. -> 1, 2
//       : parseFloat(entry.prefix);                 // For "2.1", "2.2" etc. -> 2.1, 2.2

//     // Add our own frontmatter with the correct sidebar_position
//     mdxContent = `---
// title: "${entry.title}"
// description: "${entry.description}"
// sidebar_position: ${sidebarPosition}
// ---
//  ${mdxContent}`;

//     generatedFiles.push({ filename: entry.filename, content: mdxContent });
//   }

//   console.log('ProcessRepository: All MDX files generated', { totalFiles: generatedFiles.length });

//   const docsRepo = 'gitdex-docs';
//   const docsPath = `docs/${owner}/${repo}`;

//   console.log('ProcessRepository: Clearing existing docs folder');
//   await deleteDirectoryRecursively(process.env.GITHUB_USERNAME, docsRepo, docsPath);

//   console.log('ProcessRepository: Creating Fumadocs-compatible folder structure');

//   const mainMeta = {
//     title: `${repo} Documentation`,
//     description: `Documentation for ${owner}/${repo}`,
//     icon: "book",
//     root: true
//   };

//   try {
//     await octokit.rest.repos.createOrUpdateFileContents({
//       owner: process.env.GITHUB_USERNAME,
//       repo: docsRepo,
//       path: `${docsPath}/meta.json`,
//       message: `Add main meta.json for ${owner}/${repo}`,
//       content: Buffer.from(JSON.stringify(mainMeta, null, 2)).toString('base64'),
//     });
//     console.log('ProcessRepository: Successfully created main meta.json');
//   } catch (error) {
//     console.error('Failed to create main meta.json:', error.message);
//     throw error;
//   }

//   console.log('ProcessRepository: Uploading MDX files to linear structure');

//   for (const { filename, content } of generatedFiles) {
//     try {
//       await octokit.rest.repos.createOrUpdateFileContents({
//         owner: process.env.GITHUB_USERNAME,
//         repo: docsRepo,
//         path: `${docsPath}/${filename}`,
//         message: `Add ${filename} for ${owner}/${repo}`,
//         content: Buffer.from(content).toString('base64'),
//       });
//       console.log(`ProcessRepository: Successfully uploaded ${filename}`);
//     } catch (uploadError) {
//       if (uploadError.status === 409) {
//         try {
//           const { data: latestFile } = await octokit.rest.repos.getContent({
//             owner: process.env.GITHUB_USERNAME,
//             repo: docsRepo,
//             path: `${docsPath}/${filename}`,
//           });
//           await octokit.rest.repos.createOrUpdateFileContents({
//             owner: process.env.GITHUB_USERNAME,
//             repo: docsRepo,
//             path: `${docsPath}/${filename}`,
//             message: `Add ${filename} for ${owner}/${repo}`,
//             content: Buffer.from(content).toString('base64'),
//             sha: latestFile.sha,
//           });
//           console.log(`ProcessRepository: Successfully uploaded ${filename} after retry`);
//         } catch (retryError) {
//           console.error(`Failed to upload ${filename} after retry:`, retryError.message);
//         }
//       } else {
//         console.error(`Failed to upload ${filename}:`, uploadError.message);
//       }
//     }
//   }

//   return { 
//     message: `Indexing completed for ${repoUrl}`,
//     details: {
//       repository: repoData.full_name,
//       files_processed: fileContents.length,
//       sections_generated: tocEntries.length,
//       access_path: `/docs/${owner}/${repo}`
//     }
//   };
// }

// // Keep the original indexController for now (will be removed later)
// export const indexController = async (req, res) => {
//   console.log('IndexController: Request received', { repoUrl: req.body.repoUrl });

//   try {
//     const result = await processRepository(req.body.repoUrl);
//     res.json(result);
//     console.log('IndexController: Response sent successfully');
//   } catch (error) {
//     console.error('IndexController: Error occurred', error);
//     res.status(500).json({ 
//       error: 'Failed to index repository',
//       details: error.message
//     });
//   }
// };


import { Octokit } from '@octokit/rest';
import fs from 'fs/promises';
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
                    model: 'gemini-2.0-flash',
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

        const sectionPrompt = `You are GitDex, a technical documentation AI. Generate wiki-style MDX docs in DeepWiki style for ${owner}/${repo}.
    
Section Details:
- Title: ${entry.title}
- Description: ${entry.description}
- Relevant Files: ${entry.relevant_files.join(', ')}

Content:
 ${contentBlock}

MDX Structure:
- # ${entry.title}
- ## Subsections (e.g., bullets for features, tables for stack, snippets with links, Mermaid after relevant sections)
- ## Key Integration Points (end here: insights on flows, best practices)

Requirements:
- Include 4-6 code snippets with explanations and GitHub links: [View on GitHub](https://github.com/${owner}/${repo}/blob/${repoData.default_branch}/{path}).
- Include 1-2 Mermaid diagrams (graph TD, flowchart LR, sequenceDiagram, or classDiagram; 4-8 nodes; no complex sequence diagrams).
- Length: 800-1500 words.
- Adapt to repo type (e.g., ML, web dev, frameworks, embedded, C).
- Use common languages for code blocks: javascript, typescript, python, java, html, css, json, markdown, bash, shell, sql, yaml, yml, xml, plaintext.
- No images; only MDX and Mermaid blocks.

MERMAID RULES: (FOLLOW STRICTLY)
0. NO UNNECESSARY MERMAID DIAGRAMS like the component and C one which you hallucinate.
1. ALL node text in double quotes: e.g., A["Frontend (React)"]
2. Arrows: -->, ---, -.->, ==> only.
3. Format: \`\`\`mermaid\ncode\n\`\`\` with blanks.
4. Types: graph TD, flowchart LR, sequenceDiagram, classDiagram.
5. DONT USE TOO MUCH COMPLEX SEQUENCE DIAGRAMS WITH TOO MANY CONNECTION TRY TO REPRESENT THEM USING graph LR or TD OR JUST  A SMALLER SEQUENCE DIAGRAM.
6. Nodes: ["Rectangle"], ("Circle"), {"Diamond"}—text in quotes.
7. For arrow labels(ALWAYS USE THIS): Use A -->|"Label"| B 
8. CRITICAL: NEVER use both arrow labels AND text after the arrow. Use EITHER A -->|"Label"| B OR A -- "Label" --> B, NEVER both together.
9. CRITICAL: For conditional flows, use: A -- "Condition" --> B OR A -->|"Condition"| B, not A -- "Condition" --> B: "Additional text"
10. CRITICAL: If you need to show both a condition and an explanation, create separate nodes or use multiple arrows.
11. CRITICAL: For subgraphs, ALWAYS use lowercase: "subgraph \"Name\"" and "end" (NOT "SubGraph" or "End")
12. CRITICAL: NEVER use code blocks with languages that might not be supported. Stick to common languages like: javascript, typescript, python, java, html, css, json, markdown, bash, shell, sql, yaml, yml, xml, plaintext.
13. CRITICAL: NEVER use code blocks with "env" language. Use "plaintext" or "bash" instead.
14. CRITICAL: For configuration files or environment variables, use \`\`\`plaintext or \`\`\`bash instead of \`\`\`env.
15. CRITICAL: Avoid using language-specific code blocks for niche or specialized languages. When in doubt, use \`\`\`plaintext.
16. DONT USE ANY IMAGES IN THE MDX CONTENT PLZ, ONLY MDX CONTENT AND MERMAID BLOCKS.
17. NO COLORING IN THE MERMAID DIAGRAMS PLEASE KEEP THEM VANILLA.
Output ONLY MDX content without extra formatting.`;

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

    try {
        await octokit.rest.repos.createOrUpdateFileContents({
            owner: process.env.GITHUB_USERNAME,
            repo: docsRepo,
            path: `${docsPath}/meta.json`,
            message: `Add main meta.json for ${owner}/${repo}`,
            content: Buffer.from(JSON.stringify(mainMeta, null, 2)).toString('base64'),
        });
        console.log('ProcessRepository: Successfully created main meta.json');
    } catch (error) {
        console.error('Failed to create main meta.json:', error.message);
        throw error;
    }

    console.log('ProcessRepository: Uploading MDX files to linear structure');

    for (const { filename, content } of generatedFiles) {
        try {
            await octokit.rest.repos.createOrUpdateFileContents({
                owner: process.env.GITHUB_USERNAME,
                repo: docsRepo,
                path: `${docsPath}/${filename}`,
                message: `Add ${filename} for ${owner}/${repo}`,
                content: Buffer.from(content).toString('base64'),
            });
            console.log(`ProcessRepository: Successfully uploaded ${filename}`);
        } catch (uploadError) {
            if (uploadError.status === 409) {
                try {
                    const { data: latestFile } = await octokit.rest.repos.getContent({
                        owner: process.env.GITHUB_USERNAME,
                        repo: docsRepo,
                        path: `${docsPath}/${filename}`,
                    });
                    await octokit.rest.repos.createOrUpdateFileContents({
                        owner: process.env.GITHUB_USERNAME,
                        repo: docsRepo,
                        path: `${docsPath}/${filename}`,
                        message: `Add ${filename} for ${owner}/${repo}`,
                        content: Buffer.from(content).toString('base64'),
                        sha: latestFile.sha,
                    });
                    console.log(`ProcessRepository: Successfully uploaded ${filename} after retry`);
                } catch (retryError) {
                    console.error(`Failed to upload ${filename} after retry:`, retryError.message);
                }
            } else {
                console.error(`Failed to upload ${filename}:`, uploadError.message);
            }
        }
    }
    console.log('ProcessRepository: All files uploaded, waiting for GitHub to process...');
    await new Promise(resolve => setTimeout(resolve, 30000)); // 45 second delay

    console.log('ProcessRepository: Delay completed, returning success response');


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