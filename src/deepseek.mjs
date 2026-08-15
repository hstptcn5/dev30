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
      privateRepos: dataset.profile.privateRepos || 0,
    },
    coverage: {
      candidateRepos: dataset.collector.candidateRepos,
      analyzedRepos: dataset.collector.selectedRepos,
      deepDiveRepos: dataset.collector.deepDiveRepos,
      includePrivate: dataset.collector.includePrivate,
      commitCountsTruncated: dataset.collector.commitCountsTruncated,
      prCountsTruncated: dataset.collector.prCountsTruncated,
    },
    repos: dataset.repos.map((repo) => ({
      name: repo.name,
      visibility: repo.visibility,
      description: repo.description,
      language: repo.language,
      topics: repo.topics,
      stars: repo.stars,
      isFork: repo.isFork,
      createdAt: repo.createdAt,
      commits: repo.commits,
      commitsTruncated: repo.commitsTruncated,
      pullRequests: repo.pullRequests,
      deepDive: repo.deepDive,
      recentCommitMessages: repo.recentCommitMessages,
      recentPrTitles: repo.recentPrTitles,
      changedFiles: repo.changedFiles,
    })),
    workMix: dataset.workMix,
    workUnits: dataset.workUnits.slice(0, 80).map((unit) => ({
      id: unit.id,
      type: unit.type,
      repo: unit.repo,
      date: unit.date,
      title: unit.title,
      category: unit.category,
      categoryMix: unit.categoryMix,
      files: unit.files.slice(0, 30),
      evidenceIds: unit.evidenceIds,
    })),
    evidence: dataset.evidence.map((item) => ({
      id: item.id,
      type: item.type,
      repo: item.repo,
      visibility: item.visibility,
      date: item.date,
      title: item.title,
      files: item.files,
    })),
  };
}

function systemPrompt(locale, days) {
  const language = locale === 'vi' ? 'Vietnamese' : 'English';
  return `You are Dev30, an evidence-first software development activity analyst.\n\nYour job is to explain what a developer actually worked on during a fixed ${days}-day GitHub window. Output valid JSON only, in ${language}.\n\nThe input has two important layers:\n- workUnits: deduplicated engineering units, where a pull request and its merge/squash commit are treated as one unit. A work unit may contain a categoryMix because real engineering work can span build, tests, release automation, docs, hardening, and maintenance at once.\n- evidence: source records used to verify claims. Cite only evidenceIds supplied in the input.\n\nRules:\n- GitHub evidence is the source of truth. Never invent work, technologies, users, launches, impact, ownership, or project maturity.\n- Every material claim about concrete work must be supported by one or more evidenceIds supplied in the input.\n- Describe observed recent activity only. Do not infer permanent skills, competence, seniority, personality, preferences, habits, awareness, discipline, communication quality, or suitability for a role.\n- Never produce a hire/no-hire recommendation, talent score, personality claim, or quality judgment.\n- Distinguish observed facts from cautious interpretation. Interpret project trajectory only when multiple dated evidence items support it.\n- Translate jargon for non-technical readers. Explain what changed and why that kind of engineering generally matters, without claiming business success, adoption, or developer quality.\n- Use repository names explicitly. Do not create a generic project title that hides which repository it belongs to.\n- Prefer meaningful units of work over raw commit counts. Do not treat merge commits as separate accomplishments from their PR.\n- Mention newly created side projects when supported, but do not let tiny experiments crowd out the main focus.\n- Technical stack items must be supported by repository language, topics, filenames, or concrete work-unit evidence.\n- Do not convert language choice into motivation.\n- If count fields are marked truncated, do not present the number as exact.\n- The timeline must use actual evidence dates. Sorting will be enforced server-side, but each date must be YYYY-MM-DD.\n- Produce at most 8 project clusters. Prefer one cluster per repository unless a single repository clearly contains multiple major work streams.\n- technical.signals and observations are material claims too: each item must include evidenceIds.\n\nReturn this JSON shape exactly:\n{\n  "headline": "one-sentence ${days}-day takeaway",\n  "summary": "2-4 sentence plain-language explanation",\n  "mainFocus": {\n    "repo": "repository name",\n    "title": "human-readable work cluster",\n    "explanation": "what was done",\n    "significance": "why that kind of engineering matters, without claiming business impact",\n    "evidenceIds": ["E1"]\n  },\n  "projects": [{\n    "repo": "repository name",\n    "title": "work cluster",\n    "description": "plain-language description",\n    "highlights": ["specific observed item"],\n    "evidenceIds": ["E2"]\n  }],\n  "technical": {\n    "primaryLanguages": ["Go"],\n    "areas": ["backend", "testing"],\n    "stack": ["only stack elements actually evidenced"],\n    "trajectory": "cautious description of recent engineering progression",\n    "signals": [{"text": "evidence-based technical observation about recent work, not developer ability", "evidenceIds": ["E3"]}]\n  },\n  "observations": [{"text": "careful cross-project observation about recent activity only", "evidenceIds": ["E4"]}],\n  "timeline": [{\n    "date": "YYYY-MM-DD",\n    "label": "short milestone",\n    "detail": "what changed",\n    "evidenceIds": ["E3"]\n  }]\n}`;
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
          { role: 'system', content: systemPrompt(locale, dataset.window.days) },
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
