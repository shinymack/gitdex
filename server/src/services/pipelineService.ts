import { encodingForModel } from "js-tiktoken";
import { redis } from "../config/redis.js";
import queue from "./queueService.js";
import { generateWithRetry } from "./aiService.js";
import { compressCodeWithRepomix } from "./compressionService.js";
import { triggerNextStep } from "./qstashService.js";
import { scanRepository, commitToGithub } from "./githubService.js";
import type { JobData } from "../types/job.js";
import type { PipelineData, TocEntry } from "../types/pipeline.js";

const tiktoken = encodingForModel('gpt-4');

export async function planStructure(job: JobData, data: PipelineData): Promise<void> {
  console.log(`[Pipeline] Step 1: Planning TOC for ${job.owner}/${job.repo}`);
  
  const existingHash = (await redis.hgetall(job.id)) || {};
  const oldSectionKeys = Object.keys(existingHash).filter((k) => k.startsWith('section:'));
  if (oldSectionKeys.length > 0) {
    await redis.hdel(job.id, ...oldSectionKeys);
  }

  const filePaths = data.files.map((f) => f.path).join('\n');
  const fileCount = data.files.length;

  const prompt = `You are GitDex, a principal software architect and technical documentation engine.
Analyze the following ${fileCount} file paths in the ${job.owner}/${job.repo} project:
${filePaths}

GOAL: Generate a highly technical, domain-driven Table of Contents.

SECTION TITLE & TOC STRUCTURING DIRECTIVES:
1. CRISP TECHNICAL TERMINOLOGY (CRITICAL):
   - Use short, precise, professional systems-engineering titles for all sections (e.g. "System Architecture", "Backend Core Engine", "AI Processing Pipeline", "Task Queue Orchestration", "Server API Layer", "Frontend Infrastructure", "Dynamic Repository Routing", "Client State & Proxy Layer", "AI Experience Layer").
   - NEVER use wordy, generic, or conversational section titles (e.g. AVOID "Introduction to how things work", "Understanding the code").

2. ARCHITECTURAL HIERARCHY & SUBSECTIONS:
   - Group the repository into core architectural pillars ("1", "2", "3", "4", "5").
   - For major pillars that contain multiple core files or distinct sub-modules, generate 1 to 3 focused child sub-pages (e.g., "2.1", "2.2", "3.1").
   - Every section MUST map directly to real, substantial code files.

For each section/subsection in the Table of Contents, provide:
- prefix: Numeric prefix string (e.g., "1", "2", "2.1")
- title: Crisp, highly technical section title (e.g., "Task Queue Orchestration", "AST Compression Engine")
- filename: Mapped filename formatted as "prefix_title.mdx" (replace spaces with hyphens, lowercase, e.g. "1_system-architecture.mdx" or "2.1_task-queue-orchestration.mdx")
- description: A brief, concrete technical summary of what this page covers
- relevant_files: An array of 2 to 5 actual file paths from the provided list that are directly relevant

Output your final response as a valid JSON array of objects ONLY. Do not include markdown code block formatting (do not wrap in \`\`\`json).`;
  const tocText = await generateWithRetry({ prompt });
  const cleanedToc = tocText.replace(/```json\n?|\n?```/g, '').trim();

  data.toc = JSON.parse(cleanedToc);
  data.toc.sort((a: TocEntry, b: TocEntry) => {
    const pa = a.prefix.split('.').map(Number);
    const pb = b.prefix.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  });

  await queue.updateJob(job.id, { currentStep: 2, data: JSON.stringify(data) });
}

