'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Lee ?ok= / ?err= de la URL, muestra un aviso flotante y limpia el parámetro. */
export default function Toast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    const ok = params.get('ok');
    const err = params.get('err');
    if (!ok && !err) return;
    setAviso({ texto: (ok || err)!, tipo: ok ? 'ok' : 'err' });
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.delete('ok'); sp.delete('err');
    router.replace(pathname + (sp.toString() ? '?' + sp.toString() : ''), { scroll: false });
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [params, pathname, router]);

  if (!aviso) return null;
  return <div className={'toast toast-' + aviso.tipo} role="status">{aviso.texto}</div>;
}
