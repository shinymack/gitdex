import { randomUUID } from 'node:crypto';
import { redis } from '../config/redis.js';
import { parseRepositoryUrl } from './repositoryAccess.js';
import { leaseMs, pipelineConfig } from './pipelineConfig.js';
import type { Delivery, JobData, JobState, PipelinePhase } from '../types/job.js';

const statePrefix = process.env.PIPELINE_STATE_PREFIX ?? 'gitdex:v2:';
if (!/^gitdex:[a-zA-Z0-9_-]+:$/.test(statePrefix) || statePrefix.length > 100) throw new Error('Invalid PIPELINE_STATE_PREFIX configuration');
export const NS = statePrefix;
export const deliveryId = (d: Delivery) => `${d.runId}:${d.expectedPhase}:${d.sectionIndex ?? '-'}`;
export const runKey = (id: string) => `${NS}run:${id}`;
export const leaseKey = (d: Delivery) => `${NS}lease:${deliveryId(d)}`;
export const validRunId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
export function validDelivery(value: unknown): value is Delivery {
  if (!value || typeof value !== 'object') return false;
  const d = value as Delivery;
  return validRunId(d.runId) && ['scan', 'plan', 'sections', 'publish'].includes(d.expectedPhase)
    && (d.expectedPhase === 'sections' ? Number.isInteger(d.sectionIndex) && d.sectionIndex! >= 0 && d.sectionIndex! < pipelineConfig.maxSections : d.sectionIndex === undefined);
}

// Every state transition and its pending delivery intent are one Redis operation.
const COMMON = `
local p = ARGV[1]
local now = tonumber(ARGV[2])
local function dispatch(d, delay)
 local id = d.runId .. ':' .. d.expectedPhase .. ':' .. (d.sectionIndex and tostring(d.sectionIndex) or '-')
 d.notBefore = now + (delay or 0)
 redis.call('HSET', p..'dispatch', id, cjson.encode(d))
 redis.call('ZADD', p..'pending', now, id)
end
local function promote()
 if redis.call('GET', p..'active') then return end
 while true do
  local id = redis.call('LPOP', p..'queue')
  if not id then return end
  local k = p..'run:'..id
  if redis.call('HGET', k, 'state') == 'queued' then
   redis.call('SET', p..'active', id)
   redis.call('HSET', k, 'state', 'processing', 'updatedAt', now)
   dispatch({runId=id, expectedPhase='scan'}, 0)
   return
  end
 end
end
local function terminal(id, state, message)
 local k = p..'run:'..id
 redis.call('HSET', k, 'state', state, 'error', message, 'updatedAt', now)
 redis.call('HDEL', k, 'data')
 local pending = redis.call('HKEYS', p..'dispatch')
 for _, key in ipairs(pending) do
  if string.sub(key, 1, string.len(id)+1) == id..':' then
   redis.call('HDEL', p..'dispatch', key)
   redis.call('ZREM', p..'pending', key)
   redis.call('HDEL', p..'dispatch-attempts', key)
  end
 end
 if redis.call('GET', p..'active') == id then redis.call('DEL', p..'active') end
 redis.call('EXPIRE', k, 2592000)
 promote()
end
`;

const ADMIT = COMMON + `
local identity, id = ARGV[3], ARGV[4]
local old = redis.call('GET', p..'latest:'..identity)
if old then
 local state = redis.call('HGET', p..'run:'..old, 'state')
 if state == 'processing' or state == 'queued' then return {old, state, '0'} end
end
local published = tonumber(redis.call('GET', p..'published:'..identity) or '0')
if ARGV[6] ~= '1' and now - published < 3600000 then return {'', 'cooldown', '0'} end
local job = cjson.decode(ARGV[5])
local k = p..'run:'..id
for field, value in pairs(job) do redis.call('HSET', k, field, tostring(value)) end
redis.call('SET', p..'latest:'..identity, id)
redis.call('RPUSH', p..'queue', id)
promote()
return {id, redis.call('HGET', k, 'state'), '1'}
`;

