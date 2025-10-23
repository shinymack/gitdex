import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getGithubDocs, type DocsStructure } from './github';

interface DocsCache {
  [key: string]: {
    data: DocsStructure;
    timestamp: number;
  };
}

interface DocsStore {
  cache: DocsCache;
  getDocs: (owner: string, repo: string) => Promise<DocsStructure>;
  clearCache: () => void;
  clearCacheFor: (owner: string, repo: string) => void;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export const useDocsStore = create<DocsStore>()(
  persist(
    (set, get) => ({
      cache: {},
      
      getDocs: async (owner: string, repo: string) => {
            const key = `${owner}/${repo}`;
            const now = Date.now();

            // On the server, always fetch fresh data (do not rely on persisted localStorage)
            if (typeof window === 'undefined') {
              const data = await getGithubDocs(owner, repo);
              set((state) => ({
                cache: {
                  ...state.cache,
                  [key]: { data, timestamp: now },
                },
              }));
              return data;
            }

            const cached = get().cache[key];
            if (cached && now - cached.timestamp < CACHE_TTL) {
              return cached.data;
            }

            // Always fetch fresh if not cached or cache expired
            const data = await getGithubDocs(owner, repo);
            set((state) => ({
              cache: {
                ...state.cache,
                [key]: { data, timestamp: now },
              },
            }));
            return data;
      },
      
      clearCache: () => set({ cache: {} }),
      clearCacheFor: (owner: string, repo: string) =>
        set((state) => {
          const key = `${owner}/${repo}`;
          const next = { ...state.cache };
          delete next[key];
          return { cache: next };
        }),
    }),
    {
      name: 'docs-cache',
    }
  )
);