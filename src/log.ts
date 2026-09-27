import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from './config.js';
import type { Decision } from './schema.js';

/**
 * Append-only JSONL log of every decision the system makes.
 * This is the dataset you'll fine-tune Laya on later (or use to
 * audit/tune the question schema). Log from day one.
 */
export async function logDecision(entry: {
  prompt: string;
  tier: string;
  decision: Decision;
  usage: { input_tokens: number; output_tokens: number };
  note?: string;
}): Promise<void> {
  const record = {
    ts: new Date().toISOString(),
    prompt: entry.prompt,
    tier: entry.tier,
    usage: entry.usage,
    answers: Object.fromEntries(
      Object.entries(entry.decision.answers).map(([k, v]) => [
        k,
        {
          value: v.value,
          confidence: v.confidence,
          ...(v.probability !== undefined ? { probability: v.probability } : {}),
          ...(v.probabilities ? { probabilities: v.probabilities } : {}),
        },
      ]),
    ),
    ...(entry.note ? { note: entry.note } : {}),
  };
  await mkdir(dirname(config.logPath), { recursive: true });
  await appendFile(config.logPath, JSON.stringify(record) + '\n', 'utf8');
}
