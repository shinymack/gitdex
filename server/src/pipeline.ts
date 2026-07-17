import queue, { redis, type JobData } from "./queue.js";
import { generateWithRetry } from "./ai.js";
import { Octokit } from "@octokit/rest";
import { encodingForModel } from "js-tiktoken";
import { Client } from "@upstash/qstash";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const tiktoken = encodingForModel('gpt-4');

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

interface TocEntry {
    prefix: string;
    title: string;
    filename: string;
    description: string;
    relevant_files: string[];
}

interface PipelineData {
    files: { path: string; content: string }[];
    toc: TocEntry[];
    generatedFiles: { filename: string; content: string }[];
    sectionsWritten: number;
    defaultBranch?: string;
}

async function triggerNextStep(jobId: string, sectionIndex?: number) {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) throw new Error("BASE_URL missing for QStash");

    await qstash.publishJSON({
        url: `${baseUrl}/api/pipeline/step`,
        body: { jobId, sectionIndex },
        retries: 2,
    });
}

export async function executeNextStep(jobId: string, sectionIndex?: number) {
    const acquiredLock = await queue.acquireStepLock(jobId, sectionIndex);

    if (!acquiredLock) {
        console.log(`[Pipeline] Step already in progress for ${jobId} (section: ${sectionIndex ?? 'all'}). Skipping duplicate.`);
        return;
    }

    const job = await queue.getJob(jobId);
    if (!job || job.state !== 'processing') {
        await queue.releaseStepLock(jobId, sectionIndex);
        return;
    }

    // Robust data parsing
    let data: PipelineData;
    if (job.data) {
        if (typeof job.data === 'string') {
            try {
                data = JSON.parse(job.data);
            } catch (e) {
                data = { files: [], toc: [], generatedFiles: [], sectionsWritten: 0 };
            }
        } else {
            data = job.data as PipelineData;
        }
    } else {
        data = { files: [], toc: [], generatedFiles: [], sectionsWritten: 0 };
    }

    let nextJobId: string | null = null;

    // MAIN EXECUTION TRY/CATCH
    try {
        switch (job.currentStep) {
            case 0:
                await scanRepository(job, data);
                await triggerNextStep(job.id); // Trigger self for next step
                break;
            case 1:
                await planStructure(job, data);
                // Trigger first 5 sections in parallel (indices 0 to Math.min(5, N) - 1)
                const numSections = data.toc.length;
                await redis.set(`job:${job.owner}/${job.repo}:completed_sections`, '0');
                const initialWorkers = Math.min(5, numSections);
                for (let i = 0; i < initialWorkers; i++) {
                    await triggerNextStep(job.id, i);
                }
                break;
            case 2:
                if (sectionIndex === undefined) {
                    throw new Error("Missing sectionIndex for step 2 execution");
                }
                await writeSingleSection(job, data, sectionIndex);
                break;
            case 3:
                await commitToGithub(job, data);
                nextJobId = await queue.completeJob(job.id); // Success! Get next job ID.
                break;
        }
    } catch (error: any) {
        console.error(`Pipeline failed at step ${job.currentStep} for ${jobId} (section: ${sectionIndex ?? 'all'}):`, error.message);
        nextJobId = await queue.failJob(jobId, error.message); // Fail current job, get next job ID
    } finally {
        await queue.releaseStepLock(jobId, sectionIndex);
    }

    // SAFELY TRIGGER THE NEXT JOB (ISOLATED TRY/CATCH)
    if (nextJobId) {
        try {
            console.log(`[Pipeline] Triggering next queued job: ${nextJobId}`);
            await triggerNextStep(nextJobId);
        } catch (e: any) {
            // CRITICAL: If QStash is down, we must put the next job back in the queue!
            console.error(`[Pipeline] CRITICAL: Failed to trigger next job ${nextJobId}! Re-queueing it.`, e.message);
            await queue.requeueJob(nextJobId);
        }
    }
}

interface RepoItem {
    type?: string;
    path?: string;
    size?: number;
}

