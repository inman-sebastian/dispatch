import 'dotenv/config';

/**
 * Central configuration. Everything is overridable via environment.
 * Copy .env.example to .env and adjust to your machine.
 */
export const config = {
  /** oMLX OpenAI-compatible base URL (check the oMLX admin panel for the port). */
  omlxBaseUrl: process.env.OMLX_BASE_URL ?? 'http://127.0.0.1:8000/v1',
  /** Model alias/dir name as listed by oMLX /v1/models. Used for instruction generation. */
  omlxModel: process.env.OMLX_MODEL ?? 'Qwen3-Coder-30B-A3B-Instruct-MLX-4bit',

  /** Jev-compatible decision endpoint: TypeSafe Jev cloud, or laya-serve self-hosted.
   *  Jev cloud: https://api.typesafe.ai/v1/systemone (needs DECISION_API_KEY).
   *  laya-serve: http://127.0.0.1:8001/v1/systemone (ignores the `model` field). */
  decisionApiUrl:
    process.env.DECISION_API_URL ?? 'https://api.typesafe.ai/v1/systemone',
  decisionApiKey: process.env.DECISION_API_KEY ?? '',
  /** Model id sent with each decision request (Jev cloud; ignored by laya-serve). */
  decisionModel: process.env.DECISION_MODEL ?? 'jev-latest',

  /** Max characters of enriched state sent to the decision API. */
  stateCharBudget: Number(process.env.STATE_CHAR_BUDGET ?? 6000),
  /** Below this confidence, model_tier escalates one level. */
  confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD ?? 0.6),
  /** Below this task_type confidence, the harness asks you to confirm the
   *  intent instead of guessing (intent-routing pattern). */
  intentClarifyThreshold: Number(process.env.INTENT_CLARIFY_THRESHOLD ?? 0.5),
  /** Ask for confirmation when P(destructive) reaches this. Note this gates on
   *  the raw probability, not the boolean — a 0.49 coin-flip still confirms. */
  destructiveConfirmProbability: Number(
    process.env.DESTRUCTIVE_CONFIRM_PROBABILITY ?? 0.25,
  ),
  /** JSONL log of decisions. Future fine-tuning dataset. */
  logPath: process.env.DECISION_LOG_PATH ?? './decisions.jsonl',

  autoApproveGates: process.env.AUTO_APPROVE_GATES === '1',
  autoApproveDestructive: process.env.AUTO_APPROVE_DESTRUCTIVE === '1',
} as const;
