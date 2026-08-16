import { deterministicClientReport, normalizeClientReport } from './client-report.mjs';
import { recordAiUsage } from './ai-telemetry.mjs';

const API_URL = 'https://api.deepseek.com/chat/completions';

export async function synthesizeClientReportWithDeepSeek(input) {
  const fallback = deterministicClientReport(input);
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return fallback;

  const language = input.locale === 'vi' ? 'Vietnamese' : 'English';
  const audience = input.audience === 'founder' ? 'a product founder' : 'a non-technical client or stakeholder';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  const prompt = `You are Dev30 Client Report Writer. Turn a structured GitHub activity snapshot into a concise update for ${audience}. Output valid JSON only in ${language}.\n\nRules:\n- The supplied snapshot/delta/evidence is the complete source of truth. Do not invent tasks, future plans, deadlines, blockers, adoption, impact, quality, skill, or intent.\n- Every shipped item about concrete work must use only evidenceIds present in the input and must contain at least one evidence ID.\n- changedSinceLast may describe deterministic delta facts. When a changed item is based on a new work unit, preserve its evidence IDs.\n- A moving-window count change is not proof that commits were added or deleted between snapshot times. Avoid wording that implies that.\n- Write for a stakeholder who wants progress, not implementation trivia. Translate technical details into what changed and why that category of work matters generally.\n- Keep repository names explicit.\n- Do not promise what will happen next. currentDirection means observed present direction only.\n- At most 6 shipped items and 6 changed items.\n- No developer scoring, performance evaluation, hiring recommendation, personality, or productivity judgment.\n\nReturn exactly:\n{\n  "title":"...",\n  "executiveSummary":"2-4 concise sentences",\n  "shipped":[{"repo":"repo","text":"plain-language shipped/changed item","evidenceIds":["E1"]}],\n  "changedSinceLast":[{"repo":"optional repo","text":"what changed compared with the previous saved snapshot","evidenceIds":["E2"]}],\n  "currentDirection":"one cautious paragraph about observed current focus",\n  "note":"short evidence/privacy caveat"\n}`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify(input) },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1800,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    recordAiUsage(payload, { operation: 'stakeholder_report', model });
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return fallback;
    const normalized = normalizeClientReport(JSON.parse(content), input, fallback);
    const evidenceBackedShipped = (normalized.shipped || []).filter((item) => item.evidenceIds?.length);
    normalized.shipped = evidenceBackedShipped.length ? evidenceBackedShipped : fallback.shipped;
    return normalized;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}
