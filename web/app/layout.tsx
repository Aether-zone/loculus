import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'loculus',
  description: 'Somewhere to put things.',
};

/**
 * Applies the remembered theme before the first paint.
 *
 * kosmos's `useTheme` writes the choice to `localStorage` and puts `dark` on
 * `<html>` from an effect — which is one paint too late, and shows a white
 * flash to anyone who chose dark. This runs synchronously in the document head
 * instead, reading the same key with the same meaning ('system' follows the OS).
 * Keep the key in step with the `storageKey` passed to `useTheme`.
 */
const applyTheme = `
try {
  var choice = localStorage.getItem('kosmos-theme') || 'system';
  var dark = choice === 'dark' || (choice === 'system' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch (_) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyTheme }} />
      </head>
      <body className="bg-background text-foreground">{children}</body>
    </html>
  );
}
