-- ============================================================
-- 0204 — Panorama geográfico compartido de solo lectura para TODAS las áreas
-- ------------------------------------------------------------
-- Hoy el /mapa solo lo ven Logística/admin/digitalización (lectura de puntos_acopio,
-- tareas y lugares, acotada por RLS). Pero saber DÓNDE están los centros y las
-- necesidades ayuda a todas las áreas a no trabajar a ciegas (igual que /seguimiento).
--
-- Esta RPC SECURITY DEFINER (mismo molde curado que solicitudes_ayuda_mapa/seguimiento_casos)
-- devuelve una foto de solo lectura y de baja sensibilidad: centros de acopio (ubicación,
-- tipo, urgencia, camas y qué necesitan/reciben — SIN responsable ni teléfono) y las
-- solicitudes de ayuda confirmadas y ubicadas (sin contacto ni evidencias, excluye
-- «Desaparecidos»). Gate: personal verificado (identidad aprobada), como seguimiento_casos.
-- La escritura de centros sigue por su propia RLS (líderes/Logística). Idempotente.
-- ============================================================

create or replace function public.mapa_panorama()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  -- Blindaje: solo personal verificado (sin identidad aprobada no ve el panorama).
  if not public.es_verificado() then
    return jsonb_build_object('centros', '[]'::jsonb, 'solicitudes', '[]'::jsonb);
  end if;

  select jsonb_build_object(
    'centros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nombre', p.nombre, 'tipo', p.tipo, 'temporal', p.temporal,
        'necesita', p.necesita, 'recibe', p.recibe, 'capacidad', p.capacidad,
        'camas_total', p.camas_total, 'camas_ocupadas', p.camas_ocupadas,
        'urgencia', p.urgencia::text, 'horario', p.horario,
        'lat', p.lat, 'lng', p.lng))
      from public.puntos_acopio p
      where p.activo and p.lat is not null and p.lng is not null), '[]'::jsonb),
    'solicitudes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'titulo', c.titulo, 'lat', c.lat, 'lng', c.lng,
        'tipo', c.req_tipo::text, 'urgencia', c.req_urgencia::text, 'estado', c.estado::text))
      from public.casos c
      where c.es_requerimiento and c.lat is not null and c.lng is not null
        and c.categoria is distinct from 'Desaparecidos'
        and c.estado::text in ('confirmado', 'enviado_redaccion')), '[]'::jsonb)
  ) into v;
  return v;
end $$;

revoke all on function public.mapa_panorama() from public;
grant execute on function public.mapa_panorama() to authenticated;

comment on function public.mapa_panorama() is
  'Panorama geográfico compartido (solo lectura, baja sensibilidad) para todo el personal verificado: centros de acopio + solicitudes de ayuda ubicadas. Sin contactos ni evidencias; excluye Desaparecidos.';
