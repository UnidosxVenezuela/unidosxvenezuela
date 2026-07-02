-- ============================================================
-- 0062 — Re-división del área de contenido + Líder Psicosocial
-- ------------------------------------------------------------
-- · Los grupos de contenido vuelven a separarse: Diseño Gráfico, Edición de
--   Videos, Influencers, Redes Sociales y Redacción (revierte parte de 0059).
--   "Diseño y Redes Sociales" pasa a llamarse solo "Redes Sociales".
-- · Cada grupo tiene su rol vinculado (diseño gráfico, edición de video,
--   influencers, redes sociales, redacción); asignar el rol agrega al grupo.
-- · Apoyo Psicosocial suma un LÍDER de grupo (lider_psicosocial): gestiona la
--   membresía y publica en SU grupo, junto al Coordinador Psicosocial. Los
--   CASOS confidenciales siguen restringidos (el líder gestiona el grupo, no
--   ve los acompañamientos).
-- Idempotente. No usa los valores de enum nuevos en DML dentro de esta misma
-- migración (Postgres lo prohíbe en la misma transacción); solo se referencian
-- en cuerpos plpgsql (evaluados al llamar) o por comparación de texto.
-- ============================================================

-- ── 1) Enum: roles nuevos (diseno_grafico/edicion_video ya existían) ──
alter type public.rol_usuario add value if not exists 'diseno_grafico';
alter type public.rol_usuario add value if not exists 'edicion_video';
alter type public.rol_usuario add value if not exists 'influencers';
alter type public.rol_usuario add value if not exists 'lider_psicosocial';

-- ── 2) Grupos: renombrar Redes Sociales y crear los que faltan ──
update public.grupos set nombre = 'Redes Sociales' where clave = 'redes_sociales';
insert into public.grupos (nombre, area, clave, abierto) values
  ('Diseño Gráfico',    'diseno',    'diseno_grafico', false),
  ('Edición de Videos', 'diseno',    'edicion_video',  false),
  ('Influencers',       'marketing', 'influencers',    false)
on conflict (clave) do update set nombre = excluded.nombre;

-- ── 3) Mapeo grupo ↔ rol (añade diseño, video, influencers) ──
create or replace function public.rol_de_grupo(p_clave text)
returns public.rol_usuario language plpgsql immutable as $$
begin
  return (case p_clave
    when 'gestion_casos'     then 'recopilacion'
    when 'verificacion'      then 'verificador'
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
    when 'redaccion'         then 'redaccion'
    when 'redes_sociales'    then 'redes_sociales'
    when 'diseno_grafico'    then 'diseno_grafico'
    when 'edicion_video'     then 'edicion_video'
    when 'influencers'       then 'influencers'
    when 'apoyo_psicosocial' then 'apoyo_psicosocial'
    when 'logistica'         then 'gestion_acopio'
    else null end;
end $$;

-- ── 4) Apoyo Psicosocial: mando del área = Coordinador O Líder ──
-- Comparación por TEXTO (no castea el enum nuevo): seguro en la misma migración.
create or replace function public.es_mando_psicosocial()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from unnest(public.mis_roles()) r
    where r::text in ('coordinador_psicosocial', 'lider_psicosocial')
  );
$$;
grant execute on function public.es_mando_psicosocial() to authenticated;

-- Gestiona la membresía del grupo Apoyo Psicosocial: Coordinador y Líder del
-- área (nunca a mandos: admin, líderes, ni a otro coordinador/líder psicosocial).
create or replace function public.gestionable_por_coord_psico(g uuid, p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_mando_psicosocial()
     and exists (select 1 from public.grupos gr where gr.id = g and gr.clave = 'apoyo_psicosocial')
     and public.es_gestionable_por_lider(p)
     and not exists (select 1 from public.perfiles pf where pf.id = p and (
           pf.rol::text in ('coordinador_psicosocial', 'lider_psicosocial')
           or exists (select 1 from unnest(coalesce(pf.roles_extra,'{}'::public.rol_usuario[])) r
                      where r::text in ('coordinador_psicosocial', 'lider_psicosocial'))));
$$;

-- Publicar (tareas/anuncios) en el grupo Apoyo Psicosocial: sus mandos también.
create or replace function public.puede_publicar_en_grupo(g uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  return public.tiene_rol('admin')
      or exists (select 1 from public.grupos gr where gr.id = g and gr.lider_id = auth.uid())
      or (public.tiene_rol('coordinador') and public.es_miembro_de(g))
      or (public.es_mando_psicosocial()
          and exists (select 1 from public.grupos gr where gr.id = g and gr.clave = 'apoyo_psicosocial'));
end $$;
grant execute on function public.puede_publicar_en_grupo(uuid) to authenticated;
