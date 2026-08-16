import './env.mjs';

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function deepSeekRates(env = process.env) {
  return {
    inputUsdPerMillion: number(env.DEEPSEEK_INPUT_USD_PER_MILLION, 0.14),
    outputUsdPerMillion: number(env.DEEPSEEK_OUTPUT_USD_PER_MILLION, 0.28),
  };
}

export function normalizeAiUsage(payload, { operation = 'analysis', model = null, env = process.env } = {}) {
  const usage = payload?.usage || {};
  const promptTokens = number(usage.prompt_tokens ?? usage.input_tokens, 0);
  const completionTokens = number(usage.completion_tokens ?? usage.output_tokens, 0);
  const totalTokens = number(usage.total_tokens, promptTokens + completionTokens);
  const rates = deepSeekRates(env);
  const estimatedCostUsd = (promptTokens / 1_000_000) * rates.inputUsdPerMillion
    + (completionTokens / 1_000_000) * rates.outputUsdPerMillion;
  return {
    provider: 'deepseek',
    operation,
    model: payload?.model || model || null,
    promptTokens,
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
  return telemetry;
}
