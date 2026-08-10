// Bandeja de conversaciones (migración 0231).
// Lee `hilos_bandeja`, que corre con security_invoker = true: hereda la RLS de `hilos` y
// `hilo_mensajes`, así que aquí no hay ni un filtro de permisos escrito a mano.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AMBITOS_HILO, esAmbitoHilo } from '@/lib/hilos';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import EstadoVacio from '@/components/EstadoVacio';

export const dynamic = 'force-dynamic';

/** Título humano de cada fila: se resuelve por ámbito con una sola consulta por tabla. */
async function titulosDe(supabase: any, filas: any[]) {
  const porAmbito = (a: string) => filas.filter((f) => f.ambito === a).map((f) => f.ancla_id);
  const mapa = new Map<string, string>();

  const casos = porAmbito('caso');
  const insumos = porAmbito('insumo');
  const tareas = porAmbito('tarea');
  const grupos = porAmbito('grupo');

  const [c, i, t, g] = await Promise.all([
    casos.length ? supabase.from('casos').select('id, numero, titulo').in('id', casos) : { data: [] },
    insumos.length ? supabase.from('solicitudes_insumo').select('id, titulo').in('id', insumos) : { data: [] },
    tareas.length ? supabase.from('tareas').select('id, titulo').in('id', tareas) : { data: [] },
    grupos.length ? supabase.from('grupos').select('id, nombre').in('id', grupos) : { data: [] },
  ]);

  for (const x of (c.data ?? [])) mapa.set('caso:' + x.id, '#' + (x.numero ?? '—') + ' · ' + x.titulo);
  for (const x of (i.data ?? [])) mapa.set('insumo:' + x.id, 'Entrega · ' + x.titulo);
  for (const x of (t.data ?? [])) mapa.set('tarea:' + x.id, x.titulo);
  for (const x of (g.data ?? [])) mapa.set('grupo:' + x.id, x.nombre);
  return mapa;
}

export default async function ConversacionesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('hilos_bandeja')
    .select('id, ambito, ancla_id, ultimo_mensaje_en, mensajes_n, sin_leer, ultimo_autor, ultimo_cuerpo')
    .order('ultimo_mensaje_en', { ascending: false })
    .limit(100);

  // A prueba de fallos: si 0231 no está aplicada, se avisa y el resto de la app sigue.
  if (error) {
    return (
      <div>
        <h1 className="fila" style={{ gap: 8 }}><Icono nombre="conversacion" size={24} /> Conversaciones</h1>
        <div className="tarjeta">
          <p className="muted" style={{ margin: 0 }}>
            Las conversaciones todavía no están disponibles: falta aplicar la migración <code>0231</code>.
          </p>
        </div>
      </div>
    );
  }

  const filas = (data ?? []) as any[];
  const titulos = await titulosDe(supabase, filas);
  const totalSinLeer = filas.reduce((n, f) => n + Number(f.sin_leer ?? 0), 0);

  return (
    <div>
      <RealtimeRefrescar tabla="hilo_mensajes" />

      <div className="fila" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h1 className="fila" style={{ gap: 8, margin: 0 }}>
          <Icono nombre="conversacion" size={24} /> Conversaciones
        </h1>
        {totalSinLeer > 0 && <span className="pill pill-info">{totalSinLeer} sin leer</span>}
      </div>

      <p className="muted">
        Cada conversación cuelga de su solicitud, su derivación, su tarea o su grupo, y la lee
        exactamente quien ya tiene acceso a eso. No hay mensajes sueltos: por eso nada acaba
        en la conversación equivocada.
      </p>

      {filas.length === 0 ? (
        <EstadoVacio
          icono="conversacion"
          titulo="Todavía no hay conversaciones"
          texto="Entra a una solicitud, una tarea o tu grupo y escribe el primer mensaje. Aparecerá aquí."
        />
      ) : (
        <div className="tarjeta" style={{ padding: 0 }}>
          <ul className="hilo-bandeja">
            {filas.map((f) => {
              const ambito: string = String(f.ambito ?? '');
              const clave = ambito + ':' + f.ancla_id;
              const meta = esAmbitoHilo(ambito) ? AMBITOS_HILO[ambito] : null;
              const href = meta ? meta.ruta(f.ancla_id) : '/conversaciones';
              const sinLeer = Number(f.sin_leer ?? 0);
              return (
                <li key={f.id}>
                  <Link href={href} className="hilo-bandeja-fila">
                    <div className="hilo-bandeja-txt">
                      <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <strong>{titulos.get(clave) ?? 'Conversación'}</strong>
                        {sinLeer > 0 && <span className="pill pill-info">{sinLeer}</span>}
                      </div>
                      <div className="muted" style={{ fontSize: '.88rem' }}>
                        {f.ultimo_autor ? f.ultimo_autor + ': ' : ''}{f.ultimo_cuerpo ?? ''}
                      </div>
                    </div>
                    <span className="muted" style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}>
                      {f.ultimo_mensaje_en ? fechaHora(f.ultimo_mensaje_en) : ''}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
