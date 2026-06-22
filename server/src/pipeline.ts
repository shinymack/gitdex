import queue from "./queue.js";
import { generateWithRetry } from "./ai.js";
import { Octokit } from "@octokit/rest";
import { encodingForModel } from "js-tiktoken";
import { Client } from "@upstash/qstash";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const tiktoken = encodingForModel('gpt-4');

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

interface PipelineData {
    files: { path: string; content: string }[];
    toc: any[];
    generatedFiles: { filename: string; content: string }[];
    sectionsWritten: number;
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
                await triggerNextStep(job.id);
                break;
            case 2:
                await writeSections(job, data);
                const isFinished = data.sectionsWritten >= data.toc.length;
                await triggerNextStep(job.id, isFinished ? undefined : "5s");
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

    const topFiles = relevantFiles.slice(0, 50);
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
        } catch (e) { /* skip */ }
    }

    data.files = files;
    await queue.updateJob(job.id, { currentStep: 1, data: JSON.stringify(data) });
}

async function planStructure(job: any, data: PipelineData) {
    console.log(`[Pipeline] Step 1: Planning TOC for ${job.owner}/${job.repo}`);
    const filePaths = data.files.map((f: any) => f.path).join('\n');

    const prompt = `You are GitDex, an expert in repo analysis. From these file paths in ${job.owner}/${job.repo}:\n${filePaths}\n\nGenerate a hierarchical table of contents for documentation with 4-8 top-level sections. Use numeric prefixes (e.g., 1., 2.1.). For each section, provide prefix, title, filename (prefix_title.mdx), description, and relevant_files (2-4 paths). Output as a valid JSON array ONLY.`;

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

async function writeSections(job: any, data: PipelineData) {
    console.log(`[Pipeline] Step 2: Writing section ${data.sectionsWritten + 1}/${data.toc.length} for ${job.owner}/${job.repo}`);

    const entry = data.toc[data.sectionsWritten];
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

    const blobs: any[] = [{
        path: `${docsPath}/meta.json`,
        mode: '100644',
        type: 'blob',
        content: JSON.stringify({ title: `${job.repo} Documentation`, description: `Documentation for ${job.owner}/${job.repo}`, icon: "book", root: true }, null, 2)
    }];

    for (const { filename, content } of data.generatedFiles) {
        blobs.push({ path: `${docsPath}/${filename}`, mode: '100644', type: 'blob', content });
    }

    const { data: refData } = await octokit.rest.git.getRef({ owner: docsRepoOwner, repo: docsRepo, ref: 'heads/main' });
    const { data: commitData } = await octokit.rest.git.getCommit({ owner: docsRepoOwner, repo: docsRepo, commit_sha: refData.object.sha });

    const { data: newTree } = await octokit.rest.git.createTree({
        owner: docsRepoOwner,
        repo: docsRepo,
        base_tree: commitData.tree.sha,
        tree: blobs
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
}