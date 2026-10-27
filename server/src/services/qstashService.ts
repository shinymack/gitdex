import { randomUUID } from 'node:crypto';
import { qstash } from '../config/qstash.js';
import { redis } from '../config/redis.js';
import queue, { NS, deliveryId, validDelivery } from './queueService.js';
import { pipelineConfig } from './pipelineConfig.js';
import { executeNextStep } from './pipelineService.js';

export function getBaseUrl(): string {
  const value = process.env.BASE_URL;
  if (!value) throw new Error('BASE_URL must identify the stable callback server');
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && url.protocol === 'http:'))) throw new Error('Invalid callback BASE_URL');
  return url.origin;
}

/** Sends are at-least-once. Pending intents survive successful sends until fenced completion. */
export async function dispatchPending(limit = 16): Promise<number> {
  await queue.promote();
  const ids = await redis.zrange<string[]>(`${NS}pending`,0,limit-1);
  let sent = 0;
  for (const id of ids) {
    const token = randomUUID();
    const lockKey = `${NS}send-lock:${id}`;
    const record = await redis.eval(`
local score = redis.call('ZSCORE',KEYS[1],ARGV[1])
if not score or tonumber(score) > tonumber(ARGV[2]) then return nil end
if not redis.call('SET',KEYS[3],ARGV[3],'NX','PX',30000) then return nil end
return redis.call('HGET',KEYS[2],ARGV[1])`,[`${NS}pending`,`${NS}dispatch`,lockKey],[id,Date.now(),token]);
    if (!record) continue;
    const d: unknown = typeof record === 'string' ? JSON.parse(record):record;
    if (!validDelivery(d)) throw new Error('Invalid durable dispatch record');
    const notBefore = 'notBefore' in d && typeof d.notBefore === 'number' && Number.isFinite(d.notBefore) ? d.notBefore : Date.now();
    try {
      const attempts = await redis.hincrby(`${NS}dispatch-attempts`,id,1);
      if (attempts > pipelineConfig.maxDispatchAttempts) {
        const terminal = await queue.fail(d,'Dispatch retries were exhausted. Please retry indexing.');
        if (!terminal) throw new Error('Step still has an active owner');
        continue;
      }
      if (process.env.NODE_ENV === 'development' && process.env.PIPELINE_LOCAL_DISPATCH === 'true') {
        // Explicit development only; no unsigned HTTP bypass and no background continuation.
        await executeNextStep(d);
      } else {
        const base = getBaseUrl();
        await qstash.publishJSON({
          url:`${base}/api/pipeline/step`,body:d,
          failureCallback:`${base}/api/pipeline/failure`,
          delay:Math.max(0,Math.ceil((notBefore-Date.now())/1000)),
          retries:pipelineConfig.deliveryRetries,
          timeout: Math.floor(pipelineConfig.brokerLimitMs/1000),
        });
      }
      sent++;
    } catch {
      // The durable intent remains pending. A signed reconciler retries publication.
    } finally {
      await redis.eval(`
if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
if redis.call('HEXISTS',KEYS[2],ARGV[2]) == 1 then redis.call('ZADD',KEYS[3],ARGV[3],ARGV[2]) end
redis.call('DEL',KEYS[1]); return 1`,[lockKey,`${NS}dispatch`,`${NS}pending`],[token,id,Math.max(Date.now(),notBefore)+pipelineConfig.recoveryMs]);
    }
  }
  return sent;
}

export async function handleFailureCallback(body:unknown):Promise<boolean> {
  const callback = body as {sourceBody?:unknown;url?:unknown;retried?:unknown;maxRetries?:unknown};
  if (typeof callback?.sourceBody !== 'string' || callback.sourceBody.length > 10000 || callback.url !== `${getBaseUrl()}/api/pipeline/step` || !Number.isInteger(callback.retried) || !Number.isInteger(callback.maxRetries) || Number(callback.retried) < Number(callback.maxRetries)) throw new Error('Invalid failure callback');
  const d:unknown = JSON.parse(Buffer.from(callback.sourceBody,'base64').toString('utf8'));
  if (!validDelivery(d)) throw new Error('Invalid failed delivery identity');
  // A callback belongs to one broker message, not necessarily the latest delivery
  // of this step. Never let an old callback terminally fence a newer attempt.
  await redis.eval(`
if redis.call('HEXISTS',KEYS[1],ARGV[1]) == 1 then
 redis.call('ZADD',KEYS[2],ARGV[2],ARGV[1])
end
return 1`,[`${NS}dispatch`,`${NS}pending`],[deliveryId(d),Date.now()]);
  return true;
}
