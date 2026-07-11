'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { animate } from 'animejs';
import { exito, error as sonidoError } from '@/lib/sonido';
import { sinMovimiento } from '@/lib/anime';
import Icono from './Icono';

const VIDA_MS = 3500; // cuánto dura visible un aviso de éxito antes de auto-cerrarse

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

  useEffect(() => { setReduce(sinMovimiento()); }, []);

  // Detectar ?ok=/?err= y limpiarlo de la URL (sin afectar el temporizador).
  useEffect(() => {
    const ok = params.get('ok');
    const err = params.get('err');
    if (!ok && !err) return;
    cerrando.current = false;
    setAviso({ texto: (ok || err)!, tipo: ok ? 'ok' : 'err' });
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.delete('ok'); sp.delete('err');
    router.replace(pathname + (sp.toString() ? '?' + sp.toString() : ''), { scroll: false });
  }, [params, pathname, router]);

  // Salida suave: se va más rápido que como entró (Emil: exit < enter). Con
  // `reduced-motion` solo se desvanece (sin desplazamiento).
  const cerrar = () => {
    if (cerrando.current) { setAviso(null); return; }
    cerrando.current = true;
    const el = toastRef.current;
    if (!el) { setAviso(null); return; }
    animate(el, {
      opacity: [1, 0],
      ...(reduce ? {} : { translateY: [0, 10] }),
      duration: reduce ? 140 : 180,
      ease: 'inQuad',
      onComplete: () => setAviso(null),
    });
  };

  // Sonido + auto-cierre (solo éxito) + barra de progreso que se agota.
  useEffect(() => {
    if (!aviso) return;
    if (aviso.tipo === 'ok') exito(); else sonidoError();
    // El éxito se auto-cierra; el error NO (puede necesitar leerse o actuarse).
    if (aviso.tipo !== 'ok') return;
    let barra: ReturnType<typeof animate> | null = null;
    if (!reduce && barraRef.current) {
      barra = animate(barraRef.current, { scaleX: [1, 0], duration: VIDA_MS, ease: 'linear' });
    }
    const t = setTimeout(cerrar, VIDA_MS);
    return () => { clearTimeout(t); if (barra) barra.revert(); };
  }, [aviso, reduce]);

  if (!aviso) return null;
  return (
    <div ref={toastRef} className={'toast toast-' + aviso.tipo}
      role={aviso.tipo === 'ok' ? 'status' : 'alert'}
      aria-live={aviso.tipo === 'ok' ? 'polite' : 'assertive'}
      onClick={cerrar} title="Toca para cerrar">
      <span className="toast-ico"><Icono nombre={aviso.tipo === 'ok' ? 'ok' : 'avisos'} size={18} /></span>
      <span className="toast-txt">{aviso.texto}</span>
      <span className="toast-x" aria-hidden="true"><Icono nombre="cerrar" size={15} /></span>
      {aviso.tipo === 'ok' && !reduce && <span className="toast-barra" ref={barraRef} aria-hidden="true" />}
    </div>
  );
}
