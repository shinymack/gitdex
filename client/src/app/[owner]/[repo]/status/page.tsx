import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { RepositoryStatusPanel } from '@/components/repository-status';

export default async function StatusPage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-border px-6 py-5">
        <Brand />
        <ThemeToggle />
      </header>
      <RepositoryStatusPanel owner={owner} repo={repo} />
    </main>
  );
}
