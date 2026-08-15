import { normalizeReport } from './analyzer.mjs';

const API_URL = 'https://api.deepseek.com/chat/completions';

function compactDataset(dataset) {
  return {
    window: dataset.window,
    profile: {
      login: dataset.profile.login,
      name: dataset.profile.name,
      bio: dataset.profile.bio,
      publicRepos: dataset.profile.publicRepos,
    },
    repos: dataset.repos.map((repo) => ({
      name: repo.name,
      description: repo.description,
      language: repo.language,
      topics: repo.topics,
      stars: repo.stars,
      isFork: repo.isFork,
      commits: repo.commits,
      pullRequests: repo.pullRequests,
      recentCommitMessages: repo.recentCommitMessages,
      recentPrTitles: repo.recentPrTitles,
      changedFiles: repo.changedFiles,
    })),
    workMix: dataset.workMix,
    evidence: dataset.evidence.map((item) => ({
      id: item.id,
      type: item.type,
      repo: item.repo,
      date: item.date,
      title: item.title,
      files: item.files,
    })),
  };
}

function systemPrompt(locale) {
  const language = locale === 'vi' ? 'Vietnamese' : 'English';
  return `You are Dev30, an evidence-first software development activity analyst.\n\nYour job is to explain what a developer actually worked on during a fixed 30-day GitHub window. Output valid JSON only, in ${language}.\n\nRules:\n- GitHub evidence is the source of truth. Never invent work, technologies, users, launches, impact, ownership, or project maturity.\n- Every material claim about concrete work must be supported by one or more evidenceIds supplied in the input.\n- Describe observed recent activity, not permanent skill or seniority.\n- Never produce a hire/no-hire recommendation, talent score, personality claim, or quality judgment.\n- Distinguish observed facts from cautious interpretation. Use wording such as "the activity suggests" when interpreting trajectory.\n- Translate jargon for non-technical readers, but keep a useful technical layer.\n- Focus on meaningful units of work, not raw commit counts.\n\nReturn this JSON shape exactly:\n{\n  "headline": "one-sentence 30-day takeaway",\n  "summary": "2-4 sentence plain-language explanation",\n  "mainFocus": {\n    "repo": "repository name",\n    "title": "human-readable work cluster",\n    "explanation": "what was done",\n    "significance": "why that kind of engineering matters, without claiming business impact",\n    "evidenceIds": ["E1"]\n  },\n  "projects": [{\n    "repo": "name",\n    "title": "work cluster",\n    "description": "plain-language description",\n    "highlights": ["specific observed item"],\n    "evidenceIds": ["E2"]\n  }],\n  "technical": {\n    "primaryLanguages": ["Go"],\n    "areas": ["backend", "testing"],\n    "stack": ["only stack elements actually evidenced"],\n    "trajectory": "cautious description of recent engineering progression",\n    "signals": ["evidence-based technical observation"]\n  },\n  "observations": ["careful cross-project observation"],\n  "timeline": [{\n    "date": "YYYY-MM-DD",\n    "label": "short milestone",\n    "detail": "what changed",\n    "evidenceIds": ["E3"]\n  }]\n}`;
}

export async function synthesizeWithDeepSeek(dataset, fallback, { locale = 'en' } = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { report: fallback, mode: 'deterministic', model: null, notice: 'DEEPSEEK_API_KEY is not configured.' };
  }

  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const thinking = process.env.DEEPSEEK_THINKING === 'enabled' ? 'enabled' : 'disabled';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt(locale) },
          { role: 'user', content: `Analyze this GitHub activity dataset and return JSON.\n${JSON.stringify(compactDataset(dataset))}` },
        ],
        thinking: { type: thinking },
        response_format: { type: 'json_object' },
        max_tokens: 5000,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DeepSeek API ${response.status}: ${text.slice(0, 400)}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek returned an empty response.');
    const parsed = JSON.parse(content);
    return {
      report: normalizeReport(parsed, dataset.evidence, fallback),
      mode: 'deepseek',
      model: payload.model || model,
      notice: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
