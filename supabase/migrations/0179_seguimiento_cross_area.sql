-- ============================================================
-- 0179 — Seguimiento cross-área (Requerimiento Paso 5, regla «super importante»)
-- ------------------------------------------------------------
-- «Ninguna área queda a ciegas»: cualquier persona del equipo (verificada) puede
-- consultar el ESTADO y el RECORRIDO de cualquier solicitud, sea o no de su área,
-- SIN ver datos sensibles (contacto ni evidencias, Paso 10).
--
-- Como Postgres no puede ocultar columnas por RLS, la lectura cross-área va por una
-- RPC SECURITY DEFINER que devuelve solo un subconjunto SEGURO de campos. Excluye
-- «Desaparecidos» (flujo restringido de Búsqueda, con su propio blindaje). Las
-- derivaciones (0177) ya tienen lectura amplia, así que la app las lee directo para
-- completar la línea de tiempo. Idempotente. Ejecutar tras 0178.
-- ============================================================

create or replace function public.seguimiento_casos(p_q text default null)
returns table (
  id uuid,
  numero bigint,
  titulo text,
  categoria text,
  estado text,
  es_requerimiento boolean,
  req_tipo text,
  req_urgencia text,
  ubicacion_estado text,
  ubicacion_municipio text,
  validado boolean,
  creado_en timestamptz,
  actualizado_en timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare
  v_num text := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '');
  v_txt text := nullif(trim(coalesce(p_q, '')), '');
begin
  -- Solo personal verificado (blindaje): un usuario sin identidad aprobada no navega
  -- el recorrido de todas las solicitudes.
  if not public.es_verificado() then
    return;
  end if;

  return query
    select c.id, c.numero, c.titulo, c.categoria, c.estado::text,
           c.es_requerimiento, c.req_tipo::text, c.req_urgencia::text,
           c.ubicacion_estado, c.ubicacion_municipio,
           public.caso_esta_validado(c.id), c.creado_en, c.actualizado_en
    from public.casos c
    where c.categoria is distinct from 'Desaparecidos'   -- flujo restringido aparte
      and (
        v_txt is null
        or c.titulo ilike '%' || v_txt || '%'
        or (v_num is not null and c.numero = v_num::bigint)
      )
    order by c.actualizado_en desc
    limit 100;
end $$;

revoke all on function public.seguimiento_casos(text) from public;
grant execute on function public.seguimiento_casos(text) to authenticated;

comment on function public.seguimiento_casos(text) is
  'Paso 5 (cross-área): recorrido/estado de solicitudes visible a todo el personal verificado, con solo campos NO sensibles (sin contacto ni evidencias). Excluye Desaparecidos.';