async function scanRepository(job: JobData, data: PipelineData) {
    console.log(`[Pipeline] Step 0: Scanning ${job.owner}/${job.repo}`);
    const { data: repoData } = await octokit.rest.repos.get({ owner: job.owner, repo: job.repo });
    data.defaultBranch = repoData.default_branch || 'main';

    const { data: treeData } = await octokit.rest.git.getTree({
        owner: job.owner,
        repo: job.repo,
        tree_sha: repoData.default_branch,
        recursive: 'true'
    });

    const relevantFiles = (treeData.tree as RepoItem[]).filter((item) =>
        item.type === 'blob' &&
        item.path?.match(/\.(js|ts|jsx|tsx|md|json|py|rb|go|rs|java|cpp|h|c|cs|php|css|html|sql|yaml|yml)$/i) &&
        (item.size || 0) < 1000000 &&
        !item.path.match(/\b(node_modules|dist|build|\.git|__pycache__|\.lock|package-lock|bun\.lockb|yarn\.lock|pnpm-lock|\.min\.js|\.bundle\.js)\b/i) &&
        !item.path.includes('/components/ui/')
    );

    // Group files by top-level directory for round-robin sampling
    const groups: { [key: string]: RepoItem[] } = {};
    for (const file of relevantFiles) {
        if (!file.path) continue;
        const parts = file.path.split('/');
        const dir = (parts.length > 1 ? parts[0] : '.') || '.';
        if (!groups[dir]) groups[dir] = [];
        groups[dir].push(file);
    }

    const sampledFiles: RepoItem[] = [];
    const dirs = Object.keys(groups);
    let index = 0;
    while (sampledFiles.length < 50 && dirs.length > 0) {
        const currentDir = dirs[index % dirs.length];
        if (!currentDir) {
            dirs.splice(index % dirs.length, 1);
            continue;
        }
        const file = (groups[currentDir] || []).shift();
        if (file) {
            sampledFiles.push(file);
        } else {
            dirs.splice(index % dirs.length, 1);
            continue;
        }
        index++;
    }

    const files: { path: string; content: string }[] = [];
    const concurrency = 10;
    const queueList = [...sampledFiles];
    const workers: Promise<void>[] = [];

    const worker = async () => {
        while (queueList.length > 0) {
            const file = queueList.shift();
            if (!file || !file.path) continue;
            try {
                const fileResponse = await octokit.rest.repos.getContent({
                    owner: job.owner,
                    repo: job.repo,
                    path: file.path,
                    mediaType: { format: 'raw' },
                });
                
                const rawData = fileResponse.data;
                const rawContent = typeof rawData === 'string'
                    ? rawData
                    : String(rawData);
                    
                files.push({ path: file.path, content: rawContent });
            } catch (e) {
                // skip
            }
        }
    };

    const { promise, resolve } = Promise.withResolvers<void>();
    
    for (let i = 0; i < Math.min(concurrency, sampledFiles.length); i++) {
        workers.push(worker());
    }
    
    Promise.all(workers).then(() => resolve());
    await promise;

    data.files = files;
    await queue.updateJob(job.id, { currentStep: 1, data: JSON.stringify(data) });
}

async function planStructure(job: any, data: PipelineData) {
    console.log(`[Pipeline] Step 1: Planning TOC for ${job.owner}/${job.repo}`);
    const filePaths = data.files.map((f: any) => f.path).join('\n');

    const prompt = `You are GitDex, an expert technical writer and repository analyst.
Analyze these file paths in the ${job.owner}/${job.repo} project:
${filePaths}

First, profile the repository's architecture (determine if it is a monorepo, full-stack app, backend service, frontend client, library, CLI, etc.).
Based on that profile, generate a hierarchical table of contents for its documentation with 5 to 12 top-level sections.

When designing the structure, plan sections that would benefit from visual diagrams, such as:
- Architecture overviews
- Data flows and database schemas
- Component relationships
- Process workflows and state transitions

For each section in the documentation, provide:
- prefix: Numeric prefix (e.g., "1", "2.1", etc.)
- title: Section title (e.g., "Architecture Overview", "Database Schema", etc.)
- filename: Mapped filename formatted as "prefix_title.mdx" (replace spaces with hyphens, lowercase)
- description: A brief summary of what this section covers
- relevant_files: An array of 2 to 5 actual file paths from the provided list that are most relevant to this section

Output your final response as a valid JSON array of objects ONLY. Do not include markdown code block formatting (do not wrap in \`\`\`json).`;

    const tocText = await generateWithRetry({ prompt });
    const cleanedToc = tocText.replace(/```json\n?|\n?```/g, '').trim();

    data.toc = JSON.parse(cleanedToc);
    data.toc.sort((a: any, b: any) => {
        const pa = a.prefix.split('.').map(Number);
        const pb = b.prefix.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
        }
        return 0;
    });

    await queue.updateJob(job.id, { currentStep: 2, data: JSON.stringify(data) });
}

