# 🖥️ GitDex Client

**The interactive documentation viewer and chat assistant client for GitDex.**

This application serves as the frontend for GitDex. It renders codebase documentation as beautiful, searchable Fumadocs pages and houses the interactive chatbot that lets users converse directly with the repository content.

---

## ⚡ Key Technologies

* **Framework**: Next.js (App Router, dynamic generation)
* **Styling**: Tailwind CSS
* **Docs Engine**: Fumadocs UI (for MDX rendering and page hierarchy)
* **Chat UI**: assistant-ui (with tailwind overrides)
* **Icons**: Lucide React
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
GITHUB_USERNAME=your_github_username
GITHUB_TOKEN=your_github_personal_access_token
NEXT_PUBLIC_API_URL=http://localhost:3001
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
```

### 3. Run Development Server
```bash
bun run dev
```

### 4. Build for Production
```bash
bun run build
bun run start
```

Open [http://localhost:3000](http://localhost:3000) to view the client.
