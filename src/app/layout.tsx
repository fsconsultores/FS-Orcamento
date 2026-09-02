import type { Metadata } from 'next';
import { Montserrat, Barlow } from 'next/font/google';
import { ChunkErrorReload } from '@/components/chunk-error-reload';
import './globals.css';

// Tipografia da marca (manual "Papelaria 2021"): Montserrat principal
// (títulos e UI em geral, ver fontFamily.sans em tailwind.config.ts), Barlow
// secundária (texto de apoio — ver classe utilitária `font-secondary`).
const montserrat = Montserrat({ subsets: ['latin'], variable: '--font-montserrat', display: 'swap' });
const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-barlow', display: 'swap' });

export const metadata: Metadata = {
  title: 'FS Consultores · Orçamentos',
  description: 'Sistema de orçamento de obras — fsconsultores',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} ${barlow.variable}`}>
      <body className="font-sans">
        <ChunkErrorReload />
        {children}
      </body>
    </html>
  );
}
