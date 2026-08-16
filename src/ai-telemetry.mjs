import './env.mjs';

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function deepSeekRates(env = process.env) {
  return {
    cacheHitInputUsdPerMillion: number(env.DEEPSEEK_CACHE_HIT_INPUT_USD_PER_MILLION, 0.0028),
    cacheMissInputUsdPerMillion: number(env.DEEPSEEK_INPUT_USD_PER_MILLION, 0.14),
    outputUsdPerMillion: number(env.DEEPSEEK_OUTPUT_USD_PER_MILLION, 0.28),
  };
}

export function normalizeAiUsage(payload, { operation = 'analysis', model = null, env = process.env } = {}) {
  const usage = payload?.usage || {};
  const promptTokens = number(usage.prompt_tokens ?? usage.input_tokens, 0);
  const completionTokens = number(usage.completion_tokens ?? usage.output_tokens, 0);
  const totalTokens = number(usage.total_tokens, promptTokens + completionTokens);
  const reportedHit = number(usage.prompt_cache_hit_tokens, 0);
  const reportedMiss = number(usage.prompt_cache_miss_tokens, -1);
  const hasCacheBreakdown = reportedMiss >= 0 && reportedHit + reportedMiss <= promptTokens;
  const cacheHitTokens = hasCacheBreakdown ? reportedHit : 0;
  const cacheMissTokens = hasCacheBreakdown ? reportedMiss + Math.max(0, promptTokens - reportedHit - reportedMiss) : promptTokens;
  const rates = deepSeekRates(env);
  const estimatedCostUsd = (cacheHitTokens / 1_000_000) * rates.cacheHitInputUsdPerMillion
    + (cacheMissTokens / 1_000_000) * rates.cacheMissInputUsdPerMillion
    + (completionTokens / 1_000_000) * rates.outputUsdPerMillion;
  return {
    provider: 'deepseek',
    operation,
    model: payload?.model || model || null,
    promptTokens,
    promptCacheHitTokens: cacheHitTokens,
    promptCacheMissTokens: cacheMissTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(8)),
    rates,
  };
}

export function recordAiUsage(payload, options = {}) {
  const telemetry = normalizeAiUsage(payload, options);
  if (telemetry.totalTokens > 0) {
    console.info(`[dev30-ai] ${JSON.stringify(telemetry)}`);
  }
  // Telemetry is operational data. Do not return it into user-facing API payloads.
  return null;
}
