import queue, { redis } from "./queue.js";
import { generateWithRetry } from "./ai.js";
import { Octokit } from "@octokit/rest";
import { encodingForModel } from "js-tiktoken";
import { Client } from "@upstash/qstash";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const tiktoken = encodingForModel('gpt-4');

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

interface PipelineData {
    files: { path: string; content: string }[];
    readme: string;
    toc: any[];
    generatedFiles: { filename: string; content: string }[];
    sectionsWritten: number;
}

function scoreFile(path: string): number {
    let score = 0;
    const name = path.split('/').pop()?.toLowerCase() || '';
    const lower = path.toLowerCase();

    if (/^readme/i.test(name) || /^(package\.json|cargo\.toml|go\.mod|pyproject\.toml)$/.test(name)) score += 10;
    if (/^(index|main|app|server|cli)\.(ts|js|tsx|jsx|py|go|rs|java)$/.test(name)) score += 8;
    if (/^src\/|^lib\//.test(lower)) score += 5;
    if (/config|\.config\./i.test(name)) score += 3;
    if (path.split('/').length <= 2) score += 2;
    if (/test|spec|__test__|__tests__/i.test(lower)) score -= 3;
    if (/example|demo|sample|fixture/i.test(lower)) score -= 5;

    return score;
}

function detectFramework(files: { path: string }[]): string {
    const paths = files.map(f => f.path.toLowerCase());
    const has = (p: string) => paths.some(f => f.includes(p));
    const parts: string[] = [];
    if (has('next.config')) parts.push('Next.js');
    else if (has('vite.config')) parts.push('Vite');
    else if (has('angular.json')) parts.push('Angular');
    if (has('package.json')) parts.push('Node.js');
    if (has('cargo.toml')) parts.push('Rust');
    if (has('go.mod')) parts.push('Go');
    if (has('pyproject.toml') || has('setup.py')) parts.push('Python');
    if (has('pom.xml') || has('build.gradle')) parts.push('Java');
    return parts.length > 0 ? parts.join('/') : 'Unknown';
}

async function triggerNextStep(jobId: string, delay?: any) {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) throw new Error("BASE_URL missing for QStash");

    await qstash.publishJSON({
        url: `${baseUrl}/api/pipeline/step`,
        body: { jobId },
        retries: 2,
        ...(delay ? { delay } : {})
    });
}

