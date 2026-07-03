'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

const FOCO = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Panel lateral modal accesible. Al abrir mueve el foco adentro, cierra con
 * Escape (navega a `cerrarHref`), atrapa el Tab dentro del panel y restaura el
 * foco al elemento previo al cerrarse. El contenido puede ser un Server
 * Component pasado como children (solo el cromo es cliente).
 */
export default function DrawerModal({ cerrarHref, etiqueta, children }: {
  cerrarHref: string; etiqueta: string; children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const router = useRouter();

  useEffect(() => {
    const cont = ref.current;
    if (!cont) return;
    const previo = document.activeElement as HTMLElement | null;
    // Foco al primer elemento interactivo (o al panel).
    const primerFoco = cont.querySelector<HTMLElement>(FOCO);
    (primerFoco ?? cont).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); router.push(cerrarHref); return; }
      if (e.key !== 'Tab') return;
      const foco = Array.from(cont.querySelectorAll<HTMLElement>(FOCO)).filter((el) => el.offsetParent !== null);
      if (foco.length === 0) return;
      const primero = foco[0]!;
      const ultimo = foco[foco.length - 1]!;
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      try { previo?.focus?.(); } catch { /* el disparador pudo desaparecer al navegar */ }
    };
  }, [cerrarHref, router]);

  return (
    <aside ref={ref} className="drawer-lateral" role="dialog" aria-modal="true" aria-label={etiqueta} tabIndex={-1}>
      {children}
    </aside>
  );
}
