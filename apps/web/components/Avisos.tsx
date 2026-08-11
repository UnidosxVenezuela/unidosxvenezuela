'use client';
// Avisos flotantes con **sileo** (hiaaryan/sileo).
//
// QUÉ CAMBIA Y QUÉ NO. El canal servidor→cliente sigue siendo el mismo: las Server
// Actions redirigen con `?ok=` / `?err=` (lib/flash.ts) y este componente los lee, los
// pinta y limpia la URL. Lo único que cambia es QUIÉN dibuja el aviso: antes un <div>
// propio animado con anime.js, ahora sileo.
//
// EL COSTE, DICHO EN VOZ ALTA: sileo arrastra `motion` (~780 KB en disco, bastante menos
// ya empaquetado) y, al ser un toast de cliente, el aviso **no aparece sin JavaScript** —
// antes sí, porque se renderizaba en el servidor a partir de la URL. Es una decisión
// tomada a sabiendas. Lo que NO se pierde: la acción de fondo sí se ejecuta igual sin JS
// (la redirección ocurre en el servidor); lo que falta es el cartelito de confirmación.
//
// LA LIMPIEZA DE LA URL ES DELICADA, y por eso sigue aquí y no en sileo: `celebrar` se
// borra en el MISMO viaje que `ok`/`err` para que haya UN SOLO escritor de la URL. Si lo
// limpiara también <CelebracionProveedor/>, este `replace` reviviría el parámetro y la
// celebración saldría dos veces.
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { sileo, Toaster } from 'sileo';
import { exito, error as sonidoError } from '@/lib/sonido';
import { PARAM_CELEBRACION } from '@/lib/celebraciones';

const VIDA_MS = 3500;

/** Monta el contenedor de sileo, siguiendo el tema de la app. */
export function ContenedorAvisos() {
  const [tema, setTema] = useState<'light' | 'dark'>('light');

  // El tema vive en `data-tema` de <html> (ver TemaToggle). Se lee al montar y se observa,
  // para que cambiarlo con un aviso en pantalla no deje el cartel del color anterior.
  useEffect(() => {
    const leer = () => setTema(document.documentElement.dataset.tema === 'oscuro' ? 'dark' : 'light');
    leer();
    const obs = new MutationObserver(leer);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
    return () => obs.disconnect();
  }, []);

  return (
    <Toaster
      position="bottom-right"
      theme={tema}
      // Se aparta del carril de los botones flotantes (--fab-hueco en globals.css), para
      // no taparlos ni ser tapado.
      offset={{ bottom: 'calc(20px + var(--fab-hueco, 0px))', right: '20px' }}
    />
  );
}

/** Lee ?ok= / ?err= de la URL, lo muestra con sileo y lo limpia. */
export default function Avisos() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const ok = params.get('ok');
    const err = params.get('err');
    if (!ok && !err) return;

    if (ok) {
      exito();
      sileo.success({ title: ok, duration: VIDA_MS });
    } else {
      sonidoError();
      // Los errores NO se auto-cierran: pueden necesitar leerse dos veces o actuarse.
      sileo.error({ title: err!, duration: null });
    }

    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.delete('ok'); sp.delete('err'); sp.delete(PARAM_CELEBRACION);
    router.replace(pathname + (sp.toString() ? '?' + sp.toString() : ''), { scroll: false });
  }, [params, pathname, router]);

  return null;
}
