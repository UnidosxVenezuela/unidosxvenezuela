// Conversación general de la organización (migración 0235).
// Es el único hilo sin entidad detrás, así que necesita su propia página: desde la
// bandeja hay que poder abrirlo a pantalla completa como cualquier otro.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AMBITOS_HILO, type MensajeHilo } from '@/lib/hilos';
import Icono from '@/components/Icono';
import HiloEnVivo from '@/components/HiloEnVivo';

export const dynamic = 'force-dynamic';

/** Centinela del ámbito general (0235): la conversación no cuelga de ninguna entidad. */
const CENTINELA = '00000000-0000-0000-0000-000000000000';

export default async function GeneralPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const meta = AMBITOS_HILO.general;

  const { data: hilo, error } = await supabase
    .from('hilos').select('id').eq('ambito', 'general').maybeSingle();

  if (error) {
    return (
      <div style={{ maxWidth: 780 }}>
        <h1 className="fila" style={{ gap: 8 }}><Icono nombre="conversacion" size={24} /> {meta.titulo}</h1>
        <div className="tarjeta">
          <p className="muted" style={{ margin: 0 }}>
            La conversación general todavía no está disponible: falta aplicar la migración <code>0235</code>.
          </p>
        </div>
      </div>
    );
  }

  const hiloId: string | null = hilo?.id ?? null;

  const [{ data: msgs }, { data: parts }, { data: perfil }] = await Promise.all([
    hiloId
      ? supabase.from('hilo_mensajes')
          .select('id, hilo_id, autor_id, autor_sello, cuerpo, pii_alerta, sticker, editado_en, creado_en')
          .eq('hilo_id', hiloId).order('creado_en', { ascending: true }).limit(300)
      : Promise.resolve({ data: [] as any[] }),
    hiloId
      ? supabase.from('hilo_participantes')
          .select('perfil_id, perfiles ( nombre_completo )').eq('hilo_id', hiloId)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle(),
  ]);

  const mensajes = (msgs ?? []) as MensajeHilo[];

  return (
    <div style={{ maxWidth: 780 }}>
      <Link href="/conversaciones" className="muted">← Conversaciones</Link>
      <h1 className="fila" style={{ gap: 8, marginTop: 8 }}>
        <Icono nombre="conversacion" size={24} /> {meta.titulo}
      </h1>
      <p className="muted" style={{ marginTop: -4 }}>{meta.quienLee}</p>

      {/* El recordatorio va aquí y no en las demás conversaciones a propósito: este es el
          único sitio de la plataforma donde escribe todo el mundo, y por tanto el único
          donde «lo pegué en el grupo equivocado» vuelve a ser posible. */}
      <div className="tarjeta" style={{ background: 'var(--pill-aviso-bg)', color: 'var(--pill-aviso-fg)' }}>
        <p style={{ margin: 0, fontSize: '.9rem' }}>
          <Icono nombre="avisos" size={15} />{' '}
          Aquí te lee <strong>toda la organización</strong>. Lo que sea de una solicitud
          concreta —direcciones, teléfonos, nombres de familias— va en la conversación de
          esa solicitud, donde solo entra quien debe.
        </p>
      </div>

      <div className="tarjeta">
        <HiloEnVivo
          hiloId={hiloId}
          ambito="general"
          anclaId={CENTINELA}
          mensajesIniciales={mensajes}
          miId={user.id}
          puedeEscribir={perfil?.rol !== 'observador'}
          participantes={((parts ?? []) as any[])
            .filter((p) => p.perfil_id !== user.id)
            .map((p) => ({ id: p.perfil_id as string, nombre: (p.perfiles?.nombre_completo as string) || 'Alguien' }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))}
          vacio={meta.vacio}
        />
      </div>
    </div>
  );
}
