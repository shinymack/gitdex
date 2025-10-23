// import type { Metadata } from "next";
// import "./globals.css";
// import "nextra-theme-docs/style.css";
// import { InterFont } from "./fonts";
// import { RootProvider } from 'fumadocs-ui/provider';


// export const metadata: Metadata = {
//   title: 'GitDex - Documentation for GitHub Repositories',
//   description: 'Generate and explore documentation for any GitHub repository',
// };

// export default function RootLayout({
//   children,
// }: {
//   children: React.ReactNode;
// }) {

//   return (
//     <html suppressHydrationWarning>
//       <body className={`${InterFont} antialiased`}>
//         <div className="min-h-screen bg-background font-sans antialiased">
//           {/* <Navbar></Navbar> */}
//           <div className="flex-1">
//             <RootProvider>{children}</RootProvider>
//           </div>
//         </div>
//       </body>
//     </html>
//   );
// }

// app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from 'next-themes';
import { RootProvider } from 'fumadocs-ui/provider';
import { MozillaHeadline, MozillaText } from './fonts';

export const metadata: Metadata = {
  title: 'GitDex - AI-Powered Documentation for GitHub Repositories',
  description: 'Transform any GitHub repository into beautiful, interactive documentation in seconds',
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
              enabled: false,
            }}>
            {children}
          </RootProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}