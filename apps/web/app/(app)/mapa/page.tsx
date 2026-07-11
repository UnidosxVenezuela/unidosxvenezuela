import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Mapa from '@/components/Mapa';
import LimiteError from '@/components/LimiteError';
import Icono from '@/components/Icono';
import type { PuntoAcopio } from '@unidos/types';

export default async function MapaPage() {
  const { perfil } = await requireUsuario();
  const rolesG = [perfil?.rol, ...((perfil?.roles_extra as string[] | null) ?? [])];
  if (!rolesG.includes('admin') && !rolesG.includes('logistica') && !rolesG.includes('admin_logistica') && !rolesG.includes('digitalizador')) redirect('/dashboard');

  const supabase = await createClient();

  const [{ data: puntosData }, { data: tareasData }, { data: lugaresData }, { data: solicitudesData }] = await Promise.all([
    supabase.from('puntos_acopio')
      .select('id, nombre, tipo, temporal, direccion, responsable, telefono, recibe, necesita, horario, capacidad, urgencia, lat, lng, activo, creado_por, creado_en, actualizado_en')
      .eq('activo', true),
    supabase.from('tareas')
      .select('id, titulo, lat, lng, categoria')
      .not('lat', 'is', null).not('lng', 'is', null),
    // Lugares digitalizados (la RLS los muestra a admin y digitalización).
    supabase.from('lugares')
      .select('id, tipo, nombre, lat, lng, estado')
      .not('lat', 'is', null).not('lng', 'is', null),
    // Solicitudes de ayuda (casos-requerimiento confirmados y ubicados). Se sirve por
    // una RPC curada (solo campos aptos para el mapa) para no exponer el resto del caso.
    supabase.rpc('solicitudes_ayuda_mapa'),
  ]);

  const puntos = (puntosData ?? []) as PuntoAcopio[];
  const tareas = (tareasData ?? []) as any[];
  const lugares = (lugaresData ?? []) as any[];
  const solicitudes = (solicitudesData ?? []) as any[];

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
        tareas con ubicación (<span className="leyenda-pin" style={{ background: '#0033A0' }} /> azul)
        {lugares.length > 0 && <> y lugares digitalizados (
          <span className="leyenda-pin" style={{ background: '#7C3AED' }} /> verificado,{' '}
          <span className="leyenda-pin" style={{ background: '#DB2777' }} /> pendiente)</>}
        {solicitudes.length > 0 && <> y <strong>solicitudes de ayuda</strong> (
          <span className="leyenda-pin" style={{ background: '#0D9488' }} /> requerimiento con ubicación)</>}.
        Para crear o editar centros, entra a <strong>Centros de acopio</strong>.
      </p>
      <LimiteError fallback={<div className="tarjeta"><p className="muted" style={{ margin: 0 }}>El mapa no está disponible en este dispositivo (WebGL desactivado, p. ej. en Modo de bajo consumo). Prueba con la aceleración por hardware activada u otro navegador.</p></div>}>
        <Mapa puntos={puntos} tareas={tareas} lugares={lugares} solicitudes={solicitudes} />
      </LimiteError>
    </div>
  );
}
