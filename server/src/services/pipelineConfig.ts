function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name} configuration`);
  return value;
}
export const pipelineConfig = {
  concurrency: integer('PIPELINE_CONCURRENCY', 1, 1, 8),
  stepDelaySec: integer('PIPELINE_STEP_DELAY_SEC', 5, 1, 60),
  throttleMs: integer('AI_THROTTLE_MS', 4000, 1, 60000),
  maxTpm: integer('AI_MAX_TPM', 16000, 1000, 2000000),
  maxSectionChars: integer('PIPELINE_SECTION_MAX_CHARS', 16000, 1000, 100000),
  backoff429Ms: integer('AI_BACKOFF_429_MS', 30000, 1000, 120000),
  workTimeoutMs: integer('PIPELINE_WORK_TIMEOUT_MS', 45000, 1000, 240000),
  functionLimitMs: integer('FUNCTION_MAX_DURATION_MS', 60000, 10000, 3600000),
  brokerLimitMs: integer('QSTASH_RESPONSE_TIMEOUT_MS', 60000, 10000, 900000),
  deliveryRetries: integer('PIPELINE_DELIVERY_RETRIES', 5, 1, 20),
  maxAttempts: integer('PIPELINE_MAX_STEP_ATTEMPTS', 8, 1, 50),
  maxDispatchAttempts: integer('PIPELINE_MAX_DISPATCH_ATTEMPTS', 12, 1, 100),
  recoveryMs: integer('PIPELINE_RECOVERY_MS', 120000, 10000, 3600000),
  maxFiles: integer('PIPELINE_MAX_FILES', 50, 1, 100),
  maxSections: integer('PIPELINE_MAX_SECTIONS', 20, 1, 40),
};
if (pipelineConfig.workTimeoutMs + 5000 >= Math.min(pipelineConfig.functionLimitMs, pipelineConfig.brokerLimitMs)) {
  throw new Error('Pipeline work deadline must leave over five seconds before both runtime and QStash limits');
}
export const leaseMs = pipelineConfig.workTimeoutMs + 10000;
export const GENERATOR_VERSION = 'gitdex-markdown-v2.1';
