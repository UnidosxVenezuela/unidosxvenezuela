import Link from 'next/link';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Mapa from '@/components/Mapa';
import Icono from '@/components/Icono';
import type { PuntoAcopio } from '@unidos/types';

export default async function MapaPage() {
  await requireUsuario();
  const supabase = await createClient();

  const [{ data: puntosData }, { data: tareasData }] = await Promise.all([
    supabase.from('puntos_acopio')
      .select('id, nombre, direccion, responsable, telefono, recibe, necesita, horario, capacidad, urgencia, lat, lng, activo, creado_por, creado_en, actualizado_en')
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
      <div className="pagina-cab">
        <h1>Mapa de coordinación</h1>
        <Link className="btn" href="/acopio"><Icono nombre="acopio" /> Centros de acopio</Link>
      </div>
      <p className="muted">
        Centros de acopio por urgencia (
        <span className="leyenda-pin" style={{ background: '#CF142B' }} /> urgente,{' '}
        <span className="leyenda-pin" style={{ background: '#E6A100' }} /> necesita,{' '}
        <span className="leyenda-pin" style={{ background: '#0A7D2C' }} /> cubierto) y
        tareas con ubicación (<span className="leyenda-pin" style={{ background: '#0033A0' }} /> azul).
        Para crear o editar centros, entrá a <strong>Centros de acopio</strong>.
      </p>
      <Mapa puntos={puntos} tareas={tareas} />
    </div>
  );
}
