import { RepositoryStatusPanel } from '@/components/repository-status';

/** Used only when a repository has no published pages, never for a missing slug. */
export function SyncingGuard({ owner, repo }: { owner: string; repo: string }) {
  return <RepositoryStatusPanel owner={owner} repo={repo} />;
}
