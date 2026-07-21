import Link from 'next/link';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { hrefSeguro } from '@/lib/constantes';
import { guardarWhatsappGrupo } from './actions';

export const metadata = { title: 'Ajustes' };

/** Configuración global editable por el administrador general (0188). Primer ajuste:
 *  el link del grupo de WhatsApp al que Envío a Redacción manda la info de un caso. */
export default async function AdminAjustesPage() {
  const { perfil } = await requireCoordinacion();
  const esAdmin = perfil?.rol === 'admin';
  const supabase = await createClient();
  // Best-effort: si 0188 aún no está aplicada, la consulta vuelve vacía y no rompe.
  const { data: aj } = await supabase.from('ajustes_app').select('valor').eq('clave', 'whatsapp_grupo_difusion').maybeSingle();
  const actual = (aj as any)?.valor ?? '';
  const actualHref = hrefSeguro(actual);

  return (
    <div>
      <Link href="/admin/usuarios" className="muted">← Administración</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Ajustes</h1>
          <p className="muted sub">Configuración global de la plataforma.</p>
        </div>
      </div>

      <div className="tarjeta" style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>📲 Grupo de WhatsApp de Redacción</h2>
        <p className="muted" style={{ fontSize: '.88rem' }}>
          El link del grupo al que <strong>Envío a Redacción</strong> manda la información de un caso con el botón «Enviar a WhatsApp». Pega el enlace de invitación del grupo (<code>chat.whatsapp.com/…</code>).
        </p>
        {esAdmin ? (
          <form action={guardarWhatsappGrupo}>
            <div className="campo">
              <label>Link del grupo (vacío = quitar)</label>
              <input name="valor" className="input" defaultValue={actual} placeholder="https://chat.whatsapp.com/…" inputMode="url" />
            </div>
            <button className="btn btn-primario">Guardar</button>
          </form>
        ) : (
          <div>
            <div className="muted" style={{ fontSize: '.82rem', marginBottom: 6 }}>Solo un administrador general puede cambiarlo.</div>
            {actualHref
              ? <a href={actualHref} target="_blank" rel="noopener noreferrer">{actual}</a>
              : <span className="muted">— sin configurar —</span>}
          </div>
        )}
      </div>
    </div>
  );
}
