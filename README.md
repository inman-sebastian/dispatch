# dispatch

Local-first AI dispatcher. You talk in plain English; a decision model (Laya or
Jev) routes the work; a small local model writes the execution brief; the right
harness does the job. Cloud tokens are spent only on execution — never on
deciding.

```
 you: "take a look at issue #134. are all prerequisites in place?
       if so, let's begin implementing"
        │
        ▼
 ┌──────────────┐   extract #134, gh issue view, truncate to budget
 │ state builder │────────────────────────────────────────────┐
 └──────────────┘                                            │
        │ state = { request, references }                     │
        ▼                                                     │
 ┌──────────────┐   POST /v1/systemone { state, questions }   │
 │ Laya / Jev   │──▶ task_type, complexity, model_tier,       │
 └──────────────┘   thinking, needs_tools, is_gated,          │
        │           destructive, scope (+ confidences)        │
        ▼                                                     │
 ┌──────────────┐   oMLX, small local model, constrained      │
 │ instructions │   rewriting (not open-ended planning)       │
 └──────────────┘                                             │
        │                                                     │
        ▼                                                     │
 ┌──────────────┐   local → oMLX direct                       │
 │   execute    │   cheap → codex CLI                         │
 └──────────────┘   flagship → claude CLI                     │
        │                                                     │
   gates enforced by the harness, not by vibes ◀──────────────┘
```

## Prerequisites

- Node 20+
- **oMLX** running with an instruct model downloaded (admin UI → model
  downloader). On a 64GB Mac Studio an 8B 4-bit model is comfortable for
  instruction generation; check the actual port in the oMLX admin panel.
- **Decision API**, one of:
  - TypeSafe **Jev** cloud (default): `https://api.typesafe.ai/v1/systemone`
    with an API key from https://console.typesafe.ai — set `DECISION_API_KEY`.
    The client sends `model: jev-latest` and retries 429/529 with backoff.
  - `pip install "laya[serve]"` then `laya-serve` (self-hosted, zero marginal
    cost): point `DECISION_API_URL` at it; it ignores the `model` field.
- `gh` CLI authenticated (only needed for `#123` issue enrichment; the
  pipeline works without it)
- `codex` and `claude` CLIs installed (only needed for the `cheap` /
  `flagship` tiers)

## Setup

```bash
cd dispatch
npm install
cp .env.example .env
# edit .env: OMLX_BASE_URL, OMLX_MODEL, DECISION_API_URL, DECISION_API_KEY
npm run build   # or: npm run dev -- "your directive"
```

## Usage

```bash
# Full run
node dist/index.js "take a look at issue #134. are all of the prerequisites in place? if so let's begin work implementing"

# See the state + decisions without executing anything
node dist/index.js --dry "is the webhook retry logic already covered by tests?"

# Non-interactive (auto-approve gates)
node dist/index.js --auto "refactor the auth middleware to use the new session store"

# Force a tier
node dist/index.js --tier cheap "write a README for the dispatch project"
```

Every run appends a JSONL record to `decisions.jsonl`: prompt, answers,
confidences, raw noul probabilities, chosen tier, and Jev token usage
(`input_tokens` / `output_tokens` per decision — watch this to verify the
savings). **This is your future fine-tuning dataset** — if you self-host Laya,
train it on these decisions and the schema gets sharper for your domain.

## Tuning

- **Question schema** (`src/schema.ts`): add/remove questions, but keep the
  rule — every question must move money or safety. Replace the `scope`
  criteria with your repo's real subsystems.
- **Confidence threshold** (`.env`): lower = trust the router more; higher =
  escalate to stronger tiers more often.
- **Executors** (`src/execute.ts`): the `codex`/`claude` argv assumes
  non-interactive CLIs; adjust if yours differ. Swap in API-based execution
  (Anthropic/OpenAI via the AI SDK) if you prefer.
- **Decision backend**: point `DECISION_API_URL` at Jev to start today, swap
  to `laya-serve` later — same request shape, no code changes.

## Roadmap ideas

- Fine-tune Laya on `decisions.jsonl` once you have a few hundred labeled runs.
- Confidence-gated *human* review for `destructive=yes` beyond a y/n prompt.
- Wrap as a Goose/Claude Code plugin instead of a standalone CLI.
