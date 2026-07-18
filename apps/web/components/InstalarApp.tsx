'use client';
import { useEffect, useState } from 'react';
import Icono from './Icono';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

function esStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}
function detectarIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS reciente se identifica como Mac con pantalla táctil.
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
}

/**
 * Botón «Instalar app» en la barra superior — respaldo por si el navegador no
 * muestra su propio aviso de instalación en el móvil.
 * - Android / escritorio (Chrome/Edge): captura `beforeinstallprompt` y dispara el
 *   diálogo nativo de instalación.
 * - iOS (Safari): no existe ese diálogo → mostramos instrucciones para «Añadir a
 *   pantalla de inicio».
 * - Si la app ya está instalada (display-mode: standalone), no se muestra nada.
 */
export default function InstalarApp() {
  const [evento, setEvento] = useState<BIPEvent | null>(null);
  const [instalada, setInstalada] = useState(false);
  const [ios, setIos] = useState(false);
  const [guia, setGuia] = useState(false);

  useEffect(() => {
    if (esStandalone()) { setInstalada(true); return; }
    setIos(detectarIOS());
    const onBIP = (e: Event) => { e.preventDefault(); setEvento(e as BIPEvent); };
    const onInstalada = () => { setInstalada(true); setEvento(null); setGuia(false); };
    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalada);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalada);
    };
  }, []);

  if (instalada) return null;
  // Sin evento de instalación y sin ser iOS: el navegador no ofrece instalar (o ya
  // se instaló) → no mostramos el botón para no confundir.
  if (!evento && !ios) return null;

  async function instalar() {
    if (evento) {
      await evento.prompt();
      try { await evento.userChoice; } catch { /* el usuario cerró el diálogo */ }
      setEvento(null);
    } else {
      setGuia(true); // iOS: instrucciones manuales
    }
  }

  return (
    <>
      <button type="button" className="btn-consejos" onClick={instalar}
        title="Instalar la app en tu dispositivo" aria-label="Instalar la app">
        <Icono nombre="descarga" size={17} />
        <span className="bc-txt">Instalar app</span>
      </button>

      {guia && (
        <div role="dialog" aria-modal="true" aria-label="Cómo instalar la app"
          onClick={() => setGuia(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="tarjeta" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, width: '100%' }}>
            <h3 className="fila" style={{ gap: 8, marginTop: 0 }}>
              <Icono nombre="descarga" size={20} /> Instalar en iPhone o iPad
            </h3>
            <ol style={{ paddingLeft: 20, lineHeight: 1.6, margin: '8px 0' }}>
              <li>Abre esta página en <strong>Safari</strong> (en iPhone la instalación solo funciona ahí).</li>
              <li>Toca el botón <strong>Compartir</strong> (el cuadro con la flecha hacia arriba ↑) de la barra.</li>
              <li>Elige <strong>«Añadir a pantalla de inicio»</strong> y toca <strong>«Añadir»</strong>.</li>
            </ol>
            <p className="muted" style={{ fontSize: '.85rem', margin: '4px 0 12px' }}>
              La app queda como un ícono más y se abre a pantalla completa, sin la barra del navegador.
            </p>
            <button className="btn" type="button" onClick={() => setGuia(false)}>Entendido</button>
          </div>
        </div>
      )}
    </>
  );
}
