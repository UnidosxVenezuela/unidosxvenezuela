'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ETIQUETA_ROL } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import Avatar from './Avatar';
import Icono from './Icono';

/** Chip de usuario en la barra superior: avatar + nombre + rol + menú (Perfil / Salir). */
export default function UserChip({ nombre, rol, email, avatarUrl }: {
  nombre: string; rol?: string | null; email?: string | null; avatarUrl?: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const ruta = usePathname();

  useEffect(() => {
    if (!abierto) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [abierto]);
  useEffect(() => { setAbierto(false); }, [ruta]);

  const rolEtq = rol ? (ETIQUETA_ROL[rol as Rol] ?? rol) : '';

  async function salir() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="user-chip" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        <Avatar nombre={nombre || email} url={avatarUrl} size={32} />
        <span className="uc-textos">
          <span className="uc-nombre">{nombre || email}</span>
          {rolEtq && <span className="uc-rol">{rolEtq}</span>}
        </span>
        <Icono nombre="chevron" size={16} />
      </button>
      {abierto && (
        <div role="menu" className="user-menu">
          <div className="um-cabecera">
            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre || email}</div>
            {email && nombre && <div className="muted" style={{ fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>}
          </div>
          <Link href="/perfil" onClick={() => setAbierto(false)}><Icono nombre="usuario" size={16} /> Mi perfil</Link>
          <button onClick={salir}><Icono nombre="salir" size={16} /> Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}
