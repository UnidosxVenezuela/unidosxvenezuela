import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

export const metadata: Metadata = {
  title: 'UnidosXVenezuela',
  description: 'Coordinación de equipos para la respuesta al terremoto de Venezuela.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0033A0',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}<Analytics /></body>
    </html>
  );
}
