import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUsuario, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import Mapa from '@/components/Mapa';
import LimiteError from '@/components/LimiteError';
import Icono from '@/components/Icono';
import type { PuntoAcopio } from '@unidos/types';

export default async function MapaPage() {
  const { perfil } = await requireUsuario();
  const roles = rolesDe(perfil);
  // Operativos del mapa (vista COMPLETA y editable): Logística / admin / digitalización.
  const priv = roles.includes('admin') || roles.includes('logistica') || roles.includes('admin_logistica') || roles.includes('digitalizador');
  // Panorama COMPARTIDO de solo lectura (0204): cualquier rol operativo — fuera voluntario/observador.
  const operativo = priv || roles.some((r) => !['voluntario', 'observador'].includes(r));
  if (!operativo) redirect('/dashboard');

  const supabase = await createClient();

  let puntos: PuntoAcopio[] = [];
  let tareas: any[] = [];
  let lugares: any[] = [];
  let solicitudes: any[] = [];

  if (priv) {
    // Vista operativa completa (lecturas acotadas por RLS a Logística/admin/digitalización).
    const [{ data: puntosData }, { data: tareasData }, { data: lugaresData }, { data: solicitudesData }] = await Promise.all([
      supabase.from('puntos_acopio')
        .select('id, nombre, tipo, temporal, direccion, responsable, telefono, recibe, necesita, horario, capacidad, camas_total, camas_ocupadas, urgencia, lat, lng, activo, creado_por, creado_en, actualizado_en')
        .eq('activo', true),
      supabase.from('tareas')
        .select('id, titulo, lat, lng, categoria')
        .not('lat', 'is', null).not('lng', 'is', null),
      // Lugares digitalizados (la RLS los muestra a admin y digitalización).
      supabase.from('lugares')
        .select('id, tipo, nombre, lat, lng, estado')
        .not('lat', 'is', null).not('lng', 'is', null),
      // Solicitudes de ayuda (casos-requerimiento confirmados y ubicados) por RPC curada.
      supabase.rpc('solicitudes_ayuda_mapa'),
    ]);
    puntos = (puntosData ?? []) as PuntoAcopio[];
    tareas = (tareasData ?? []) as any[];
    lugares = (lugaresData ?? []) as any[];
    solicitudes = (solicitudesData ?? []) as any[];
  } else {
    // Panorama compartido (solo lectura): centros + solicitudes, por la RPC curada 0204.
    // Sin tareas/lugares (capas operativas) ni contactos. Degrada a vacío si falta 0204.
    const { data } = await supabase.rpc('mapa_panorama');
    const pan = (data ?? {}) as { centros?: any[]; solicitudes?: any[] };
    puntos = ((pan.centros ?? []) as any[]) as PuntoAcopio[];
    solicitudes = (pan.solicitudes ?? []) as any[];
  }

  return (
    <div>
      {priv && <RealtimeRefrescar tabla="puntos_acopio" />}
      <div className="pagina-cab">
        <h1>Mapa de coordinación</h1>
        {priv && <Link className="btn" href="/acopio"><Icono nombre="acopio" /> Centros de acopio</Link>}
      </div>
      <p className="muted">
        Centros de acopio por urgencia (
        <span className="leyenda-pin" style={{ background: '#CF142B' }} /> urgente,{' '}
        <span className="leyenda-pin" style={{ background: '#E6A100' }} /> necesita,{' '}
        <span className="leyenda-pin" style={{ background: '#0A7D2C' }} /> cubierto)
        {tareas.length > 0 && <> y tareas con ubicación (<span className="leyenda-pin" style={{ background: '#0033A0' }} /> azul)</>}
        {lugares.length > 0 && <> y lugares digitalizados (
          <span className="leyenda-pin" style={{ background: '#7C3AED' }} /> verificado,{' '}
          <span className="leyenda-pin" style={{ background: '#DB2777' }} /> pendiente)</>}
        {solicitudes.length > 0 && <> y <strong>solicitudes de ayuda</strong> (
          <span className="leyenda-pin" style={{ background: '#0D9488' }} /> requerimiento con ubicación)</>}.
        {' '}Activa la <strong>capa de calor</strong> para ver dónde se concentran las necesidades, o filtra los <strong>albergues con cupo</strong>.
        {priv ? <> Para crear o editar centros, entra a <strong>Centros de acopio</strong>.</> : <> Es una vista de <strong>solo lectura</strong> del panorama.</>}
      </p>
      <LimiteError fallback={<div className="tarjeta"><p className="muted" style={{ margin: 0 }}>El mapa no está disponible en este dispositivo (WebGL desactivado, p. ej. en Modo de bajo consumo). Prueba con la aceleración por hardware activada u otro navegador.</p></div>}>
        <Mapa puntos={puntos} tareas={tareas} lugares={lugares} solicitudes={solicitudes} />
      </LimiteError>
    </div>
  );
}
