# GitDex

**Transform any GitHub repository into beautiful, AI-powered interactive documentation in seconds.**

GitDex leverages advanced AI to analyze your codebase, generate comprehensive documentation, and provide an interactive assistant that knows your project inside out.

---

## ✨ Key Features

- **🧠 Smart Analysis**: AI-powered code analysis that understands project structure and generates deep architectural insights.
- **💬 AI Code Assistant**: A built-in chat interface that allows you to ask questions about the codebase, find where things are implemented, and understand complex logic.
- **📊 Interactive Diagrams**: Auto-generated Mermaid diagrams for visualizing system architecture, workflows, and data flows with pan/zoom support.
- **🔍 Seamless Integration**: Enter any `owner/repo` to instantly index and view documentation.
- **⚡ Premium UI**: A fast, responsive documentation viewer built with Next.js, Fumadocs, and sleek modern aesthetics.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: [Next.js (App Router)](https://nextjs.org/)
- **Runtime**: [Bun](https://bun.sh/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [assistant-ui](https://assistant-ui.com/), [Fumadocs](https://fumadocs.vercel.app/), [Lucide React](https://lucide.dev/)
- **Data Fetching**: AI SDK with manual ReAct loop integration.

### Backend
- **Engine**: Node.js & Express
- **AI Model**: Google Gemma-3 (via Google AI SDK)
- **Tooling**: Octokit for GitHub API interaction.
- **Processing**: BullMQ/Queue system for background repository indexing.

---

## 📂 Project Structure

```bash
gitdex/
├── client/          # Next.js frontend application
│   ├── components/  # Core UI components (Chat, Modal, UI primitives)
│   ├── src/app/     # App Router pages and API routes
│   └── lib/         # Utility functions and stores
└── server/          # Node.js backend & API
    ├── controllers/ # Business logic for indexing and repos
    ├── routes/      # API endpoints
    └── queue.js     # Background job processing
```

---

## 🚀 Getting Started

1. **Clone the repo**
2. **Setup Client**:
   ```bash
   cd client
   bun install
   bun dev
   ```
3. **Setup Server**:
   ```bash
   cd server
   bun install
   bun start
   ```
4. **Environment Variables**:
   Ensure you have `GOOGLE_GENERATIVE_AI_API_KEY` and `GITHUB_TOKEN` configured in your environment.

---

Built 