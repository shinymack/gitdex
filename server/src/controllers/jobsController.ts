import type { Request, Response } from 'express';
import queue, { validDelivery } from '../services/queueService.js';
import { parseOwnerRepo, verifyRepoExists, getPublishedGuide } from '../services/githubService.js';
import { dispatchPending, handleFailureCallback } from '../services/qstashService.js';
import { executeNextStep, DeliveryBusyError } from '../services/pipelineService.js';
import type { JobData } from '../types/job.js';

function safeJob(job:JobData) {
  return {id:job.id,runId:job.runId,state:job.state,owner:job.owner,repo:job.repo,createdAt:job.createdAt,updatedAt:job.updatedAt,error:job.error,phase:job.phase,currentStep:job.currentStep,sectionCount:job.sectionCount,sectionsCompleted:job.sectionsCompleted};
}
export const createJob=async(req:Request,res:Response)=>{
  if (process.env.INDEXING_PAUSED==='true') return res.status(503).json({error:'New indexing is temporarily paused. Existing guides remain available.'});
  try {
    const {repoUrl,force}=req.body || {};
    if (typeof repoUrl!=='string') return res.status(400).json({error:'A public GitHub repository URL is required.'});
    if (force !== undefined && typeof force !== 'boolean') return res.status(400).json({error:'force must be a boolean.'});
    const parsed=parseOwnerRepo(repoUrl);
    if (!parsed) return res.status(400).json({error:'Invalid GitHub repository URL.'});
    const verification=await verifyRepoExists(parsed.owner,parsed.repo);
    if (!verification.exists) return res.status(verification.error?503:404).json({error:verification.error || 'This public repository is unavailable.'});
    const result=await queue.addJob(repoUrl,force===true);
    await dispatchPending();
    return res.status(202).json({jobId:result.jobId,status:result.state,newlyStarted:result.newlyStarted});
  } catch(error) {
    if (error instanceof Error && error.message.includes('cooldown')) return res.status(429).json({error:error.message});
    return res.status(503).json({error:'Indexing admission is temporarily unavailable. Please retry.'});
  }
};
export const getJobStatus=async(req:Request,res:Response)=>{
  try {
    const job=await queue.getJob(String(req.params.jobId));
    return job?res.json(safeJob(job)):res.status(404).json({error:'Job not found.'});
  } catch { return res.status(503).json({error:'Job status is temporarily unavailable.'}); }
};
export const getStatusByName=async(req:Request,res:Response)=>{
  const {owner,repo}=req.query;
  if (typeof owner!=='string' || typeof repo!=='string' || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo) || [owner,repo].some(value=>value==='.' || value==='..') || !parseOwnerRepo(`https://github.com/${owner}/${repo}`)) return res.status(400).json({error:'Valid owner and repo parameters are required.'});
  try {
    const verification=await verifyRepoExists(owner,repo);
    if (!verification.exists) return res.status(verification.error?503:404).json({error:verification.error || 'This public repository is unavailable.'});
    const [job,guide]=await Promise.all([queue.getJobByRepo(owner,repo),getPublishedGuide(owner,repo,AbortSignal.timeout(15000),false)]);
    return res.json({indexed:!!guide,lastIndexed:guide?.lastIndexed ?? null,job:job?safeJob(job):null,...(guide?{path:`/${owner}/${repo}`,sourceSha:guide.manifest?.sourceSha,docsCommitSha:guide.commitSha}: {})});
  } catch { return res.status(503).json({error:'Documentation availability could not be checked. Please retry.'}); }
};
export const reconcile=async(_req:Request,res:Response)=>{
  try { const dispatched=await dispatchPending(32); return res.json({success:true,dispatched}); }
  catch { return res.status(503).json({error:'Reconciliation is temporarily unavailable; retry the signed delivery.'}); }
};
export const pipelineStep=async(req:Request,res:Response)=>{
  if (!validDelivery(req.body)) return res.status(400).json({error:'A valid runId and expectedPhase are required, with sectionIndex only for sections.'});
  try { return res.json(await executeNextStep(req.body)); }
  catch(error) {
    if (error instanceof DeliveryBusyError) return res.status(503).json({error:'The step is owned by another worker. Retry this delivery.'});
    return res.status(503).json({error:'The step could not finish. Its durable state is retained for retry.'});
  }
};
export const pipelineFailure=async(req:Request,res:Response)=>{
  try {
    const terminal=await handleFailureCallback(req.body);
    if (!terminal) return res.status(503).json({error:'The step still has an active lease. Retry the failure callback.'});
    await dispatchPending();
    return res.json({outcome:'terminal-or-obsolete'});
  } catch { return res.status(503).json({error:'Failure callback could not be reconciled. Retry the signed delivery.'}); }
};
