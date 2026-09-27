import { config } from './config.js';
import {
  DECISION_QUESTIONS,
  type Decision,
  type DecisionUsage,
  type QuestionName,
  type TypedAnswer,
} from './schema.js';

/**
 * Jev-compatible decision client. Works unchanged against:
 *   - TypeSafe Jev cloud: POST https://api.typesafe.ai/v1/systemone
 *   - laya-serve (self-hosted Laya): POST /v1/systemone
 * Only the base URL / key / model in config changes.
 *
 * Follows the official TypeSafe guidance:
 * - `model` is sent with every request (required by Jev cloud, ignored by laya-serve).
 * - Choice answers keep the full per-option probability distribution.
 * - Noul answers carry no separate confidence; the probability is the signal.
 * - 429/529 responses are retried with exponential backoff.
 */

interface RawAnswer {
  type?: string;
  choice?: string;
  probabilities?: Record<string, number>;
  score?: number;
  legend?: Record<string, string>;
  noul?: number;
  confidence?: number;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function parseAnswer(name: QuestionName, raw: RawAnswer | undefined): TypedAnswer {
  const q = DECISION_QUESTIONS[name];
  if (!raw) return { value: 'unknown', confidence: 0 };

  if (q.type === 'choice') {
    return {
      value: raw.choice ?? 'unknown',
      confidence: clamp01(raw.confidence ?? 0),
      probabilities: raw.probabilities,
    };
  }
  if (q.type === 'noul') {
    const p = clamp01(raw.noul ?? 0);
    return { value: p >= 0.5, confidence: Math.max(p, 1 - p), probability: p };
  }
  // score
  return {
    value: raw.score ?? 0,
    confidence: clamp01(raw.confidence ?? 1),
    probabilities: raw.probabilities,
  };
}

async function postDecision(
  state: Record<string, string>,
  attempt: number,
): Promise<Response> {
  const res = await fetch(config.decisionApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.decisionApiKey
        ? { Authorization: `Bearer ${config.decisionApiKey}` }
        : {}),
    },
    body: JSON.stringify({
      state,
      model: config.decisionModel,
      questions: DECISION_QUESTIONS,
    }),
  });

  if ((res.status === 429 || res.status === 529) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    return postDecision(state, attempt + 1);
  }
  return res;
}

export async function decide(state: Record<string, string>): Promise<Decision> {
  const res = await postDecision(state, 0);

  if (!res.ok) {
    throw new Error(
      `Decision API failed (${res.status}): ${(await res.text()).slice(0, 500)}`,
    );
  }

  const data = (await res.json()) as {
    answers?: Record<string, RawAnswer>;
    usage?: DecisionUsage;
  };

  const answers = {} as Record<QuestionName, TypedAnswer>;
  for (const name of Object.keys(DECISION_QUESTIONS) as QuestionName[]) {
    answers[name] = parseAnswer(name, data.answers?.[name]);
  }
  return {
    answers,
    usage: data.usage ?? { input_tokens: 0, output_tokens: 0 },
    raw: data,
  };
}

/**
 * Confidence-gated escalation: if the tier decision is shaky, spend up
 * one level rather than trusting a cheap wrong answer. Cheap insurance.
 * (The 0.6 default follows TypeSafe's confidence-gating guidance; tune it
 * on your own data.)
 */
export function applyConfidenceEscalation(d: Decision): 'local' | 'cheap' | 'flagship' {
  const tier = d.answers.model_tier.value as string;
  const c = d.answers.model_tier.confidence;
  const order = ['local', 'cheap', 'flagship'] as const;
  const idx = order.indexOf(tier as (typeof order)[number]);
  const safeIdx = idx === -1 ? 1 : idx;
  if (c < config.confidenceThreshold && safeIdx < order.length - 1) {
    return order[safeIdx + 1];
  }
  return order[safeIdx];
}
