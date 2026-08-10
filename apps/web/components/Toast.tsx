'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { animate, createSpring } from 'animejs';
import { exito, error as sonidoError } from '@/lib/sonido';
import { sinMovimiento } from '@/lib/anime';
import { PARAM_CELEBRACION } from '@/lib/celebraciones';
import Icono from './Icono';
import CheckDibujado from './CheckDibujado';

const VIDA_MS = 3500;   // cuánto dura visible un aviso de éxito antes de auto-cerrarse
const ARRASTRE_CIERRE = 72;   // px hacia la derecha que descartan el aviso

/** Lee ?ok= / ?err= de la URL, muestra un aviso flotante y lo cierra solo. */
export default function Toast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'err' } | null>(null);
  const [reduce, setReduce] = useState(false);
  const toastRef = useRef<HTMLDivElement>(null);
  const barraRef = useRef<HTMLSpanElement>(null);
  const cerrando = useRef(false);
  const arrastre = useRef<{ x0: number; dx: number; activo: boolean }>({ x0: 0, dx: 0, activo: false });
  const [pausado, setPausado] = useState(false);

  useEffect(() => { setReduce(sinMovimiento()); }, []);

  // Detectar ?ok=/?err= y limpiarlo de la URL (sin afectar el temporizador).
  useEffect(() => {
    const ok = params.get('ok');
    const err = params.get('err');
    if (!ok && !err) return;
    cerrando.current = false;
    setAviso({ texto: (ok || err)!, tipo: ok ? 'ok' : 'err' });
    // `celebrar` se borra AQUÍ a propósito: es el mismo viaje de vuelta y así
    // hay UN SOLO escritor de la URL. Si lo limpiara también <CelebracionProveedor/>,
    // este `replace` (que lleva su propia foto de los parámetros) lo revivirá y la
    // celebración saldría dos veces. Ver la cabecera de CelebracionProveedor.tsx.
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.delete('ok'); sp.delete('err'); sp.delete(PARAM_CELEBRACION);
    router.replace(pathname + (sp.toString() ? '?' + sp.toString() : ''), { scroll: false });
  }, [params, pathname, router]);

  // Salida suave: se va más rápido que como entró (Emil: exit < enter). Con
  // `reduced-motion` solo se desvanece (sin desplazamiento).
  // `haciaFuera` sale por la derecha: es el final natural de un descarte por gesto.
  const cerrar = (haciaFuera = false) => {
    if (cerrando.current) { setAviso(null); return; }
    cerrando.current = true;
    const el = toastRef.current;
    if (!el) { setAviso(null); return; }
    animate(el, {
      opacity: [1, 0],
      ...(reduce ? {} : haciaFuera ? { translateX: [arrastre.current.dx, 340] } : { translateY: [0, 10] }),
      duration: reduce ? 140 : haciaFuera ? 220 : 180,
      ease: 'inQuad',
      onComplete: () => setAviso(null),
    });
  };

  // Entrada con resorte en vez de una curva fija. Es lo que hace que un aviso «aterrice»
  // en lugar de aparecer: la idea viene de sileo (hiaaryan/sileo), que la resuelve con
  // un muelle de rebote bajo. Aquí se hace con anime.js, que ya es dependencia del
  // proyecto, en vez de sumar `motion` — este es el mismo parque de teléfonos donde las
  // celebraciones en vídeo ya no cargan.
  useEffect(() => {
    if (!aviso || reduce) return;
    const el = toastRef.current;
    if (!el) return;
    const a = animate(el, {
      opacity: [0, 1],
      translateY: [14, 0],
      scale: [0.96, 1],
      duration: 520,
      ease: createSpring({ stiffness: 130 }),
    });
    return () => { a.revert(); };
  }, [aviso, reduce]);

  // Sonido + auto-cierre (solo éxito) + barra de progreso que se agota.
  // El temporizador se PAUSA mientras el puntero está encima o mientras se arrastra:
  // que un aviso se cierre justo cuando lo estás leyendo es la queja de siempre.
  useEffect(() => {
    if (!aviso) return;
    if (aviso.tipo === 'ok') exito(); else sonidoError();
    // El éxito se auto-cierra; el error NO (puede necesitar leerse o actuarse).
    if (aviso.tipo !== 'ok') return;
    if (pausado) return;
    let barra: ReturnType<typeof animate> | null = null;
    if (!reduce && barraRef.current) {
      barra = animate(barraRef.current, { scaleX: [1, 0], duration: VIDA_MS, ease: 'linear' });
    }
    const t = setTimeout(() => cerrar(false), VIDA_MS);
    return () => { clearTimeout(t); if (barra) barra.revert(); };
  }, [aviso, reduce, pausado]);

  // Descarte por gesto: se arrastra hacia la derecha y se suelta. Si no llega al umbral,
  // vuelve a su sitio con el mismo muelle. Solo con puntero fino o táctil; el teclado
  // cierra con Escape y con el botón, que siguen ahí.
  const alBajar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    arrastre.current = { x0: e.clientX, dx: 0, activo: true };
    setPausado(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!arrastre.current.activo) return;
    const dx = Math.max(0, e.clientX - arrastre.current.x0);   // solo hacia la derecha
    arrastre.current.dx = dx;
    const el = toastRef.current;
    if (el) {
      el.style.transform = 'translateX(' + dx + 'px)';
      el.style.opacity = String(Math.max(0.35, 1 - dx / (ARRASTRE_CIERRE * 2.4)));
    }
  };
  const alSoltar = () => {
    if (!arrastre.current.activo) return;
    const dx = arrastre.current.dx;
    arrastre.current.activo = false;
    if (dx >= ARRASTRE_CIERRE) { cerrar(true); return; }
    const el = toastRef.current;
    if (el) {
      el.style.opacity = '';
      animate(el, { translateX: [dx, 0], duration: 420, ease: createSpring({ stiffness: 150 }) });
    }
    // `dx` NO se pone a cero aquí: el `click` llega DESPUÉS del `pointerup`, y si ya
    // valiera cero, un arrastre que volvió a su sitio acabaría cerrando el aviso igual
    // —el gesto diría «me lo quedo» y el resultado sería el contrario—. Lo limpia el
    // propio onClick tras decidir.
    setPausado(false);
  };

  if (!aviso) return null;
  return (
    <div ref={toastRef} className={'toast toast-' + aviso.tipo}
      role={aviso.tipo === 'ok' ? 'status' : 'alert'}
      aria-live={aviso.tipo === 'ok' ? 'polite' : 'assertive'}
      onClick={() => { const hubo = arrastre.current.dx >= 4; arrastre.current.dx = 0; if (!hubo) cerrar(false); }}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => { if (!arrastre.current.activo) setPausado(false); }}
      title="Toca para cerrar, o deslízalo a la derecha">
      <span className="toast-ico">{aviso.tipo === 'ok' ? <CheckDibujado size={18} /> : <Icono nombre="avisos" size={18} />}</span>
      <span className="toast-txt">{aviso.texto}</span>
      <span className="toast-x" aria-hidden="true"><Icono nombre="cerrar" size={15} /></span>
      {aviso.tipo === 'ok' && !reduce && <span className="toast-barra" ref={barraRef} aria-hidden="true" />}
    </div>
  );
}
