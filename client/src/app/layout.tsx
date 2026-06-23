import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from 'next-themes';
import { RootProvider } from 'fumadocs-ui/provider';
import { MozillaHeadline, MozillaText } from './fonts';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'GitDex - AI-Powered Documentation for GitHub Repositories',
  description: 'Transform any GitHub repository into beautiful, interactive documentation in seconds',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon.png',
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
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <RootProvider
            search={{
              enabled: false 
            }}>
            {children}
            <Toaster />
          </RootProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}