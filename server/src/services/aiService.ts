import { APICallError, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { setTimeout as sleep } from 'node:timers/promises';
import { redis } from '../config/redis.js';
import { NS } from './queueService.js';
import { pipelineConfig } from './pipelineConfig.js';

const docsModels = (process.env.DOCS_MODELS || 'gemma-4-31b-it,gemma-4-26b-a4b-it').split(',').map(m=>m.trim()).filter(Boolean);
if (!docsModels.length || docsModels.length > 4) throw new Error('Configure one to four documentation models');

/** One provider/project quota gate shared by chat, documentation, models and instances. */
export async function acquireModelSlot(_modelId: string, signal?: AbortSignal): Promise<void> {
  const deadline = signal || AbortSignal.timeout(pipelineConfig.workTimeoutMs);
  while (true) {
    deadline.throwIfAborted();
    const waitMs = await redis.eval<unknown[], number>(`
local t = redis.call('TIME')
local now = tonumber(t[1])*1000 + math.floor(tonumber(t[2])/1000)
local next = tonumber(redis.call('GET',KEYS[1]) or '0')
if now < next then return next-now end
redis.call('SET',KEYS[1],now+tonumber(ARGV[1]),'PX',tonumber(ARGV[1])*2)
return 0`,[`${NS}quota:google`],[pipelineConfig.throttleMs]);
    if (!waitMs) return;
    await sleep(waitMs, undefined, {signal:deadline});
  }
}

export interface GenerateOptions { systemPrompt?:string; prompt:string; signal?:AbortSignal }
export async function generateWithRetry({systemPrompt,prompt,signal}:GenerateOptions):Promise<string> {
  const deadline = signal || AbortSignal.timeout(pipelineConfig.workTimeoutMs);
  for (const modelId of docsModels) {
    deadline.throwIfAborted();
    await acquireModelSlot(modelId,deadline);
    try {
      const result = await generateText({model:google(modelId),system:systemPrompt,prompt,maxRetries:0,abortSignal:deadline,providerOptions:{google:{thinkingConfig:{thinkingLevel:'minimal'}}}});
      if (!result.text.trim()) throw new Error('Empty model response');
      return result.text;
    } catch (error) {
      console.warn('[Docs] Model candidate failed.', { model: modelId, name: error instanceof Error ? error.name : 'unknown', status: APICallError.isInstance(error) ? error.statusCode : undefined });
      deadline.throwIfAborted();
      // One attempt per configured model. The broker owns subsequent delivery retries.
    }
  }
  throw new Error('The documentation provider is unavailable. The delivery will be retried.');
}
