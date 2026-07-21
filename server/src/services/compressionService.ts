import { processFiles, mergeConfigs } from "repomix";

export async function compressCodeWithRepomix(path: string, content: string): Promise<string> {
  try {
    const rawConfig = {
      output: {
        compress: true,
        style: "plain" as const,
      },
    };
    const config = mergeConfigs(process.cwd(), rawConfig, {});
    const processedFiles = await processFiles(
      [{ path, content }],
      config,
      () => {}
    );
    return processedFiles[0]?.content || content;
  } catch (err) {
    console.warn(`[Repomix] Compression failed for ${path}, using raw content:`, err);
    return content;
  }
}