export async function writeSingleSection(job: JobData, data: PipelineData, sectionIndex: number): Promise<void> {
  const entry = data.toc[sectionIndex];
  if (!entry) {
    throw new Error(`Section entry not found at index ${sectionIndex}`);
  }

  console.log(`[Pipeline] Step 2: Writing section ${sectionIndex + 1}/${data.toc.length} for ${job.owner}/${job.repo}`);

  const relevantContents = data.files.filter((f) => entry.relevant_files.includes(f.path));

  const maxTokensPerFile = 4000;
  const processedContents = [];
  for (const f of relevantContents) {
    const compressed = await compressCodeWithRepomix(f.path, f.content);
    const tokens = tiktoken.encode(compressed);
    if (tokens.length > maxTokensPerFile) {
      const truncated = tiktoken.decode(tokens.slice(0, maxTokensPerFile));
      processedContents.push(`File: ${f.path}\n${truncated}\n// ... [truncated to fit context]\n---\n`);
    } else {
      processedContents.push(`File: ${f.path}\n${compressed}\n---\n`);
    }
  }
  const contentBlock = processedContents.join('');

  const compactTocContext = data.toc.map(t => `${t.prefix}. ${t.title}: ${t.description}`).join('\n');
  const prompt = `You are GitDex, a principal software architect and systems engineer.
Generate an in-depth, authoritative, and highly technical MDX documentation page for "${entry.title}" in ${job.owner}/${job.repo}.

Section Description: "${entry.description}"

Global Table of Contents for context:
<global_toc>
${compactTocContext}
</global_toc>

Source files to document:
<source_files>
${contentBlock}</source_files>

WRITING & ARTIFACT DIRECTIVES (TECHNICAL & COMPREHENSIVE):

1. TECHNICAL DENSITY & PRECISION:
- Write in dense, authoritative engineering prose. Name exact classes, functions, state keys, Redis data structures, HTTP headers, environment variables, and concurrency locks.
- Use bullet lists to highlight key technical points, invariants, and step-by-step algorithmic flows.
- ZERO fluff or marketing language ("In today's fast-paced environment...", "This component plays a vital role...").

2. MANDATORY ARTIFACT REQUIREMENTS PER PAGE:
   A. TECHNICAL TABLES:
      - Include 1 or 2 structured Markdown tables detailing component parameters, configuration schemas, API contracts, or Redis data structures.
   B. MERMAID DIAGRAMS:
      - Include 1 or 2 clean Mermaid diagrams (graph TD/LR or sequenceDiagram) illustrating component interactions or workflow transitions.
      - Quote all node labels in Mermaid diagrams (e.g., A["My Label"]) and keep label text under 4 words.
   C. FOCUSED CODE SNIPPETS WITH TITLE HEADERS:
      - Include 2 to 4 focused code snippets covering core algorithms, route handlers, or type interfaces.
      - EVERY code fence MUST specify an explicit language identifier (e.g. \`\`\`typescript, \`\`\`js, \`\`\`python, \`\`\`bash, \`\`\`json).
      - ALWAYS add a file title attribute to code fences for syntax title header styling, e.g.:
        \`\`\`typescript title="server/src/services/pipelineService.ts"
        // snippet code
        \`\`\`
      - Explain line-by-line mechanics, parameter contracts, and state updates directly beneath each snippet.

3. SECTION STRUCTURE:
   - Start directly with H1: "# ${entry.title}". NO conversational intro, preamble, or frontmatter block.
   - Section A: System Role & Architectural Position (with dependencies/specs table).
   - Section B: Core Execution & Data Flow Mechanics (with Mermaid diagram & step-by-step key points).
   - Section C: Implementation Deep Dive & Code Snippets (with titled syntax-highlighted code blocks).
   - Section D: Method / State Reference & Error Recovery (with parameter tables and failure modes).

4. OUTPUT FORMAT:
- Output ONLY the raw Markdown/MDX body. Do not wrap the entire response in outer markdown code fences.`;
  let mdxContent = await generateWithRetry({ prompt });

  mdxContent = mdxContent
    .replace(/<TOC\s*\/?>|\[TOC\]/gi, '')
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

  const concurrency = parseInt(process.env.PIPELINE_CONCURRENCY || "4", 10);
  const stepDelaySec = parseInt(process.env.PIPELINE_STEP_DELAY_SEC || "2", 10);
  const nextIndex = sectionIndex + concurrency;
  if (nextIndex < data.toc.length) {
    await triggerNextStep(job.id, nextIndex, stepDelaySec);
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
        generatedFiles.push(typeof fileData === 'string' ? JSON.parse(fileData) : fileData as { filename: string; content: string });
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

export async function executeNextStep(jobId: string, sectionIndex?: number): Promise<void> {
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

  let data: PipelineData;
  if (job.data) {
    if (typeof job.data === 'string') {
      try {
        data = JSON.parse(job.data);
      } catch {
        data = { files: [], toc: [], generatedFiles: [], sectionsWritten: 0 };
      }
    } else {
      data = job.data as unknown as PipelineData;
    }
  } else {
    data = { files: [], toc: [], generatedFiles: [], sectionsWritten: 0 };
  }

  let nextJobId: string | null = null;

  try {
    switch (job.currentStep) {
      case 0:
        await scanRepository(job, data);
        await triggerNextStep(job.id);
        break;
      case 1:
        await planStructure(job, data);
        const concurrency = parseInt(process.env.PIPELINE_CONCURRENCY || "4", 10);
        const stepDelaySec = parseInt(process.env.PIPELINE_STEP_DELAY_SEC || "2", 10);
        const numSections = data.toc.length;
        await redis.set(`job:${job.owner}/${job.repo}:completed_sections`, '0');
        const initialWorkers = Math.min(concurrency, numSections);
        for (let i = 0; i < initialWorkers; i++) {
          await triggerNextStep(job.id, i, i * stepDelaySec);
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
        nextJobId = await queue.completeJob(job.id);
        break;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Pipeline failed at step ${job.currentStep} for ${jobId} (section: ${sectionIndex ?? 'all'}):`, message);
    nextJobId = await queue.failJob(jobId, message);
  } finally {
    await queue.releaseStepLock(jobId, sectionIndex);
  }

  if (nextJobId) {
    try {
      console.log(`[Pipeline] Triggering next queued job: ${nextJobId}`);
      await triggerNextStep(nextJobId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[Pipeline] CRITICAL: Failed to trigger next job ${nextJobId}! Re-queueing it.`, message);
      await queue.requeueJob(nextJobId);
    }
  }
}
