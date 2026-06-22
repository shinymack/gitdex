import { generateText } from "ai";
import { google } from "@ai-sdk/google";

// Unified model across the entire app
const MODEL_ID = "gemma-4-31b-it";

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
                // Rate limit hit, wait longer
                await new Promise(resolve => setTimeout(resolve, 10000 * (attempt + 1)));
            } else {
                // Standard exponential backoff
                await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, attempt)));
            }
        }
    }

    throw new Error(`AI generation failed after ${maxRetries} retries. Last error: ${lastError?.message}`);
}