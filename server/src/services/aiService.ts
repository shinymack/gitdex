import { APICallError, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { setTimeout as sleep } from 'node:timers/promises';
import { redis } from '../config/redis.js';
import { NS } from './queueService.js';
import { pipelineConfig } from './pipelineConfig.js';

const docsModels = (process.env.DOCS_MODELS || 'gemma-4-31b-it,gemma-4-26b-a4b-it').split(',').map(m=>m.trim()).filter(Boolean);
if (!docsModels.length || docsModels.length > 4) throw new Error('Configure one to four documentation models');

/** One provider/project quota gate shared by chat, documentation, models and instances. */
export async function acquireModelSlot(_modelId: string, signal?: AbortSignal, estimatedTokens = 4000): Promise<void> {
  const deadline = signal || AbortSignal.timeout(pipelineConfig.workTimeoutMs);
  while (true) {
    deadline.throwIfAborted();
    const waitMs = await redis.eval<unknown[], number>(`
local t = redis.call('TIME')
local now = tonumber(t[1])*1000 + math.floor(tonumber(t[2])/1000)
local next = tonumber(redis.call('GET',KEYS[1]) or '0')
if now < next then return next-now end

local throttleMs = tonumber(ARGV[1])
local estimatedTokens = tonumber(ARGV[2])
local maxTpm = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - 60000)
local entries = redis.call('ZRANGE', KEYS[2], 0, -1)
local currentTokens = 0
for _, entry in ipairs(entries) do
  local tok = tonumber(string.match(entry, ':(%d+)$') or '0')
  currentTokens = currentTokens + tok
end

if (currentTokens + estimatedTokens) > maxTpm then
  local oldest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
  if oldest and #oldest >= 2 then
    local oldestTime = tonumber(oldest[2])
    local waitTime = (oldestTime + 60000) - now
    if waitTime > 0 then return math.min(waitTime, 30000) end
  end
  return 5000
end

redis.call('SET',KEYS[1],now+throttleMs,'PX',throttleMs*2)
redis.call('ZADD', KEYS[2], now, tostring(now)..':'..tostring(estimatedTokens))
redis.call('PEXPIRE', KEYS[2], 120000)
return 0`,[`${NS}quota:google:next`,`${NS}quota:google:tokens`],[pipelineConfig.throttleMs,estimatedTokens,pipelineConfig.maxTpm]);
    if (!waitMs) return;
    await sleep(waitMs, undefined, {signal:deadline});
  }
}

export interface GenerateOptions { systemPrompt?:string; prompt:string; signal?:AbortSignal }
export async function generateWithRetry({systemPrompt,prompt,signal}:GenerateOptions):Promise<string> {
  const deadline = signal || AbortSignal.timeout(pipelineConfig.workTimeoutMs);
  const estimatedTokens = Math.ceil(((systemPrompt?.length || 0) + prompt.length) / 4) + 1000;
  for (const modelId of docsModels) {
    deadline.throwIfAborted();
    await acquireModelSlot(modelId,deadline,estimatedTokens);
    try {
      const result = await generateText({model:google(modelId),system:systemPrompt,prompt,maxRetries:0,abortSignal:deadline,providerOptions:{google:{thinkingConfig:{thinkingLevel:'minimal'}}}});
      if (!result.text.trim()) throw new Error('Empty model response');
      return result.text;
    } catch (error) {
      if (APICallError.isInstance(error) && error.statusCode === 429) {
        await redis.set(`${NS}quota:google:next`, Date.now() + pipelineConfig.backoff429Ms, { px: pipelineConfig.backoff429Ms });
      }
      console.warn('[Docs] Model candidate failed.', { model: modelId, name: error instanceof Error ? error.name : 'unknown', status: APICallError.isInstance(error) ? error.statusCode : undefined });
      deadline.throwIfAborted();
    }
  }
  throw new Error('The documentation provider is unavailable. The delivery will be retried.');
}
