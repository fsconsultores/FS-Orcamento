import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'fsconsultores · Orçamentos',
  description: 'Sistema de orçamento de obras — fsconsultores',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
