// Conversación anclada a una entidad (migración 0231).
// Server Component: lee con la RLS de quien mira. Si esa persona no puede leer el ancla,
// la consulta devuelve cero filas y el bloque no se pinta — no hace falta comprobar
// permisos aquí, y por eso no se comprueban dos veces.
//
// A prueba de fallos: si la migración 0231 todavía no está aplicada, las consultas
// fallan, todo degrada a vacío y la página sigue funcionando.
import { createClient } from '@/lib/supabase/server';
import { AMBITOS_HILO, type AmbitoHilo, type MensajeHilo } from '@/lib/hilos';
import Icono from './Icono';
import HiloEnVivo from './HiloEnVivo';

export default async function Hilo({
  ambito,
  anclaId,
  titulo,
}: {
  ambito: AmbitoHilo;
  anclaId: string;
  /** Sobrescribe el título por defecto del ámbito. */
  titulo?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = AMBITOS_HILO[ambito];

  // ¿Puede siquiera ver esta conversación? Se pregunta a la base, que es quien sabe.
  const { data: puedeLeer } = await supabase.rpc('puede_leer_ancla', {
    p_ambito: ambito,
    p_ancla: anclaId,
  });
  if (!puedeLeer) return null;

  const { data: hilo } = await supabase
    .from('hilos')
    .select('id')
    .eq('ambito', ambito)
    .eq('ancla_id', anclaId)
    .maybeSingle();

  const hiloId: string | null = hilo?.id ?? null;

  const [{ data: mensajesData }, { data: partData }, { data: perfil }] = await Promise.all([
    hiloId
      ? supabase
          .from('hilo_mensajes')
          .select('id, hilo_id, autor_id, autor_sello, cuerpo, pii_alerta, sticker, editado_en, creado_en')
          .eq('hilo_id', hiloId)
          .order('creado_en', { ascending: true })
          .limit(300)
      : Promise.resolve({ data: [] as any[] }),
    hiloId
      ? supabase
          .from('hilo_participantes')
          .select('perfil_id, perfiles ( nombre_completo )')
          .eq('hilo_id', hiloId)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle(),
  ]);

  const mensajes = (mensajesData ?? []) as MensajeHilo[];

  // El observador lee y no escribe (doctrina 0009). La base lo vuelve a comprobar en la
  // RPC; esto solo evita pintar un redactor que no funcionaría.
  const puedeEscribir = perfil?.rol !== 'observador';

  const participantes = ((partData ?? []) as any[])
    .filter((p) => p.perfil_id !== user.id)
    .map((p) => ({
      id: p.perfil_id as string,
      nombre: (p.perfiles?.nombre_completo as string) || 'Alguien',
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <section className="hilo-bloque">
      <h2 className="fila" style={{ gap: 6 }}>
        <Icono nombre="conversacion" size={20} />
        {titulo ?? meta.titulo}
        {mensajes.length > 0 && <span className="muted" style={{ fontWeight: 400 }}>({mensajes.length})</span>}
      </h2>
      <p className="muted" style={{ marginTop: -4, fontSize: '.88rem' }}>{meta.quienLee}</p>

      <div className="tarjeta">
        <HiloEnVivo
          hiloId={hiloId}
          ambito={ambito}
          anclaId={anclaId}
          mensajesIniciales={mensajes}
          miId={user.id}
          puedeEscribir={puedeEscribir}
          participantes={participantes}
          vacio={meta.vacio}
        />
      </div>
    </section>
  );
}
