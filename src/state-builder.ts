import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from './config.js';

const execFileAsync = promisify(execFile);

/**
 * The state builder turns a natural-language directive into the compact
 * "state" object the decision model scores.
 *
 * The user's raw message is almost always the core of the state — it's short.
 * The value-add here is enrichment: extract references like #134, fetch the
 * underlying context (issue body, etc.), and keep everything inside a char
 * budget the decision model can actually read.
 */

export interface BuiltState {
  /** The user's original message, verbatim. */
  request: string;
  /** Enriched reference context, truncated to budget. */
  references: string;
  /** The final state object sent to the decision API. */
  asObject: Record<string, string>;
}

const ISSUE_RE = /#(\d{1,5})\b/g;

async function fetchIssueBody(num: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['issue', 'view', num, '--json', 'title,body', '--jq', '"\(.title)\n\n\(.body)"'],
      { timeout: 15_000, maxBuffer: 1024 * 1024 },
    );
    return stdout.trim() || null;
  } catch {
    return null; // gh not installed / not authed / issue not found — state still works without it
  }
}

function truncate(s: string, budget: number): string {
  if (s.length <= budget) return s;
  return s.slice(0, budget - 3).trimEnd() + '...';
}

export async function buildState(prompt: string): Promise<BuiltState> {
  const request = prompt.trim();

  // 1. Extract issue references (#134) — extend with file/@-mentions as needed.
  const issueNums = Array.from(
    new Set([...request.matchAll(ISSUE_RE)].map((m) => m[1])),
  );

  // 2. Fetch underlying context for each reference.
  const chunks: string[] = [];
  for (const num of issueNums.slice(0, 5)) {
    const body = await fetchIssueBody(num);
    if (body) chunks.push(`Issue #${num}:\n${body}`);
  }

  // 3. Assemble within budget. The request itself always survives truncation;
  //    reference context is what gets cut first.
  const refBudget = Math.max(
    0,
    config.stateCharBudget - request.length - 200,
  );
  const references = truncate(chunks.join('\n\n---\n\n'), refBudget);

  return {
    request,
    references,
    asObject: {
      request,
      ...(references ? { references } : {}),
    },
  };
}
