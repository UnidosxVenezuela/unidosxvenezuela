import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Mapa from '@/components/Mapa';
import type { PuntoAcopio } from '@unidos/types';

export default async function MapaPage() {
  await requireUsuario();
  const supabase = await createClient();

  const [{ data: puntosData }, { data: tareasData }] = await Promise.all([
    supabase.from('puntos_acopio')
      .select('id, nombre, direccion, responsable, telefono, recibe, necesita, horario, lat, lng, activo, creado_por, creado_en')
      .eq('activo', true),
    supabase.from('tareas')
      .select('id, titulo, lat, lng, categoria')
      .not('lat', 'is', null).not('lng', 'is', null),
  ]);

  const puntos = (puntosData ?? []) as PuntoAcopio[];
  const tareas = (tareasData ?? []) as any[];

  return (
    <div>
      <RealtimeRefrescar tabla="puntos_acopio" />
      <h1>Mapa de coordinación</h1>
      <p className="muted">
        Puntos de acopio (<span className="leyenda-pin" style={{ background: '#0033A0' }} /> azul) y
        tareas con ubicación (<span className="leyenda-pin" style={{ background: '#FFCE00' }} /> amarillo).
        Toca el mapa para registrar un nuevo punto.
      </p>
      <Mapa puntos={puntos} tareas={tareas} />
    </div>
  );
}