async function writeSingleSection(job: any, data: PipelineData, sectionIndex: number) {
    const entry = data.toc[sectionIndex];
    if (!entry) {
        throw new Error(`Section entry not found at index ${sectionIndex}`);
    }

    console.log(`[Pipeline] Step 2: Writing section ${sectionIndex + 1}/${data.toc.length} for ${job.owner}/${job.repo}`);

    const relevantContents = data.files.filter((f: any) => entry.relevant_files.includes(f.path));

    const maxTokens = 100000;
    let truncatedContents = [];
    for (const f of relevantContents) {
        const tokens = tiktoken.encode(f.content);
        if (tokens.length > maxTokens / Math.max(relevantContents.length, 1)) {
            const truncated = tiktoken.decode(tokens.slice(0, Math.floor(maxTokens / Math.max(relevantContents.length, 1))));
            truncatedContents.push(`File: ${f.path}\n${truncated}... (truncated)\n---\n`);
        } else {
            truncatedContents.push(`File: ${f.path}\n${f.content}\n---\n`);
        }
    }
    const contentBlock = truncatedContents.join('');

    const fullTocContext = JSON.stringify(data.toc, null, 2);

    const prompt = `You are GitDex, an expert technical writer and software architect.
Generate a comprehensive, accurate, and production-ready technical documentation page in Markdown/MDX format about a specific module within the project ${job.owner}/${job.repo}.

The page you need to create:
Section Title: "${entry.title}"
Section Description: "${entry.description}"

To help you understand the context and prevent repeating information, here is the full planned Table of Contents for this project's documentation:
<global_toc>
${fullTocContext}
</global_toc>

Use the following source files from the project as the sole basis for the content:
<source_files>
${contentBlock}</source_files>

CRITICAL RULES FOR GENERATION:

1. STRUCTURE & LAYOUT:
- Do not provide any conversational preamble, greeting, or introductory filler (e.g., do not say "Here is the documentation..."). Start directly with the content.
- No frontmatter blocks.
- Start directly with a H1 heading: "# ${entry.title}".
- Break the page down into logical sections using H2 (##) and H3 (###) headings.

2. FACTUAL GROUNDING:
- Base all information strictly on the provided source files. Do not speculate, guess, or invent features not explicitly present in the code.
- Cover at least 5 different source files from the available list across the document to ensure comprehensive code coverage (or cover all of them if fewer than 5 exist).

3. MERMAID DIAGRAMS:
- Include 1 or 2 visual Mermaid diagrams (e.g., flowchart TD, flowchart LR, sequenceDiagram, classDiagram, erDiagram) to represent component interactions or data flow.
- Support both top-down ("graph TD") and left-to-right ("graph LR") layout directives.
- Quote all node labels (e.g., A["My Label"]) to prevent syntax errors from special characters.
- Keep node label text short (maximum 3-4 words).
- For sequence diagrams:
  - Start with "sequenceDiagram" on its own line.
  - Define all participants using the "participant" keyword at the top.
  - Use correct Mermaid arrow notations: ->> (calls/requests), -->> (responses/returns), -) (async messages).
  - Use activation/deactivation markers (+/- suffix) and autonumber directive.
  - Use loop/alt/opt/par/critical/break blocks for complex control flows.

4. TABLES & CODE SNIPPETS:
- Use Markdown tables to describe key API endpoints, data fields, or configuration options.
- Keep code snippets brief, well-formatted, and directly extracted from the source files.

5. OUTPUT:
- Output ONLY the raw Markdown/MDX body. Do not wrap the entire response in outer markdown code fences (\`\`\`md or \`\`\`mdx).`;

    let mdxContent = await generateWithRetry({ prompt });

    mdxContent = mdxContent
        .replace(/^```(?:mdx|markdown|md)\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim();

    while (mdxContent.startsWith('---')) {
        const closeIndex = mdxContent.indexOf('---', 3);
        if (closeIndex === -1) break;
        mdxContent = mdxContent.slice(closeIndex + 3).trim();
    }

    const sidebarPosition = entry.prefix.endsWith('.') ? parseInt(entry.prefix.replace('.', '')) : parseFloat(entry.prefix);
    const finalContent = `---\ntitle: "${entry.title}"\ndescription: "${entry.description}"\nsidebar_position: ${sidebarPosition}\n---\n${mdxContent}`;

    const sectionField = `section:${sectionIndex}`;
    await redis.hset(job.id, { [sectionField]: JSON.stringify({ filename: entry.filename, content: finalContent }) });

    const nextIndex = sectionIndex + 5;
    if (nextIndex < data.toc.length) {
        await triggerNextStep(job.id, nextIndex);
    }

    const jobHash = (await redis.hgetall(job.id)) || {};
    const completedSections = Object.keys(jobHash).filter((k) => k.startsWith('section:'));
    const completedCount = completedSections.length;

    console.log(`[Pipeline] Section ${sectionIndex + 1}/${data.toc.length} written for ${job.owner}/${job.repo}. Completed count: ${completedCount}`);

    await queue.updateJob(job.id, {});

    if (completedCount === data.toc.length) {
        console.log(`[Pipeline] All sections written for ${job.owner}/${job.repo}. Fan-in gathering files.`);
        
        const generatedFiles: { filename: string; content: string }[] = [];
        for (let i = 0; i < data.toc.length; i++) {
            const fileData = jobHash[`section:${i}`];
            if (fileData) {
                generatedFiles.push(typeof fileData === 'string' ? JSON.parse(fileData) : fileData);
            }
        }

        data.generatedFiles = generatedFiles;
        data.sectionsWritten = completedCount;

        if (completedSections.length > 0) {
            await redis.hdel(job.id, ...completedSections);
        }

        await queue.updateJob(job.id, { currentStep: 3, data: JSON.stringify(data) });
        await triggerNextStep(job.id);
    }
}

async function commitToGithub(job: any, data: PipelineData) {
    console.log(`[Pipeline] Step 3: Committing to GitHub for ${job.owner}/${job.repo}`);
    const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';
    const docsRepoOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME || "";
    if (!docsRepoOwner) throw new Error("Missing DOCS_REPO_OWNER or GITHUB_USERNAME env variable");
    const docsPath = `docs/${job.owner}/${job.repo}`;

    const newBlobs: any[] = [{
        path: `${docsPath}/meta.json`,
        mode: '100644',
        type: 'blob',
        content: JSON.stringify({ 
            title: `${job.repo} Documentation`, 
            description: `Documentation for ${job.owner}/${job.repo}`, 
            icon: "book", 
            root: true,
            defaultBranch: data.defaultBranch || 'main'
        }, null, 2)
    }];

    for (const { filename, content } of data.generatedFiles) {
        newBlobs.push({ path: `${docsPath}/${filename}`, mode: '100644', type: 'blob', content });
    }

    const { data: refData } = await octokit.rest.git.getRef({ owner: docsRepoOwner, repo: docsRepo, ref: 'heads/main' });
    const { data: commitData } = await octokit.rest.git.getCommit({ owner: docsRepoOwner, repo: docsRepo, commit_sha: refData.object.sha });

    // Get the full current tree to find stale files under docsPath that need deleting.
    const { data: currentTree } = await octokit.rest.git.getTree({
        owner: docsRepoOwner,
        repo: docsRepo,
        tree_sha: commitData.tree.sha,
        recursive: 'true',
    });

    const newBlobPaths = new Set(newBlobs.map(b => b.path));
    const deletions: any[] = currentTree.tree
        .filter(item => item.path?.startsWith(`${docsPath}/`) && item.type === 'blob' && !newBlobPaths.has(item.path!))
        .map(item => ({ path: item.path, mode: '100644', type: 'blob', sha: null }));

    const { data: newTree } = await octokit.rest.git.createTree({
        owner: docsRepoOwner,
        repo: docsRepo,
        base_tree: commitData.tree.sha,
        tree: [...deletions, ...newBlobs]
    });

    const { data: newCommit } = await octokit.rest.git.createCommit({
        owner: docsRepoOwner,
        repo: docsRepo,
        message: `GitDex Index: ${job.owner}/${job.repo}`,
        tree: newTree.sha,
        parents: [refData.object.sha]
    });

    await octokit.rest.git.updateRef({
        owner: docsRepoOwner,
        repo: docsRepo,
        ref: 'heads/main',
        sha: newCommit.sha
    });

    await redis.set(`last_indexed:${job.owner}/${job.repo}`, Date.now().toString());
    console.log(`[Pipeline] Wrote last_indexed timestamp for ${job.owner}/${job.repo}`);
}