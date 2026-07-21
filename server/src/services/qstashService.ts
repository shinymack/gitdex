import { qstash } from "../config/qstash.js";

export function getBaseUrl(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  if (process.env.SERVER_URL) return process.env.SERVER_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3001';
}

export async function triggerNextStep(jobId: string, sectionIndex?: number, delay?: number): Promise<void> {
  const baseUrl = getBaseUrl();
  const targetUrl = `${baseUrl.replace(/\/$/, '')}/api/pipeline/step`;

  console.log(`[QStash] Triggering next step for job ${jobId} at ${targetUrl} (sectionIndex: ${sectionIndex ?? 'N/A'}, delay: ${delay ?? 0}s)...`);

  const isLocalhost = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');

  if (isLocalhost) {
    console.log(`[QStash Dev] Localhost target detected. Triggering step locally via direct HTTP dispatch...`);
    const dispatch = async () => {
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, sectionIndex }),
        });
        if (!response.ok) {
          console.error(`[QStash Dev] Local dispatch returned status ${response.status}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[QStash Dev] Local dispatch failed: ${msg}`);
      }
    };

    if (delay && delay > 0) {
      setTimeout(dispatch, delay * 1000);
    } else {
      dispatch();
    }
    return;
  }

  await qstash.publishJSON({
    url: targetUrl,
    body: { jobId, sectionIndex },
    delay: delay ? delay : undefined,
  });
}