const CLAIM = COMMON + `
local d, token = cjson.decode(ARGV[3]), ARGV[4]
local k = p..'run:'..d.runId
local id = ARGV[5]
if redis.call('GET', p..'active') ~= d.runId or redis.call('HGET',k,'state') ~= 'processing' or redis.call('HGET',k,'phase') ~= d.expectedPhase then return 'obsolete' end
if redis.call('HEXISTS', k, 'done:'..id) == 1 then return 'done' end
if d.expectedPhase == 'sections' and d.sectionIndex >= tonumber(redis.call('HGET', k, 'sectionCount') or '0') then return 'obsolete' end
local lock = p..'lease:'..id
if not redis.call('SET', lock, token, 'NX', 'PX', ARGV[6]) then return 'busy' end
local attempts = redis.call('HINCRBY', k, 'attempt:'..id, 1)
if attempts > tonumber(ARGV[7]) then redis.call('DEL', lock); terminal(d.runId, 'failed', 'The step exhausted its delivery attempts. Please retry indexing.'); return 'terminal' end
return 'claimed'
`;

const FINISH = COMMON + `
local d, token, id = cjson.decode(ARGV[3]), ARGV[4], ARGV[5]
local k = p..'run:'..d.runId
if redis.call('GET', p..'active') ~= d.runId or redis.call('HGET', k, 'phase') ~= d.expectedPhase or redis.call('GET',p..'lease:'..id) ~= token then return 0 end
if redis.call('HEXISTS', k, 'done:'..id) == 1 then return 1 end
redis.call('HSET', k, 'done:'..id, '1', 'updatedAt', now)
redis.call('HDEL', p..'dispatch', id)
redis.call('HDEL', p..'dispatch-attempts', id)
redis.call('ZREM', p..'pending', id)
redis.call('DEL', p..'lease:'..id)
local result = cjson.decode(ARGV[6])
if d.expectedPhase == 'sections' then
 redis.call('HSET', k, 'section:'..d.sectionIndex, result.artifact)
 local count = redis.call('HINCRBY', k, 'sectionsCompleted', 1)
 local total = tonumber(redis.call('HGET', k, 'sectionCount'))
 local nextIndex = d.sectionIndex + tonumber(ARGV[7])
 if nextIndex < total then dispatch({runId=d.runId, expectedPhase='sections', sectionIndex=nextIndex}, tonumber(ARGV[8])) end
 if count == total then
  redis.call('HSET', k, 'phase', 'publish', 'currentStep', 3)
  dispatch({runId=d.runId, expectedPhase='publish'}, tonumber(ARGV[8]))
 end
elseif d.expectedPhase == 'publish' then
 redis.call('SET', p..'published:'..redis.call('HGET',k,'owner')..'/'..redis.call('HGET',k,'repo'), result.publishedAt)
 terminal(d.runId, 'completed', '')
else
 local phase = d.expectedPhase == 'scan' and 'plan' or 'sections'
 redis.call('HSET', k, 'data', result.data, 'phase', phase, 'currentStep', d.expectedPhase == 'scan' and 1 or 2)
 if phase == 'sections' then
  redis.call('HSET', k, 'sectionCount', result.sectionCount)
  for i=0, math.min(tonumber(ARGV[7]), result.sectionCount)-1 do dispatch({runId=d.runId, expectedPhase='sections', sectionIndex=i}, i*tonumber(ARGV[8])) end
 else dispatch({runId=d.runId, expectedPhase='plan'}, tonumber(ARGV[8])) end
end
return 1
`;

