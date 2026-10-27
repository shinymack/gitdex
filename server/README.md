# GitDex API

Express API, Upstash Redis/QStash, Octokit, and the AI SDK Google provider. The API reads public repositories, generates source-linked Markdown, and publishes guides to a separate GitHub documentation repository.

## Setup

```sh
bun install
cp .env.example .env
bun run dev
```

Supply real credentials in `.env`; never commit that file. Run development in the `server` window of the `omp` tmux session. The local API defaults to `http://localhost:3001`.

Use a current Node 22 or Node 24 LTS release with Bun as the package manager. `bun run dev`, `bun run start`, and `bun run test` execute Node through `tsx`, matching the production runtime. The isolated JSDOM parser uses Node's VM support rather than Bun's incomplete VM implementation.

Required configuration:

- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` for durable state.
- `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` for delivery and verification.
- `BASE_URL`: canonical public API origin, without a path/query/hash. Production is `https://gitdex-server.vercel.app`; local QStash delivery needs a reachable HTTPS tunnel.
- `GITHUB_TOKEN`: documentation writer; `DOCS_REPO_OWNER`, `DOCS_REPO_NAME`, `DOCS_REPO_BRANCH`: the shared client/API documentation destination.
- `GOOGLE_GENERATIVE_AI_API_KEY`: Google provider key. `DOCS_MODELS` and `CHAT_MODELS` select ordered model candidates.
- `CLIENT_URLS`: comma-separated exact allowed browser origins. This is CORS, not API authentication.

Optional `GITHUB_SOURCE_TOKEN` is a separate public-source credential for higher GitHub metadata limits. Without it, metadata uses GitHub’s unauthenticated quota. Public raw file reads use pinned commit URLs and never use the writer token.

## API contracts

- `GET /health`: process health, not a dependency audit.
- `POST /api/index`: `{ "repoUrl": "https://github.com/owner/repository", "force": false }`. Requires a public repository root; `force` is optional and must be boolean. Returns accepted run identity or the existing published/queued state. `INDEXING_PAUSED=true` rejects new admissions without hiding existing guides.
- `GET /api/status?owner=...&repo=...`: published availability plus independent latest-run state. `indexed` means a usable guide exists, not that a refresh completed successfully.
- `POST /api/chat`: `x-github-owner` / `x-github-repo` headers and AI SDK UI messages. Source is pinned to one commit per request. The assistant uses native `listFiles`, `readFiles`, and `searchCode` tools; it has read/search limits, cancellation, and a total `CHAT_TIMEOUT_MS` deadline (default 90000, capped at 180000).
- Signed `POST /api/pipeline/step`, `/api/pipeline/reconcile`, and `/api/pipeline/failure`. Signature verification binds both raw body and the canonical destination URL. Unsigned callbacks are not accepted.

Gemma requests use native `streamText` tool calls with minimal thinking to fit interactive deadlines. Tool steps and token deltas stream incrementally to the client as they arrive in real time.

Development administration is absent in production. In development it also requires `DEV_ADMIN_TOKEN`; destructive documentation administration additionally requires `DOCS_ALLOW_DESTRUCTIVE_DEV=true`.

## Queue invariants and recovery

The default namespace is `gitdex:v2:`. A run moves through scan, plan, sections, and publish. Lua atomically admits work, promotes the next queued run, records durable dispatch intents, and accepts completion only from the current lease token and expected phase. Section completion is idempotent and the publish fan-in occurs once.

QStash delivery is at least once. Pending delivery intents survive publication to the broker until fenced step completion. Publication/step attempts are bounded. The signed reconciler republishes pending work and repairs queued work without an active owner. Failure callbacks reschedule a still-pending intent; an old broker failure must not terminate a newer attempt.

Create a **POST** QStash schedule targeting `${BASE_URL}/api/pipeline/reconcile`, cron `*/5 * * * *`. This costs 288 baseline messages/day, leaving room for indexing within the [1,000/day free quota](https://upstash.com/pricing/qstash); a one-minute schedule alone would use 1,440. Normal steps dispatch immediately; abandoned delivery recovery may wait up to five minutes. Replace the obsolete `/api/pipeline/cron-heal` schedule during cutover. Outgoing step messages attach `${BASE_URL}/api/pipeline/failure` automatically. Validate a real signed delivery after deployment.

Defaults: concurrency 4, step delay 2 seconds, model request spacing 2000ms shared across chat/docs, work deadline 45000ms, claimed lease 55000ms, runtime/broker safety limits 60000ms, recovery interval 120000ms. Keep the work deadline more than five seconds below both actual function and broker limits. Configure limits with the `PIPELINE_*`, `AI_THROTTLE_MS`, `FUNCTION_MAX_DURATION_MS`, and `QSTASH_RESPONSE_TIMEOUT_MS` variables in `.env.example`.

This production deployment uses a 180000ms work deadline, 240000ms broker response timeout, and a 300000ms function limit; the broker accepted the longer timeout. The conservative source defaults remain 45000/60000/60000 for other deployments. Always align these three values before changing work duration.

For an isolated Redis smoke only, set `PIPELINE_STATE_PREFIX` to a unique `gitdex:smoke-<id>:` prefix **before importing services**. Clean up only that prefix. Never clear shared state. `PIPELINE_LOCAL_DISPATCH=true` is an explicit development-only synchronous path, not an unsigned HTTP bypass.

## Generation and publication

Scanning selects at most 50 eligible files by default. TOC entries must refer to selected source files; filenames are derived and validated, with at most 20 sections. Generated files are validated before publication, including source links and Mermaid syntax. Unchanged sections are reused only when generator, dependencies, file positions, coverage, and content checks agree.

Diagram validation runs the installed Mermaid browser bundle in a cached, isolated JSDOM context. Only the trusted library is executed as script; diagram text is parsed, never evaluated. No browser globals or external resource loading are added to the API process. Syntax errors reject the candidate; parser initialization failures remain retryable infrastructure errors.

JSDOM is pinned to 26.1.0: it avoids jsdom 30's CommonJS-to-ESM encoding import, which this Vercel legacy loader rejects. Upgrade it together with a compatible deployment loader, not independently.

Publication creates one Git tree/commit and performs a non-force branch update. A manifest records the source SHA, coverage, generator version, run ID, and section dependencies. Invalid candidates leave the previous guide untouched. Redis lease ownership and GitHub publication cannot be made one atomic transaction: an already-sent GitHub write may land after lease loss. Non-force ref updates prevent branch rewind, not this cross-service race.

## Verification and deployment

```sh
bun x tsc --noEmit
bun run test
```

Deploy the Vercel project `gitdex-server`, root directory `server`, Node 22. `vercel.json` uses the legacy Node builder; do not mix its `builds` property with a `functions` configuration. Set canonical production callbacks and aligned docs destination explicitly; do not deploy a local tunnel URL or overwrite production secrets with redacted environment pulls.

The root `.vercelignore` explicitly excludes local `.env` credentials, caches, and build output from source uploads; the environment template remains included. Production secrets belong in Vercel environment settings, not uploaded files.

Before cutover, inspect active legacy work and broker deliveries. Preserve published guides and Redis state. Afterward verify signed reconciliation, source-reading chat, one complete indexing run through publication, and the reader’s source revision/coverage. CLI deployment does not push source changes: indexing reads the committed GitHub source, not the uncommitted local working tree.
