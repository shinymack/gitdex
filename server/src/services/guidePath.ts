type TreeEntry = { path?: string; type?: string };

/** Resolve a repository's exact storage directory without combining case variants. */
export function resolveGuideRoot(tree: readonly TreeEntry[], owner: string, repo: string): string | null {
  const requestedRoot = `docs/${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const roots = new Set<string>();
  for (const entry of tree) {
    const path = entry.path;
    if (!path?.startsWith('docs/')) continue;
    const candidate = path.slice(0, requestedRoot.length);
    if (candidate.toLowerCase() !== requestedRoot) continue;
    if (path.length === requestedRoot.length ? entry.type !== 'tree' : path[requestedRoot.length] !== '/') continue;
    roots.add(`${candidate}/`);
  }
  if (roots.size > 1) throw new Error('Ambiguous published documentation directories differ only by case.');
  return roots.values().next().value ?? null;
}
