import { createHash } from 'node:crypto';
import { validateDiagram, DiagramSyntaxError } from './diagramValidation.js';
import { octokit, publicOctokit } from '../config/octokit.js';
import { getPublicRepository, parseRepositoryUrl, readPublicFile } from './repositoryAccess.js';
import { GENERATOR_VERSION, pipelineConfig } from './pipelineConfig.js';
import { resolveGuideRoot } from './guidePath.js';
import type { JobData } from '../types/job.js';
import type { Artifact, GuideManifest, PipelineData, PublishedGuide, RepoItem } from '../types/pipeline.js';

export const digest = (value:string) => createHash('sha256').update(value).digest('hex');
export const safeFilename = (value:string) => /^\d+(?:\.\d+)*_[a-z0-9]+(?:-[a-z0-9]+)*\.mdx$/.test(value) && value.length <= 150;
export const parseOwnerRepo = parseRepositoryUrl;
export class InvalidArtifactError extends Error {}
export async function verifyRepoExists(owner:string,repo:string):Promise<{exists:boolean;error?:string}> {
  try { await getPublicRepository(owner,repo); return {exists:true}; }
  catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    if (status === 404 || (error instanceof Error && error.message.includes('public repository'))) return {exists:false};
    return {exists:false,error:'Public GitHub repository verification is temporarily unavailable.'};
  }
}
export function docsDestination() {
  const owner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME;
  const repo = process.env.DOCS_REPO_NAME || 'gitdex-docs';
  const branch = process.env.DOCS_REPO_BRANCH || 'main';
  if (!owner || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || !branch || branch.includes('..') || /[\s~^:?*\[\\]/.test(branch)) throw new Error('Invalid documentation destination configuration');
  return {owner,repo,branch};
}
const statusOf = (error:unknown) => error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
async function readOutput(path:string,ref:string,signal?:AbortSignal):Promise<string> {
  const {owner,repo} = docsDestination();
  const {data} = await octokit.rest.repos.getContent({owner,repo,path,ref,request:{signal}});
  if (Array.isArray(data) || !('content' in data) || data.type !== 'file') throw new Error('Invalid published documentation file');
  return Buffer.from(data.content,'base64').toString('utf8');
}

export async function getPublishedGuide(owner:string,repo:string,signal?:AbortSignal,includeContent=true):Promise<PublishedGuide|null> {
  const target = docsDestination();
  const {data:ref} = await octokit.rest.git.getRef({owner:target.owner,repo:target.repo,ref:`heads/${target.branch}`,request:{signal}});
  let tree;
  try { tree = (await octokit.rest.git.getTree({owner:target.owner,repo:target.repo,tree_sha:ref.object.sha,recursive:'true',request:{signal}})).data; }
  catch(e) { throw e; }
  if (tree.truncated) throw new Error('Documentation tree exceeds the supported listing size');
  const path = resolveGuideRoot(tree.tree,owner,repo);
  if (!path) return null;
  const pages = tree.tree.filter(item=>item.type === 'blob' && item.path?.startsWith(path) && /\.mdx?$/i.test(item.path.slice(path.length)) && (item.size || 0)>0);
  if (!pages.length) return null;
  const result:PublishedGuide = {commitSha:ref.object.sha,lastIndexed:null,files:[]};
  const manifestItem = tree.tree.find(item=>item.path === `${path}manifest.json` && item.type === 'blob');
  if (manifestItem) {
    const parsed:unknown = JSON.parse(await readOutput(`${path}manifest.json`,ref.object.sha,signal));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid published manifest');
    const m = parsed as GuideManifest;
    if (m.version !== 2 || typeof m.runId !== 'string' || !/^[a-f0-9]{40}$/i.test(m.sourceSha) || typeof m.generatorVersion !== 'string' || !Array.isArray(m.sections) || !m.sections.length || m.sections.length > pipelineConfig.maxSections || !Number.isFinite(m.publishedAt) || m.sections.some(s=>!safeFilename(s.filename) || !pages.some(p=>p.path === `${path}${s.filename}`))) throw new Error('Invalid published manifest');
    result.manifest=m; result.lastIndexed=m.publishedAt;
  } else {
    // Existing guides remain available; a timestamp alone never proves availability.
    const {data:commits} = await octokit.rest.repos.listCommits({owner:target.owner,repo:target.repo,sha:ref.object.sha,path,per_page:1,request:{signal}});
    const date = commits[0]?.commit.committer?.date;
    result.lastIndexed = date ? new Date(date).getTime():null;
  }
  for (const page of pages) result.files.push({filename:page.path!.slice(path.length),content:includeContent ? await readOutput(page.path!,ref.object.sha,signal):''});
  return result;
}

export async function scanRepository(job:JobData,data:PipelineData,signal:AbortSignal):Promise<void> {
  const repository = await getPublicRepository(job.owner,job.repo,signal);
  data.defaultBranch = repository.default_branch;
  const {data:commit} = await publicOctokit.rest.repos.getCommit({owner:job.owner,repo:job.repo,ref:repository.default_branch,request:{signal}});
  data.sourceSha=commit.sha;
  const {data:tree} = await publicOctokit.rest.git.getTree({owner:job.owner,repo:job.repo,tree_sha:commit.sha,recursive:'true',request:{signal}});
  const blobs = (tree.tree as RepoItem[]).filter((f):f is RepoItem & {path:string;sha:string}=>f.type === 'blob' && !!f.path && !!f.sha);
  const eligible = blobs.filter(f=>(f.size || 0) <= 80000 && /(?:\.(?:[cm]?[jt]sx?|md|mdx|json|py|rb|go|rs|java|cpp|h|c|cs|php|css|html|sql|toml|ya?ml|sh)|(?:^|\/)(?:Dockerfile|Makefile|Procfile))$/i.test(f.path) && !/(?:^|\/)(?:node_modules|dist|build|vendor|\.git|__pycache__)(?:\/|$)|(?:package-lock\.json|\.lock|\.min\.js|\.bundle\.js)$/.test(f.path));
  const priority = (path:string)=>/(?:^|\/)(?:readme[^/]*|package\.json|pyproject\.toml|cargo\.toml|go\.mod|dockerfile|[^/]*config[^/]*|index\.[^/]+|main\.[^/]+|app\.[^/]+)$/i.test(path)?0:1;
  eligible.sort((a,b)=>priority(a.path)-priority(b.path) || a.path.localeCompare(b.path));
  const selected = eligible.slice(0,pipelineConfig.maxFiles);
  if (!selected.length) throw new InvalidArtifactError('No supported readable source files were found in this public snapshot.');
  data.sourceFiles=Object.fromEntries(selected.map(f=>[f.path,f.sha]));
  let cursor=0;
  const files:PipelineData['files']=[];
  await Promise.all(Array.from({length:Math.min(4,selected.length)},async()=>{
    while (cursor<selected.length) {
      signal.throwIfAborted();
      const f=selected[cursor++]!;
      const content=await readPublicFile(job.owner,job.repo,data.sourceSha,f.path,signal);
      files.push({path:f.path,sha:f.sha,content});
    }
  }));
  files.sort((a,b)=>a.path.localeCompare(b.path));
  if (files.reduce((sum,f)=>sum+Buffer.byteLength(f.content),0)>1500000) throw new InvalidArtifactError('The sampled source exceeds the supported context budget.');
  data.files=files;
  data.coverage={treeFiles:blobs.length,eligibleFiles:eligible.length,selectedFiles:selected.length,readFiles:files.length,omittedFiles:Math.max(0,blobs.length-files.length),treeTruncated:!!tree.truncated,sampled:blobs.length>files.length || !!tree.truncated};
  const globals=blobs.filter(f=>/(?:^|\/)(?:readme[^/]*|package\.json|pyproject\.toml|cargo\.toml|go\.mod|dockerfile|[^/]*config[^/]*|\.github\/.*)$/i.test(f.path)).map(f=>[f.path,f.sha]);
  data.planningHash=digest(JSON.stringify({generator:GENERATOR_VERSION,globals,paths:files.map(f=>f.path),maxSections:pipelineConfig.maxSections}));
  data.previous=(await getPublishedGuide(job.owner,job.repo,signal)) || undefined;
}

export async function validateArtifact(file:Artifact,sourceFiles:Record<string,string>,owner:string,repo:string,sha:string):Promise<void> {
  if (!safeFilename(file.filename) || typeof file.content !== 'string' || file.content.length<80 || file.content.length>180000 || file.content.includes('\0')) throw new InvalidArtifactError('A generated page is empty, oversized or has an unsafe filename.');
  let fence:string|null=null; let fenceLength=0; let mermaidBody:string[]=[]; let isMermaid=false;
  for (const line of file.content.split('\n')) {
    const marker=line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) { fence=marker[1]![0]!; fenceLength=marker[1]!.length; isMermaid=marker[2]!.trim()==='mermaid'; mermaidBody=[]; }
      else if (marker[1]![0]===fence && marker[1]!.length>=fenceLength && !marker[2]!.trim()) {
        if (isMermaid) {
          if (!mermaidBody.length || /\b(?:click|href)\b|%%\s*\{/i.test(mermaidBody.join('\n'))) throw new InvalidArtifactError('Unsafe generated diagram.');
          try { await validateDiagram(mermaidBody.join('\n')); }
          catch (error) {
            if (error instanceof DiagramSyntaxError) throw new InvalidArtifactError('Invalid generated diagram.');
            throw error;
          }
        }
        fence=null;
      }
      continue;
    }
    if (fence) { if (isMermaid) mermaidBody.push(line); continue; }
    if (/^\s*(?:import|export)\s|<(?:[A-Z][A-Za-z0-9]*|script|iframe|object|embed|style)\b|(?:javascript|data):/i.test(line)) throw new InvalidArtifactError('Executable content is not accepted in generated Markdown.');
    const urls=line.matchAll(/https:\/\/github\.com\/([^\s)\]>]+)/g);
    for (const match of urls) {
      const parts=match[1]!.split('/');
      if (parts[2] !== 'blob') continue;
      const path=decodeURIComponent(parts.slice(4).join('/').split('#')[0]!);
      if (parts[0]?.toLowerCase()!==owner.toLowerCase() || parts[1]?.toLowerCase()!==repo.toLowerCase() || parts[3]!==sha || !sourceFiles[path]) throw new InvalidArtifactError('A generated source citation does not match the pinned snapshot.');
    }
  }
  if (fence || !/^#\s+\S/m.test(file.content)) throw new InvalidArtifactError('A generated page has an unclosed code fence or no heading.');
}

