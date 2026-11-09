import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { ThemeProvider, themeInitScript } from '@/components/ThemeProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Admin · Hisobchi Go', template: '%s · Admin · Hisobchi Go' },
  description: 'Hisobchi Go platforma egalari uchun admin panel (faqat o\'qish).',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0f1a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={inter.variable} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body className="min-h-dvh font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
