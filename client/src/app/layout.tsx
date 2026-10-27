import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from 'next-themes';
import { RootProvider } from 'fumadocs-ui/provider';
import { MozillaHeadline, MozillaText } from './fonts';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: { default: 'GitDex — A field guide to your code', template: '%s | GitDex' },
  description: 'Explore public GitHub repositories through source-grounded documentation, architecture diagrams, and code-aware answers.',
  applicationName: 'GitDex',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/favicon.ico' }],
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={` ${MozillaHeadline.variable} ${MozillaText.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          storageKey="gitdex-theme"
          disableTransitionOnChange
        >
          <RootProvider theme={{ enabled: false }} search={{ enabled: false }}>
            {children}
            <Toaster />
          </RootProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}