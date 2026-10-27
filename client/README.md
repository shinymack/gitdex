# GitDex client

Next.js App Router, Fumadocs, Tailwind CSS, assistant-ui, and Lucide. The landing page, reader, status pages, assistant, and icons share the forest/jade/sage identity.

## Setup

```sh
bun install
```

Create `client/.env` with these variables. Keep credentials server-side; never add a `NEXT_PUBLIC_` prefix to a token.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | API origin; local development uses `http://localhost:3001`. Production uses `https://gitdex-server.vercel.app`. |
| `GITHUB_TOKEN` | Read access to the documentation store, not the source repository. |
| `DOCS_REPO_OWNER` | Documentation store owner. Falls back to `GITHUB_USERNAME`. |
| `DOCS_REPO_NAME` | Documentation repository; defaults to `gitdex-docs`. |
| `DOCS_REPO_BRANCH` | Documentation branch; defaults to `main`. |

Use the same documentation destination on the API and client. No Google model key is needed in this package.

```sh
bun run dev
bun x tsc --noEmit
bun run build
bun run start
```

Run the development server in the `client` window of the `omp` tmux session. The default URL is `http://localhost:3000`.

## Reader and navigation

- The landing input accepts a GitHub repository root URL or `owner/repository`; it rejects file, branch, and issue URLs. Enter activates the selected repository suggestion or submits the input.
- Status and indexing requests use bounded, cancellable API proxies. Refresh is an explicit action and preserves the published guide while newer work runs.
- A reader request fetches a single documentation commit and reads its pages from that same commit. A store outage is distinct from a genuinely missing guide or slug.
- Generated files are compiled as Markdown, not executable MDX. Raw HTML is displayed literally. Mermaid is the trusted fenced-diagram component, with strict rendering; mathematics and GFM tables are supported.
- Search is scoped to the current repository’s guide. Source links preserve their text and point to validated GitHub source URLs.
- Missing pages use a real not-found state, without a reload loop or sample-repository redirect.

## Appearance and accessibility

First visit defaults to dark, independent of OS preference. The footer theme button stores the light/dark choice under `gitdex-theme`; docs and status use the same theme. The assistant opens only on request, supports Escape, and traps focus on mobile. Reduced motion and visible keyboard focus are respected.

`src/components/brand.tsx` contains the shared, custom three-stroke mark. App icon assets live under `src/app/`. The mark is drawn from simple SVG geometry; it is not an imported third-party icon or a claim of trademark clearance.

## Deployment checks

Deploy the `gitdex` Vercel project with root directory `client`, using Bun installation and `bun run build`. Check the production landing page in both themes and at mobile width, repository entry, status, a real guide, scoped search, source links, assistant output, missing slugs, and app icons. A successful build alone does not establish that the configured API, GitHub store, or model is reachable.
