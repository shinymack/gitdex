import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

export default async function Layout({ children }: LayoutProps) {
  return <div className='font-serif'>
    {children};
    </div>
}