'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Avatar from './Avatar';
import Icono from './Icono';

/**
 * Subida de foto de perfil. Sube al bucket público 'avatares' en la carpeta
 * del usuario (avatares/<uid>/…) — la RLS solo permite la carpeta propia — y
 * guarda la URL en perfiles.avatar_url. Si no hay foto, Avatar muestra iniciales.
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
    if (!file.type.startsWith('image/')) { setError('Elegí un archivo de imagen.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('La imagen no debe superar 5 MB.'); return; }
    setError(null); setTrabajando(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setTrabajando(false); return; }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const ruta = `${user.id}/avatar.${ext}`;
    const up = await supabase.storage.from('avatares').upload(ruta, file, { upsert: true, contentType: file.type });
    if (up.error) { setError('No se pudo subir: ' + up.error.message); setTrabajando(false); return; }
    const { data: pub } = supabase.storage.from('avatares').getPublicUrl(ruta);
    const urlFinal = pub.publicUrl + '?t=' + Date.now();
    const upd = await supabase.from('perfiles').update({ avatar_url: urlFinal }).eq('id', user.id);
    if (upd.error) { setError('No se pudo guardar la foto: ' + upd.error.message); setTrabajando(false); return; }
    setUrl(urlFinal); setTrabajando(false); router.refresh();
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
