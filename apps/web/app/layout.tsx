import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

// Tipografía del rediseño «Claridad con calidez»: Inter para el cuerpo y Sora
// para titulares/cifras. Se descargan en build (next/font) — sin peticiones a
// Google en runtime — y se exponen como variables CSS para globals.css.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter', display: 'swap' });
const sora = Sora({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-sora', display: 'swap' });

export const metadata: Metadata = {
  title: 'Apoyo por Venezuela',
  description: 'Coordinación de equipos para la respuesta al terremoto de Venezuela.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0033A0',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // usa toda la pantalla en PWA; los env(safe-area-*) evitan el notch/gestos
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: el script de abajo puede fijar data-tema antes de
    // que React hidrate (preferencia guardada), y ese atributo no lo maneja React.
    <html lang="es" className={`${inter.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        {/* Aplica el tema guardado ANTES del primer pintado para que no parpadee.
            Sin preferencia guardada, queda el tema claro (el de :root). */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('uxv:tema')==='oscuro')document.documentElement.dataset.tema='oscuro'}catch(e){}" }} />
      </head>
      <body>{children}<Analytics /></body>
    </html>
  );
}
