import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cofre de Senhas',
  description: 'Gerenciador de senhas da equipe',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