class DurableQueue {
  async addJob(repoUrl: string, force = false): Promise<{jobId:string;state:JobState;newlyStarted:boolean}> {
    const parsed = parseRepositoryUrl(repoUrl);
    if (!parsed) throw new Error('Invalid repository URL');
    const owner = parsed.owner.toLowerCase(), repo = parsed.repo.toLowerCase();
    const id = randomUUID(), now = Date.now();
    const job = { id, runId:id, state:'queued', repoUrl:`https://github.com/${owner}/${repo}`, owner, repo, createdAt:now, updatedAt:now, error:'', phase:'scan', currentStep:0, sectionCount:0, sectionsCompleted:0 };
    const result = await redis.eval<unknown[], [string, string, number | string]>(ADMIT, [], [NS, now, `${owner}/${repo}`, id, JSON.stringify(job), force ? '1':'0']);
    if (result[1] === 'cooldown') throw new Error('Repository is in cooldown. Try again in one hour, or explicitly request a refresh.');
    return {jobId:result[0],state:result[1] as JobState,newlyStarted:String(result[2]) === '1'};
  }
  async getJob(id: string): Promise<JobData | null> {
    if (!validRunId(id)) return null;
    const h = await redis.hgetall<Record<string, unknown>>(runKey(id));
    if (!h?.id) return null;
    return { id:String(h.id),runId:String(h.runId),state:h.state as JobState,repoUrl:String(h.repoUrl),owner:String(h.owner),repo:String(h.repo),createdAt:Number(h.createdAt),updatedAt:Number(h.updatedAt),error:h.error ? String(h.error):null,phase:h.phase as PipelinePhase,currentStep:Number(h.currentStep),sectionCount:Number(h.sectionCount),sectionsCompleted:Number(h.sectionsCompleted),data:h.data ? (typeof h.data === 'string' ? h.data:JSON.stringify(h.data)):null };
  }
  async getJobByRepo(owner:string,repo:string) {
    const id = await redis.get<string>(`${NS}latest:${owner.toLowerCase()}/${repo.toLowerCase()}`);
    return id ? this.getJob(id):null;
  }
  async claim(d:Delivery,token:string):Promise<string> {
    return redis.eval<unknown[], string>(CLAIM, [], [NS,Date.now(),JSON.stringify(d),token,deliveryId(d),leaseMs,pipelineConfig.maxAttempts]);
  }
  async assertLease(d:Delivery,token:string):Promise<void> {
    const valid = await redis.eval<unknown[], number>(`return redis.call('GET',KEYS[1]) == ARGV[1] and redis.call('GET',KEYS[2]) == ARGV[2] and redis.call('HGET',KEYS[3],'state') == 'processing' and redis.call('HGET',KEYS[3],'phase') == ARGV[3] and 1 or 0`,[leaseKey(d),`${NS}active`,runKey(d.runId)],[token,d.runId,d.expectedPhase]);
    if (!valid) throw new Error('Step ownership expired; retry delivery.');
  }
  async release(d:Delivery,token:string) {
    await redis.eval(`if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`,[leaseKey(d)],[token]);
  }
  async finish(d:Delivery,token:string,result:Record<string,unknown>) {
    const accepted = await redis.eval<unknown[], number>(FINISH,[],[NS,Date.now(),JSON.stringify(d),token,deliveryId(d),JSON.stringify(result),pipelineConfig.concurrency,pipelineConfig.stepDelaySec*1000]);
    if (!accepted) throw new Error('Step ownership expired; retry delivery.');
  }
  async fail(d:Delivery,error:string,token?:string):Promise<boolean> {
    return Boolean(await redis.eval<unknown[], number>(COMMON+`
local d, id = cjson.decode(ARGV[3]), ARGV[4]
local k = p..'run:'..d.runId
if redis.call('GET',p..'active') ~= d.runId or redis.call('HGET',k,'phase') ~= d.expectedPhase or redis.call('HEXISTS',k,'done:'..id) == 1 then return 1 end
local lock = redis.call('GET',p..'lease:'..id)
if (ARGV[6] ~= '' and lock ~= ARGV[6]) or (ARGV[6] == '' and lock) then return 0 end
terminal(d.runId,'failed',ARGV[5]); return 1`,[],[NS,Date.now(),JSON.stringify(d),deliveryId(d),error,token || '']));
  }
  async sections(runId:string):Promise<unknown[]> {
    const job = await this.getJob(runId);
    if (!job) throw new Error('Run not found');
    const values = await redis.hmget<Record<string,unknown>>(runKey(runId),...Array.from({length:job.sectionCount},(_,i)=>`section:${i}`));
    return Array.from({length:job.sectionCount},(_,i)=>values?.[`section:${i}`]);
  }
  async promote():Promise<void> { await redis.eval(COMMON+'promote(); return 1',[],[NS,Date.now()]); }
}
export default new DurableQueue();
