'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { subirAvatar } from '@/app/(app)/perfil/actions';
import Avatar from './Avatar';
import Icono from './Icono';

/**
 * Subida de foto de perfil. El archivo se sube en el servidor con la service
 * key (Server Action subirAvatar) al bucket público 'avatares' en la carpeta
 * del usuario (avatares/<uid>/…) y se guarda la URL en perfiles.avatar_url.
 * Así no depende de que estén creadas las policies de Storage. Si no hay foto,
 * Avatar muestra las iniciales.
 */
export default function SubirAvatar({ nombre, urlActual }: { nombre?: string | null; urlActual?: string | null }) {
  const [url, setUrl] = useState<string | null>(urlActual ?? null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Elige un archivo de imagen.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('La imagen no debe superar 5 MB.'); return; }
    setError(null); setTrabajando(true);
    const fd = new FormData();
    fd.set('file', file);
    const res = await subirAvatar(fd);   // sube con la service key (sin depender de la RLS de Storage)
    if (res.error) { setError(res.error); setTrabajando(false); return; }
    setUrl(res.url ?? null); setTrabajando(false); router.refresh();
  }

  async function quitar() {
    setTrabajando(true); setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setTrabajando(false); return; }
    const upd = await supabase.from('perfiles').update({ avatar_url: null }).eq('id', user.id);
    if (upd.error) { setError(upd.error.message); setTrabajando(false); return; }
    setUrl(null); setTrabajando(false); router.refresh();
  }

  return (
    <div className="fila" style={{ gap: 16, alignItems: 'center' }}>
      <Avatar nombre={nombre} url={url} size={72} />
      <div>
        <input ref={input} type="file" accept="image/*" onChange={elegir} style={{ display: 'none' }} />
        <div className="fila">
          <button type="button" className="btn" onClick={() => input.current?.click()} disabled={trabajando}>
            <Icono nombre="imagen" size={16} /> {trabajando ? 'Subiendo…' : (url ? 'Cambiar foto' : 'Subir foto')}
          </button>
          {url && <button type="button" className="btn" onClick={quitar} disabled={trabajando}>Quitar</button>}
        </div>
        <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>JPG o PNG, hasta 5 MB.</p>
        {error && <p className="error" style={{ marginTop: 6 }}>{error}</p>}
      </div>
    </div>
  );
}
