import { create } from 'zustand';
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

export const useDocsStore = create<DocsStore>()((set, get) => ({
  cache: {},
  
  getDocs: async (owner, repo) => {
    const key = `${owner}/${repo}`;
    const now = Date.now();
    const cached = get().cache[key];
    
    if (cached && now - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

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
  clearCacheFor: (owner, repo) =>
    set((state) => {
      const next = { ...state.cache };
      delete next[`${owner}/${repo}`];
      return { cache: next };
    }),
}));