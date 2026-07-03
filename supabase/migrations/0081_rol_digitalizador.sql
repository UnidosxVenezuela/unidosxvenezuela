-- ============================================================
-- 0081 — Rol y grupo propios para Digitalización
-- ------------------------------------------------------------
-- La sección de Digitalización deja de depender de Búsqueda/Logística y pasa a
-- un rol y grupo propios:
--   · Rol 'digitalizador' y grupo de sistema «Grupo de Digitalización»
--     (clave 'digitalizacion'). Ser miembro otorga el rol (trigger de
--     sincronización), así que líderes y coordinadores del grupo quedan cubiertos.
--   · Acceso a Digitalización = admin, o rol 'digitalizador' CON 2ª verificación
--     (identidad) aprobada. Ya NO hay frontera por tipo de lugar: el digitalizador
--     trabaja todos los tipos (hospital / albergue / acopio / otro).
--
-- Se REDEFINEN puede_digitalizar() y puede_ver_listado() de 0080; las políticas
-- RLS que los usan quedan actualizadas sin tocarlas.
--
-- Enum-safety (como 0062/0078): el valor nuevo 'digitalizador' solo se referencia
-- en cuerpos plpgsql o por comparación de texto. Idempotente. Ejecutar tras 0080.
-- ============================================================

-- ── 1) Enum ──
alter type public.rol_usuario add value if not exists 'digitalizador';

-- ── 2) Grupo de sistema «Grupo de Digitalización» ──
insert into public.grupos (nombre, area, clave, abierto) values
  ('Grupo de Digitalización', 'gestion_informacion', 'digitalizacion', false)
on conflict (clave) do update set nombre = excluded.nombre;

-- ── 3) Mapeo grupo ↔ rol (añade digitalizacion ↔ digitalizador) ──
create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'     then 'recopilacion'
    when 'verificacion'      then 'verificador'
    when 'busqueda'          then 'busqueda'
    when 'digitalizacion'    then 'digitalizador'
    when 'redaccion'         then 'redaccion'
    when 'redes_sociales'    then 'redes_sociales'
    when 'diseno_grafico'    then 'diseno_grafico'
    when 'edicion_video'     then 'edicion_video'
    when 'influencers'       then 'influencers'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'gestion_acopio'    then 'logistica'
    else null end)::public.rol_usuario;
end $$;

create or replace function public.clave_de_rol(p_rol public.rol_usuario)
returns text language plpgsql immutable as $$
begin
  return case p_rol::text
    when 'recopilacion'      then 'gestion_casos'
    when 'verificador'       then 'verificacion'
    when 'busqueda'          then 'busqueda'
    when 'digitalizador'     then 'digitalizacion'
    when 'redaccion'         then 'redaccion'
    when 'redes_sociales'    then 'redes_sociales'
    when 'diseno_grafico'    then 'diseno_grafico'
    when 'edicion_video'     then 'edicion_video'
    when 'influencers'       then 'influencers'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'logistica'         then 'gestion_acopio'
    else null end;
end $$;

-- ── 4) Helper de rol (texto: seguro en esta misma migración) ──
create or replace function public.es_digitalizador()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(public.mis_roles()) r where r::text = 'digitalizador');
$$;
grant execute on function public.es_digitalizador() to authenticated;

-- ── 5) Acceso a Digitalización: admin o digitalizador con 2ª verificación ──
create or replace function public.puede_digitalizar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_admin() or (public.es_digitalizador() and public.identidad_aprobada());
$$;
grant execute on function public.puede_digitalizar() to authenticated;

-- Sin frontera por tipo: el digitalizador ve/gestiona todos los tipos de lugar.
-- (Se conserva la firma (text) para no tocar las políticas RLS de 0080.)
create or replace function public.puede_ver_listado(p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.puede_digitalizar();
$$;
grant execute on function public.puede_ver_listado(text) to authenticated;