export async function executeNextStep(jobId: string) {
    const acquiredLock = await queue.acquireStepLock(jobId);

    if (!acquiredLock) {
        console.log(`[Pipeline] Step already in progress for ${jobId}. Skipping duplicate.`);
        return;
    }

    const job = await queue.getJob(jobId);
    if (!job || job.state !== 'processing') {
        await queue.releaseStepLock(jobId);
        return;
    }

    // Robust data parsing
    let data: PipelineData;
    if (job.data) {
        if (typeof job.data === 'string') {
            try {
                data = JSON.parse(job.data);
            } catch (e) {
                data = { files: [], readme: '', toc: [], generatedFiles: [], sectionsWritten: 0 };
            }
        } else {
            data = job.data as PipelineData;
        }
    } else {
        data = { files: [], readme: '', toc: [], generatedFiles: [], sectionsWritten: 0 };
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
                await triggerNextStep(job.id);
                break;
            case 2:
                await writeSections(job, data);
                const isFinished = data.sectionsWritten >= data.toc.length;
                await triggerNextStep(job.id, isFinished ? undefined : "1s");
                break;
            case 3:
                await commitToGithub(job, data);
                nextJobId = await queue.completeJob(job.id); // Success! Get next job ID.
                break;
        }
    } catch (error: any) {
        console.error(`Pipeline failed at step ${job.currentStep} for ${jobId}:`, error.message);
        nextJobId = await queue.failJob(jobId, error.message); // Fail current job, get next job ID
    } finally {
        await queue.releaseStepLock(jobId);
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

async function scanRepository(job: any, data: PipelineData) {
    console.log(`[Pipeline] Step 0: Scanning ${job.owner}/${job.repo}`);
    const { data: repoData } = await octokit.rest.repos.get({ owner: job.owner, repo: job.repo });

    const { data: treeData } = await octokit.rest.git.getTree({
        owner: job.owner,
        repo: job.repo,
        tree_sha: repoData.default_branch,
        recursive: 'true'
    });

    const relevantFiles = treeData.tree.filter((item: any) =>
        item.type === 'blob' &&
        item.path?.match(/\.(js|ts|jsx|tsx|md|json|py|rb|go|rs|java|cpp|h|c|cs|php|css|html|sql|yaml|yml)$/i) &&
        (item.size || 0) < 1000000 &&
        !item.path.match(/\b(node_modules|dist|build|\.git|__pycache__|\.lock|\.min\.js|\.bundle\.js)\b/i)
    );

    const topFiles = relevantFiles
        .map((f: any) => ({ ...f, score: scoreFile(f.path!) }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 100);
    const files = [];
    for (const file of topFiles) {
        try {
            const fileResponse = await octokit.rest.repos.getContent({
                owner: job.owner,
                repo: job.repo,
                path: file.path,
                mediaType: { format: 'raw' },
            });
            const rawContent = typeof fileResponse.data === 'string'
                ? fileResponse.data
                : (fileResponse.data as any).toString();
            files.push({ path: file.path, content: rawContent });
        } catch (e) { console.warn(`[Pipeline] Skipped ${file.path}: ${(e as any).message}`); }
    }

    data.files = files;
    const readmeFile = files.find(f => /^readme/i.test(f.path.split('/').pop() || ''));
    data.readme = readmeFile?.content?.slice(0, 3000) || '';
    await queue.updateJob(job.id, { currentStep: 1, data: JSON.stringify(data) });
}

async function planStructure(job: any, data: PipelineData) {
    console.log(`[Pipeline] Step 1: Planning TOC for ${job.owner}/${job.repo}`);
    const filePaths = data.files.map((f: any) => f.path).join('\n');

    const framework = detectFramework(data.files);
    const readmeContext = data.readme
        ? `\n\nProject README (first 3000 chars):\n${data.readme}\n`
        : '';

    const prompt = `You are GitDex, an expert in repo analysis. This is a ${framework} project: ${job.owner}/${job.repo}.${readmeContext}\nFile paths in the repository:\n${filePaths}\n\nGenerate a hierarchical table of contents for documentation with 4-8 top-level sections. Use numeric prefixes (e.g., 1., 2.1.). For each section, provide prefix, title, filename (prefix_title.mdx), description, and relevant_files (2-4 paths). Output as a valid JSON array ONLY.`;

    const tocText = await generateWithRetry({ prompt });
    const cleanedToc = tocText.replace(/```json\n?|\n?```/g, '').trim();

    try {
        data.toc = JSON.parse(cleanedToc);
    } catch (e: any) {
        throw new Error(`Gemini returned invalid JSON for TOC: ${e.message}`);
    }

    const requiredFields = ['prefix', 'title', 'filename', 'description', 'relevant_files'];
    for (const entry of data.toc) {
        for (const field of requiredFields) {
            if (!entry[field]) throw new Error(`TOC entry missing required field "${field}": ${JSON.stringify(entry)}`);
        }
    }

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

async function writeSections(job: any, data: PipelineData) {
    console.log(`[Pipeline] Step 2: Writing section ${data.sectionsWritten + 1}/${data.toc.length} for ${job.owner}/${job.repo}`);

    const entry = data.toc[data.sectionsWritten];
    const relevantContents = data.files.filter((f: any) => entry.relevant_files.includes(f.path));

    const maxTokens = 100000;
    const MIN_TOKENS_PER_FILE = 5000;
    const totalSize = relevantContents.reduce((sum, f) => sum + f.content.length, 0);
    let truncatedContents = [];
    for (const f of relevantContents) {
        const proportion = totalSize > 0 ? f.content.length / totalSize : 1 / relevantContents.length;
        const allocated = Math.max(MIN_TOKENS_PER_FILE, Math.floor(maxTokens * proportion));
        const tokens = tiktoken.encode(f.content);
        if (tokens.length > allocated) {
            const truncated = tiktoken.decode(tokens.slice(0, allocated));
            truncatedContents.push(`File: ${f.path}\n${truncated}... (truncated from ${tokens.length} to ${allocated} tokens)\n---\n`);
        } else {
            truncatedContents.push(`File: ${f.path}\n${f.content}\n---\n`);
        }
    }
    const contentBlock = truncatedContents.join('');

    const prompt = `You are GitDex, an expert technical writer. Generate production-ready MDX documentation for ${job.owner}/${job.repo}.\nSection: ${entry.title}\nDescription: ${entry.description}\nCode Context:\n${contentBlock}\n\nSTRICT RULES: Valid MDX only. No frontmatter. Start with "# ${entry.title}". Include 1 Mermaid diagram if relevant (use graph TD, quoted nodes A["User"] --> B["API"], standard arrows). No images. Output ONLY the MDX body.`;

    let mdxContent = await generateWithRetry({ prompt });

    // Strip outer code fence wrapper if the model wrapped the entire response.
    // No 'm' flag: ^ and $ must anchor to the entire string, not per-line,
    // otherwise the regex matches and strips the first closing ``` in the content
    // (e.g. the mermaid block's closing fence) instead of a trailing wrapper.
    mdxContent = mdxContent
        .replace(/^```(?:mdx|markdown|md)\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim();

    // Strip ALL leading frontmatter blocks the model may have included,
    // then prepend our own controlled frontmatter
    while (mdxContent.startsWith('---')) {
        const closeIndex = mdxContent.indexOf('---', 3);
        if (closeIndex === -1) break;
        mdxContent = mdxContent.slice(closeIndex + 3).trim();
    }

    const sidebarPosition = entry.prefix.endsWith('.') ? parseInt(entry.prefix.replace('.', '')) : parseFloat(entry.prefix);
    const finalContent = `---\ntitle: "${entry.title}"\ndescription: "${entry.description}"\nsidebar_position: ${sidebarPosition}\n---\n${mdxContent}`;

    data.generatedFiles.push({ filename: entry.filename, content: finalContent });
    data.sectionsWritten++;

    if (data.sectionsWritten >= data.toc.length) {
        await queue.updateJob(job.id, { currentStep: 3, data: JSON.stringify(data) });
    } else {
        await queue.updateJob(job.id, { currentStep: 2, data: JSON.stringify(data) });
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
        content: JSON.stringify({ title: `${job.repo} Documentation`, description: `Documentation for ${job.owner}/${job.repo}`, icon: "book", root: true }, null, 2)
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