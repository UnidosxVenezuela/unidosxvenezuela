'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { exito, error as sonidoError } from '@/lib/sonido';
import Icono from './Icono';

/** Lee ?ok= / ?err= de la URL, muestra un aviso flotante y lo cierra solo. */
export default function Toast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'err' } | null>(null);

  // Detectar ?ok=/?err= y limpiarlo de la URL (sin afectar el temporizador).
  useEffect(() => {
    const ok = params.get('ok');
    const err = params.get('err');
    if (!ok && !err) return;
    setAviso({ texto: (ok || err)!, tipo: ok ? 'ok' : 'err' });
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.delete('ok'); sp.delete('err');
    router.replace(pathname + (sp.toString() ? '?' + sp.toString() : ''), { scroll: false });
  }, [params, pathname, router]);

  // Auto-cierre + sonido: temporizador atado al aviso, no a la URL.
  useEffect(() => {
    if (!aviso) return;
    if (aviso.tipo === 'ok') exito(); else sonidoError();
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  if (!aviso) return null;
  return (
    <div className={'toast toast-' + aviso.tipo} role="status" onClick={() => setAviso(null)} title="Toca para cerrar">
      <span className="toast-ico"><Icono nombre={aviso.tipo === 'ok' ? 'ok' : 'avisos'} size={18} /></span>
      <span className="toast-txt">{aviso.texto}</span>
      <span className="toast-x" aria-hidden="true"><Icono nombre="cerrar" size={15} /></span>
    </div>
  );
}