export async function commitToGithub(job:JobData,data:PipelineData,signal:AbortSignal,assertOwnership:()=>Promise<void>):Promise<number> {
  if (!data.generatedFiles.length || data.generatedFiles.length!==data.toc.length || new Set(data.generatedFiles.map(f=>f.filename)).size!==data.generatedFiles.length || !/^[a-f0-9]{40}$/i.test(data.sourceSha)) throw new InvalidArtifactError('The candidate guide is incomplete.');
  for (const file of data.generatedFiles) await validateArtifact(file,data.sourceFiles,job.owner,job.repo,data.sourceSha);
  const manifest:GuideManifest={version:2,runId:job.runId,sourceSha:data.sourceSha,generatorVersion:GENERATOR_VERSION,planningHash:data.planningHash,publishedAt:Date.now(),coverage:data.coverage,sections:data.toc.map(entry=>{
    const file=data.generatedFiles.find(f=>f.filename===entry.filename);
    if (!file || entry.relevant_files.some(path=>!data.sourceFiles[path])) throw new InvalidArtifactError('The candidate manifest has an invalid dependency.');
    return {...entry,dependencies:Object.fromEntries(entry.relevant_files.map(path=>[path,data.sourceFiles[path]!])),contentHash:digest(file.content)};
  })};
  const {owner,repo,branch}=docsDestination();
  const metadata={title:`${job.repo} Documentation`,description:`Documentation for ${job.owner}/${job.repo}`,root:true,defaultBranch:data.defaultBranch,sourceSha:data.sourceSha,generatorVersion:GENERATOR_VERSION,runId:job.runId,publishedAt:manifest.publishedAt,coverage:data.coverage,pages:data.toc.map(s=>s.filename.replace(/\.mdx$/,''))};
  const artifacts=[...data.generatedFiles,{filename:'meta.json',content:JSON.stringify(metadata,null,2)},{filename:'manifest.json',content:JSON.stringify(manifest,null,2)}];
  for (let attempt=0;attempt<3;attempt++) {
    signal.throwIfAborted();
    await assertOwnership();
    const existing=await getPublishedGuide(job.owner,job.repo,signal,false);
    if (existing?.manifest?.runId===job.runId) return existing.manifest.publishedAt;
    const {data:ref}=await octokit.rest.git.getRef({owner,repo,ref:`heads/${branch}`,request:{signal}});
    const {data:base}=await octokit.rest.git.getCommit({owner,repo,commit_sha:ref.object.sha,request:{signal}});
    const {data:tree}=await octokit.rest.git.getTree({owner,repo,tree_sha:base.tree.sha,recursive:'true',request:{signal}});
    if (tree.truncated) throw new Error('Documentation tree listing is incomplete; publication was not attempted.');
    const root=resolveGuideRoot(tree.tree,job.owner,job.repo) ?? `docs/${job.owner}/${job.repo}/`;
    const paths=new Set(artifacts.map(f=>root+f.filename));
    const deletions=tree.tree.filter(f=>f.type==='blob' && f.path?.startsWith(root) && !paths.has(f.path)).map(f=>({path:f.path!,mode:'100644' as const,type:'blob' as const,sha:null}));
    const {data:newTree}=await octokit.rest.git.createTree({owner,repo,base_tree:base.tree.sha,tree:[...deletions,...artifacts.map(f=>({path:root+f.filename,mode:'100644' as const,type:'blob' as const,content:f.content}))],request:{signal}});
    const {data:commit}=await octokit.rest.git.createCommit({owner,repo,message:`GitDex ${job.runId}: ${job.owner}/${job.repo} at ${data.sourceSha}`,tree:newTree.sha,parents:[ref.object.sha],request:{signal}});
    await assertOwnership(); signal.throwIfAborted();
    try { await octokit.rest.git.updateRef({owner,repo,ref:`heads/${branch}`,sha:commit.sha,force:false,request:{signal}}); return manifest.publishedAt; }
    catch(e) { if (![409,422].includes(statusOf(e) || 0) || attempt===2) throw e; }
  }
  throw new Error('Documentation publication conflicted; delivery will be retried.');
}
