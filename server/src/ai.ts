import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const docsModels = (process.env.DOCS_MODELS || "gemma-4-31b-it,gemma-4-26b-a4b-it")
  .split(",")
  .map(m => m.trim())
  .filter(Boolean);

// Module-level throttle driven by AI_THROTTLE_MS env var (defaults to 2000ms = 30 RPM max)
let lastApiCallTimestamp = 0;
const MIN_INTERVAL_MS = parseInt(process.env.AI_THROTTLE_MS || "2000", 10);

interface GenerateOptions {
  systemPrompt?: string;
  prompt: string;
  maxRetries?: number;
}

export async function generateWithRetry({
  systemPrompt,
  prompt,
  maxRetries = 3
}: GenerateOptions): Promise<string> {
  let lastError: Error | null = null;

  for (const modelId of docsModels) {
    console.log(`[AI] Attempting generation with model: ${modelId}`);
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Dynamic Throttle Logic - synchronous reservation
        const now = Date.now();
        const targetTime = Math.max(now, lastApiCallTimestamp + MIN_INTERVAL_MS);
        lastApiCallTimestamp = targetTime;

        if (targetTime > now) {
          const waitTime = targetTime - now;
          console.log(`[AI Throttle] Waiting ${waitTime}ms to avoid rate limit...`);
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, waitTime);
          await promise;
        }

        const result = await generateText({
          model: google(modelId),
          system: systemPrompt,
          prompt: prompt,
        });
        return result.text;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;
        console.warn(`[AI] Model ${modelId} attempt ${attempt + 1} failed: ${err.message}`);

        const isRateLimit = err.message.includes('429') || 
                            (typeof error === 'object' && error !== null && 'status' in error && error.status === 429);

        if (isRateLimit) {
          // If we somehow still hit a 429, wait a full 10 seconds
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, 10000);
          await promise;
        } else {
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, 2000 * Math.pow(2, attempt));
          await promise;
        }
      }
    }
  }

  throw new Error(`AI generation failed for all configured models. Last error: ${lastError?.message}`);
}