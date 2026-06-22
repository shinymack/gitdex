# ⚙️ GitDex Server

**The background document indexing pipeline and API server for GitDex.**

This application handles repository scanning, TOC planning, step-by-step document generation using Google Gemini, and commits the generated output directly to your GitHub docs repository. It acts as the orchestrator for the QStash + Upstash Redis queue.

---

## ⚡ Key Technologies

* **Engine**: Node.js, Express
* **Database**: Upstash Redis
* **Message Broker**: Upstash QStash
* **SDKs**: Google AI SDK, Octokit
* **Runtime**: Bun

---

## ⚙️ Getting Started

### 1. Install Dependencies
```bash
bun install
```

### 2. Configure Environment Variables
Create a `.env` file in this directory containing:
```env
PORT=3001
CLIENT_URLS=http://localhost:3000
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
QSTASH_TOKEN=your_qstash_token
BASE_URL=your_ngrok_or_public_tunnel_url
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_USERNAME=your_github_username
DOCS_REPO_OWNER=your_github_username
DOCS_REPO_NAME=gitdex-docs
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
```

### 3. Run Development Server
```bash
bun run dev
```

The API endpoints will be accessible at [http://localhost:3001](http://localhost:3001).
