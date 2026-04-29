import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Orçamento FS',
  description: 'Sistema de orçamento de obras',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
