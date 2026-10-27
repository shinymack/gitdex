import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { redis } from '../config/redis.js';
import { octokit } from '../config/octokit.js';
import queue, { NS, runKey } from '../services/queueService.js';
import { docsDestination } from '../services/githubService.js';
import { parseRepositoryUrl } from '../services/repositoryAccess.js';

function authorized(req:Request):boolean {
  const secret=process.env.DEV_ADMIN_TOKEN;
  const supplied=req.get('x-dev-admin-token');
  if (process.env.NODE_ENV!=='development' || !secret || !supplied) return false;
  const a=Buffer.from(secret),b=Buffer.from(supplied);
  return a.length===b.length && timingSafeEqual(a,b);
}
function identity(req:Request) {
  const {owner,repo}=req.query;
  if (typeof owner!=='string' || typeof repo!=='string') return null;
  return parseRepositoryUrl(`https://github.com/${owner}/${repo}`);
}
export const clearRedis=async(req:Request,res:Response)=>{
  if (!authorized(req)) return res.status(403).json({error:'Development administration is disabled or unauthorized.'});
  const parsed=identity(req);
  if (!parsed || req.query.all!==undefined) return res.status(400).json({error:'Provide one owner/repo. Global key deletion is not supported.'});
  const owner=parsed.owner.toLowerCase(),repo=parsed.repo.toLowerCase();
  try {
    const job=await queue.getJobByRepo(owner,repo);
    if (!job) return res.json({success:true,removed:0});
    const removed=await redis.eval<unknown[], number>(`
if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
local state=redis.call('HGET',KEYS[2],'state')
if state == 'queued' or state == 'processing' then return -1 end
redis.call('DEL',KEYS[1],KEYS[2]); return 1`,[`${NS}latest:${owner}/${repo}`,runKey(job.runId)],[job.runId]);
    if (removed<0) return res.status(409).json({error:'Active runs must finish or be reconciled, not deleted.'});
    return res.json({success:true,removed});
  } catch { return res.status(503).json({error:'Development cleanup failed.'}); }
};
export const deleteDocs=async(req:Request,res:Response)=>{
  if (!authorized(req) || process.env.DOCS_ALLOW_DESTRUCTIVE_DEV!=='true') return res.status(403).json({error:'Destructive development administration is disabled or unauthorized.'});
  const parsed=identity(req);
  if (!parsed) return res.status(400).json({error:'Provide a valid owner/repo.'});
  const owner=parsed.owner.toLowerCase(),repo=parsed.repo.toLowerCase();
  try {
    const job=await queue.getJobByRepo(owner,repo);
    if (job && ['queued','processing'].includes(job.state)) return res.status(409).json({error:'An active run cannot be cleared.'});
    const target=docsDestination();
    const signal=AbortSignal.timeout(20000);
    const {data:ref}=await octokit.rest.git.getRef({owner:target.owner,repo:target.repo,ref:`heads/${target.branch}`,request:{signal}});
    const {data:base}=await octokit.rest.git.getCommit({owner:target.owner,repo:target.repo,commit_sha:ref.object.sha,request:{signal}});
    const {data:tree}=await octokit.rest.git.getTree({owner:target.owner,repo:target.repo,tree_sha:base.tree.sha,recursive:'true',request:{signal}});
    if (tree.truncated) throw new Error('Incomplete tree');
    const prefix=`docs/${owner}/${repo}/`;
    const deletions=tree.tree.filter(item=>item.type==='blob' && item.path?.startsWith(prefix)).map(item=>({path:item.path!,mode:'100644' as const,type:'blob' as const,sha:null}));
    if (!deletions.length) return res.status(404).json({error:'No published guide found.'});
    const {data:newTree}=await octokit.rest.git.createTree({owner:target.owner,repo:target.repo,base_tree:base.tree.sha,tree:deletions,request:{signal}});
    const {data:commit}=await octokit.rest.git.createCommit({owner:target.owner,repo:target.repo,message:`GitDex development: remove ${owner}/${repo}`,tree:newTree.sha,parents:[ref.object.sha],request:{signal}});
    await octokit.rest.git.updateRef({owner:target.owner,repo:target.repo,ref:`heads/${target.branch}`,sha:commit.sha,force:false,request:{signal}});
    await redis.del(`${NS}published:${owner}/${repo}`);
    return res.json({success:true,deleted:deletions.length});
  } catch { return res.status(503).json({error:'Documentation deletion failed; no force update was attempted.'}); }
};
