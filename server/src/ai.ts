import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const MODEL_ID = "gemma-4-31b-it";

// Module-level throttle to prevent hitting 15 RPM limit
let lastApiCallTimestamp = 0;
const MIN_INTERVAL_MS = 4500; // 4.5 seconds = ~13 RPM (safely under 15)

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

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Dynamic Throttle Logic
      const now = Date.now();
      const timeSinceLastCall = now - lastApiCallTimestamp;
      
      if (timeSinceLastCall < MIN_INTERVAL_MS) {
        const waitTime = MIN_INTERVAL_MS - timeSinceLastCall;
        console.log(`[AI Throttle] Waiting ${waitTime}ms to avoid rate limit...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // Update timestamp right before firing
      lastApiCallTimestamp = Date.now();

      const result = await generateText({
        model: google(MODEL_ID),
        system: systemPrompt,
        prompt: prompt,
      });
      return result.text;
    } catch (error: any) {
      lastError = error;
      console.warn(`AI generation attempt ${attempt + 1} failed: ${error.message}`);

      if (error.message.includes('429') || error.status === 429) {
        // If we somehow still hit a 429, wait a full 10 seconds
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, attempt)));
      }
    }
  }

  throw new Error(`AI generation failed after ${maxRetries} retries. Last error: ${lastError?.message}`);
}