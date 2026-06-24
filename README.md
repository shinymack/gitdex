# GitDex

Transform any GitHub repository into beautiful, AI-powered interactive documentation in seconds.

GitDex analyzes your codebase structure, plans a table of contents, writes comprehensive markdown docs using LLMs, and presents it in a search-ready web reader with an interactive AI chat assistant.

---

## Key Features

* **Multi-Step Indexing**: High-performance pipeline that scans, plans, and writes documentation.
* **AI Code Assistant**: Chat interface using manual ReAct loops to answer questions about the repository.
* **Interactive Diagrams**: Automatic Mermaid diagram generation for visualizing codebase architecture.
* **Serverless Queueing**: Custom-built queue system using Upstash Redis and QStash to bypass serverless execution timeouts.

---

## How It Works

To support serverless timeout limits, the indexing workflow is decoupled into step-by-step executions orchestrated by QStash:

<div align="center" style="margin: 24px 0;">
  <a href="https://gitdex-alpha.vercel.app/shinymack/gitdex" target="_blank" style="text-decoration: none;">
    <span style="display: inline-block; padding: 10px 24px; font-size: 14px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #ffffff; background-color: #10b981; border-radius: 6px; border: 1px solid #059669; text-decoration: none;">
      Explore Deployed Docs &rarr;
    </span>
  </a>
</div>

---

## Repository Architecture

This repository is split into two main packages:

* **[Client](./client/README.md)**: A Next.js application that renders documentation via Fumadocs and provides the AI assistant interface.
* **[Server](./server/README.md)**: An Express API that manages the Upstash Redis queue and handles the Gemini indexing pipeline.

For setup instructions and configuration steps, see the links above.

---

## Technical Stack

* **Frontend**: Next.js, Tailwind CSS, Fumadocs, assistant-ui
* **Backend**: Node.js, Express, Upstash Redis, Upstash QStash
* **AI Model**: Google Gemini (via Google AI SDK)
* **GitHub Integration**: Octokit (GitHub REST API)
